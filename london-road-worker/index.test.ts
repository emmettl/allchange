import { describe, expect, it, vi } from 'vitest'
import worker, { captureKey, MAX_BODY_BYTES, type Env } from './index.ts'

// Transport-only fixture, not an NTIS sample or a proposed NTIS SOAP acknowledgement.
const xml = '<testEnvelope><value>42</value></testEnvelope>'
const acknowledgement = '<testAcknowledgement/>'

function setup(overrides: Partial<Env> = {}) {
  const put = vi.fn().mockResolvedValue({})
  const env = {
    OBSERVATIONS: { put } as unknown as R2Bucket,
    CAPTURE_ENABLED: 'true', NTIS_USERNAME: 'test-publisher', NTIS_PASSWORD: 'test-password',
    NTIS_ACK_XML: acknowledgement, NTIS_ACK_CONTENT_TYPE: 'text/xml',
    ...overrides,
  }
  return { env, put }
}

function request(body: BodyInit = xml, headers: Record<string, string> = {}) {
  return new Request('https://receiver.example/ntis/midas', {
    method: 'POST', body,
    headers: {
      Authorization: `Basic ${btoa('test-publisher:test-password')}`,
      'Content-Type': 'text/xml; charset=utf-8', ...headers,
    },
  })
}

async function gzip(value: string) {
  return new Response(new Blob([value]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer()
}

describe('NTIS transport capture', () => {
  it('archives the unchanged envelope and returns only the configured acknowledgement', async () => {
    const { env, put } = setup()
    const response = await worker.fetch(request(), env)
    expect(response.status).toBe(200)
    expect(await response.text()).toBe(acknowledgement)
    expect(response.headers.get('Content-Type')).toBe('text/xml; charset=utf-8')
    const [key, bytes, options] = put.mock.calls[0]
    expect(key).toMatch(/^london\/ntis-raw\/\d{4}-\d{2}-\d{2}\/midas\/.+-[a-f0-9]{64}\.xml\.gz$/)
    expect(options.customMetadata).toMatchObject({ feed: 'midas', validation: 'unvalidated-transport-capture' })
    const saved = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text()
    expect(saved).toBe(xml)
    expect(JSON.stringify(options)).not.toContain('test-password')
    expect(JSON.stringify(options)).not.toContain('test-publisher')
  })

  it('waits for durable storage before acknowledging', async () => {
    const { env, put } = setup()
    let finish!: () => void
    put.mockReturnValue(new Promise<void>(resolve => { finish = resolve }))
    let acknowledged = false
    const response = worker.fetch(request(), env).then(value => { acknowledged = true; return value })
    await vi.waitFor(() => expect(put).toHaveBeenCalledOnce())
    expect(acknowledged).toBe(false)
    finish()
    expect((await response).status).toBe(200)
  })

  it('accepts bounded gzip and preserves the decompressed XML', async () => {
    const { env, put } = setup()
    const response = await worker.fetch(request(await gzip(xml), { 'Content-Encoding': 'gzip' }), env)
    expect(response.status).toBe(200)
    const saved = await new Response(new Blob([put.mock.calls[0][1]]).stream().pipeThrough(new DecompressionStream('gzip'))).text()
    expect(saved).toBe(xml)
  })

  it.each([
    { CAPTURE_ENABLED: 'false' }, { NTIS_PASSWORD: undefined },
    { NTIS_ACK_XML: undefined }, { NTIS_ACK_CONTENT_TYPE: undefined },
  ])('fails closed when setup is incomplete: %j', async overrides => {
    const { env, put } = setup(overrides)
    expect((await worker.fetch(request(), env)).status).toBe(503)
    expect(put).not.toHaveBeenCalled()
  })

  it.each(['', 'Bearer secret', 'Basic invalid!', `Basic ${btoa('test-publisher:wrong')}`])(
    'rejects invalid authentication without storing a payload: %s', async Authorization => {
      const { env, put } = setup()
      const response = await worker.fetch(request(xml, { Authorization }), env)
      expect(response.status).toBe(401)
      expect(put).not.toHaveBeenCalled()
    },
  )

  it('rejects oversized bodies even without a Content-Length header', async () => {
    const { env, put } = setup()
    expect((await worker.fetch(request('x'.repeat(MAX_BODY_BYTES + 1)), env)).status).toBe(413)
    expect(put).not.toHaveBeenCalled()
  })

  it('limits decompressed size as well as wire size', async () => {
    const { env, put } = setup()
    const body = await gzip('x'.repeat(MAX_BODY_BYTES + 1))
    expect(body.byteLength).toBeLessThan(MAX_BODY_BYTES)
    expect((await worker.fetch(request(body, { 'Content-Encoding': 'gzip' }), env)).status).toBe(413)
    expect(put).not.toHaveBeenCalled()
  })

  it.each([
    { body: '', headers: {}, status: 400 },
    { body: xml, headers: { 'Content-Type': 'application/json' }, status: 415 },
    { body: xml, headers: { 'Content-Encoding': 'br' }, status: 415 },
    { body: xml, headers: { 'Content-Encoding': 'gzip' }, status: 400 },
  ])('rejects invalid transport input: %j', async ({ body, headers, status }) => {
    const { env, put } = setup()
    expect((await worker.fetch(request(body, headers as Record<string, string>), env)).status).toBe(status)
    expect(put).not.toHaveBeenCalled()
  })

  it('returns a retryable failure when storage fails', async () => {
    const { env, put } = setup()
    put.mockRejectedValue(new Error('storage failure'))
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      expect((await worker.fetch(request(), env)).status).toBe(503)
      expect(log).toHaveBeenCalledWith('NTIS raw capture storage failed')
    } finally {
      log.mockRestore()
    }
  })

  it('does not expose raw data or claim that receiver readiness is live traffic', async () => {
    const { env } = setup()
    const health = await worker.fetch(new Request('https://receiver.example/health'), env)
    expect(await health.json()).toEqual({ status: 'capture-ready', stage: 'raw-transport-only', liveTrafficAvailable: false })
    expect((await worker.fetch(new Request('https://receiver.example/ntis/midas'), env)).status).toBe(405)
    expect((await worker.fetch(new Request('https://receiver.example/roads.json'), env)).status).toBe(404)
  })

  it('keeps receipt time and feed in the private archive key', () => {
    expect(captureKey('tmu', '2026-09-07T09:30:00.000Z', 'abc')).toBe(
      'london/ntis-raw/2026-09-07/tmu/2026-09-07T09-30-00-000Z-abc.xml.gz',
    )
  })
})
