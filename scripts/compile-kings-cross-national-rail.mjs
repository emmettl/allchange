#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { assembleRailCorridor } from './national-rail-corridor.mjs'
import { fetchBytes } from './ingest-tfl-pdf-timetable.mjs'

export const KINGS_CROSS_SOURCE = {
  table: 'YA01',
  url: 'https://www.networkrail.co.uk/wp-content/uploads/2025/02/01.-June-2026-December-2026-Working-timetable-documents.zip',
  member: '01. June 2026 - December 2026 Working timetable documents/YA/YA01/YA01 - KINGS CROSS AND MOORGATE TO HERTFORD NORTH AND WELWYN GARDEN CITY.xlsx',
}
export const WTT_STATIONS = ['LONDON KINGS CROSS', 'FINSBURY PARK', 'HARRINGAY', 'HORNSEY', 'ALEXANDRA PALACE', 'NEW SOUTHGATE', 'OAKLEIGH PARK', 'NEW BARNET', 'HADLEY WOOD', 'POTTERS BAR', 'BROOKMANS PARK', 'WELHAM GREEN', 'HATFIELD', 'WELWYN GARDEN CITY']
const OPERATORS = { GN: 'Great Northern', GR: 'LNER', LD: 'Lumo', HT: 'Hull Trains', GC: 'Grand Central', TL: 'Thameslink' }
const EMPTY = value => !value || value === '..'
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')

export function wttTime(value) {
  // Reviewed YA references: T passenger stop, TB/TF origin/terminate, S service note,
  // A arrival, K/KE catering. Slash denotes passing; half-minute precision is retained.
  const match = /^(\d{2})([A-Z/ ]*)(\d{2})(½?)$/.exec(value)
  if (!match || !['', '/', 'T', 'TB', 'TF', 'S', 'TBS', 'TBK KE', 'A'].includes(match[2]) || +match[1] > 23 || +match[3] > 59) throw new Error(`Unreviewed WTT time: ${value}`)
  return +match[1] * 3600 + +match[3] * 60 + (match[4] ? 30 : 0)
}

export function wttRunsOn(days, range, date) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4}) to (\d{2})\/(\d{2})\/(\d{4})$/.exec(range)
  if (!match) throw new Error(`Unreviewed WTT date range: ${range}`)
  if (date < `${match[3]}-${match[2]}-${match[1]}` || date > `${match[6]}-${match[5]}-${match[4]}`) return false
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay()
  if (![1, 2, 3, 4, 5].includes(weekday)) return false
  // These are the complete day codes in the selected King’s Cross passenger columns.
  if (!['SX', 'MO', 'MX'].includes(days)) throw new Error(`Unreviewed WTT operating days: ${days}`)
  return days === 'SX' || (days === 'MO' ? weekday === 1 : weekday !== 1)
}

function terminal(value) {
  const match = /^(.+)\n(\d{2}):(\d{2})$/.exec(value)
  if (!match) throw new Error(`Unreviewed WTT terminal: ${value}`)
  return { name: match[1], time: wttTime(match[2] + match[3]) }
}
const displayName = name => name === 'LONDON KINGS CROSS' ? "London King's Cross" : name.toLowerCase().replace(/\b\w/g, letter => letter.toUpperCase()).replace('Kings Lynn', "King’s Lynn")

/** Import passenger columns, preserving UID, source cells, actual day and pass/stop distinction. */
export function parseKingsCrossWtt(sheets, serviceDate = '2026-09-04') {
  if (![1, 2, 3, 4, 5].includes(new Date(`${serviceDate}T12:00:00Z`).getUTCDay())) throw new Error('YA01 importer requires a weekday study')
  const journeys = [], excluded = [], identities = new Set()
  for (const [sheet, rows] of Object.entries(sheets)) {
    if (!['Mondays to Fridays Forward', 'Mondays to Fridays Reverse'].includes(sheet)) throw new Error(`Unexpected WTT sheet: ${sheet}`)
    for (const [i, label] of ['TID', 'UID', 'Operator', 'Origin', 'Destination', 'Timing Load', 'Dates of Operation', 'Running Days', 'Service Code'].entries()) if (rows[i]?.[1] !== label) throw new Error(`Unexpected WTT header ${i + 1}`)
    const direction = sheet.endsWith('Forward') ? 'outbound' : 'inbound'
    let station = ''
    const timingRows = rows.flatMap((row, index) => {
      if (row[0]) station = row[0]
      return index >= 9 && WTT_STATIONS.includes(station) && ['arr', 'dep', 'pass'].includes(row[1]) ? [{ row: index + 1, station: WTT_STATIONS.indexOf(station), kind: row[1], values: row }] : []
    })
    for (let column = 2; column < rows[0].length; column++) {
      const tid = rows[0][column], uid = rows[1][column], operator = rows[2][column]
      if (!OPERATORS[operator] || !/^[129][A-Z]\d{2}$/.test(tid)) continue
      const origin = terminal(rows[3][column]), destination = terminal(rows[4][column])
      if ((direction === 'outbound' ? origin : destination).name !== 'LONDON KINGS CROSS') continue
      const source = { table: 'YA01', sheet, column: column + 1, uid, tid, operator, days: rows[7][column], dates: rows[6][column] }
      const cells = timingRows.filter(row => !EMPTY(row.values[column]))
      if (!cells.some(row => row.station === WTT_STATIONS.length - 1)) {
        excluded.push({ ...source, reason: 'No Welwyn mainline timing; Hertford routing or incomplete corridor column' }); continue
      }
      const grouped = new Map(); let previous = -1, day = 0
      for (const cell of cells) {
        let time = wttTime(cell.values[column]) + day * 86400
        if (time < previous - 12 * 3600) { day++; time += 86400 }
        if (time < previous) throw new Error(`Non-monotonic WTT column ${sheet}:${column + 1}:${cell.row}`)
        previous = time
        const entry = grouped.get(cell.station) ?? { station: cell.station, pass: false, rows: [] }
        entry[cell.kind] = time
        entry.rows.push(cell.row)
        grouped.set(cell.station, entry)
      }
      const points = [...grouped.values()]
      const terminalPoint = direction === 'outbound' ? points[0] : points.at(-1)
      if (terminalPoint.station !== 0) throw new Error(`Missing King's Cross timing: ${uid}`)
      const workingTerminalTime = terminalPoint.arr ?? terminalPoint.dep
      const publicTime = (direction === 'outbound' ? origin : destination).time
      const adjustedPublic = publicTime + Math.round((workingTerminalTime - publicTime) / 86400) * 86400
      if (Math.abs(adjustedPublic - workingTerminalTime) > 5 * 60) throw new Error(`Unreviewed terminal differential: ${uid}`)
      // Header terminals are public times; the WTT body can give an earlier working arrival.
      terminalPoint.arr = adjustedPublic; terminalPoint.dep = adjustedPublic
      const stops = points.map(point => [point.station, point.arr ?? point.dep ?? point.pass, point.dep ?? point.arr ?? point.pass])
      const passIndexes = points.flatMap((point, index) => point.pass !== false && point.arr === undefined && point.dep === undefined ? [index] : [])
      for (const offset of [-86400, 0]) {
        const date = new Date(Date.parse(`${serviceDate}T12:00:00Z`) + offset * 1000).toISOString().slice(0, 10)
        if (!wttRunsOn(source.days, source.dates, date)) continue
        const shifted = stops.map(([stop, a, d]) => [stop, a + offset, d + offset])
        if (shifted[0][1] >= 86400 || shifted.at(-1)[2] < 0) continue
        const id = `national-rail:YA01:${uid}:${date}`
        if (identities.has(id)) throw new Error(`Duplicate active WTT UID: ${id}`)
        identities.add(id)
        const intermediateCalls = points.filter((point, index) => point.station !== 0 && point.station !== WTT_STATIONS.length - 1 && !passIndexes.includes(index)).length
        journeys.push({ id, direction, route: OPERATORS[operator], headsign: displayName(destination.name), origin: displayName(origin.name), shortName: tid, category: 'intercity', mode: 'national-rail', servicePattern: intermediateCalls ? 'local' : 'express', stops: shifted, passIndexes, source: { ...source, timingRows: points.map(point => point.rows), workingTerminalTime, publicTerminalTime: adjustedPublic } })
      }
    }
  }
  if (Object.keys(sheets).length !== 2) throw new Error('Both weekday directions are required')
  return { journeys, excluded }
}

export async function compileKingsCross(cache = '/tmp/allchange-kings-cross') {
  await mkdir(cache, { recursive: true })
  const path = resolve(cache, 'YA01.xlsx')
  let bytes
  try { bytes = await readFile(path) } catch (error) {
    if (error.code !== 'ENOENT') throw error
    const archive = resolve(cache, 'wtt.zip')
    try { await readFile(archive) } catch (error) {
      if (error.code !== 'ENOENT') throw error
      await writeFile(archive, await fetchBytes(KINGS_CROSS_SOURCE.url))
    }
    bytes = execFileSync('unzip', ['-p', archive, KINGS_CROSS_SOURCE.member], { maxBuffer: 8 * 1024 * 1024 })
    await writeFile(path, bytes)
  }
  const sheets = JSON.parse(execFileSync('python3', ['scripts/read-rail-wtt.py', path], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }))
  const { journeys, excluded } = parseKingsCrossWtt(sheets)
  const geometryBytes = await readFile('fixtures/national-rail/kings-cross-geometry.json'), geometry = JSON.parse(geometryBytes)
  const reference = JSON.parse(await readFile('fixtures/tfl/all-change-rail-led-morning.json'))
  const snapshot = assembleRailCorridor({ journeys, excluded, geometry, bounds: reference.bounds, metadata: {
    publisher: 'Network Rail', feedVersion: 'kings-cross-ya01-v1', serviceDate: '2026-09-04', windowStart: 0, windowEnd: 86400, focusTime: 27900,
    sourceUrl: 'https://www.networkrail.co.uk/industry-and-commercial/the-timetable/working-timetable/', retrievedAt: new Date().toISOString(),
    model: 'Published weekday timetable interpolation / not observed operations', modes: ['national-rail'], sources: [{ ...KINGS_CROSS_SOURCE, sha256: sha256(bytes) }],
    note: 'King’s Cross passenger services with a Welwyn Garden City timing in YA01. Hertford-loop routings, Moorgate services, empty stock and non-passenger operators are excluded. Header public times are used at King’s Cross; intermediate working times retain passing points and explicit dwell. Pass points are not passenger calls. Day restrictions apply to the local station bank, including previous-day tails. Temporary alterations are not applied.',
    geometry: { ...geometry.metadata, artifactSha256: sha256(geometryBytes), wayIds: geometry.wayIds },
    coverage: { corridor: 'London King’s Cross – Finsbury Park – Alexandra Palace – Welwyn Garden City', operators: Object.fromEntries(Object.values(OPERATORS).map(name => [name, journeys.filter(train => train.route === name).length])) },
  } })
  await writeFile('fixtures/national-rail/kings-cross.json', JSON.stringify(snapshot))
  console.log(`King's Cross: ${snapshot.trains.length} journeys, ${snapshot.paths.length} paths, ${excluded.length} excluded corridor columns`)
  return snapshot
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const index = process.argv.indexOf('--cache')
  await compileKingsCross(index < 0 ? undefined : process.argv[index + 1])
}
