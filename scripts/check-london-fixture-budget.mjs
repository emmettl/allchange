import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { gzipSync } from 'node:zlib'
import { decodeBusChunk } from '../src/data/bus-day.ts'
import { canonicalStationName as canonicalDiagramStationName } from './london-diagram-layout.mjs'

const FILES = [
  'fixtures/tfl/all-change-rail-led-morning.json',
  'fixtures/tfl/all-change-geography.json',
]
const BUDGETS = {
  raw: 1_600 * 1024,
  gzip: 260 * 1024,
  javaScript: 344 * 1024, // Airport selection shell; the board has a separate lazy budget.
  css: 14 * 1024,
  total: 650 * 1024,
  layoutRaw: 90 * 1024,
  layoutGzip: 16 * 1024,
  dayManifestGzip: 40 * 1024,
  dayChunkGzip: 190 * 1024,
  dayTotalGzip: 1_600 * 1024,
  airMorningGzip: 220 * 1024,
  airManifestGzip: 135 * 1024, // Full-day origin/destination evidence (~119 KiB).
  airChunkGzip: 145 * 1024,
  airDayTotalGzip: 2_300 * 1024,
  roadTopologyGzip: 65 * 1024,
  roadManifestGzip: 8 * 1024,
  roadChunkGzip: 50 * 1024,
  roadDayTotalGzip: 250 * 1024,
  surfaceGzip: 32 * 1024,
  busManifestGzip: 2300 * 1024,
  busChunkGzip: 550 * 1024,
  busDayTotalGzip: 8000 * 1024,
}

const networkBytes = await readFile(
  resolve('fixtures/tfl/all-change-rail-led-morning.json'),
)
const network = JSON.parse(networkBytes.toString('utf8'))
const layoutBytes = await readFile(resolve('fixtures/tfl/all-change-diagram.json'))
const layout = JSON.parse(layoutBytes.toString('utf8'))
const layoutRaw = layoutBytes.byteLength
const layoutGzip = gzipSync(layoutBytes, { level: 9 }).byteLength
const expectedNetworkHash = createHash('sha256').update(networkBytes).digest('hex')
const overridesBytes = await readFile(
  resolve('fixtures/tfl/all-change-diagram-overrides.json'),
)
const overrides = JSON.parse(overridesBytes.toString('utf8'))
const expectedOverridesHash = createHash('sha256')
  .update(overridesBytes)
  .digest('hex')
if (layout.metadata?.sourceSha256 !== expectedNetworkHash) {
  throw new Error('London diagram was not compiled from the current opening network')
}
if (layout.metadata?.overridesSha256 !== expectedOverridesHash) {
  throw new Error('London diagram was not compiled with the current authored overrides')
}
if (Object.keys(overrides.anchors ?? {}).length < 30 || (overrides.corridors?.length ?? 0) < 40) {
  throw new Error('London diagram no longer has its authored central interchange field')
}
if (layout.stops?.length !== network.stops.length) {
  throw new Error('London diagram does not cover every opening-network stop')
}
if (new Set(layout.stops.map(([sourceId]) => sourceId)).size !== network.stops.length) {
  throw new Error('London diagram stop identities are missing or duplicated')
}
if (layout.paths?.length !== network.paths.length) {
  throw new Error('London diagram path indexes do not match the opening network')
}

const diagramCellStations = new Map()
for (const [index, [, x, y]] of layout.stops.entries()) {
  const key = `${x}:${y}`
  const names = diagramCellStations.get(key) ?? new Set()
  names.add(canonicalDiagramStationName(network.stops[index]?.[2]))
  diagramCellStations.set(key, names)
}
if ([...diagramCellStations.values()].some((names) => names.size > 1)) {
  throw new Error('Unrelated London stations share a diagram cell')
}

function approximateKilometres(first, second) {
  const longitudeScale = Math.cos(((first[1] + second[1]) * Math.PI) / 360)
  return Math.hypot(
    (first[0] - second[0]) * longitudeScale,
    first[1] - second[1],
  ) * 111
}

for (const [edgeIndex, [fromIndex, toIndex]] of network.edges.entries()) {
  const pathIndex = network.edgePaths?.[edgeIndex]
  const path = pathIndex === undefined || pathIndex === null
    ? undefined
    : network.paths[pathIndex]
  if (!path || path.length < 2) continue
  const chord = approximateKilometres(
    network.stops[fromIndex],
    network.stops[toIndex],
  )
  let pathLength = 0
  for (let index = 1; index < path.length; index += 1) {
    pathLength += approximateKilometres(path[index - 1], path[index])
  }
  if (pathLength > Math.max(8, chord * 5)) {
    throw new Error(
      `London path ${pathIndex} takes an implausible ${pathLength.toFixed(1)} km detour between ${network.stops[fromIndex][2]} and ${network.stops[toIndex][2]}`,
    )
  }
}
if (!layout.context?.waterPaths?.some((path) => path.length >= 2)) {
  throw new Error('London diagram is missing its authored Thames context path')
}

const dayManifestBytes = await readFile(
  resolve('fixtures/tfl/all-change-day-manifest.json'),
)
const dayManifest = JSON.parse(dayManifestBytes.toString('utf8'))
if (
  dayManifest.metadata?.windowStart !== 0 ||
  dayManifest.metadata?.windowEnd !== 86_400 ||
  dayManifest.chunks?.length !== 12
) {
  throw new Error('London day manifest must cover 24 hours in 12 chunks')
}
if (
  dayManifest.stops?.length !== network.stops.length ||
  dayManifest.paths?.length !== network.paths.length
) {
  throw new Error('London morning and day studies do not share one topology')
}
if (
  dayManifest.stops.some(
    (stop, index) => stop[4] !== network.stops[index]?.[4],
  )
) {
  throw new Error('London morning and day stop identities are not index-aligned')
}
let dayTotalGzip = gzipSync(dayManifestBytes, { level: 9 }).byteLength
let largestDayChunkGzip = 0
const dayTrainIds = new Set()
for (const [index, descriptor] of dayManifest.chunks.entries()) {
  const expectedStart = index * 2 * 3600
  if (
    descriptor.windowStart !== expectedStart ||
    descriptor.windowEnd !== expectedStart + 2 * 3600
  ) {
    throw new Error(`London day chunk ${descriptor.id} breaks the time sequence`)
  }
  const bytes = await readFile(resolve('fixtures/tfl', descriptor.path))
  if (descriptor.bytes !== bytes.byteLength) {
    throw new Error(`London day chunk ${descriptor.id} has stale size metadata`)
  }
  if (descriptor.sha256 !== createHash('sha256').update(bytes).digest('hex')) {
    throw new Error(`London day chunk ${descriptor.id} has stale integrity metadata`)
  }
  const chunk = JSON.parse(bytes.toString('utf8'))
  for (const train of chunk.trains) dayTrainIds.add(train.id)
  const compressed = gzipSync(bytes, { level: 9 }).byteLength
  dayTotalGzip += compressed
  largestDayChunkGzip = Math.max(largestDayChunkGzip, compressed)
}
if (dayTrainIds.size !== dayManifest.tripCount) {
  throw new Error(
    `London day chunks contain ${dayTrainIds.size} unique journeys, expected ${dayManifest.tripCount}`,
  )
}
let directDiagramPaths = 0
for (const path of layout.paths) {
  if (path.length < 2) throw new Error('London diagram contains an empty path')
  if (path.length === 2) directDiagramPaths += 1
  for (let index = 1; index < path.length; index += 1) {
    const deltaX = path[index][0] - path[index - 1][0]
    const deltaY = path[index][1] - path[index - 1][1]
    const diagonal = Math.abs(Math.abs(deltaX) - Math.abs(deltaY)) < 0.000001
    if (deltaX !== 0 && deltaY !== 0 && !diagonal) {
      throw new Error('London diagram contains a non-octilinear segment')
    }
  }
}
// Corridor bends may fall between stations. Preserve those bends instead of
// requiring each station pair to be a single chord (which distorts the map).
const diagramBends = layout.paths.reduce((sum, path) => sum + Math.max(0, path.length - 2), 0)
if (directDiagramPaths / layout.paths.length < 0.6 || diagramBends / layout.paths.length > 0.65) {
  throw new Error('London diagram no longer maintains a predominantly direct octilinear network')
}
const SERVICE_CATEGORIES = new Set([
  'international',
  'intercity',
  'interregio',
  'regional-express',
  's-bahn',
  'regional',
  'tram',
  'metro',
  'bus',
  'ferry',
  'cableway',
  'funicular',
  'other',
])

function kibibytes(bytes) {
  return `${(bytes / 1024).toFixed(1)} KiB`
}

let raw = 0
let dataGzip = 0
for (const file of FILES) {
  const bytes = await readFile(resolve(file))
  const snapshot = JSON.parse(bytes.toString('utf8'))
  for (const train of snapshot.trains ?? []) {
    if (!SERVICE_CATEGORIES.has(train.category)) {
      throw new Error(
        `${file} uses unsupported service category ${JSON.stringify(train.category)}`,
      )
    }
  }
  raw += bytes.byteLength
  dataGzip += gzipSync(bytes, { level: 9 }).byteLength
}

console.log('All Change opening-study budget:')
console.log(`  raw        ${kibibytes(raw)} / ${kibibytes(BUDGETS.raw)}`)
console.log(`  gzip       ${kibibytes(dataGzip)} / ${kibibytes(BUDGETS.gzip)}`)

const fixtureFailures = Object.entries({ raw, gzip: dataGzip }).filter(
  ([name, size]) => size > BUDGETS[name],
)
if (fixtureFailures.length) {
  throw new Error(
    `London fixture budget exceeded: ${fixtureFailures
      .map(([name, size]) => `${name} ${kibibytes(size)}`)
      .join(', ')}`,
  )
}

console.log('All Change lazy diagram budget:')
console.log(`  raw        ${kibibytes(layoutRaw)} / ${kibibytes(BUDGETS.layoutRaw)}`)
console.log(`  gzip       ${kibibytes(layoutGzip)} / ${kibibytes(BUDGETS.layoutGzip)}`)
if (layoutRaw > BUDGETS.layoutRaw || layoutGzip > BUDGETS.layoutGzip) {
  throw new Error(
    `London diagram budget exceeded: raw ${kibibytes(layoutRaw)}, gzip ${kibibytes(layoutGzip)}`,
  )
}

const dayManifestGzip = gzipSync(dayManifestBytes, { level: 9 }).byteLength
console.log('All Change progressive 24-hour budget:')
console.log(
  `  manifest   ${kibibytes(dayManifestGzip)} / ${kibibytes(BUDGETS.dayManifestGzip)}`,
)
console.log(
  `  max chunk  ${kibibytes(largestDayChunkGzip)} / ${kibibytes(BUDGETS.dayChunkGzip)}`,
)
console.log(
  `  full day   ${kibibytes(dayTotalGzip)} / ${kibibytes(BUDGETS.dayTotalGzip)}`,
)
if (
  dayManifestGzip > BUDGETS.dayManifestGzip ||
  largestDayChunkGzip > BUDGETS.dayChunkGzip ||
  dayTotalGzip > BUDGETS.dayTotalGzip
) {
  throw new Error('London progressive day budget exceeded')
}

const surfaceBytes = await readFile(
  resolve('fixtures/tfl/all-change-surface-day.json'),
)
const surface = JSON.parse(surfaceBytes.toString('utf8'))
const surfaceCategories = new Set(surface.trains.map(({ category }) => category))
if (
  surface.metadata?.windowStart !== 0 ||
  surface.metadata?.windowEnd !== 86_400 ||
  surface.metadata?.serviceDate !== dayManifest.metadata?.serviceDate ||
  !surfaceCategories.has('ferry') ||
  !surfaceCategories.has('cableway') ||
  surface.metadata?.modes?.some(
    (mode) => mode !== 'river-bus' && mode !== 'cable-car',
  )
) {
  throw new Error('London surface study violates its 24-hour mode contract')
}
const surfaceGzip = gzipSync(surfaceBytes, { level: 9 }).byteLength
console.log('All Change optional surface-study budget:')
console.log(
  `  full day   ${kibibytes(surfaceGzip)} / ${kibibytes(BUDGETS.surfaceGzip)}`,
)
if (surfaceGzip > BUDGETS.surfaceGzip) {
  throw new Error('London optional surface-study budget exceeded')
}

const busManifestBytes = await readFile(
  resolve('fixtures/tfl/all-change-bus-day-manifest.json'),
)
const busManifest = JSON.parse(busManifestBytes.toString('utf8'))
if (
  busManifest.metadata?.windowStart !== 0 ||
  busManifest.metadata?.windowEnd !== 86_400 ||
  busManifest.metadata?.serviceDate !== dayManifest.metadata?.serviceDate ||
  busManifest.chunks?.length !== 12 ||
  busManifest.metadata?.modes?.length !== 1 ||
  busManifest.metadata.modes[0] !== 'bus'
) {
  throw new Error('London bus study violates its 24-hour mode contract')
}
if (busManifest.stops.some(([lon, lat]) => !Number.isFinite(lon) || !Number.isFinite(lat)) ||
  busManifest.paths.some((path) => path.length < 2 || path.some(([lon, lat]) => !Number.isFinite(lon) || !Number.isFinite(lat)))) {
  throw new Error('London bus geometry contains invalid coordinates')
}
let busDayTotalGzip = gzipSync(busManifestBytes, { level: 9 }).byteLength
let largestBusChunkGzip = 0
const busTrainIds = new Set()
const busRoutes = new Set()
for (const descriptor of busManifest.chunks) {
  const bytes = await readFile(resolve('fixtures/tfl', descriptor.path))
  if (descriptor.bytes !== bytes.byteLength) {
    throw new Error(`London bus chunk ${descriptor.id} has stale size metadata`)
  }
  if (descriptor.sha256 !== createHash('sha256').update(bytes).digest('hex')) {
    throw new Error(`London bus chunk ${descriptor.id} has stale integrity metadata`)
  }
  const chunk = JSON.parse(bytes.toString('utf8'))
  for (const train of decodeBusChunk(chunk).trains) {
    if (train.category !== 'bus') {
      throw new Error(`London bus chunk ${descriptor.id} contains a non-bus journey`)
    }
    if (train.pathSegments?.some((pathIndex) => pathIndex !== null && (!Number.isInteger(pathIndex) || pathIndex < 0 || pathIndex >= busManifest.paths.length))) {
      throw new Error(`London bus chunk ${descriptor.id} contains an invalid path reference`)
    }
    if (train.end < train.start || train.stops.length < 2 || train.pathSegments?.length !== train.stops.length - 1 || train.stops.some(([stop, arrival, departure], index) =>
      !busManifest.stops[stop] || departure < arrival || (index > 0 && arrival < train.stops[index - 1][2]))) {
      throw new Error(`London bus journey ${train.id} has invalid stop calls`)
    }
    busTrainIds.add(train.id)
    busRoutes.add(train.route)
  }
  const compressed = gzipSync(bytes, { level: 9 }).byteLength
  busDayTotalGzip += compressed
  largestBusChunkGzip = Math.max(largestBusChunkGzip, compressed)
}
if (
  busTrainIds.size !== busManifest.tripCount ||
  !busRoutes.has('26') ||
  !busRoutes.has('N26') ||
  busRoutes.size !== busManifest.metadata.coverage?.activeRouteCount ||
  busRoutes.size < 600 ||
  busManifest.metadata.coverage.routes.length !== busManifest.metadata.coverage.advertisedRouteCount ||
  busManifest.metadata.coverage.routes.some(({ name, journeyCount, issues }) =>
    (journeyCount > 0) !== busRoutes.has(name) || (!journeyCount && !issues.length))
) {
  throw new Error('London bus chunks do not match the audited London-wide route catalogue')
}
const busManifestGzip = gzipSync(busManifestBytes, { level: 9 }).byteLength
console.log('All Change progressive bus-study budget:')
console.log(
  `  manifest   ${kibibytes(busManifestGzip)} / ${kibibytes(BUDGETS.busManifestGzip)}`,
)
console.log(
  `  max chunk  ${kibibytes(largestBusChunkGzip)} / ${kibibytes(BUDGETS.busChunkGzip)}`,
)
console.log(
  `  full day   ${kibibytes(busDayTotalGzip)} / ${kibibytes(BUDGETS.busDayTotalGzip)}`,
)
if (
  busManifestGzip > BUDGETS.busManifestGzip ||
  largestBusChunkGzip > BUDGETS.busChunkGzip ||
  busDayTotalGzip > BUDGETS.busDayTotalGzip
) {
  throw new Error('London progressive bus-study budget exceeded')
}

const airMorningBytes = await readFile(
  resolve('public/data/all-change-air-morning.json'),
)
const airMorning = JSON.parse(airMorningBytes.toString('utf8'))
const airManifestBytes = await readFile(
  resolve('public/data/all-change-air-day-manifest.json'),
)
const airManifest = JSON.parse(airManifestBytes.toString('utf8'))
if (
  airMorning.metadata?.serviceDate !== network.metadata?.serviceDate ||
  airMorning.metadata?.windowStart !== network.metadata?.windowStart ||
  airMorning.metadata?.windowEnd !== network.metadata?.windowEnd ||
  airMorning.metadata?.license !== 'ODbL 1.0'
) {
  throw new Error('London opening air study does not match the rail clock or licence contract')
}
if (
  airManifest.metadata?.windowStart !== 0 ||
  airManifest.metadata?.windowEnd !== 86_400 ||
  airManifest.chunks?.length !== 24 ||
  airManifest.trackCount !== airManifest.aircraft?.length
) {
  throw new Error('London air manifest must index a complete 24-hour study')
}
const airMorningGzip = gzipSync(airMorningBytes, { level: 9 }).byteLength
const airManifestGzip = gzipSync(airManifestBytes, { level: 9 }).byteLength
let airDayTotalGzip = airManifestGzip
let largestAirChunkGzip = 0
for (const [index, descriptor] of airManifest.chunks.entries()) {
  if (
    descriptor.windowStart !== index * 3600 ||
    descriptor.windowEnd !== (index + 1) * 3600 ||
    descriptor.path !== `all-change-air-day-${String(index).padStart(2, '0')}.json`
  ) {
    throw new Error(`London air chunk ${descriptor.id} breaks the hourly sequence`)
  }
  const bytes = await readFile(resolve('public/data', descriptor.path))
  const chunk = JSON.parse(bytes.toString('utf8'))
  if (
    chunk.windowStart !== descriptor.windowStart ||
    chunk.windowEnd !== descriptor.windowEnd ||
    chunk.tracks.length !== descriptor.trackCount
  ) {
    throw new Error(`London air chunk ${descriptor.id} disagrees with its manifest`)
  }
  const compressed = gzipSync(bytes, { level: 9 }).byteLength
  airDayTotalGzip += compressed
  largestAirChunkGzip = Math.max(largestAirChunkGzip, compressed)
}
console.log('All Change optional air-study budget:')
console.log(
  `  morning    ${kibibytes(airMorningGzip)} / ${kibibytes(BUDGETS.airMorningGzip)}`,
)
console.log(
  `  manifest   ${kibibytes(airManifestGzip)} / ${kibibytes(BUDGETS.airManifestGzip)}`,
)
console.log(
  `  max chunk  ${kibibytes(largestAirChunkGzip)} / ${kibibytes(BUDGETS.airChunkGzip)}`,
)
console.log(
  `  full day   ${kibibytes(airDayTotalGzip)} / ${kibibytes(BUDGETS.airDayTotalGzip)}`,
)
if (
  airMorningGzip > BUDGETS.airMorningGzip ||
  airManifestGzip > BUDGETS.airManifestGzip ||
  largestAirChunkGzip > BUDGETS.airChunkGzip ||
  airDayTotalGzip > BUDGETS.airDayTotalGzip
) {
  throw new Error('London optional air-study budget exceeded')
}

const roadTopologyBytes = await readFile(
  resolve('public/data/all-change-road-topology.json'),
)
const roadTopology = JSON.parse(roadTopologyBytes.toString('utf8'))
const roadManifestBytes = await readFile(
  resolve('public/data/all-change-road-day-manifest.json'),
)
const roadManifest = JSON.parse(roadManifestBytes.toString('utf8'))
if (
  roadTopology.metadata?.publisher !== 'National Highways' ||
  roadTopology.roads?.length !== 7 ||
  !roadManifest.siteIds?.every(id => roadTopology.sites.some(site => site.id === id)) ||
  !roadManifest.sections?.every(section => roadTopology.sections.some(candidate => candidate.id === section.id)) ||
  roadManifest.metadata?.windowStart !== 0 ||
  roadManifest.metadata?.windowEnd !== 86_400 ||
  roadManifest.metadata?.measurementKind !== 'recorded' ||
  !(roadManifest.metadata?.minimumSiteCoverage > 0 && roadManifest.metadata.minimumSiteCoverage <= 1) ||
  roadManifest.chunks?.length !== 4
) {
  throw new Error('London road topology and day manifest violate the study contract')
}
const roadTopologyGzip = gzipSync(roadTopologyBytes, { level: 9 }).byteLength
const roadManifestGzip = gzipSync(roadManifestBytes, { level: 9 }).byteLength
let roadDayTotalGzip = roadTopologyGzip + roadManifestGzip
let largestRoadChunkGzip = 0
for (const [index, descriptor] of roadManifest.chunks.entries()) {
  const expectedStart = index * 6 * 3600
  if (
    descriptor.windowStart !== expectedStart ||
    descriptor.windowEnd !== expectedStart + 6 * 3600 ||
    descriptor.path !== `all-change-road-day/${descriptor.id}.json`
  ) {
    throw new Error(`London road chunk ${descriptor.id} breaks the six-hour sequence`)
  }
  const bytes = await readFile(resolve('public/data', descriptor.path))
  const chunk = JSON.parse(bytes.toString('utf8'))
  const valueCount = chunk.minutes.reduce(
    (total, [, values]) => total + values.length,
    0,
  )
  if (
    chunk.windowStart !== descriptor.windowStart ||
    chunk.windowEnd !== descriptor.windowEnd ||
    chunk.minutes.length !== descriptor.minuteCount ||
    valueCount !== descriptor.valueCount
  ) {
    throw new Error(`London road chunk ${descriptor.id} disagrees with its manifest`)
  }
  const compressed = gzipSync(bytes, { level: 9 }).byteLength
  roadDayTotalGzip += compressed
  largestRoadChunkGzip = Math.max(largestRoadChunkGzip, compressed)
}
console.log('All Change optional road-study budget:')
console.log(
  `  topology   ${kibibytes(roadTopologyGzip)} / ${kibibytes(BUDGETS.roadTopologyGzip)}`,
)
console.log(
  `  manifest   ${kibibytes(roadManifestGzip)} / ${kibibytes(BUDGETS.roadManifestGzip)}`,
)
console.log(
  `  max chunk  ${kibibytes(largestRoadChunkGzip)} / ${kibibytes(BUDGETS.roadChunkGzip)}`,
)
console.log(
  `  full day   ${kibibytes(roadDayTotalGzip)} / ${kibibytes(BUDGETS.roadDayTotalGzip)}`,
)
if (
  roadTopologyGzip > BUDGETS.roadTopologyGzip ||
  roadManifestGzip > BUDGETS.roadManifestGzip ||
  largestRoadChunkGzip > BUDGETS.roadChunkGzip ||
  roadDayTotalGzip > BUDGETS.roadDayTotalGzip
) {
  throw new Error('London optional road-study budget exceeded')
}

const manifest = JSON.parse(
  await readFile(resolve('dist/.vite/manifest.json'), 'utf8'),
)
const londonEntry = Object.entries(manifest).find(
  ([key, chunk]) => chunk.isEntry && key === 'index.html',
)
if (!londonEntry) throw new Error('Vite manifest has no London entry')

const scripts = new Set()
const styles = new Set()
const visited = new Set()
const roadDetailKey = 'src/studies/LondonRoadObservations.tsx'
const railBoardKey = 'src/studies/LondonNationalRailBoard.tsx'
const passengerPulseKey = 'src/studies/LondonPassengerPulse.tsx'
const cycleStudyKey = 'src/studies/LondonCycleStudy.tsx'
const cycleComparisonKey = 'src/studies/LondonCycleComparison.tsx'
const hubPulseKey = 'node_modules/@motionstudies/three/HubPulseScene.js'
const passengerCardKey = 'src/studies/LondonPassengerDemand.tsx'
const stationBoardKey = 'src/studies/LondonStationDepartures.tsx'
const combinedBoardKey = 'src/studies/LondonCombinedStationBoard.tsx'
const airportCardKey = 'src/studies/AirportCard.tsx'
const railLayerKey = 'src/studies/LondonNationalRailLayer.tsx'
const visit = (key) => {
  if (visited.has(key)) return
  visited.add(key)
  const chunk = manifest[key]
  if (!chunk) throw new Error(`Missing Vite manifest entry: ${key}`)
  if (chunk.file.endsWith('.js')) scripts.add(chunk.file)
  for (const cssFile of chunk.css ?? []) styles.add(cssFile)
  for (const importedKey of chunk.imports ?? []) visit(importedKey)
  // Selected cards and alternate studies load only after interaction. Budget
  // them separately; retain their shared static dependencies in the opening.
  for (const importedKey of chunk.dynamicImports ?? []) if (![airportCardKey, roadDetailKey, railBoardKey, stationBoardKey, combinedBoardKey, railLayerKey, passengerCardKey, passengerPulseKey, cycleStudyKey, hubPulseKey].includes(importedKey)) visit(importedKey)
}
visit(londonEntry[0])

async function totalGzipSize(files) {
  let total = 0
  for (const file of files) {
    total += gzipSync(await readFile(resolve('dist', file)), { level: 9 }).byteLength
  }
  return total
}

const javaScript = await totalGzipSize(scripts)

// Optional cards can share the split-flap widget. Include their full static
// dependency closure, excluding only assets already counted in the opening.
async function optionalCardSize(key, parentKey) {
  if (!manifest[key]?.isDynamicEntry || visited.has(key)) throw new Error(`${key} must remain lazy`)
  // A nested panel opens from an already loaded parent. Exclude that parent's
  // static closure, whose complete payload still has its own enforced budget.
  const loaded = new Set(visited), loadedStyles = new Set(styles)
  function preload(id) {
    if (loaded.has(id)) return
    loaded.add(id)
    for (const css of manifest[id].css ?? []) loadedStyles.add(css)
    for (const dependency of manifest[id].imports ?? []) preload(dependency)
  }
  if (parentKey) preload(parentKey)
  if (loaded.has(key)) throw new Error(`${key} must load separately from its parent`)
  const keys = new Set(), files = new Set(), css = new Set()
  function collect(id) {
    if (loaded.has(id) || keys.has(id)) return
    keys.add(id)
    const chunk = manifest[id]
    if (!chunk) throw new Error(`Missing optional dependency ${id}`)
    files.add(chunk.file)
    for (const file of chunk.css ?? []) if (!loadedStyles.has(file)) css.add(file)
    for (const dependency of chunk.imports ?? []) collect(dependency)
    if (chunk.dynamicImports?.some(dependency => id !== cycleStudyKey || dependency !== cycleComparisonKey)) throw new Error(`Unbudgeted optional dynamic dependencies in ${id}`)
  }
  collect(key)
  return { javaScript: await totalGzipSize(files), css: await totalGzipSize(css) }
}
const { javaScript: airportCardScript, css: airportCardStyles } = await optionalCardSize(airportCardKey)
console.log(`All Change optional airport card: ${kibibytes(airportCardScript)} JavaScript / 4.0 KiB; ${kibibytes(airportCardStyles)} CSS / 3.0 KiB`)
if (airportCardScript > 4 * 1024 || airportCardStyles > 3 * 1024) throw new Error('Airport card transfer budget exceeded')
const roadDetail = manifest[roadDetailKey]
if (!roadDetail?.isDynamicEntry || roadDetail.imports?.some(key => !visited.has(key))) {
  throw new Error('The road detail panel must remain lazy with no unbudgeted dependencies')
}
const roadDetailJavaScript = await totalGzipSize([roadDetail.file])
const roadDetailCss = await totalGzipSize(roadDetail.css ?? [])
console.log(`All Change optional road detail: ${kibibytes(roadDetailJavaScript)} JavaScript / 2.0 KiB; ${kibibytes(roadDetailCss)} CSS / 2.0 KiB`)
if (roadDetailJavaScript > 2 * 1024 || roadDetailCss > 2 * 1024) throw new Error('Road detail transfer budget exceeded')
const railLayer = manifest[railLayerKey]
if (!railLayer?.isDynamicEntry || railLayer.imports?.some(key => !visited.has(key))) throw new Error('The optional rail renderer must stay lazy with budgeted dependencies')
const railLayerSize = await totalGzipSize([railLayer.file])
console.log(`All Change optional rail renderer: ${kibibytes(railLayerSize)} / 6.0 KiB`)
if (railLayerSize > 6 * 1024) throw new Error('Rail renderer transfer budget exceeded')
const passengerCard = await optionalCardSize(passengerCardKey)
const hubPulse = await optionalCardSize(hubPulseKey)
console.log(`All Change optional interchange pulse: ${kibibytes(hubPulse.javaScript)} JavaScript / 5 KiB; ${kibibytes(hubPulse.css)} CSS / 2 KiB`)
if (hubPulse.javaScript > 5 * 1024 || hubPulse.css > 2 * 1024) throw new Error('Interchange pulse transfer budget exceeded')
const cycleStudy = await optionalCardSize(cycleStudyKey)
const cycleComparison = await optionalCardSize(cycleComparisonKey, cycleStudyKey)
let cycleProfileLargest = 0, cycleProfileTotal = 0
const cycleManifestData = JSON.parse(await readFile('fixtures/cycle-hire/manifest.json', 'utf8'))
for (const dock of cycleManifestData.stations) {
  const size = gzipSync(await readFile(`fixtures/cycle-hire/profiles/${dock.id}.json`), { level: 9 }).byteLength
  cycleProfileLargest = Math.max(cycleProfileLargest, size); cycleProfileTotal += size
}
console.log(`All Change optional dock comparison: ${kibibytes(cycleComparison.javaScript)} JS / 5 KiB; ${kibibytes(cycleProfileLargest)} largest profile / 1 KiB; ${kibibytes(cycleProfileTotal)} all profiles / 400 KiB`)
if (cycleComparison.javaScript > 5 * 1024 || cycleComparison.css > 2 * 1024 || cycleProfileLargest > 1024 || cycleProfileTotal > 400 * 1024) throw new Error('Dock comparison transfer budget exceeded')
const cycleManifestBytes = await readFile('fixtures/cycle-hire/manifest.json')
const cycleManifestSize = gzipSync(cycleManifestBytes, { level: 9 }).byteLength
let cycleLargestDay = 0
for (const date of JSON.parse(cycleManifestBytes).dates) cycleLargestDay = Math.max(cycleLargestDay, gzipSync(await readFile(`fixtures/cycle-hire/days/${date}.json`), { level: 9 }).byteLength)
console.log(`All Change optional cycle study: ${kibibytes(cycleStudy.javaScript)} JS / 9 KiB; ${kibibytes(cycleStudy.css)} CSS / 3 KiB; ${kibibytes(cycleManifestSize)} index / 24 KiB; ${kibibytes(cycleLargestDay + cycleManifestSize)} index + largest day / 300 KiB`)
if (cycleStudy.javaScript > 9 * 1024 || cycleStudy.css > 3 * 1024 || cycleManifestSize > 24 * 1024 || cycleLargestDay + cycleManifestSize > 300 * 1024) throw new Error('Cycle study transfer budget exceeded')
const passengerPulse = await optionalCardSize(passengerPulseKey)
const passengerCatalogue = JSON.parse(await readFile('fixtures/passenger-demand/catalogue.json', 'utf8'))
const passengerIndexBytes = gzipSync(await readFile('fixtures/passenger-demand/catalogue.json'), { level: 9 }).byteLength
let passengerLargest = 0, passengerTotal = passengerIndexBytes
for (const asc of Object.keys(passengerCatalogue.areas)) {
  const bytes = gzipSync(await readFile(`fixtures/passenger-demand/stations/${asc}.json`), { level: 9 }).byteLength
  passengerLargest = Math.max(passengerLargest, bytes); passengerTotal += bytes
}
console.log(`All Change optional passenger profiles: ${kibibytes(passengerCard.javaScript)} card JS / 4 KiB; ${kibibytes(passengerPulse.javaScript)} pulse JS / 4 KiB; ${kibibytes(passengerIndexBytes)} catalogue / 12 KiB; ${kibibytes(passengerLargest)} largest area / 2 KiB; ${kibibytes(passengerTotal)} full dataset / 650 KiB`)
if (passengerCard.javaScript > 4 * 1024 || passengerCard.css > 2 * 1024 || passengerPulse.javaScript > 4 * 1024 || passengerPulse.css > 2 * 1024 || passengerIndexBytes > 12 * 1024 || passengerLargest > 2 * 1024 || passengerTotal > 650 * 1024) throw new Error('Passenger profile transfer budget exceeded')
const stationBoard = await optionalCardSize(stationBoardKey)
console.log(`All Change optional station board: ${kibibytes(stationBoard.javaScript)} JavaScript / 4.0 KiB; ${kibibytes(stationBoard.css)} CSS / 3.0 KiB`)
if (stationBoard.javaScript > 4 * 1024 || stationBoard.css > 3 * 1024) throw new Error('Station board transfer budget exceeded')
const railBoard = await optionalCardSize(railBoardKey)
const combinedBoard = await optionalCardSize(combinedBoardKey)
console.log(`All Change optional combined station board: ${kibibytes(combinedBoard.javaScript)} JavaScript / 6.0 KiB; ${kibibytes(combinedBoard.css)} CSS / 3.0 KiB`)
if (combinedBoard.javaScript > 6 * 1024 || combinedBoard.css > 3 * 1024) throw new Error('Combined station board transfer budget exceeded')
console.log(`All Change optional rail board (including station widget): ${kibibytes(railBoard.javaScript)} JavaScript / 6.0 KiB; ${kibibytes(railBoard.css)} CSS / 3.0 KiB`)
if (railBoard.javaScript > 6 * 1024 || railBoard.css > 3 * 1024) throw new Error('Rail board transfer budget exceeded')
const railCatalogue = JSON.parse(await readFile('fixtures/national-rail/catalogue.json', 'utf8'))
let railTotal = 0, railLargest = 0
for (const { file } of railCatalogue.corridors) {
  const compressed = gzipSync(await readFile(resolve('public/data', file)), { level: 9 }).byteLength
  railTotal += compressed; railLargest = Math.max(railLargest, compressed)
}
const railCatalogueSize = gzipSync(await readFile('fixtures/national-rail/catalogue.json'), { level: 9 }).byteLength
console.log(`All Change optional rail data: ${kibibytes(railCatalogueSize)} catalogue / 12.0 KiB; ${kibibytes(railLargest)} largest family / 500.0 KiB; ${kibibytes(railTotal)} network / 3000.0 KiB`)
if (railCatalogueSize > 12 * 1024 || railLargest > 500 * 1024 || railTotal > 3000 * 1024) throw new Error('Optional rail data transfer budget exceeded')
const css = await totalGzipSize(styles)
const total = javaScript + css + dataGzip
const transfer = { javaScript, css, total }

console.log('All Change mobile first-view budget (gzip):')
for (const [name, size] of Object.entries(transfer)) {
  console.log(
    `  ${name.padEnd(10)} ${kibibytes(size)} / ${kibibytes(BUDGETS[name])}`,
  )
}

const transferFailures = Object.entries(transfer).filter(
  ([name, size]) => size > BUDGETS[name],
)
if (transferFailures.length) {
  throw new Error(
    `London transfer budget exceeded: ${transferFailures
      .map(([name, size]) => `${name} ${kibibytes(size)}`)
      .join(', ')}`,
  )
}
