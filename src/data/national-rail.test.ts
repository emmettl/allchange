import snapshotFixture from '../../fixtures/national-rail/paddington.json'
import geographyFixture from '../../fixtures/tfl/all-change-geography.json'
import { describe, expect, it } from 'vitest'
import { londonBoundary, type LondonGeographySnapshot } from '../editions/london-geography.ts'
import { boundaryOpacity, paddingtonCalls, prepareRailPath, railPosition, validateNationalRail, type NationalRailSnapshot } from './national-rail.ts'

const snapshot = snapshotFixture as unknown as NationalRailSnapshot
const geography = geographyFixture as unknown as LondonGeographySnapshot
const coordinates = snapshot.stops.map(stop => [stop[0], stop[1]] as const)
const boundary = londonBoundary(geography)
const paths = snapshot.paths!.map(path => prepareRailPath(path, boundary, 4))

describe('National Rail geographic playback', () => {
  it('keeps London opaque and dissolves the corridor before Slough', () => {
    expect(boundaryOpacity(coordinates[0], boundary)).toBe(1)
    expect(boundaryOpacity(coordinates[4], boundary)).toBe(1)
    expect(boundaryOpacity(coordinates[5], boundary)).toBeGreaterThan(0.5)
    expect(boundaryOpacity(coordinates[6], boundary)).toBeGreaterThan(0)
    expect(boundaryOpacity(coordinates[6], boundary)).toBeLessThan(0.5)
    expect(boundaryOpacity(coordinates[7], boundary)).toBe(0)
    expect(boundaryOpacity(coordinates[12], boundary)).toBe(0)
  })
  it('moves in both directions along the railway and fades symmetrically', () => {
    const outbound = snapshot.trains.find(train => train.direction === 'outbound' && train.stops.length === 2)!
    const inbound = { ...outbound, direction: 'inbound' as const, stops: [...outbound.stops].reverse().map(([stop], i) => [stop, i * 100, i * 100] as const), start: 0, end: 100, pathSegments: [0] }
    const outward = [{ ...paths[outbound.pathSegments![0]!], points: paths[outbound.pathSegments![0]!].points }]
    const inward = [prepareRailPath([...snapshot.paths![outbound.pathSegments![0]!]].reverse(), boundary, 4)]
    const forward = { ...outbound, stops: outbound.stops.map(([stop], i) => [stop, i * 100, i * 100] as const), start: 0, end: 100, pathSegments: [0] }
    for (const time of [1, 10, 20, 40, 60, 90, 99]) {
      const a = railPosition(forward, time, snapshot, outward)!
      const b = railPosition(inbound, 100 - time, snapshot, inward)!
      expect(a[0]).toBeCloseTo(b[0], 4)
      expect(a[1]).toBeCloseTo(b[1], 4)
      expect(a[2]).toBeCloseTo(b[2], 3)
    }
    expect(railPosition(forward, -1, snapshot, outward)).toBeUndefined()
    expect(railPosition(forward, 101, snapshot, outward)).toBeUndefined()
  })
  it('uses the published stopping times and holds the train during a real dwell', () => {
    const train = snapshot.trains.find(train => train.id === 'national-rail:T10:4:1:17')!
    expect(train.stops).toEqual([[0, 27480, 27480], [7, 28440, 28440], [10, 28860, 28920], [11, 29340, 29340], [12, 29760, 29760]])
    const point = railPosition(train, 28890, snapshot, paths)!
    expect(point.slice(0, 2)).toEqual(snapshot.stops[10].slice(0, 2))
    expect(point[2]).toBe(0)
  })
  it('keeps Friday/date exceptions, overnight services and deduplication explicit', () => {
    expect(snapshot.trains.some(train => train.start < 0 && train.end > 0)).toBe(true)
    for (const id of ['TS:4:3:4', 'TS:4:1:3', 'TS:7:3:2', 'T10:4:1:1']) expect(snapshot.trains.some(train => train.id === `national-rail:${id}`)).toBe(false)
    expect(snapshot.trains.some(train => train.id === 'national-rail:TS:4:1:13')).toBe(false) // T10 has its intermediate calls.
    const identities = snapshot.trains.map(train => `${train.direction}:${train.start}:${train.end}`)
    expect(new Set(identities).size).toBe(identities.length)
    expect(validateNationalRail(snapshot, '2026-09-04')).toBe(snapshot)
    expect(() => validateNationalRail(snapshot, '2026-09-05')).toThrow()
    expect(() => validateNationalRail({ ...snapshot, paths: [] }, '2026-09-04')).toThrow()
  })
  it('keeps every geometry segment connected to its actual calls', () => {
    for (const train of snapshot.trains) train.pathSegments!.forEach((index, segment) => {
      const path = snapshot.paths![index!]!
      expect(path[0]).toEqual(snapshot.stops[train.stops[segment][0]].slice(0, 2))
      expect(path.at(-1)).toEqual(snapshot.stops[train.stops[segment + 1][0]].slice(0, 2))
    })
  })
  it('shows separate arrival/departure calls inside the selected clock window', () => {
    for (const direction of ['inbound', 'outbound'] as const) {
      const calls = paddingtonCalls(snapshot, 27900, direction, 31500)
      expect(calls).toHaveLength(3)
      expect(calls.every(call => call.train.direction === direction && call.time >= 27900 && call.time < 31500)).toBe(true)
    }
    expect(paddingtonCalls(snapshot, 86400, 'outbound')).toEqual([])
  })
})
