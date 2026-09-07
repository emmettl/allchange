#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import { compileTflLineProof, sourceSha256 } from './ingest-tfl-line.mjs'
import { mergeNetworkSnapshots } from './merge-network-snapshots.mjs'
import { chunkNetworkSnapshot } from '@motionstudies/data/network-chunks'
import { encodeBusChunk } from '../src/data/bus-day.ts'

const SERVICE_DATE = '2026-09-04'
const OUTPUT = 'fixtures/tfl/all-change-bus-day.json'
const MANIFEST = 'fixtures/tfl/all-change-bus-day-manifest.json'
const DAY = 86_400

// Cache raw public responses, never URLs containing credentials. A separate cache
// directory per refresh makes an interrupted full-network import resumable.
export function createBusSourceLoader(cacheDirectory) {
  let gate = Promise.resolve()
  return async (path) => {
    const file = join(cacheDirectory, `${createHash('sha256').update(path).digest('hex')}.json`)
    try { return JSON.parse(await readFile(file, 'utf8')) } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
    const url = new URL(path, 'https://api.tfl.gov.uk')
    if (process.env.TFL_API_KEY) url.searchParams.set('app_key', process.env.TFL_API_KEY)
    for (let attempt = 0; attempt < 5; attempt++) {
      const slot = gate.then(() => new Promise((done) => setTimeout(done, process.env.TFL_API_KEY ? 250 : 1250)))
      gate = slot
      await slot
      let response
      try {
        response = await fetch(url, { signal: AbortSignal.timeout(30_000) })
      } catch {
        if (attempt === 4) throw new Error(`TfL network failure for ${path}`)
        continue
      }
      if (response.ok) {
        const value = await response.json()
        await mkdir(cacheDirectory, { recursive: true })
        await writeFile(file, JSON.stringify(value))
        return value
      }
      if ((response.status !== 429 && response.status < 500) || attempt === 4) {
        throw new Error(`TfL HTTP ${response.status} for ${path}`)
      }
      const retryAfter = Number(response.headers.get('retry-after'))
      await new Promise((done) => setTimeout(done, Math.max(retryAfter * 1000, 2000 * (attempt + 1))))
    }
    throw new Error(`TfL retries exhausted for ${path}`)
  }
}

export function planBusOrigins(routeSequence) {
  const origins = new Map()
  for (const branch of routeSequence.orderedLineRoutes ?? []) {
    const origin = branch.naptanIds?.[0]
    if (!origin) continue
    // Some terminal stop IDs also occur part-way along the opposite direction.
    // Match the ordered branch against each directional sequence before querying.
    const scores = (routeSequence.stopPointSequences ?? []).map(({ direction, stopPoint }) => {
      let position = 0, matched = 0
      for (const { id } of stopPoint ?? []) {
        const next = branch.naptanIds.indexOf(id, position)
        if (next >= 0) { position = next + 1; matched++ }
      }
      const includesOrigin = stopPoint?.some(({ id }) => id === origin)
      return { direction, score: includesOrigin ? matched : 0 }
    })
    const best = Math.max(0, ...scores.map(({ score }) => score))
    const directions = new Set(scores.filter(({ score }) => score > 0 && score === best).map(({ direction }) => direction))
    for (const direction of directions) {
      if (direction !== 'inbound' && direction !== 'outbound') continue
      origins.set(`${direction}:${origin}`, { direction, origin })
    }
  }
  return [...origins.values()]
}

// TfL occasionally publishes a platform NaPTAN in the timetable and another
// platform in the route sequence (e.g. route 20 at The Crown). Match their TfL
// stop area only when the coordinates are within 150 m; retain the timetable's
// actual stop ID and coordinate in the output.
export function busStopMatcher(routeSequence, timetable) {
  const stops = new Map([...(routeSequence.stopPointSequences ?? []).flatMap(({ stopPoint }) => stopPoint ?? []), ...(timetable.stops ?? [])].map((stop) => [stop.id, stop]))
  return (first, second) => {
    if (first === second) return true
    const a = stops.get(first), b = stops.get(second)
    if (!a || !b || !a.parentId || a.parentId !== b.parentId) return false
    const dx = (a.lon - b.lon) * Math.cos(a.lat * Math.PI / 180) * 111320
    const dy = (a.lat - b.lat) * 111320
    return dx * dx + dy * dy <= 150 * 150
  }
}

// Align occasional timetable platform aliases to a complete advertised branch.
// The surrounding ordered stops must all match, so a shared stop-area name
// alone cannot move a journey onto another road or direction.
export function alignBusTimetableStops(routeSequence, timetable) {
  const catalogue = new Map([...(timetable.stops ?? []), ...(routeSequence.stopPointSequences ?? []).flatMap(({ stopPoint }) => stopPoint ?? [])].map((stop) => [stop.id, stop]))
  const equivalent = (first, second) => {
    if (first === second) return true
    const a = catalogue.get(first), b = catalogue.get(second)
    if (!a?.parentId || a.parentId !== b?.parentId || a.name !== b.name) return false
    const dx = (a.lon - b.lon) * Math.cos(a.lat * Math.PI / 180) * 111320
    const dy = (a.lat - b.lat) * 111320
    return dx * dx + dy * dy <= 1000 * 1000
  }
  const aliases = new Map()
  const departure = timetable.timetable?.departureStopId
  const routes = (timetable.timetable?.routes ?? []).map((route) => ({ ...route,
    stationIntervals: route.stationIntervals.map((interval) => {
      const groups = [departure]
      const groupIndexes = interval.intervals.map(({ stopId }) => {
        if (groups.at(-1) !== stopId) groups.push(stopId)
        return groups.length - 1
      })
      const candidates = (routeSequence.orderedLineRoutes ?? []).filter(({ naptanIds }) => naptanIds?.[0] === departure).flatMap(({ naptanIds }) => {
        let cursor = 0, substitutions = 0
        const matched = []
        for (const stopId of groups) {
          while (cursor < naptanIds.length && !equivalent(stopId, naptanIds[cursor])) cursor++
          if (cursor === naptanIds.length) return []
          const match = naptanIds[cursor++]
          if (match !== stopId) substitutions++
          matched.push(match)
        }
        if (substitutions > groups.length * 0.2) return []
        return [{ matched, score: substitutions * 1000 + cursor - groups.length }]
      }).sort((a, b) => a.score - b.score)
      if (!candidates.length) return interval
      const { matched } = candidates[0]
      return { ...interval, intervals: interval.intervals.map((call, index) => {
        const stopId = matched[groupIndexes[index]]
        if (stopId !== call.stopId) aliases.set(`${call.stopId}:${stopId}`, { from: call.stopId, to: stopId })
        return { ...call, stopId }
      }) }
    }),
  }))
  return { timetable: { ...timetable, stops: [...catalogue.values()], timetable: { ...timetable.timetable, routes } }, aliases: [...aliases.values()] }
}

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
function scheduleScore(name, weekday, schoolDays) {
  const lower = name.toLowerCase()
  if (schoolDays && /non[ -]?school/.test(lower)) return 0
  if (!schoolDays && /school/.test(lower) && !/non[ -]?school/.test(lower)) return 0
  const normalized = lower.split('/')[0]
    .replace(/sunday|su\b/g, 'sun').replace(/monday|mo\b/g, 'mon')
    .replace(/tuesday|tu\b/g, 'tue').replace(/wednesday|we\b/g, 'wed')
    .replace(/thursday|th\b/g, 'thu').replace(/friday|fr\b/g, 'fri')
    .replace(/saturday|sa\b/g, 'sat')
  const range = /(sun|mon|tue|wed|thu|fri|sat)\s*(?:-|to)\s*(sun|mon|tue|wed|thu|fri|sat)/.exec(normalized)
  if (range) {
    const start = DAYS.indexOf(range[1]), end = DAYS.indexOf(range[2])
    return (weekday - start + 7) % 7 <= (end - start + 7) % 7 ? 80 : 0
  }
  if (normalized.includes(DAYS[weekday])) return 100
  if (/daily|every night|nightly/.test(normalized)) return 60
  if (/weekday|schooldays/.test(normalized) && weekday >= 1 && weekday <= 5) return 60
  return 0
}

// Include the preceding service day's tail as well as the chosen day's service.
// TfL night schedules use hours 24–29; Friday Night belongs to Saturday morning.
export function selectBusTimetables(timetable, serviceDate, schoolDays = true) {
  const weekday = new Date(`${serviceDate}T12:00:00Z`).getUTCDay()
  return [
    { weekday: (weekday + 6) % 7, timeOffsetSeconds: -DAY },
    { weekday, timeOffsetSeconds: 0 },
  ].flatMap(({ weekday: day, timeOffsetSeconds }) => {
    const routes = (timetable.timetable?.routes ?? []).flatMap((route) => {
      const rank = (school) => (route.schedules ?? []).map((schedule) => ({
        schedule, score: scheduleScore(schedule.name, day, school),
      })).filter(({ score }) => score > 0).sort((a, b) => b.score - a.score)
      const preferred = rank(schoolDays)
      const ranked = preferred.length ? preferred : rank(!schoolDays)
      if (!ranked.length) return []
      return [{ ...route, schedules: [ranked[0].schedule], scheduleFallback: !preferred.length }]
    })
    return routes.length ? [{
      timetable: { ...timetable, timetable: { ...timetable.timetable, routes } },
      timeOffsetSeconds,
    }] : []
  })
}

export async function compileBusStudy({
  serviceDate = SERVICE_DATE,
  retrievedAt = new Date().toISOString(),
  schoolDays = true,
  loadJson = createBusSourceLoader(`/tmp/allchange-tfl-bus-${retrievedAt.slice(0, 10)}`),
  concurrency = 6,
  onProgress = () => {},
} = {}) {
  const catalogue = await loadJson('/Line/Mode/bus')
  const lines = catalogue.filter(({ modeName }) => modeName === 'bus')
    .sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }))
  if (!lines.length) throw new Error('TfL bus catalogue is empty')
  const results = new Array(lines.length)
  let cursor = 0, complete = 0
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (cursor < lines.length) {
      const index = cursor++, line = lines[index]
      const snapshots = [], issues = [], origins = []
      const routePath = `/Line/${encodeURIComponent(line.id)}/Route/Sequence/all`
      try {
        const routeSequence = await loadJson(routePath)
        origins.push(...planBusOrigins(routeSequence))
        if (!origins.length) issues.push({ reason: 'No advertised directional origins' })
        for (const { direction, origin } of origins) {
          const timetablePath = `/Line/${encodeURIComponent(line.id)}/Timetable/${encodeURIComponent(origin)}?direction=${direction}`
          try {
            const timetable = await loadJson(timetablePath)
            const aligned = alignBusTimetableStops(routeSequence, timetable)
            const selections = selectBusTimetables(aligned.timetable, serviceDate, schoolDays)
            let journeys = 0
            for (const selection of selections) {
              // Each route already has exactly one chosen schedule; use its
              // original name for the source note and bypass rail-day scoring.
              const selected = selection.timetable
              for (let routeIndex = 0; routeIndex < selected.timetable.routes.length; routeIndex++) {
                const route = selected.timetable.routes[routeIndex]
                if (route.scheduleFallback) issues.push({ direction, origin,
                  reason: `Requested ${schoolDays ? 'school-day' : 'non-school-day'} variant unavailable; using published ${route.schedules[0].name}`,
                })
                try {
                  const snapshot = compileTflLineProof({
                    routeSequence: { ...routeSequence, direction },
                    timetable: { ...selected, timetable: { ...selected.timetable, routes: [route] } },
                    scheduleName: route.schedules[0].name,
                    stopIdsEquivalent: busStopMatcher(routeSequence, timetable),
                    serviceDate, retrievedAt,
                    timeOffsetSeconds: selection.timeOffsetSeconds,
                    windowStart: 0, windowEnd: DAY,
                    routeUrl: `https://api.tfl.gov.uk${routePath}`,
                    timetableUrl: `https://api.tfl.gov.uk${timetablePath}`,
                  })
                  if (aligned.aliases.length) snapshot.metadata.note += ` ${aligned.aliases.length} timetable platform aliases aligned to the advertised branch using TfL stop areas.`
                  snapshot.metadata.sourceSha256 = sourceSha256(timetable)
                  snapshot.metadata.geometry.sourceSha256 = sourceSha256(routeSequence)
                  // Identity must remain distinct between timetable routes and
                  // stable where the preceding/current schedules overlap.
                  snapshot.trains = snapshot.trains.map((train) => ({ ...train,
                    id: `${train.id}:r${routeIndex}`,
                  }))
                  journeys += snapshot.trains.length
                  snapshots.push(snapshot)
                  if (snapshot.metadata.geometry.unmatchedBranchPatterns) {
                    issues.push({ direction, origin, reason: `${snapshot.metadata.geometry.unmatchedBranchPatterns} unmatched timetable branch patterns` })
                  }
                } catch (error) {
                  if (!error.message.includes('produced no journeys in the study window')) throw error
                }
              }
            }
            if (!journeys) issues.push({ direction, origin, reason: selections.length ? 'No journeys in the selected civil day' : 'No matching school/day schedule' })
          } catch (error) { issues.push({ direction, origin, reason: error.message }) }
        }
      } catch (error) { issues.push({ reason: error.message }) }
      results[index] = { lineId: line.id, name: line.name, origins, snapshots, issues: [...new Map(issues.map((issue) => [JSON.stringify(issue), issue])).values()] }
      onProgress({ complete: ++complete, total: lines.length, lineId: line.id, issues })
    }
  }))
  const snapshots = results.flatMap(({ snapshots }) => snapshots)
  if (!snapshots.length) throw new Error('TfL bus catalogue produced no usable journeys')
  const merged = mergeNetworkSnapshots(snapshots, { retrievedAt,
    note: `London-wide TfL bus catalogue, ${schoolDays ? 'school-day' : 'non-school-day'} recurring timetables for ${serviceDate}, including the preceding service day's after-midnight tail. Positions interpolate published timetables along route geometry; they are not observed bus telemetry. See coverage for unavailable origins and branches.`,
  })
  const seen = new Set()
  merged.trains = merged.trains.filter((train) => {
    const key = JSON.stringify([train.route, train.start, train.stops, train.pathSegments])
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  const trainIds = new Set(merged.trains.map(({ id }) => id))
  if (trainIds.size !== merged.trains.length) throw new Error('Duplicate bus journey identities')
  // The same street segments occur on many routes. Retain each rendered edge once.
  const edges = [], edgePaths = [], seenEdges = new Set()
  merged.edges.forEach((edge, index) => {
    const key = `${edge.join(':')}:${merged.edgePaths[index]}`
    if (seenEdges.has(key)) return
    seenEdges.add(key); edges.push(edge); edgePaths.push(merged.edgePaths[index])
  })
  merged.edges = edges; merged.edgePaths = edgePaths
  const feedVersion = `all-change-bus:${retrievedAt.slice(0, 10)}`
  merged.metadata = { ...merged.metadata, feedVersion,
    model: 'TfL recurring bus timetable interpolation / not realtime',
    geometry: { ...merged.metadata.geometry, feedVersion, model: 'TfL route geometry matched by ordered stop IDs, with timetable platform aliases aligned to advertised branches using TfL stop areas' },
    coverage: {
      status: results.some(({ issues }) => issues.length) ? 'audited-with-gaps' : 'complete-for-advertised-catalogue',
      catalogueUrl: 'https://api.tfl.gov.uk/Line/Mode/bus',
      catalogueSha256: sourceSha256(catalogue),
      advertisedRouteCount: lines.length,
      activeRouteCount: new Set(merged.trains.map(({ route }) => route)).size,
      schoolDays,
      routes: results.map(({ lineId, name, origins, snapshots, issues }) => ({
        lineId, name, originCount: origins.length,
        journeyCount: merged.trains.filter(({ route }) => route === name).length,
        compiledOriginCount: new Set(snapshots.map(({ trains }) => trains[0]?.id.split(':').slice(1, 3).join(':'))).size,
        issues,
      })),
    },
  }
  return merged
}

export async function writeBusStudy(snapshot, manifestOutput = MANIFEST) {
  const directory = dirname(resolve(manifestOutput))
  const { manifest, chunks } = chunkNetworkSnapshot(snapshot, 7200, 'all-change-bus-day-chunks')
  for (const chunk of chunks) {
    const encoded = JSON.stringify(encodeBusChunk(chunk.payload))
    chunk.descriptor.bytes = Buffer.byteLength(encoded)
    chunk.descriptor.sha256 = createHash('sha256').update(encoded).digest('hex')
    const output = join(directory, chunk.descriptor.path)
    await mkdir(dirname(output), { recursive: true })
    await writeFile(output, encoded)
  }
  await writeFile(resolve(manifestOutput), JSON.stringify({ ...manifest, format: 'tfl-bus-patterns-v1' }))
  return manifest
}

async function main() {
  const argv = process.argv.slice(2)
  const arg = (name, fallback) => { const index = argv.indexOf(`--${name}`); return index < 0 ? fallback : argv[index + 1] }
  const retrievedAt = arg('retrieved-at', new Date().toISOString())
  const snapshot = await compileBusStudy({
    serviceDate: arg('service-date', SERVICE_DATE), retrievedAt,
    schoolDays: !argv.includes('--non-school-days'),
    loadJson: createBusSourceLoader(arg('cache', `/tmp/allchange-tfl-bus-${retrievedAt.slice(0, 10)}`)),
    onProgress: ({ complete, total, lineId, issues }) => {
      if (issues.length || complete % 20 === 0 || complete === total) console.log(`${complete}/${total} routes: ${lineId}${issues.length ? ` (${issues.length} coverage issues)` : ''}`)
    },
  })
  const output = resolve(arg('output', OUTPUT))
  await mkdir(dirname(output), { recursive: true })
  await writeFile(output, JSON.stringify(snapshot))
  await writeBusStudy(snapshot, arg('manifest', MANIFEST))
  console.log(`Wrote ${snapshot.metadata.coverage.activeRouteCount}/${snapshot.metadata.coverage.advertisedRouteCount} routes, ${snapshot.trains.length} journeys, ${snapshot.stops.length} stops`)
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main()
