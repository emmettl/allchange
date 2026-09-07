import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildLondonDiagram, canonicalStationName } from './london-diagram-layout.mjs'

const network = JSON.parse(readFileSync('fixtures/tfl/all-change-rail-led-morning.json'))
const overrides = JSON.parse(readFileSync('fixtures/tfl/all-change-diagram-overrides.json'))
const diagram = buildLondonDiagram(network, overrides)
const stop = name => diagram.stops[network.stops.findIndex(s => s[2] === name)].slice(1)
const close = (a, b) => { expect(a[0]).toBeCloseTo(b[0], 8); expect(a[1]).toBeCloseTo(b[1], 8) }

describe('London corridor diagram', () => {
  it('preserves every source identity and path endpoint, including reversed paths', () => {
    expect(diagram.stops.map(s => s[0])).toEqual(network.stops.map(s => s[4]))
    expect(diagram.paths).toHaveLength(network.paths.length)
    network.edgePaths.forEach((pathIndex, edgeIndex) => {
      if (pathIndex == null) return
      const path = diagram.paths[pathIndex], [from, to] = network.edges[edgeIndex]
      const a = diagram.stops[from].slice(1), b = diagram.stops[to].slice(1)
      const forward = Math.hypot(path[0][0] - a[0], path[0][1] - a[1]) < 1e-8
      close(path[0], forward ? a : b); close(path.at(-1), forward ? b : a)
    })
    for (const path of diagram.paths) for (let i = 1; i < path.length; i++) {
      const dx = Math.abs(path[i][0] - path[i - 1][0]), dy = Math.abs(path[i][1] - path[i - 1][1])
      expect(Math.min(dx, dy, Math.abs(dx - dy))).toBeLessThan(1e-8)
      expect(path[i].every(Number.isFinite)).toBe(true)
    }
  })
  it('keeps the TfL central line orientations and generous station runs', () => {
    const central = ['Bond Street', 'Oxford Circus', 'Tottenham Court Road', 'Holborn'].map(stop)
    expect(new Set(central.map(p => p[1])).size).toBe(1)
    expect(central.every((p, i) => !i || p[0] - central[i - 1][0] >= 10)).toBe(true)
    const west = ['Westbourne Park', 'Ladbroke Grove', 'Latimer Road', 'Wood Lane'].map(stop)
    expect(new Set(west.map(p => p[0])).size).toBe(1)
    expect(west.every((p, i) => !i || p[1] < west[i - 1][1])).toBe(true)
    expect(stop('Finsbury Park')[0]).toBeGreaterThan(stop("King's Cross St. Pancras")[0])
    expect(stop('Finsbury Park')[1]).toBeGreaterThan(stop("King's Cross St. Pancras")[1])
    expect(stop('Victoria')[0]).toBeLessThan(stop('Green Park')[0])
    expect(stop('Victoria')[1]).toBeLessThan(stop('Green Park')[1])
  })
  it('never stacks unrelated stations and keeps the two Bethnal Greens separate', () => {
    const occupied = new Map()
    diagram.stops.forEach(([, x, y], i) => {
      const name = canonicalStationName(network.stops[i][2]), key = `${x}:${y}`
      expect(occupied.get(key) ?? name).toBe(name)
      occupied.set(key, name)
    })
    const bethnal = network.stops.flatMap((s, i) => s[2] === 'Bethnal Green' ? [diagram.stops[i].slice(1)] : [])
    expect(bethnal).toHaveLength(2)
    expect(bethnal[0]).not.toEqual(bethnal[1])
  })
  it('requires every station to belong to an authored corridor', () => {
    const extra = { ...network, stops: [...network.stops, [0, 0, 'Unplaced', '', 'unplaced']] }
    expect(() => buildLondonDiagram(extra, overrides)).toThrow('Stations need authored corridors: Unplaced')
  })
})
