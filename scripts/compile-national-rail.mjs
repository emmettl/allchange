#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { readFile, mkdir, writeFile, mkdtemp, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { assembleRailCorridor } from './national-rail-corridor.mjs'
import { extractPdfText, fetchBytes } from './ingest-tfl-pdf-timetable.mjs'

export const SOURCES = [
  { id: 'T10', file: 'T10-train-times-17-May-to-12-December-2026-v2.pdf', pages: [4, 10] },
  { id: 'TS', file: 'TS-train-times-17-May-to-12-December-2026.pdf', pages: [4, 7] },
].map(source => ({ ...source, url: `https://www.gwr.com/-/media/gwr-sc-website/files/timetables/may-26-december-26/${source.file}` }))
const NAMES = ['London Paddington', 'Ealing Broadway', 'Southall', 'Hayes & Harlington', 'West Drayton', 'Iver', 'Langley', 'Slough', 'Burnham', 'Taplow', 'Maidenhead', 'Twyford', 'Reading']
const IDS = ['910GPADTON', '910GEALINGB', '910GSTHALL', '910GHAYESAH', '910GWDRYTON', '910GIVER', '910GLANGLEY', '910GSLOUGH', '910GBNHAM', '910GTAPLOW', '910GMDNHEAD', '910GTWYFORD', '910GRDNGSTN']
const DESTINATIONS = { NBY: 'Newbury', BAN: 'Banbury', BDW: 'Bedwyn', BPW: 'Bristol Parkway', BRI: 'Bristol Temple Meads', CDF: 'Cardiff Central', CMN: 'Carmarthen', CNM: 'Cheltenham Spa', EXD: 'Exeter St Davids', FRO: 'Frome', GMV: 'Great Malvern', HFD: 'Hereford', NQY: 'Newquay', PGN: 'Paignton', PLY: 'Plymouth', PMD: 'Pembroke Dock', PNZ: 'Penzance', SWA: 'Swansea', TAU: 'Taunton', WOF: 'Worcester Foregate Street', WOP: 'Worcestershire Parkway', WOS: 'Worcester Shrub Hill', WSB: 'Westbury', WSM: 'Weston-super-Mare' }
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const normalise = value => value.replaceAll(/\s+/g, ' ').trim()
const clock = value => Number(value.slice(0, 2)) * 3600 + Number(value.slice(2, 4)) * 60 - (value.includes('p') ? 86400 : 0)

/** Parse only the reviewed Friday tables, retaining an audit of excluded columns. */
export function parseTable(text, sourceId, page, direction) {
  if (!text.includes('MONDAYS TO FRIDAYS') || text.includes('FROM 5 OCTOBER')) throw new Error('Wrong service-date table')
  const lines = text.split('\n')
  const starts = lines.flatMap((line, index) => line.trimStart().startsWith('Facilities') ? [index] : [])
  const journeys = [], excluded = []
  let previousAnchor = -86400, dayOffset = 0
  for (const [block, start] of starts.entries()) {
    const rows = lines.slice(start + 1, starts[block + 1] ?? lines.length)
    const pad = rows.find(line => /^\s*London\s+Paddington.*\d{4}/.test(line))
    if (!pad) throw new Error(`Missing Paddington row ${sourceId}:${page}:${block + 1}`)
    const tokens = [...pad.matchAll(/\d{4}[a-z]*|·/g)]
    const centers = tokens.map(token => token.index + (token[0] === '·' ? 0 : 1.5))
    const cells = line => {
      const result = new Array(tokens.length).fill('')
      if (!line) return result
      for (const token of line.matchAll(/\d{4}[a-z]*|·|\b[A-Z]{1,3}\b/g)) {
        const center = token.index + (token[0] === '·' ? 0 : (token[0].match(/^\d/) ? 1.5 : (token[0].length - 1) / 2))
        if (center < centers[0] - 30) continue
        const index = centers.reduce((best, c, i) => Math.abs(c - center) < Math.abs(centers[best] - center) ? i : best, 0)
        if (Math.abs(centers[index] - center) > 30) continue
        result[index] += `${result[index] ? ' ' : ''}${token[0]}`
      }
      return result
    }
    const noteLine = lines.slice(block ? starts[block - 1] + 1 : 0, start).reverse().find(line => /^\s*Notes\b/.test(line))
    // A notes row belongs only to the immediately preceding header, not an earlier block.
    const lastData = lines.slice(0, start).findLastIndex(line => /^\s*London\s+Paddington.*\d{4}/.test(line))
    const notes = cells(noteLine && lines.lastIndexOf(noteLine, start) > lastData ? noteLine : '')
    const parsedRows = rows.flatMap(line => {
      const name = NAMES.find(name => normalise(line).startsWith(name))
      if (!name) return []
      const first = line.search(/\d{4}|·/)
      if (first < 0) return []
      const kind = /a\s*$/.test(line.slice(0, first)) ? 'a' : 'd'
      return [{ stop: NAMES.indexOf(name), kind, values: cells(line) }]
    })
    if (!tokens.length) throw new Error(`Missing columns ${sourceId}:${page}:${block + 1}`)
    const readingKind = direction === 'outbound' ? 'a' : 'd'
    const reading = parsedRows.find(row => row.stop === 12 && row.kind === readingKind)
    if (!reading) throw new Error(`Missing Reading row ${sourceId}:${page}:${block + 1}`)
    const destinations = cells(rows.find(line => normalise(line).startsWith('Train continues to')))
    const didcot = cells(rows.find(line => normalise(line).startsWith('Didcot Parkway')))
    for (let column = 0; column < tokens.length; column++) {
      const id = `${sourceId}:${page}:${block + 1}:${column + 1}`
      const padTime = tokens[column][0], readingTime = reading?.values[column] ?? ''
      if (!/^\d{4}/.test(padTime) || !/^\d{4}/.test(readingTime)) { excluded.push({ id, reason: 'No paired Paddington/Reading timing; outside this corridor proof' }); continue }
      const anchor = clock(direction === 'outbound' ? padTime : readingTime)
      if (anchor + dayOffset < previousAnchor - 12 * 3600) dayOffset += 86400
      previousAnchor = anchor + dayOffset
      const flags = notes[column].split(' ').filter(Boolean)
      if (flags.some(flag => ['MO', 'FX', 'SM', 'MM', 'SUM', 'A', 'D'].includes(flag))) { excluded.push({ id, reason: `Not Friday 4 September: ${flags.join(' ')}` }); continue }
      if (flags.some(flag => !['MX', 'FO', 'B', 'C', 'H', 'G', 'TFM', 'TSM'].includes(flag))) throw new Error(`Unreviewed note ${id}: ${notes[column]}`)
      if (/ae|b|f|e/.test(padTime + readingTime)) { excluded.push({ id, reason: 'Connection, bus or earlier-arrival alternative' }); continue }
      const ordered = direction === 'outbound' ? NAMES.map((_, i) => i) : NAMES.map((_, i) => 12 - i)
      const calls = []
      let previousTime = anchor + dayOffset
      for (const stop of ordered) {
        const stopRows = parsedRows.filter(row => row.stop === stop)
        let arrival = stopRows.find(row => row.kind === 'a')?.values[column]
        let departure = stopRows.find(row => row.kind === 'd')?.values[column]
        if (stop === ordered[0]) arrival = departure
        if (stop === ordered.at(-1)) departure = arrival
        const value = arrival && /^\d{4}/.test(arrival) ? arrival : departure
        if (!value || !/^\d{4}/.test(value)) continue
        if (/ae|b|f|e/.test(value)) throw new Error(`Unexpected connecting call ${id}: ${value}`)
        let a = clock(value) + dayOffset
        while (a < previousTime - 12 * 3600) a += 86400
        let d = departure && /^\d{4}/.test(departure) ? clock(departure) + dayOffset : a
        while (d < a - 12 * 3600) d += 86400
        if (a < previousTime || d < a) throw new Error(`Non-monotonic call ${id}: ${stop} ${a} ${d}`)
        calls.push([stop, a, d]); previousTime = d
      }
      if (calls.length < 2 || calls.at(-1)[2] <= 0 || calls[0][1] >= 86400) { excluded.push({ id, reason: 'Outside calendar study day' }); continue }
      const continued = DESTINATIONS[destinations[column]]
      if (destinations[column] && !continued) throw new Error(`Unknown destination ${destinations[column]}`)
      const terminal = ['Oxford', 'Swindon', 'Didcot Parkway', 'Newbury'].find(name => /^\d{4}/.test(cells(rows.find(line => normalise(line).startsWith(name)))[column]))
      const destination = direction === 'inbound' ? 'London Paddington' : continued ?? (sourceId === 'T10' && /^\d{4}/.test(didcot[column]) ? 'Didcot Parkway' : sourceId === 'TS' ? terminal ?? 'Reading' : 'Reading')
      journeys.push({ id: `national-rail:${id}`, route: calls.length > 2 ? 'GWR stopping' : 'GWR fast', headsign: destination, shortName: `GWR ${padTime.slice(0, 2)}:${padTime.slice(2, 4)}`, category: 'intercity', mode: 'national-rail', servicePattern: calls.length > 2 ? 'local' : 'express', start: calls[0][1], end: calls.at(-1)[2], stops: calls, source: { table: sourceId, page, block: block + 1, column: column + 1 }, direction })
    }
  }
  return { journeys, excluded }
}

const distance = (a, b) => Math.hypot((b[0] - a[0]) * Math.cos((a[1] + b[1]) * Math.PI / 360), b[1] - a[1]) * 111.32
export function corridorGeometry(network) {
  const indexes = IDS.map(id => network.stops.findIndex(stop => stop[4] === id))
  if (indexes.includes(-1)) throw new Error('Missing source corridor station')
  const graph = new Map()
  for (const train of network.trains.filter(train => train.mode === 'elizabeth-line')) {
    train.stops.slice(1).forEach(([to], i) => {
      const from = train.stops[i][0], path = network.paths[train.pathSegments[i]]
      if (!path) return
      const forward = distance(path[0], network.stops[from]) < distance(path.at(-1), network.stops[from]) ? path : [...path].reverse()
      const weight = forward.slice(1).reduce((sum, point, j) => sum + distance(forward[j], point), 0)
      for (const [a, b, points] of [[from, to, forward], [to, from, [...forward].reverse()]]) {
        const edges = graph.get(a) ?? new Map()
        if (!edges.has(b) || weight < edges.get(b).weight) edges.set(b, { points, weight })
        graph.set(a, edges)
      }
    })
  }
  const paths = []
  for (let i = 1; i < indexes.length; i++) {
    const queue = [{ stop: indexes[i - 1], weight: 0, points: [] }], visited = new Set()
    let found
    while (queue.length) {
      queue.sort((a, b) => a.weight - b.weight)
      const current = queue.shift()
      if (visited.has(current.stop)) continue
      if (current.stop === indexes[i]) { found = current; break }
      visited.add(current.stop)
      for (const [stop, edge] of graph.get(current.stop) ?? []) queue.push({ stop, weight: current.weight + edge.weight, points: [...current.points, ...edge.points.slice(current.points.length ? 1 : 0)] })
    }
    if (!found || found.weight > Math.max(8, distance(network.stops[indexes[i - 1]], network.stops[indexes[i]]) * 2)) throw new Error(`Unresolved corridor geometry ${IDS[i]}`)
    paths.push(found.points)
  }
  return { stops: indexes.map((index, i) => [...network.stops[index].slice(0, 2), NAMES[i], '', IDS[i]]), paths }
}


// Coordinates preserve columns that pdftotext -layout compresses inconsistently.
export async function extractAlignedTable(bytes, page) {
  const directory = await mkdtemp(resolve(tmpdir(), 'allchange-gwr-'))
  try {
    const path = resolve(directory, 'source.pdf')
    await writeFile(path, bytes)
    const xml = execFileSync('pdftotext', ['-f', String(page), '-l', String(page), '-bbox', path, '-'], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 })
    const words = [...xml.matchAll(/<word xMin="([^"]+)" yMin="([^"]+)" xMax="([^"]+)" yMax="([^"]+)">([^<]+)<\/word>/g)].map(([, x1, y1, x2, y2, text]) => ({ x: (Number(x1) + Number(x2)) / 2, y: (Number(y1) + Number(y2)) / 2, text: text.replaceAll('&amp;', '&').replaceAll('&gt;', '>').replaceAll('&lt;', '<') })).sort((a, b) => a.y - b.y || a.x - b.x)
    const rows = []
    for (const word of words) {
      if (word.x < 25) continue // Rotated weekday labels are outside the table.
      let row = rows.find(row => Math.abs(row.y - word.y) < 2)
      if (!row) { row = { y: word.y, words: [] }; rows.push(row) }
      row.words.push(word)
    }
    const original = await extractPdfText(bytes, page, page)
    if (!original.includes('MONDAYS TO FRIDAYS') || original.includes('FROM 5 OCTOBER')) throw new Error('Unexpected weekday table')
    return 'MONDAYS TO FRIDAYS\n' + rows.map(row => {
      const chars = []
      for (const word of row.words.sort((a, b) => a.x - b.x)) {
        const start = Math.round(word.x * 4 - (word.text.length - 1) / 2)
        for (let i = 0; i < word.text.length; i++) chars[start + i] = word.text[i]
      }
      return Array.from({ length: chars.length }, (_, i) => chars[i] ?? ' ').join('')
    }).join('\n')
  } finally { await rm(directory, { recursive: true, force: true }) }
}

export async function compile(cache) {
  const excluded = [], journeys = [], sources = []
  for (const source of SOURCES) {
    const bytes = cache ? await readFile(resolve(cache, `${source.id}.pdf`)) : await fetchBytes(source.url)
    sources.push({ ...source, sha256: hash(bytes) })
    for (const [index, page] of source.pages.entries()) {
      const text = await extractAlignedTable(bytes, page)
      const result = parseTable(text, source.id, page, index === 0 ? 'outbound' : 'inbound')
      excluded.push(...result.excluded); journeys.push(...result.journeys)
    }
  }
  // T10 carries intermediate calls; prefer it when TS republishes that same train.
  const unique = new Map()
  for (const train of journeys) {
    const key = `${train.direction}:${train.start}:${train.end}`
    if (unique.has(key)) { excluded.push({ id: train.id, reason: 'Duplicate of stopping table service' }); continue }
    unique.set(key, train)
  }
  const geometryBytes = await readFile('fixtures/tfl/all-change-rail-led-morning.json')
  const reference = JSON.parse(geometryBytes)
  const geometry = corridorGeometry(reference)
  const trains = [...unique.values()]
  const snapshot = assembleRailCorridor({ journeys: trains, geometry, excluded,
    metadata: { publisher: 'Great Western Railway', feedVersion: 'gwr-paddington-proof-v1', serviceDate: '2026-09-04', windowStart: 0, windowEnd: 86400, focusTime: 27900, sourceUrl: 'https://www.gwr.com/travel-information/train-times', retrievedAt: new Date().toISOString(), model: 'Published recurring Friday timetable interpolation / not observed operations', note: 'Paddington–Reading corridor proof. TS services without a paired Reading time are excluded; this is not all GWR or National Rail. Engineering alterations are not applied. Single departure-only calls have no invented dwell. Corridor geometry is shared with Elizabeth line and does not identify individual fast/slow tracks.', modes: ['national-rail'], sources, geometry: { ...reference.metadata.geometry, sourceSha256: hash(geometryBytes), model: 'Shortest connected Elizabeth line corridor paths, Paddington mainline to Reading' }, coverage: { corridor: 'London Paddington – Reading', includedJourneys: trains.length, excluded } },
    bounds: reference.bounds,
  })
  await mkdir('fixtures/national-rail', { recursive: true })
  await writeFile('fixtures/national-rail/paddington.json', JSON.stringify(snapshot))
  console.log(`National Rail: ${trains.length} journeys, ${excluded.length} audited exclusions, ${snapshot.paths.length} paths`)
  return snapshot
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const cacheIndex = process.argv.indexOf('--cache')
  await compile(cacheIndex < 0 ? undefined : process.argv[cacheIndex + 1])
}
