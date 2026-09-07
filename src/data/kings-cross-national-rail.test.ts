import { describe, expect, it } from 'vitest'
import { mergeNetworkLayers } from '@motionstudies/core/domain/network-layers'
import type { NetworkSnapshot } from '@motionstudies/core/domain/network'
import railFixture from '../../fixtures/national-rail/kings-cross.json'
import gwrFixture from '../../fixtures/national-rail/paddington.json'
import swrFixture from '../../fixtures/national-rail/waterloo.json'
import morningFixture from '../../fixtures/tfl/all-change-rail-led-morning.json'
import geographyFixture from '../../fixtures/tfl/all-change-geography.json'
import { londonBoundary, type LondonGeographySnapshot } from '../editions/london-geography.ts'
import { LONDON_HUBS } from '../editions/london-hubs.ts'
import { isNationalRailCall, londonPulseCalls, pulseFlowAllowed } from '../editions/london-pulse.ts'
import { boundaryOpacity, prepareRailPath, railPosition, stationRailCalls, validateNationalRail, type NationalRailSnapshot } from './national-rail.ts'
const rail = railFixture as unknown as NationalRailSnapshot
const morning = morningFixture as unknown as NetworkSnapshot
const boundary = londonBoundary(geographyFixture as unknown as LondonGeographySnapshot)

describe('King’s Cross map, board and pulse', () => {
  it('includes mainline terminal calls alongside TfL, with the correct one-sided flow', () => {
    const hub = LONDON_HUBS.find(hub => hub.id === 'kings-cross')!
    const calls = londonPulseCalls(morning, hub, rail)
    expect(calls.filter(isNationalRailCall).length).toBeGreaterThan(25)
    expect(calls.filter(call => !isNationalRailCall(call)).length).toBeGreaterThan(0)
    expect(calls.filter(isNationalRailCall).every(call => pulseFlowAllowed(call, 'arrival') !== pulseFlowAllowed(call, 'departure'))).toBe(true)
    for (const direction of ['arrival', 'departure'] as const) expect(stationRailCalls(rail, "London King's Cross", 27900, direction, 31500)).toHaveLength(3)
    expect(stationRailCalls(rail, "London King's Cross", 0, 'arrival').map(call => call.time)).toEqual([480, 1080, 1440])
  })
  it('uses passing times for movement without adding passenger calls, also after layer merging', () => {
    const combined = mergeNetworkLayers([gwrFixture, swrFixture, railFixture] as unknown as NetworkSnapshot[]) as NationalRailSnapshot
    const express = combined.trains.find(train => train.shortName === '1D01')!
    const local = combined.trains.find(train => train.shortName === '2L76')!
    const hub = { id: 'finsbury', name: 'Finsbury Park', displayName: 'Finsbury Park', character: 'test' }
    const calls = londonPulseCalls({ ...morning, metadata: { ...morning.metadata, windowStart: 0, windowEnd: 86400 } }, hub, combined).filter(isNationalRailCall)
    expect(calls.some(call => call.train.id === express.id)).toBe(false)
    expect(calls.some(call => call.train.id === local.id)).toBe(true)
    expect(stationRailCalls(combined, 'Finsbury Park', 20400, 'departure').some(call => call.train.id === express.id)).toBe(false)
    for (const train of combined.trains) train.pathSegments!.forEach((index, segment) => {
      expect(combined.paths![index!]![0]).toEqual(combined.stops[train.stops[segment][0]].slice(0, 2))
      expect(combined.paths![index!]!.at(-1)).toEqual(combined.stops[train.stops[segment + 1][0]].slice(0, 2))
    })
  })
  it('follows the railway through London and disappears in the northern fringe', () => {
    expect(boundaryOpacity([rail.stops[1][0], rail.stops[1][1]], boundary)).toBe(1)
    expect(boundaryOpacity([rail.stops[4][0], rail.stops[4][1]], boundary)).toBe(1)
    expect(boundaryOpacity([rail.stops[8][0], rail.stops[8][1]], boundary)).toBe(1)
    expect(boundaryOpacity([rail.stops[13][0], rail.stops[13][1]], boundary)).toBe(0)
    const paths = rail.paths!.map(path => prepareRailPath(path, boundary, 4))
    const express = rail.trains.find(train => train.shortName === '1D01')!
    const position = railPosition(express, 20730, rail, paths)!
    expect(position[0]).toBeCloseTo(rail.stops[4][0], 6)
    expect(position[1]).toBeCloseTo(rail.stops[4][1], 6)
    expect(railPosition(express, express.end, rail, paths)?.[2]).toBe(0)
    expect(railPosition(express, express.start - 1, rail, paths)).toBeUndefined()
    expect(validateNationalRail(rail, '2026-09-04')).toBe(rail)
    expect(() => validateNationalRail({ ...rail, trains: [{ ...express, passIndexes: [999] }] }, '2026-09-04')).toThrow('passing points')
  })
})
