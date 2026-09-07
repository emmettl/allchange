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
  it('routes every Elizabeth service along the same track through skipped stations', () => {
    const pointKey = point => point.map(v => v.toFixed(8)).join(',')
    const segmentKey = (a, b) => [pointKey(a), pointKey(b)].sort().join('|')
    const adjacent = new Set(overrides.corridors
      .filter(corridor => corridor.route === 'Elizabeth line')
      .flatMap(({ stops }) => stops.slice(1).map((name, i) => [stops[i], name].sort().join('|'))))
    const services = network.trains.filter(train => train.route === 'Elizabeth line')
    const track = new Set()
    const calls = (train, i) => [train.stops[i][0], train.stops[i + 1][0]]
      .map(index => canonicalStationName(network.stops[index][2])).sort().join('|')
    for (const train of services) train.pathSegments.forEach((index, i) => {
      if (!adjacent.has(calls(train, i))) return
      const path = diagram.paths[index]
      path.slice(1).forEach((point, j) => track.add(segmentKey(path[j], point)))
    })
    let expressLinks = 0
    for (const train of services) train.pathSegments.forEach((index, i) => {
      if (adjacent.has(calls(train, i))) return
      expressLinks++
      const path = diagram.paths[index]
      path.slice(1).forEach((point, j) => expect(track.has(segmentKey(path[j], point)), calls(train, i)).toBe(true))
    })
    expect(expressLinks).toBeGreaterThan(0)
  })
  it.each([
    ['Iver', 'Whitechapel', ['Ealing Broadway', 'Paddington', 'Bond Street', 'Farringdon', 'Liverpool Street']],
    ['Farringdon', 'Stratford', ['Liverpool Street', 'Whitechapel']],
    ['Farringdon', 'Custom House', ['Liverpool Street', 'Whitechapel', 'Canary Wharf']],
  ])('keeps %s to %s on its branch in either direction', (from, to, via) => {
    const stationIndex = name => network.stops.findIndex(s => canonicalStationName(s[2]) === name)
    const a = stationIndex(from), b = stationIndex(to)
    for (const [start, end] of [[a, b], [b, a]]) {
      const index = network.paths.length
      const fixture = {
        ...network,
        edges: [...network.edges, [start, end]], edgePaths: [...network.edgePaths, index],
        paths: [...network.paths, [network.stops[start].slice(0, 2), network.stops[end].slice(0, 2)]],
        trains: [...network.trains, { route: 'Elizabeth line', pathSegments: [index] }],
      }
      const path = buildLondonDiagram(fixture, overrides).paths[index]
      const expected = (start === a ? via : [...via].reverse()).map(name => diagram.stops[stationIndex(name)].slice(1))
      let previous = -1
      for (const point of expected) {
        const at = path.findIndex(p => Math.hypot(p[0] - point[0], p[1] - point[1]) < 1e-8)
        expect(at).toBeGreaterThan(previous)
        previous = at
      }
    }
  })
})
