#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { assembleRailCorridor } from './national-rail-corridor.mjs'
import { fetchBytes } from './ingest-tfl-pdf-timetable.mjs'

export const SWR_SOURCES = [
  { id: 'SWR06', file: 'ptt06-may-2026.pdf', inbound: [4, 5, 6], outbound: [13, 14, 15] },
  { id: 'SWR08', file: 'ptt08a-may-2026.pdf', inbound: [5, 6, 7, 8], outbound: [17, 18, 19, 20] },
].map(source => ({ ...source, url: `https://www.southwesternrailway.com/-/media/files/plan-my-journey/timetables/may-2026/${source.file}` }))
const seconds = text => Number(text.slice(0, 2)) * 3600 + Number(text.slice(2, 4)) * 60
const decode = text => text.replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>')
export function pdfRows(path, page) {
  const xml = execFileSync('pdftotext', ['-f', String(page), '-l', String(page), '-bbox', path, '-'], { encoding: 'utf8' })
  const words = [...xml.matchAll(/<word xMin="([^"]+)" yMin="([^"]+)" xMax="([^"]+)" yMax="([^"]+)">([^<]*)<\/word>/g)]
    .map(([, x1, y1, x2, y2, text]) => ({ x: (Number(x1) + Number(x2)) / 2, y: (Number(y1) + Number(y2)) / 2, text: decode(text).trim() }))
    .filter(word => word.text).sort((a, b) => a.y - b.y || a.x - b.x)
  const rows = []
  for (const word of words) {
    let row = rows.find(row => Math.abs(row.y - word.y) < 1)
    if (!row) { row = { y: word.y, words: [] }; rows.push(row) }
    row.words.push(word)
  }
  return rows.map(row => ({ ...row, words: row.words.sort((a, b) => a.x - b.x) }))
}

/** Preserve physical columns and reject every timetable symbol we have not reviewed. */
export function parseSwrRows(rows, { table, page, direction, names, clockState = { latest: 0 } }) {
  if (!rows.some(row => row.words.map(word => word.text).join(' ').includes('MONDAY TO FRIDAY'))) throw new Error('Unexpected SWR weekday table')
  const blocks = rows.flatMap((row, index) => row.words.some(word => word.text === 'Notes') ? [index] : [])
  const columns = []
  for (const [block, start] of blocks.entries()) {
    const section = rows.slice(start + 1, blocks[block + 1] ?? rows.length)
    const labelled = section.map(row => ({ ...row, label: row.words.filter(word => word.x < 84).map(word => word.text).join(' ') }))
    const waterloo = labelled.find(row => row.label.startsWith('London Waterloo'))
    if (!waterloo) continue
    const anchors = waterloo.words.filter(word => /^\d{4}[a-z]?$/.test(word.text))
    if (!anchors.length) throw new Error(`Missing Waterloo timings ${table}:${page}`)
    const spacing = anchors.length > 1 ? Math.min(...anchors.slice(1).map((word, i) => word.x - anchors[i].x)) : 18
    const cell = (row, column) => row.words.filter(word => word.x > 84 && Math.abs(word.x - anchors[column].x) < spacing * 0.47).map(word => word.text).join(' ')
    for (let column = 0; column < anchors.length; column++) {
      let anchor = seconds(anchors[column].text)
      if (clockState.latest > 21 * 3600 && anchor < 3 * 3600) anchor += 86400
      clockState.latest = Math.max(clockState.latest, anchor)
      const flags = cell(rows[start], column).split(/\s+/).filter(Boolean)
      if (flags.some(flag => !['y', '1', ':', 'FO', 'FX', 'SO', 'SX'].includes(flag))) throw new Error(`Unreviewed SWR note ${table}:${page}:${block + 1}:${column + 1}: ${flags}`)
      const calls = []
      for (const row of labelled) {
        const name = names.find(name => row.label.startsWith(name))
        if (!name) continue
        const value = cell(row, column).split(' ').filter(token => token !== 'v').join(' ')
        if (!value || value === 'v') continue
        if (!/^\d{4}[uas]?$/.test(value)) throw new Error(`Unreviewed SWR timing ${name}: ${value}`)
        const kind = value.endsWith('a') || row.label.trim().endsWith('a') ? 'arrival' : 'departure'
        // Anchor the times to Waterloo's service-day position, including the midnight crossing.
        let time = seconds(value) + Math.floor(anchor / 86400) * 86400
        if (direction === 'inbound' && time > anchor + 12 * 3600) time -= 86400
        if (direction === 'outbound' && time < anchor - 12 * 3600) time += 86400
        calls.push({ name, time, kind, pickupOnly: value.endsWith('u'), setDownOnly: value.endsWith('s') })
      }
      columns.push({ id: `national-rail:${table}:${page}:${block + 1}:${column + 1}`, direction, flags, calls, source: { table, page, block: block + 1, column: column + 1 } })
    }
  }
  return columns
}

export function calendarJourneys(columns, serviceDate, names, { requireWoking = true } = {}) {
  const journeys = [], excluded = []
  for (const column of columns) for (const dayOffset of [-86400, 0]) {
    const nominalWeekday = new Date(`${serviceDate}T12:00:00Z`).getUTCDay() + dayOffset / 86400
    const firstTime = Math.min(...column.calls.map(call => call.time))
    const actualWeekday = (nominalWeekday + Math.floor(firstTime / 86400) + 7) % 7
    const id = column.id + (dayOffset ? ':previous-day' : '')
    if (column.flags.includes('FO') && nominalWeekday !== 5 || column.flags.includes('FX') && nominalWeekday === 5 || column.flags.includes('SO') && actualWeekday !== 6 || column.flags.includes('SX') && actualWeekday === 6) {
      excluded.push({ id, reason: `Weekday exception: ${column.flags.join(' ')}` }); continue
    }
    const grouped = new Map()
    for (const call of column.calls) {
      const index = names.indexOf(call.name)
      if (index < 0) continue
      const entry = grouped.get(index) ?? { index }
      entry[call.kind] = call.time + dayOffset
      grouped.set(index, entry)
    }
    const stops = [...grouped.values()].map(({ index, arrival, departure }) => [index, arrival ?? departure, departure ?? arrival])
      .sort((a, b) => column.direction === 'outbound' ? a[0] - b[0] : b[0] - a[0])
    if (requireWoking && !stops.some(([index]) => names[index] === 'Woking')) { excluded.push({ id, reason: 'No paired Waterloo/Woking call in this corridor' }); continue }
    if (stops.length < 2 || stops[0][1] >= 86400 || stops.at(-1)[2] < 0) { excluded.push({ id, reason: 'Outside calendar study day or insufficient corridor calls' }); continue }
    if (stops.some(([, a, d], i) => d < a || i && a < stops[i - 1][2])) throw new Error(`Non-monotonic SWR column ${id}`)
    journeys.push({ id, direction: column.direction, route: 'SWR mainline', headsign: column.direction === 'inbound' ? 'London Waterloo' : 'Via Woking', shortName: 'SWR', category: 'intercity', mode: 'national-rail', servicePattern: 'express', stops, start: stops[0][1], end: stops.at(-1)[2], source: column.source })
  }
  return { journeys, excluded }
}

export function enrichSwrCalls(trains, detailed, names) {
  const waterloo = names.indexOf('London Waterloo'), surbiton = names.indexOf('Surbiton'), clapham = names.indexOf('Clapham Junction')
  const audit = []
  const journeys = trains.map(train => {
    const terminal = train.stops.find(([index]) => index === waterloo)
    const candidates = detailed.filter(other => other.direction === train.direction && other.stops.some(([index, arrival]) => index === waterloo && arrival === terminal[1]) && [surbiton, clapham].every(index => {
      const a = train.stops.find(stop => stop[0] === index), b = other.stops.find(stop => stop[0] === index)
      if (Boolean(a) !== Boolean(b)) return false
      if (!a || !b) return true
      return index === surbiton && train.direction === 'inbound' ? b[2] >= a[1] && b[2] - a[1] <= 300 : a[2] === b[2]
    }))
    if (candidates.length !== 1) { audit.push({ id: train.id, reason: candidates.length ? 'Ambiguous detailed-table match; primary calls retained' : 'No detailed-table match; primary calls retained' }); return train }
    const detail = candidates[0], calls = new Map(train.stops.map(stop => [stop[0], [...stop]]))
    for (const stop of detail.stops) {
      const prior = calls.get(stop[0])
      calls.set(stop[0], prior ? [stop[0], Math.min(prior[1], stop[1]), Math.max(prior[2], stop[2])] : [...stop])
    }
    const stops = [...calls.values()].sort((a, b) => train.direction === 'outbound' ? a[0] - b[0] : b[0] - a[0])
    if (stops.some(([, a], i) => i && a < stops[i - 1][2])) throw new Error(`Conflicting detail timetable ${train.id}`)
    return { ...train, stops, route: 'SWR stopping', servicePattern: 'local', source: { ...train.source, enrichedFrom: detail.source } }
  })
  return { journeys, audit }
}

export async function compileSwr(cache = '/tmp/allchange-waterloo') {
  const serviceDate = '2026-09-04', sources = [], tables = []
  const geometryBytes = await readFile('fixtures/national-rail/waterloo-geometry.json'), geometry = JSON.parse(geometryBytes)
  const names = geometry.stops.map(stop => stop[2])
  await mkdir(cache, { recursive: true })
  for (const source of SWR_SOURCES) {
    const path = resolve(cache, `${source.id}.pdf`)
    let bytes
    try { bytes = await readFile(path) } catch { bytes = await fetchBytes(source.url); await writeFile(path, bytes) }
    sources.push({ ...source, sha256: createHash('sha256').update(bytes).digest('hex') })
    const columns = []
    for (const direction of ['inbound', 'outbound']) {
      const clockState = { latest: 0 }
      for (const page of source[direction]) columns.push(...parseSwrRows(pdfRows(path, page), { table: source.id, page, direction, names, clockState }))
    }
    tables.push(calendarJourneys(columns, serviceDate, names, { requireWoking: source.id === 'SWR06' }))
  }
  const enriched = enrichSwrCalls(tables[0].journeys, tables[1].journeys, names)
  const reference = JSON.parse(await readFile('fixtures/tfl/all-change-rail-led-morning.json'))
  const snapshot = assembleRailCorridor({ journeys: enriched.journeys, geometry, bounds: reference.bounds, excluded: tables[0].excluded, metadata: {
    publisher: 'South Western Railway', feedVersion: 'swr-waterloo-woking-v1', serviceDate, windowStart: 0, windowEnd: 86400, focusTime: 27900, sourceUrl: 'https://www.southwesternrailway.com/plan-my-journey/timetables', retrievedAt: new Date().toISOString(), model: 'Published recurring Friday timetable interpolation / not observed operations', modes: ['national-rail'], sources,
    note: 'Waterloo–Woking services from table 6, enriched by uniquely matching table 8 intermediate calls. Other SWR branches and trains passing Woking without a timing are excluded. Full origins/destinations are not established by these corridor tables. Temporary timetable and engineering alterations are not applied. Berrylands is closed in the source timetable. Single-sided calls have no invented dwell.',
    geometry: { ...geometry.metadata, sourceSha256: createHash('sha256').update(geometryBytes).digest('hex'), wayIds: geometry.wayIds },
    coverage: { corridor: 'London Waterloo – Clapham Junction – Woking', detailedTableMatches: enriched.journeys.filter(train => train.source.enrichedFrom).length, detailAudit: enriched.audit },
  } })
  await writeFile('fixtures/national-rail/waterloo.json', JSON.stringify(snapshot))
  console.log(`SWR: ${snapshot.trains.length} journeys, ${snapshot.metadata.coverage.detailedTableMatches} enriched, ${snapshot.paths.length} paths`)
  return snapshot
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const index = process.argv.indexOf('--cache')
  await compileSwr(index < 0 ? undefined : process.argv[index + 1])
}
