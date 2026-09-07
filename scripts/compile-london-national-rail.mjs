#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { assembleRailCorridor } from './national-rail-corridor.mjs'

const cache = process.env.RAIL_CACHE ?? '/tmp/allchange-rail-complete'
const families = {
  paddington: ['GW', 'HX'], waterloo: ['SW'], 'kings-cross': ['GN', 'GR', 'GC', 'HT', 'LD'],
  thameslink: ['TL'], southern: ['SN', 'GX'], southeastern: ['SE'], 'liverpool-street': ['LE'],
  euston: ['VT', 'LM', 'CS'], marylebone: ['CH'], 'fenchurch-street': ['CC'], 'st-pancras': ['EM'],
}
const operatorNames = { GW: 'GWR', HX: 'Heathrow Express', SW: 'South Western Railway', GN: 'Great Northern', GR: 'LNER', GC: 'Grand Central', HT: 'Hull Trains', LD: 'Lumo', TL: 'Thameslink', SN: 'Southern', GX: 'Gatwick Express', SE: 'Southeastern', LE: 'Greater Anglia', VT: 'Avanti West Coast', LM: 'London Northwestern Railway', CS: 'Caledonian Sleeper', CH: 'Chiltern Railways', CC: 'c2c', EM: 'East Midlands Railway' }
const displayName = name => name.toLowerCase().replace(/\b\w/g, letter => letter.toUpperCase()).replace(' (E)', '').replace('Kings Lynn', 'King’s Lynn')
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')

if (!process.argv.includes('--reuse-normalized')) execFileSync('python3', ['scripts/london-rail-network.py'], { stdio: 'inherit' })
const routed = JSON.parse(await readFile(`${cache}/routed.json`))
if (routed.conflicts.length || Object.keys(routed.geometryFailures).length || routed.excludedGeometry.length) throw new Error('Resolve rail coverage audit before publishing snapshots')
const reference = JSON.parse(await readFile('fixtures/tfl/all-change-rail-led-morning.json'))
const geometrySources = await Promise.all(['nw', 'ne', 'sw', 'se', 'east', 'west', 'south', 'junctions'].map(async tile => {
  const bytes = await readFile(`${cache}/osm/${tile}.json`), value = JSON.parse(bytes)
  return { tile, query: await readFile(`${cache}/osm/${tile}.query`, 'utf8'), sha256: sha256(bytes), retrievedAt: value.osm3s.timestamp_osm_base }
}))
const gatewayIds = { PAD: 'paddington', WAT: 'waterloo', KGX: 'kings-cross', CLJ: 'clapham-junction', VIC: 'victoria', LBG: 'london-bridge', CHX: 'charing-cross', CST: 'cannon-street', LST: 'liverpool-street', EUS: 'euston', MYB: 'marylebone', FST: 'fenchurch-street', STP: 'st-pancras', SPL: 'st-pancras-thameslink', MOG: 'moorgate', SRA: 'stratford' }
const catalogue = { serviceDate: '2026-09-04', corridors: [], stations: [] }
const stationFamilies = new Map(), allTrains = [], duplicateSchedules = []
for (const [id, operators] of Object.entries(families)) {
  const movements = new Map()
  for (const train of routed.journeys.filter(train => operators.includes(train.operator))) {
    const identity = JSON.stringify([train.operator, train.tid, train.origin, train.destination, train.originDate, train.points.map(point => [point.code, point.arrival, point.departure, point.passenger])])
    const existing = movements.get(identity)
    if (existing) { duplicateSchedules.push({ kept: existing.uid, duplicate: train.uid, originDate: train.originDate }); existing.alternateUids = [...(existing.alternateUids ?? []), train.uid] }
    else movements.set(identity, train)
  }
  const selected = [...movements.values()]
  const codes = [...new Set(selected.flatMap(train => train.points.map(point => point.code)))].sort()
  const indexes = new Map(codes.map((code, index) => [code, index]))
  const stops = codes.map(code => {
    const station = routed.stations[code]
    return [station.lon, station.lat, station.tags.name, '', `${code.length === 3 ? 'crs' : 'tiploc'}:${code}`]
  })
  const pairPaths = {}, edges = new Map()
  const journeys = selected.map(train => {
    train.points.slice(1).forEach((point, i) => {
      const a = train.points[i].code, b = point.code
      const path = routed.geometry[`${a}:${b}`].path
      pairPaths[`${indexes.get(a)}:${indexes.get(b)}`] = path
      path.slice(1).forEach((point, i) => {
        const segment = [path[i], point]
        const key = segment.map(p => p.join(',')).sort().join('|')
        if (!edges.has(key)) edges.set(key, segment)
      })
    })
    for (const point of train.points) if (point.passenger) {
      if (!stationFamilies.has(point.code)) stationFamilies.set(point.code, new Set())
      stationFamilies.get(point.code).add(id)
    }
    const stops = train.points.map(point => [indexes.get(point.code), point.arrival, point.departure])
    const centreDistance = point => Math.hypot(point[0] + 0.1278, point[1] - 51.5074)
    const first = routed.stations[train.points[0].code], last = routed.stations[train.points.at(-1).code]
    const direction = centreDistance([first.lon, first.lat]) > centreDistance([last.lon, last.lat]) ? 'inbound' : 'outbound'
    const result = {
      id: `national-rail:WTT:${train.uid}:${train.originDate}`, direction, route: operatorNames[train.operator],
      headsign: displayName(train.destination), origin: displayName(train.origin), shortName: train.tid,
      category: 'intercity', mode: 'national-rail', stops,
      passIndexes: train.points.flatMap((point, i) => point.passenger ? [] : [i]),
      pickupOnlyIndexes: train.points.flatMap((point, i) => point.pickupOnly ? [i] : []),
      setDownOnlyIndexes: train.points.flatMap((point, i) => point.setDownOnly ? [i] : []),
      source: { table: 'WTT', column: train.sources[0].column, uid: train.uid, alternateUids: train.alternateUids, originDate: train.originDate, columns: train.sources, timingRows: train.points.map(point => [point.source, ...point.rows]) },
    }
    allTrains.push(result)
    return result
  })
  const tables = new Set(selected.flatMap(train => train.sources.map(source => source.table)))
  const snapshot = assembleRailCorridor({ journeys, geometry: { stops, pairPaths, corridorPaths: [...edges.values()] }, bounds: reference.bounds, metadata: {
    publisher: 'Network Rail', feedVersion: 'london-passenger-wtt-v1', serviceDate: '2026-09-04', windowStart: 0, windowEnd: 86400, focusTime: 27900,
    sourceUrl: 'https://www.networkrail.co.uk/industry-and-commercial/the-timetable/working-timetable/', model: 'Published Friday passenger timetable / interpolated movement, not observed operations', modes: ['national-rail'],
    sources: routed.sources.filter(source => tables.has(source.table)),
    geometry: { publisher: 'OpenStreetMap contributors', licence: 'ODbL 1.0', sourceUrl: 'https://www.openstreetmap.org/copyright', sources: geometrySources, model: 'Connected railway graph with short station-anchor connectors; individual operational tracks are not resolved' },
    note: 'Domestic passenger services within London and its fading fringe. Overlapping tables are joined by UID and originating date. Passing, staff and operating points are not passenger calls. Missing WTT station calls are reconciled against public eNRT tables; Berrylands is closed on this study date. Header terminal times are retained. Temporary alterations and live running are not applied. TfL services are supplied by the existing TfL layer; freight, empty stock and international services are outside this layer.',
    coverage: { family: id, operators: Object.fromEntries(operators.map(operator => [operatorNames[operator], selected.filter(train => train.operator === operator).length])) },
  } })
  const path = `fixtures/national-rail/network-${id}.json`
  await writeFile(path, JSON.stringify(snapshot))
  catalogue.corridors.push({ id, journeys: snapshot.trains.length, stations: stops.length, file: `all-change-national-rail-network-${id}.json` })
  console.log(`${id}: ${snapshot.trains.length} journeys, ${stops.length} stations, ${snapshot.paths.length} paths`)
}
for (const [code, corridors] of stationFamilies) {
  const node = routed.stations[code]
  if (routed.stationBoundaryDistances[code] > 4) continue
  catalogue.stations.push({ id: gatewayIds[code] ?? `rail:${code}`, code, name: node.tags.name, longitude: node.lon, latitude: node.lat, corridors: [...corridors] })
}
const closed = routed.stations.BRS
catalogue.stations.push({ id: 'rail:BRS', code: 'BRS', name: closed.tags.name, longitude: closed.lon, latitude: closed.lat, corridors: ['waterloo'], note: 'Closed until 20 September 2026 for improvement works.' })
for (const station of catalogue.stations) {
  station.displayName = station.code === 'SPL' ? 'St Pancras Thameslink'
    : (station.code === 'LBG' ? station.name : station.name.replace(/^London /, '')).replace("King's", 'King’s')
}
catalogue.stations.sort((a, b) => a.displayName.localeCompare(b.displayName))
const accounted = new Set(catalogue.stations.map(station => station.code))
const stationAudit = { served: catalogue.stations.filter(station => !station.note).length, closed: ['BRS'], suppliedByTfl: [], unresolved: [] }
for (const [code, station] of Object.entries(routed.stations)) {
  if (routed.stationBoundaryDistances[code] >= 0 || accounted.has(code) || code.length !== 3) continue
  const provider = `${station.tags.network ?? ''} ${station.tags.operator ?? ''}`
  if (/Overground|Underground|Elizabeth|Transport for London|Docklands|KeolisAmey/.test(provider)) stationAudit.suppliedByTfl.push({ code, name: station.tags.name })
  else stationAudit.unresolved.push({ code, name: station.tags.name, provider })
}
if (stationAudit.unresolved.length) throw new Error(`Unaccounted London stations: ${JSON.stringify(stationAudit.unresolved)}`)
await writeFile('fixtures/national-rail/catalogue.json', JSON.stringify(catalogue))
await writeFile('fixtures/national-rail/coverage.json', JSON.stringify({ serviceDate: '2026-09-04', scope: 'Domestic passenger rail in Greater London and its four-kilometre fringe', journeys: allTrains.length, stations: catalogue.stations.length, corridors: catalogue.corridors, sourceTables: routed.sources, stationAudit, duplicateSchedules, publicCalls: routed.publicCallAudit, unmatchedSourceLocations: routed.unmapped, timingConflicts: routed.conflicts, geometryFailures: routed.geometryFailures, excludedGeometry: routed.excludedGeometry }, null, 2))
