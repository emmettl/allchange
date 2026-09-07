/** NTIS transport capture. Decoding and public traffic output require the subscriber schemas. */
export interface Env {
  readonly OBSERVATIONS: R2Bucket
  readonly CAPTURE_ENABLED?: string
  readonly NTIS_USERNAME?: string
  readonly NTIS_PASSWORD?: string
  /** Exact response body agreed against the subscriber WSDL/test payload. Never guessed. */
  readonly NTIS_ACK_XML?: string
  readonly NTIS_ACK_CONTENT_TYPE?: string
}

export const MAX_BODY_BYTES = 8 * 1024 * 1024
const FEEDS = new Set(['midas', 'tmu'])
const encoder = new TextEncoder()

class PayloadError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }
}

function reply(message: string, status: number): Response {
  return new Response(message, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}

function configured(env: Env): boolean {
  return Boolean(env.NTIS_USERNAME && !env.NTIS_USERNAME.includes(':') && env.NTIS_PASSWORD && env.NTIS_ACK_XML !== undefined &&
    ['text/xml', 'application/soap+xml'].includes(env.NTIS_ACK_CONTENT_TYPE ?? ''))
}

async function digest(value: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', value))
}

async function authorized(request: Request, env: Env): Promise<boolean> {
  const authorization = request.headers.get('Authorization') ?? ''
  if (authorization.length > 4096 || !/^Basic /i.test(authorization)) return false
  let decoded: string
  try {
    decoded = new TextDecoder('utf-8', { fatal: true }).decode(
      Uint8Array.from(atob(authorization.slice(6)), character => character.charCodeAt(0)),
    )
  } catch {
    return false
  }
  // Compare fixed-length digests without a prefix-dependent early return.
  const [actual, expected] = await Promise.all([
    digest(encoder.encode(decoded)),
    digest(encoder.encode(`${env.NTIS_USERNAME}:${env.NTIS_PASSWORD}`)),
  ])
  let difference = 0
  for (let index = 0; index < expected.length; index++) difference |= actual[index] ^ expected[index]
  return difference === 0
}

async function boundedBody(stream: ReadableStream<Uint8Array> | null): Promise<Uint8Array<ArrayBuffer>> {
  if (!stream) throw new PayloadError(400, 'Empty payload')
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      length += next.value.byteLength
      if (length > MAX_BODY_BYTES) {
        await reader.cancel()
        throw new PayloadError(413, 'Payload too large')
      }
      chunks.push(next.value)
    }
  } finally {
    reader.releaseLock()
  }
  if (!length) throw new PayloadError(400, 'Empty payload')
  const body = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.length
  }
  return body
}

export function captureKey(feed: string, receivedAt: string, sha256: string): string {
  const timestamp = receivedAt.replaceAll(':', '-').replaceAll('.', '-')
  return `london/ntis-raw/${receivedAt.slice(0, 10)}/${feed}/${timestamp}-${sha256}.xml.gz`
}

async function capture(request: Request, env: Env, feed: string): Promise<Response> {
  if (env.CAPTURE_ENABLED !== 'true' || !configured(env)) return reply('Receiver is not configured', 503)
  if (!await authorized(request, env)) {
    const response = reply('Unauthorized', 401)
    response.headers.set('WWW-Authenticate', 'Basic realm="NTIS receiver", charset="UTF-8"')
    return response
  }
  const contentType = (request.headers.get('Content-Type') ?? '').split(';')[0].trim().toLowerCase()
  if (!['text/xml', 'application/xml', 'application/soap+xml'].includes(contentType)) {
    return reply('Expected XML or SOAP', 415)
  }
  const encoding = (request.headers.get('Content-Encoding') ?? 'identity').toLowerCase()
  if (!['identity', 'gzip'].includes(encoding)) return reply('Unsupported content encoding', 415)
  const declaredLength = Number(request.headers.get('Content-Length'))
  if (declaredLength > MAX_BODY_BYTES) return reply('Payload too large', 413)

  let body: Uint8Array<ArrayBuffer>
  try {
    body = await boundedBody(request.body)
    if (encoding === 'gzip') {
      body = await boundedBody(new Blob([body]).stream().pipeThrough(new DecompressionStream('gzip')))
    }
  } catch (error) {
    return error instanceof PayloadError ? reply(error.message, error.status) : reply('Invalid payload encoding', 400)
  }
  // Retain the full envelope, unchanged. No XML entities are expanded and no schema is assumed.
  const receivedAt = new Date().toISOString()
  const sha256 = [...await digest(body)].map(value => value.toString(16).padStart(2, '0')).join('')
  const key = captureKey(feed, receivedAt, sha256)
  try {
    const compressed = await new Response(new Blob([body]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer()
    // Await durable storage before acknowledging: a failed write must cause the publisher to retry.
    await env.OBSERVATIONS.put(key, compressed, {
      httpMetadata: { contentType: 'application/xml', contentEncoding: 'gzip' },
      customMetadata: {
        receivedAt, sha256, feed, bytes: String(body.byteLength),
        sourceContentType: contentType, validation: 'unvalidated-transport-capture',
      },
    })
  } catch {
    // Never log headers, credentials, envelopes or provider-supplied content.
    console.error('NTIS raw capture storage failed')
    return reply('Capture storage unavailable', 503)
  }
  return new Response(env.NTIS_ACK_XML, {
    status: 200,
    headers: { 'Content-Type': `${env.NTIS_ACK_CONTENT_TYPE}; charset=utf-8`, 'Cache-Control': 'no-store' },
  })
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (request.method === 'GET' && url.pathname === '/health') {
      const ready = env.CAPTURE_ENABLED === 'true' && configured(env)
      return Response.json({
        status: ready ? 'capture-ready' : 'setup-required',
        stage: 'raw-transport-only',
        liveTrafficAvailable: false,
      }, { status: ready ? 200 : 503, headers: { 'Cache-Control': 'no-store' } })
    }
    const match = /^\/ntis\/(midas|tmu)$/.exec(url.pathname)
    if (!match || !FEEDS.has(match[1])) return reply('Not found', 404)
    if (request.method !== 'POST') return reply('Method not allowed', 405)
    return capture(request, env, match[1])
  },
} satisfies ExportedHandler<Env>
