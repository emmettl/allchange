import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { NetworkSnapshot } from '@motionstudies/core/domain/network'
import type { SpatialLayoutSnapshot } from '@motionstudies/core/domain/spatial-layout'
import { londonDiagramMarkers, londonDiagramOrderedPoints, londonDiagramSegmentKey, type DiagramPoint } from '../src/editions/london-diagram-markers.ts'
const network: NetworkSnapshot = JSON.parse(readFileSync('fixtures/tfl/all-change-rail-led-morning.json', 'utf8'))
const layout: SpatialLayoutSnapshot = JSON.parse(readFileSync('fixtures/tfl/all-change-diagram.json', 'utf8'))
const stops: DiagramPoint[] = layout.stops.map(([, x, y]) => [x, 0, -y])
const paths = layout.paths.map(path => ({ points: path.map(([x, y]): DiagramPoint => [x, 0, -y]) }))
const markers = londonDiagramMarkers(network, stops, paths)
const marker = (name: string) => markers.find(m => network.stops[m.stopIndex][2] === name)!

describe('TfL station grammar', () => {
  it('uses ticks on shared tracks, rings at line changes, mode changes and branches', () => {
    for (const name of ['Temple', 'Great Portland Street', 'Regent\'s Park', 'Ladbroke Grove']) expect(marker(name).interchange, name).toBe(false)
    for (const name of ['Oxford Circus', 'Camden Town', 'Kew Gardens', 'Paddington']) expect(marker(name).interchange, name).toBe(true)
  })
  it('turns ticks perpendicular to their track, independent of train direction', () => {
    expect(Math.abs(marker("St. James's Park").normal[0])).toBeCloseTo(0)
    expect(Math.abs(marker("St. James's Park").normal[1])).toBeCloseTo(1)
    expect(Math.abs(marker('Ladbroke Grove').normal[0])).toBeCloseTo(1)
    expect(Math.abs(marker('Ladbroke Grove').normal[1])).toBeCloseTo(0)
    const reversed = londonDiagramMarkers({ ...network, trains: [...network.trains].reverse() }, stops, paths)
    const index = marker('Ladbroke Grove').stopIndex
    const other = reversed.find(m => m.stopIndex === index)!
    expect(Math.abs(other.normal[0])).toBeCloseTo(1)
    expect(Math.abs(other.normal[1])).toBeCloseTo(0)
  })
  it('retains parallel line order across opposite directions and different path IDs', () => {
    const a = { stops: [[0], [1]] }, b = { stops: [[1], [0]] }
    expect(londonDiagramSegmentKey(a, 0, stops)).toBe(londonDiagramSegmentKey(b, 0, stops))
    const points: DiagramPoint[] = [[-1, 0, 0], [0, 0, 0], [1, 0, -1]]
    expect(londonDiagramOrderedPoints(points)).toEqual(londonDiagramOrderedPoints([...points].reverse()))
  })
})
