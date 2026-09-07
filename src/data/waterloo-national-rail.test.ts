import { describe, expect, it } from 'vitest'
import { mergeNetworkLayers } from '@motionstudies/core/domain/network-layers'
import type { NetworkSnapshot } from '@motionstudies/core/domain/network'
import railFixture from '../../fixtures/national-rail/waterloo.json'
import gwrFixture from '../../fixtures/national-rail/paddington.json'
import morningFixture from '../../fixtures/tfl/all-change-rail-led-morning.json'
import geographyFixture from '../../fixtures/tfl/all-change-geography.json'
import { londonBoundary, type LondonGeographySnapshot } from '../editions/london-geography.ts'
import { LONDON_HUBS } from '../editions/london-hubs.ts'
import { isNationalRailCall, londonPulseCalls, pulseFlowAllowed } from '../editions/london-pulse.ts'
import { boundaryOpacity, railPosition, prepareRailPath, stationRailCalls, validateNationalRail, type NationalRailSnapshot } from './national-rail.ts'
const rail = railFixture as unknown as NationalRailSnapshot
const gwr = gwrFixture as unknown as NationalRailSnapshot
const morning = morningFixture as unknown as NetworkSnapshot
const boundary = londonBoundary(geographyFixture as unknown as LondonGeographySnapshot)

describe('Waterloo rail movement and station pulses', () => {
  it('shows arriving and departing trains at Clapham, with only one movement at Waterloo terminals', () => {
    const arrivals = stationRailCalls(rail, 'Clapham Junction', 27900, 'arrival', 31500)
    const departures = stationRailCalls(rail, 'Clapham Junction', 27900, 'departure', 31500)
    expect(arrivals).toHaveLength(3)
    expect(departures).toHaveLength(3)
    for (const hubId of ['waterloo', 'clapham-junction']) {
      const hub = LONDON_HUBS.find(hub => hub.id === hubId)!
      const calls = londonPulseCalls(morning, hub, rail).filter(isNationalRailCall)
      expect(calls.length).toBeGreaterThan(10)
      expect(calls.some(call => call.previousStop)).toBe(true)
      expect(calls.some(call => call.nextStop)).toBe(true)
      if (hubId === 'clapham-junction') expect(calls.every(call => pulseFlowAllowed(call, 'arrival') && pulseFlowAllowed(call, 'departure'))).toBe(true)
      else expect(calls.every(call => pulseFlowAllowed(call, 'arrival') !== pulseFlowAllowed(call, 'departure'))).toBe(true)
    }
    expect(stationRailCalls(rail, 'Berrylands', 0, 'arrival')).toEqual([])
  })
  it('fades beyond London while retaining physical railway interpolation and real dwell', () => {
    expect(boundaryOpacity([rail.stops[2][0], rail.stops[2][1]], boundary)).toBe(1)
    expect(boundaryOpacity([rail.stops[8][0], rail.stops[8][1]], boundary)).toBe(1)
    expect(boundaryOpacity([rail.stops[15][0], rail.stops[15][1]], boundary)).toBe(0)
    const paths = rail.paths!.map(path => prepareRailPath(path, boundary, 4))
    const first = rail.trains.find(train => train.id === 'national-rail:SWR06:4:1:1')!
    expect(railPosition(first, 17640, rail, paths)?.slice(0, 2)).toEqual(rail.stops[8].slice(0, 2))
    expect(railPosition(first, first.start - 1, rail, paths)).toBeUndefined()
    expect(railPosition(first, first.end + 1, rail, paths)).toBeUndefined()
    expect(validateNationalRail(rail, '2026-09-04')).toBe(rail)
  })
  it('composes both operators without corrupting source-local stop or path indexes', () => {
    const combined = mergeNetworkLayers([gwr, rail])
    expect(combined.trains).toHaveLength(gwr.trains.length + rail.trains.length)
    for (const train of combined.trains) train.pathSegments!.forEach((index, segment) => {
      const path = combined.paths![index!]!
      expect(path[0]).toEqual(combined.stops[train.stops[segment][0]].slice(0, 2))
      expect(path.at(-1)).toEqual(combined.stops[train.stops[segment + 1][0]].slice(0, 2))
    })
  })
})
