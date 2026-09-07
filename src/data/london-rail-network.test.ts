import catalogueFixture from '../../fixtures/national-rail/catalogue.json'
import family0 from '../../fixtures/national-rail/network-paddington.json'
import family1 from '../../fixtures/national-rail/network-waterloo.json'
import family2 from '../../fixtures/national-rail/network-kings-cross.json'
import family3 from '../../fixtures/national-rail/network-thameslink.json'
import family4 from '../../fixtures/national-rail/network-southern.json'
import family5 from '../../fixtures/national-rail/network-southeastern.json'
import family6 from '../../fixtures/national-rail/network-liverpool-street.json'
import family7 from '../../fixtures/national-rail/network-euston.json'
import family8 from '../../fixtures/national-rail/network-marylebone.json'
import family9 from '../../fixtures/national-rail/network-fenchurch-street.json'
import family10 from '../../fixtures/national-rail/network-st-pancras.json'
import { describe, expect, it } from 'vitest'
import { mergeNetworkLayers } from '@motionstudies/core/domain/network-layers'
import { railBoardStations, type RailCatalogue } from '../editions/london-national-rail.ts'
import { railPulseHubs } from '../editions/london-hubs.ts'
import { isNationalRailCall, londonPulseCalls, pulseFlowAllowed } from '../editions/london-pulse.ts'
import { railFlowAllowed, stationRailCalls, validateNationalRail, type NationalRailSnapshot, type NationalRailTrain } from './national-rail.ts'
const catalogue = catalogueFixture as unknown as RailCatalogue
const snapshots = [family0, family1, family2, family3, family4, family5, family6, family7, family8, family9, family10] as unknown as NationalRailSnapshot[]
const merged = { ...mergeNetworkLayers(snapshots), corridorPaths: snapshots.flatMap(value => value.corridorPaths), fadeKilometres: 4 } as unknown as NationalRailSnapshot

describe('London passenger rail network', () => {
  it('validates every family and preserves unique scheduled movements with connected geometry', () => {
    for (const snapshot of snapshots) expect(validateNationalRail(snapshot, '2026-09-04')).toBe(snapshot)
    expect(merged.trains.length).toBeGreaterThan(8000)
    expect(new Set(merged.trains.map(train => train.id)).size).toBe(merged.trains.length)
    expect(merged.trains.every(train => train.stops.slice(1).every(([to], i) => {
      const path = merged.paths![train.pathSegments![i]!]
      return JSON.stringify(path[0]) === JSON.stringify(merged.stops[train.stops[i][0]].slice(0, 2)) && JSON.stringify(path.at(-1)) === JSON.stringify(merged.stops[to].slice(0, 2))
    }))).toBe(true)
  })
  it('includes all gateway and branch families without duplicating TfL services', () => {
    const codes = new Set(catalogue.stations.map(station => station.code))
    for (const code of ['PAD', 'WAT', 'KGX', 'VIC', 'LBG', 'CHX', 'CST', 'LST', 'EUS', 'MYB', 'FST', 'STP', 'SPL', 'MOG', 'HXX', 'HWV', 'CSS', 'HMC', 'SHP', 'SUO', 'HYS', 'BMN', 'DFD', 'UPM', 'CLW', 'GFD', 'ENL', 'ENC', 'WAE', 'BCZ', 'LEB']) expect(codes.has(code), code).toBe(true)
    expect(merged.trains.every(train => !/Elizabeth|Overground/.test(train.route))).toBe(true)
    expect(railBoardStations(catalogue).find(station => station.code === 'LBG')!.name).toBe('London Bridge')
  })
  it('gives every advertised station a board and a pulse with all its operators', () => {
    const stations = railBoardStations(catalogue), hubs = railPulseHubs(stations)
    for (const station of stations) {
      if (station.note) continue
      const arrivals = stationRailCalls(merged, station.stationName, 0, 'arrival')
      const departures = stationRailCalls(merged, station.stationName, 0, 'departure')
      expect(arrivals.length + departures.length, station.name).toBeGreaterThan(0)
      const hub = hubs.find(hub => hub.id === station.id)!
      const calls = londonPulseCalls({ ...merged, trains: [] }, hub, merged).filter(isNationalRailCall)
      expect(calls.length, station.name).toBeGreaterThan(0)
      expect(new Set(calls.map(call => call.id)).size).toBe(calls.length)
    }
    const bridge = hubs.find(hub => hub.id === 'london-bridge')!
    const operators = new Set(londonPulseCalls({ ...merged, trains: [] }, bridge, merged).map(call => call.train.route))
    expect([...operators].sort()).toEqual(['Southeastern', 'Southern', 'Thameslink'])
  })
  it('retains both visits on loops and applies staff, pickup and set-down restrictions', () => {
    const train: NationalRailTrain = { ...merged.trains[0], id: 'national-rail:loop', start: 0, end: 500, stops: [[0,0,0],[1,100,120],[2,200,220],[1,300,320],[3,400,430],[4,500,500]], passIndexes: [4], pickupOnlyIndexes: [1], setDownOnlyIndexes: [3] }
    const snapshot = { ...merged, trains: [train] }
    const hub = { id: 'loop', name: merged.stops[1][2], displayName: 'Loop', character: 'test' }
    const calls = londonPulseCalls({ ...snapshot, trains: [] }, hub, snapshot)
    expect(calls).toHaveLength(2)
    expect(calls.map(call => [pulseFlowAllowed(call,'arrival'), pulseFlowAllowed(call,'departure')])).toEqual([[false,true],[true,false]])
    expect(stationRailCalls(snapshot, hub.name, 0, 'arrival').map(call => call.time)).toEqual([300])
    expect(stationRailCalls(snapshot, hub.name, 0, 'departure').map(call => call.time)).toEqual([120])
    expect(railFlowAllowed(train,4,'arrival')).toBe(false)
    expect(railFlowAllowed(train,4,'departure')).toBe(false)
  })
})
