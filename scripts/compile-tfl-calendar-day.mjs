import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { compileUnifiedApiLattice } from './compile-tfl-morning-lattice.mjs'
import { mergeNetworkSnapshots } from './merge-network-snapshots.mjs'
import { uniquePdfJourneys } from './compile-tfl-pdf-lattice.mjs'
import { chunkNetworkSnapshot } from '@motionstudies/data/network-chunks'

// The retained PDF compiler admits Monday–Friday / Monday–Saturday pages only.
// Adjacent Thursday and Friday therefore share those recurring columns. Early
// 00xx-origin columns already have calendar-day clocks; shift only 23xx carry-in.
export function pdfWeekdayCarryIn(snapshot) {
  if (snapshot.metadata.serviceDate !== '2026-09-04') throw new Error('Re-audit PDF day applicability for a different date')
  const tail = snapshot.trains.filter(train => train.start < 86400 && train.end > 86400).map(train => ({
    ...train, id: `2026-09-03:${train.id}`, start: train.start - 86400, end: train.end - 86400,
    stops: train.stops.map(([stop, arrival, departure]) => [stop, arrival - 86400, departure - 86400]),
  }))
  return { ...snapshot, trains: [...tail, ...snapshot.trains], metadata: { ...snapshot.metadata,
    calendar: { previousDate: '2026-09-03', sharedPages: 'Monday–Friday / Monday–Saturday', carryIn: tail.length,
      limitation: 'Existing branch and full-endpoint PDF exclusions remain; Friday-night/Saturday PDF service requires a separate page audit.' } } }
}

async function main() {
  const cacheIndex = process.argv.indexOf('--cache')
  const cache = cacheIndex < 0 ? '/tmp/allchange-tfl-rail-calendar-2026-09-08' : process.argv[cacheIndex + 1]
  const offline = process.argv.includes('--offline')
  await mkdir(cache, { recursive: true })
  const sources = []
  async function loadJson(path) {
    const key = createHash('sha256').update(path).digest('hex'), file = `${cache}/${key}.json`
    let bytes
    try { bytes = await readFile(file) } catch {
      if (offline) throw new Error(`Missing retained source ${file}`)
      let response
      for (let attempt = 0; attempt < 6; attempt++) {
        response = await fetch(`https://api.tfl.gov.uk${path}`)
        if (response.status !== 429) break
        await new Promise(done => setTimeout(done, 30000))
      }
      if (!response.ok) throw new Error(`TfL ${response.status}: ${path}`)
      bytes = Buffer.from(await response.arrayBuffer()); await writeFile(file, bytes)
    }
    sources.push({ url: `https://api.tfl.gov.uk${path}`, file: `${key}.json`, sha256: createHash('sha256').update(bytes).digest('hex') })
    return JSON.parse(bytes)
  }
  const catalogue = JSON.parse(await readFile('fixtures/tfl/all-change-rail-led-catalogue.json', 'utf8'))
  const saturday = process.argv.includes('--saturday-audit')
  const unified = await compileUnifiedApiLattice({ catalogue, serviceDate: saturday ? '2026-09-05' : '2026-09-04',
    retrievedAt: '2026-09-08T18:00:00.000Z', windowStart: 0, windowEnd: saturday ? 18000 : 86400,
    includePreviousDay: true, loadJson, batchSize: 1, pauseMs: offline ? 0 : 550 })
  const audit = { serviceDate: unified.metadata.serviceDate, sources, coverage: unified.metadata.coverage,
    checkpoints: [0, 1800, 9000, 16200].map(time => ({ time, journeys: unified.trains.filter(t => t.start <= time && t.end > time).length })),
    limitation: 'Recurring Tube/DLR/tram schedules captured 8 September, not historical operations. Origin/branch exclusions remain explicit. Saturday audit covers these modes only.' }
  if (saturday) {
    await writeFile('fixtures/night/saturday-audit.json', JSON.stringify(audit, null, 2) + '\n')
    return
  }
  const baseManifestPath = 'fixtures/night/friday-base-manifest.json', baseBytes = await readFile(baseManifestPath)
  const base = JSON.parse(baseBytes), trains = new Map(), retainedChunks = new Map()
  for (const descriptor of base.chunks) {
    const path = descriptor.path.endsWith('/00-02.json') ? 'fixtures/night/friday-base-00-02.json' : `fixtures/tfl/${descriptor.path}`
    const bytes = await readFile(path)
    if (bytes.length !== descriptor.bytes || createHash('sha256').update(bytes).digest('hex') !== descriptor.sha256) throw new Error(`Retained Friday input changed: ${path}`)
    retainedChunks.set(descriptor.path, bytes)
    for (const train of JSON.parse(bytes).trains) trains.set(train.id, train)
  }
  base.trains = [...trains.values()]
  const pdf = pdfWeekdayCarryIn({ ...base, trains: base.trains.filter(train => ['overground','elizabeth-line'].includes(train.mode)) })
  pdf.trains = pdf.trains.filter(train => train.id.startsWith('2026-09-03:'))
  audit.pdf = { inputSha256: createHash('sha256').update(baseBytes).digest('hex'), calendar: pdf.metadata.calendar,
    coverage: 'Retained Friday delivery, published shared-weekday PDF branches. Original source hashes and exclusions are retained in friday-base-manifest.json.' }
  const tail = { ...unified, trains: unified.trains.filter(train => train.id.startsWith('2026-09-03:')) }
  const merged = mergeNetworkSnapshots([base, tail, pdf], { retrievedAt: '2026-09-08T18:00:00.000Z', note: 'Retained Friday calendar day with freshly captured Thursday recurring rail carry-in. Existing inactive origins and PDF branch restrictions remain. Not actual operations.' })
  // A 00xx branch origin can be the tail of a 23xx through train once that
  // train is shifted into the calendar day (e.g. Paddington 00:07 to Shenfield).
  const isPdf = train => ['overground', 'elizabeth-line'].includes(train.mode)
  const uniquePdf = new Set(uniquePdfJourneys(merged.trains.filter(isPdf)))
  merged.trains = merged.trains.filter(train => !isPdf(train) || uniquePdf.has(train))
  merged.metadata.calendarAudit = 'fixtures/night/rail-calendar-audit.json'
  await writeFile('fixtures/tfl/all-change-rail-led-day.json', JSON.stringify(merged) + '\n')
  const { manifest, chunks } = chunkNetworkSnapshot(merged, 7200, 'all-change-day-chunks')
  for (const [index, chunk] of chunks.entries()) {
    if (index === 0) {
      await writeFile(`fixtures/tfl/${chunk.descriptor.path}`, JSON.stringify(chunk.payload))
    } else {
      // Carry-in changes the first chunk only. Keep the reviewed Friday bytes
      // (including ordering) and reject an accidental daytime change.
      const original = JSON.parse(retainedChunks.get(chunk.descriptor.path))
      const byId = new Map(original.trains.map(train => [train.id, JSON.stringify(train)]))
      if (chunk.payload.trains.length !== original.trains.length || chunk.payload.trains.some(train => byId.get(train.id) !== JSON.stringify(train))) throw new Error('Calendar audit altered retained daytime journeys')
      manifest.chunks[index] = base.chunks[index]
    }
  }
  await writeFile('fixtures/tfl/all-change-day-manifest.json', JSON.stringify(manifest))
  await writeFile('fixtures/night/rail-calendar-audit.json', JSON.stringify(audit, null, 2) + '\n')
  console.log(`${merged.trains.length} calendar-day journeys; ${merged.trains.filter(t => t.start < 0 && t.end > 0).length} cross midnight`)
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main()
