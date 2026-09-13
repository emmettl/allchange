import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

import { railCorridorGeometry } from '@motionstudies/data/rail-geometry'
export { railCorridorGeometry, distance } from '@motionstudies/data/rail-geometry'
export const WATERLOO_STATIONS = ['WAT', 'VXH', 'CLJ', 'EAD', 'WIM', 'RAY', 'NEM', 'BRS', 'SUR', 'ESH', 'HER', 'WAL', 'WYB', 'BFN', 'WBY', 'WOK']
export const KINGS_CROSS_STATIONS = ['KGX', 'FPK', 'HGY', 'HRN', 'AAP', 'NSG', 'OKL', 'NBA', 'HDW', 'PBR', 'BPK', 'WMG', 'HAT', 'WGC']

/** Route on connected OSM rails through each station; never replace gaps with straight lines. */
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
