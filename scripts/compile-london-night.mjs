import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { mergeNetworkLayers } from '@motionstudies/core/domain/network-layers'
import { decodeBusChunk } from '../src/data/bus-day.ts'

const DATE = '2026-09-04', END = 18000
export async function compileNightStudy() {
  const sources = []
  async function read(path) {
    const bytes = await readFile(path)
    sources.push({ path, sha256: createHash('sha256').update(bytes).digest('hex') })
    return JSON.parse(bytes)
  }
  async function day(path, compact = false) {
    const manifest = await read(path)
    if (manifest.metadata.serviceDate !== DATE || manifest.metadata.windowStart !== 0 || manifest.metadata.windowEnd !== 86400) throw new Error('Night source date/window mismatch')
    const chunks = []
    for (const descriptor of manifest.chunks) {
      const path = `fixtures/tfl/${descriptor.path}`, bytes = await readFile(path)
      if (bytes.length !== descriptor.bytes || createHash('sha256').update(bytes).digest('hex') !== descriptor.sha256) throw new Error(`Invalid source chunk: ${path}`)
      const value = await read(path)
      chunks.push(compact ? decodeBusChunk(value) : value)
    }
    return { ...manifest, trains: [...new Map(chunks.flatMap(chunk => chunk.trains).map(train => [train.id, train])).values()] }
  }
  const tfl = await day('fixtures/tfl/all-change-day-manifest.json')
  const calendar = await read('fixtures/night/rail-calendar-audit.json')
  const demand = await read('fixtures/passenger-demand/catalogue.json')
  if (calendar.serviceDate !== DATE || !calendar.coverage.includesPreviousDay || !demand.precedingSource) throw new Error('Missing preceding-day audit')
  const bus = await day('fixtures/tfl/all-change-bus-day-manifest.json', true)
  const catalogue = await read('fixtures/national-rail/catalogue.json')
  const families = []
  for (const corridor of catalogue.corridors) families.push(await read(`fixtures/national-rail/network-${corridor.id}.json`))
  const eurostar = await read('fixtures/eurostar/network.json')
  if ([...families, eurostar].some(value => value.metadata.serviceDate !== DATE)) throw new Error('Rail source dates differ')
  const rail = mergeNetworkLayers(families)
  const profiles = {}, routes = [], routeIds = new Map()
  for (const [kind, network] of [['tfl', tfl], ['rail', rail], ['eurostar', eurostar.board]]) {
    for (const stop of network.stops) if (stop[4]) profiles[stop[4]] ??= { name: stop[2], kind, calls: [] }
    for (const train of network.trains) {
      if (!routeIds.has(train.route)) { routeIds.set(train.route, routes.length); routes.push(train.route) }
      train.stops.forEach(([index, , departure], ordinal) => {
        if (ordinal === train.stops.length - 1 || train.passIndexes?.includes(ordinal) || train.setDownOnlyIndexes?.includes(ordinal) || departure >= 86400) return
        const id = network.stops[index][4]
        if (id) profiles[id].calls.push([departure, routeIds.get(train.route)])
      })
    }
  }
  for (const profile of Object.values(profiles)) {
    profile.calls.sort((a, b) => a[0] - b[0] || a[1] - b[1])
    // Preserve one earlier and one later call, even across chunk boundaries.
    const before = profile.calls.filter(call => call[0] < 0).at(-1)
    const after = profile.calls.find(call => call[0] >= END)
    profile.calls = [...(before ? [before] : []), ...profile.calls.filter(call => call[0] >= 0 && call[0] < END), ...(after ? [after] : [])]
  }
  const checkpoints = Array.from({ length: 10 }, (_, i) => {
    const time = i * 1800
    const group = network => {
      const active = network.trains.filter(train => train.start <= time && train.end > time)
      return { journeys: active.length, routes: [...new Set(active.map(train => train.route))].sort((a, b) => a.localeCompare(b, 'en', { numeric: true })) }
    }
    return { time, tfl: group(tfl), rail: group(rail), bus: group(bus) }
  })
  const comparisons = [
    { name: 'Waterloo', description: 'Mainline terminal and Underground interchange', ids: ['940GZZLUWLO', 'crs:WAT'] },
    { name: 'Bank', description: 'City interchange', ids: ['940GZZLUBNK', '940GZZDLBNK'] },
    { name: 'Upminster', description: 'Outer London terminus with District, Liberty and c2c services', ids: ['940GZZLUUPM', '910GUPMNSTR', 'crs:UPM'] },
  ]
  for (const comparison of comparisons) if (comparison.ids.some(id => !profiles[id])) throw new Error(`Missing comparison identity: ${comparison.name}`)
  const audit = {
    serviceDate: DATE, nightStart: 0, nightEnd: END, previousServiceDate: '2026-09-03',
    sourceFiles: sources,
    coverage: {
      tfl: 'Thursday carry-in audited across all advertised Unified API origins and retained shared-weekday PDF branches. Existing source branch and full-endpoint exclusions remain; recurring timetable gaps do not prove no service ran.',
      rail: 'Dated WTT service UIDs retain originating dates, including Thursday carry-in; published timetable, not temporary alterations or live running.',
      bus: 'Compiler includes preceding Thursday schedules at -86400 seconds and Friday schedules at zero offset. Friday Night 24+ belongs to Saturday, not this view. Existing branch exclusions remain in the bus manifest.',
      demand: 'Friday 00:00–05:00 uses the Thursday 24:00–29:00 tail of NUMBAT 2025 typical Tuesday–Thursday demand, loaded independently by station. Friday workbook Saturday tail is never wrapped into early Friday.',
    },
    carryIn: { tfl: tfl.trains.filter(t => t.start < 0 && t.end > 0).length, rail: rail.trains.filter(t => t.start < 0 && t.end > 0).length, bus: bus.trains.filter(t => t.start < 0 && t.end > 0).length },
  }
  return { format: 'london-night-v1', serviceDate: DATE, windowStart: 0, windowEnd: END, routes, profiles, checkpoints, comparisons, audit }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const data = await compileNightStudy(), rendered = JSON.stringify(data) + '\n', path = 'fixtures/night/study.json'
  if (process.argv.includes('--check')) {
    if (await readFile(path, 'utf8') !== rendered) throw new Error('Night fixture differs from retained source compilation')
  } else { await mkdir('fixtures/night', { recursive: true }); await writeFile(path, rendered) }
  console.log(`${Object.keys(data.profiles).length} rail source areas; ${data.checkpoints.length} checkpoints; carry-in ${JSON.stringify(data.audit.carryIn)}`)
}
