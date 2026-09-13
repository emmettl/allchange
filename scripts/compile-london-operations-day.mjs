import { compileObservationWindows, jsonArtifact } from '@motionstudies/data/observation-windows'
import { studyDay } from '@motionstudies/data/uk-service-day'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const DEFAULT_INPUT = 'recordings/london-operations'
const DEFAULT_MANIFEST = 'public/data/all-change-operations-day-manifest.json'
const DEFAULT_CHUNK_DIRECTORY = 'public/data/all-change-operations-day-chunks'

function argument(name) {
  const prefix = `--${name}=`
  return process.argv.slice(2).find((value) => value.startsWith(prefix))?.slice(prefix.length)
}

export function londonDateAndTime(isoTimestamp) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })
    .formatToParts(new Date(isoTimestamp))
    .reduce((result, part) => ({ ...result, [part.type]: part.value }), {})
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    seconds:
      Number(parts.hour) * 3_600 + Number(parts.minute) * 60 + Number(parts.second),
  }
}

export function compileOperationsDay(
  snapshots,
  { serviceDate, minimumSamples = 1_200, chunkHours = 2, chunkPathPrefix = 'all-change-operations-day-chunks' } = {},
) {
  const day = studyDay(serviceDate)
  // The shared archive handles 23/25-hour days. The existing London playback
  // clock is wall-seconds, so reject those days until that UI has an explicit policy.
  if (day.durationSeconds !== 86400) throw new Error('London replay does not yet support DST transition days')
  const eligible = snapshots.filter(snapshot => snapshot?.metadata?.kind === 'observed-operations')
  const result = compileObservationWindows(eligible.map(snapshot => ({
    id: snapshot.metadata.scheduledAt, timeUtc: snapshot.metadata.scheduledAt,
    receivedAt: snapshot.metadata.collectedAt, value: snapshot,
  })), { ...day, sourceId: 'tfl-arrival-predictions', evidenceKind: 'arrival-prediction', timeBasis: 'capture-schedule',
    minimumRecords: minimumSamples, windowSeconds: chunkHours * 3600, cadenceSeconds: 60,
    duplicatePolicy: 'last', pathPrefix: chunkPathPrefix })
  const frames = result.chunks.flatMap(chunk => chunk.artifact.frames)
  if (!frames.length) throw new Error('No London observation frames in the selected day')
  const lineIds = [...new Set(frames.flatMap(frame => frame.value.metadata.lineIds ?? []))].sort()
  const chunks = result.chunks.map(({ artifact: source }) => {
    const { windowStart, windowEnd } = source
    const id = `${String(windowStart / 3600).padStart(2, '0')}-${String(windowEnd / 3600).padStart(2, '0')}`
    const artifact = { windowStart, windowEnd, frames: source.frames.map(frame => ({
      time: frame.time, observedAt: frame.receivedAt, vehicles: frame.value.vehicles, lineStatuses: frame.value.lineStatuses,
    })) }
    const { json, bytes, sha256 } = jsonArtifact(artifact)
    return { descriptor: { id, windowStart, windowEnd, path: `${chunkPathPrefix}/${id}.json`, frameCount: artifact.frames.length, bytes, sha256 }, artifact, json }
  })
  const first = frames[0].value
  return { manifest: { metadata: {
    kind: 'observed-operations-day', publisher: first.metadata.publisher, serviceDate, timezone: day.timezone,
    sourceUrl: first.metadata.sourceUrl,
    model: 'Recorded TfL arrival predictions projected between matched stops on static route geometry',
    note: 'Prediction-derived historical replay; positions are interpolated between predicted stop calls and are not GPS.',
    sampleIntervalSeconds: 60, completeMinutes: result.manifest.coverage.retainedRecords,
    longestGapSeconds: result.manifest.coverage.longestGapSeconds, lineIds,
    captureCoverage: result.manifest.coverage, timeBasis: result.manifest.timeBasis,
    duplicatePolicy: result.manifest.duplicatePolicy,
  }, chunks: chunks.map(({ descriptor }) => descriptor) }, chunks }
}

async function main() {
  if (process.argv.includes('--help')) {
    console.log(
      'Usage: npm run data:london:operations:compile -- --date=YYYY-MM-DD [--input=recordings/london-operations] [--manifest=public/data/all-change-operations-day-manifest.json] [--chunks=public/data/all-change-operations-day-chunks] [--minimum-samples=1200]',
    )
    return
  }
  const serviceDate = argument('date')
  const input = resolve(argument('input') ?? DEFAULT_INPUT)
  const manifestPath = resolve(argument('manifest') ?? DEFAULT_MANIFEST)
  const chunkDirectory = resolve(argument('chunks') ?? DEFAULT_CHUNK_DIRECTORY)
  const minimumSamples = Number(argument('minimum-samples') ?? 1_200)
  const filenames = (await readdir(input))
    .filter((filename) => filename.endsWith('.json'))
    .sort()
  const snapshots = await Promise.all(
    filenames.map(async (filename) =>
      JSON.parse(await readFile(resolve(input, filename), 'utf8')),
    ),
  )
  const result = compileOperationsDay(snapshots, {
    serviceDate,
    minimumSamples,
    chunkPathPrefix: argument('chunk-path-prefix') ??
      'all-change-operations-day-chunks',
  })
  await mkdir(dirname(manifestPath), { recursive: true })
  await mkdir(chunkDirectory, { recursive: true })
  await Promise.all([
    writeFile(manifestPath, `${JSON.stringify(result.manifest)}\n`),
    ...result.chunks.map(({ descriptor, json }) =>
      writeFile(resolve(chunkDirectory, `${descriptor.id}.json`), json),
    ),
  ])
  console.log(
    `Compiled ${result.manifest.metadata.completeMinutes} London operations minutes into ${result.chunks.length} progressive chunks`,
  )
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
