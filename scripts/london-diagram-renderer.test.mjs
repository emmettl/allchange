import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { londonDiagramRenderer } from './london-diagram-renderer.ts'

const source = readFileSync('node_modules/@motionstudies/three/NationalNetworkScene.js', 'utf8')
const id = '/node_modules/@motionstudies/three/NationalNetworkScene.js'
describe('London renderer compatibility', () => {
  it('applies the same adapter in production and Vite development cache URLs', () => {
    const plugin = londonDiagramRenderer()
    const production = plugin.transform(source, id)
    expect(production.code).toContain('LondonDiagramStations')
    expect(plugin.transform(source, `${id}?v=cache-key`)).toEqual(production)
    expect(plugin.transform(source, '/src/unrelated.tsx')).toBeUndefined()
  })
  it('requires explicit review if the installed renderer hooks change', () => {
    expect(() => londonDiagramRenderer().transform('export function NationalNetworkScene() {}', id)).toThrow('needs review')
  })
  it('uses the full reference only for infrastructure, retaining timetable-driven traffic', () => {
    const { code } = londonDiagramRenderer().transform(source, id)
    expect(code).toContain('_jsx(RouteIdentityLayer, { snapshot: infrastructureSnapshot,')
    expect(code).toContain('_jsx(LondonDiagramStations, { snapshot: infrastructureSnapshot,')
    expect(code).toContain('_jsx(TrafficFlowLayer, { snapshot: snapshot,')
    expect(code).toContain('buildTrainTimeIndex(props.snapshot.trains,')
  })
})
