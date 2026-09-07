import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

export const distance = (a, b) => Math.hypot((a[0] - b[0]) * Math.cos((a[1] + b[1]) * Math.PI / 360), a[1] - b[1]) * 111.32
export const WATERLOO_STATIONS = ['WAT', 'VXH', 'CLJ', 'EAD', 'WIM', 'RAY', 'NEM', 'BRS', 'SUR', 'ESH', 'HER', 'WAL', 'WYB', 'BFN', 'WBY', 'WOK']
export const KINGS_CROSS_STATIONS = ['KGX', 'FPK', 'HGY', 'HRN', 'AAP', 'NSG', 'OKL', 'NBA', 'HDW', 'PBR', 'BPK', 'WMG', 'HAT', 'WGC']

/** Route on connected OSM rails through each station; never replace gaps with straight lines. */
export function railCorridorGeometry(osm, stationCodes) {
  const nodes = new Map(osm.elements.filter(e => e.type === 'node').map(e => [e.id, e]))
  const graph = new Map()
  for (const way of osm.elements.filter(e => e.type === 'way' && e.tags?.railway === 'rail' && !['yard', 'siding', 'spur'].includes(e.tags.service))) {
    for (let i = 1; i < way.nodes.length; i++) {
      const a = nodes.get(way.nodes[i - 1]), b = nodes.get(way.nodes[i])
      if (!a || !b) throw new Error(`Missing OSM nodes on ${way.id}`)
      const weight = distance([a.lon, a.lat], [b.lon, b.lat])
      for (const [from, to] of [[a.id, b.id], [b.id, a.id]]) {
        if (!graph.has(from)) graph.set(from, [])
        graph.get(from).push({ to, weight, way: way.id })
      }
    }
  }
  const stations = stationCodes.map(code => {
    const station = [...nodes.values()].find(node => node.tags?.railway === 'station' && node.tags['ref:crs'] === code)
    if (!station) throw new Error(`Missing OSM station ${code}`)
    return station
  })
  // The largest connected component excludes isolated rails and works-in-progress.
  const visited = new Set(); let component = []
  for (const start of graph.keys()) {
    if (visited.has(start)) continue
    const found = [], queue = [start]; visited.add(start)
    for (let i = 0; i < queue.length; i++) {
      const id = queue[i]; found.push(id)
      for (const { to } of graph.get(id)) if (!visited.has(to)) { visited.add(to); queue.push(to) }
    }
    if (found.length > component.length) component = found
  }
  const anchors = stations.map(station => {
    const point = [station.lon, station.lat]
    const id = component.reduce((best, id) => distance(point, [nodes.get(id).lon, nodes.get(id).lat]) < distance(point, [nodes.get(best).lon, nodes.get(best).lat]) ? id : best, component[0])
    if (distance(point, [nodes.get(id).lon, nodes.get(id).lat]) > 0.25) throw new Error(`Station too far from connected railway: ${station.tags.name}`)
    return id
  })
  const queue = [{ id: anchors[0], weight: 0 }], best = new Map([[anchors[0], 0]]), previous = new Map()
  const target = anchors.at(-1)
  while (queue.length) {
    queue.sort((a, b) => b.weight - a.weight)
    const current = queue.pop()
    if (current.weight !== best.get(current.id)) continue
    if (current.id === target) break
    for (const edge of graph.get(current.id)) {
      const weight = current.weight + edge.weight
      if (weight >= (best.get(edge.to) ?? Infinity)) continue
      best.set(edge.to, weight); previous.set(edge.to, { id: current.id, way: edge.way }); queue.push({ id: edge.to, weight })
    }
  }
  if (!best.has(target)) throw new Error('Disconnected railway corridor')
  const ids = [target], wayIds = new Set()
  while (ids.at(-1) !== anchors[0]) {
    const edge = previous.get(ids.at(-1)); wayIds.add(edge.way); ids.push(edge.id)
  }
  const line = ids.reverse().map(id => [nodes.get(id).lon, nodes.get(id).lat])
  // Snap every intermediate station to this continuous route, avoiding jumps between parallel tracks.
  const indexes = stations.map(station => line.reduce((best, point, i) => distance(point, [station.lon, station.lat]) < distance(line[best], [station.lon, station.lat]) ? i : best, 0))
  const paths = []
  for (let i = 0; i < indexes.length; i++) {
    if (distance(line[indexes[i]], [stations[i].lon, stations[i].lat]) > 0.25) throw new Error(`Railway misses ${stationCodes[i]}`)
    if (!i) continue
    if (indexes[i] <= indexes[i - 1]) throw new Error(`Railway reverses at ${stationCodes[i]}`)
    const path = line.slice(indexes[i - 1], indexes[i] + 1)
    const length = path.slice(1).reduce((sum, point, j) => sum + distance(path[j], point), 0)
    if (length > Math.max(2, distance(path[0], path.at(-1)) * 1.8)) throw new Error(`Implausible railway detour to ${stationCodes[i]}`)
    paths.push(path)
  }
  return { stops: stations.map((station, i) => [...line[indexes[i]], station.tags.name, '', `crs:${stationCodes[i]}`]), paths, wayIds: [...wayIds].sort((a, b) => a - b) }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const bytes = await readFile(process.argv[2])
  const osm = JSON.parse(bytes)
  const corridor = process.argv[3] ?? 'waterloo'
  if (!['waterloo', 'kings-cross'].includes(corridor)) throw new Error(`Unknown corridor: ${corridor}`)
  const result = railCorridorGeometry(osm, corridor === 'waterloo' ? WATERLOO_STATIONS : KINGS_CROSS_STATIONS)
  await mkdir('fixtures/national-rail', { recursive: true })
  const artifact = { metadata: { publisher: 'OpenStreetMap contributors', sourceUrl: 'https://www.openstreetmap.org/copyright', licence: 'ODbL 1.0', sourceSha256: createHash('sha256').update(bytes).digest('hex'), retrievedAt: osm.osm3s.timestamp_osm_base, query: '[out:json][timeout:40];(way[railway=rail][service!~"yard|siding|spur"](51.28,-0.58,51.51,-0.10);node[railway=station](51.28,-0.58,51.51,-0.10););out body;>;out skel qt;', model: 'Connected railway centreline through station anchors; does not resolve individual operational tracks' }, ...result }
  if (corridor === 'kings-cross') artifact.metadata.query = '[out:json][timeout:60];(way[railway=rail][service!~"yard|siding|spur"](51.52,-0.25,51.82,-0.08);node[railway=station](51.52,-0.25,51.82,-0.08););out body;>;out skel qt;'
  await writeFile(`fixtures/national-rail/${corridor}-geometry.json`, JSON.stringify(artifact))
  console.log(`${corridor} geometry: ${result.stops.length} stations, ${result.paths.flat().length} points, ${result.wayIds.length} OSM ways`)
}
