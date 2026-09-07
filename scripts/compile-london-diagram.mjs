import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve, basename } from 'node:path'
import { buildLondonDiagram } from './london-diagram-layout.mjs'

const input = resolve(process.argv[2] ?? 'fixtures/tfl/all-change-rail-led-morning.json')
const output = resolve(process.argv[3] ?? 'fixtures/tfl/all-change-diagram.json')
const overridesInput = resolve(process.argv[4] ?? 'fixtures/tfl/all-change-diagram-overrides.json')
const [raw, overridesRaw] = await Promise.all([readFile(input), readFile(overridesInput)])
const network = JSON.parse(raw), overrides = JSON.parse(overridesRaw)
const artifact = {
  metadata: {
    id: 'diagram', label: 'Diagram', kind: 'topological', coordinateSpace: 'normalized',
    sourceNetwork: basename(input), sourceSha256: createHash('sha256').update(raw).digest('hex'),
    overridesSource: basename(overridesInput), overridesSha256: createHash('sha256').update(overridesRaw).digest('hex'),
    feedVersion: network.metadata.feedVersion,
    model: 'TfL-relative authored corridors / spaced junctions / continuous octilinear station runs',
    note: 'An independently authored London schematic informed by the relative line orientations of the TfL diagram. Intermediate stations divide continuous corridors; source stop and path identities are preserved.',
  },
  ...buildLondonDiagram(network, overrides),
}
await writeFile(output, JSON.stringify(artifact))
console.log(`Wrote ${output} with ${artifact.stops.length} stops and ${artifact.paths.length} octilinear paths.`)
