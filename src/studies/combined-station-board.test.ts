import { describe, expect, it } from 'vitest'
import type { NetworkSnapshot, NetworkTrain } from '@motionstudies/core/domain/network'
import { mergeNetworkLayers } from '@motionstudies/core/domain/network-layers'
import tflManifest from '../../fixtures/tfl/all-change-day-manifest.json'
import angliaFixture from '../../fixtures/national-rail/network-liverpool-street.json'
import swrFixture from '../../fixtures/national-rail/network-waterloo.json'
import southernFixture from '../../fixtures/national-rail/network-southern.json'
import paddingtonFixture from '../../fixtures/national-rail/network-paddington.json'
import thameslinkFixture from '../../fixtures/national-rail/network-thameslink.json'
import southeasternFixture from '../../fixtures/national-rail/network-southeastern.json'
import eustonFixture from '../../fixtures/national-rail/network-euston.json'
import kingsCrossFixture from '../../fixtures/national-rail/network-kings-cross.json'
import stPancrasFixture from '../../fixtures/national-rail/network-st-pancras.json'
import eurostar from '../../fixtures/eurostar/network.json'
import eurostarStation from '../../fixtures/eurostar/station.json'
import catalogue from '../../fixtures/national-rail/catalogue.json'
import { BOARD_INTERCHANGES, boardInterchange, boardInterchanges } from '../editions/london-board-interchanges.ts'
import { combinedStationCalls } from './combined-station-board.ts'
import { upcomingStationCalls } from './station-board.ts'
import type { NationalRailTrain } from '../data/national-rail.ts'

// Reconstruct from committed delivery artifacts; the compiler's full-day output is ignored by Git.
const chunks = import.meta.glob<{ trains: NetworkTrain[] }>('../../fixtures/tfl/all-change-day-chunks/*.json', { eager: true, import: 'default' })
const tfl = { ...tflManifest, trains: [...new Map(Object.values(chunks).flatMap(chunk => chunk.trains).map(train => [train.id, train])).values()] } as unknown as NetworkSnapshot
const rail = mergeNetworkLayers([angliaFixture, swrFixture, southernFixture, paddingtonFixture, thameslinkFixture, southeasternFixture, eustonFixture, kingsCrossFixture, stPancrasFixture] as unknown as NetworkSnapshot[])
const source = (snapshot: NetworkSnapshot, windowStart = 0, windowEnd = 86400) => ({ snapshot, windowStart, windowEnd })

describe('combined interchange boards', () => {
  it('audits exact stop identities and reconciles passenger calls independently for each source', () => {
    for (const station of BOARD_INTERCHANGES) {
      const nr = [...catalogue.stations, eurostarStation].find(value => value.code === station.railCode)!
      expect(nr.id).toBe(station.id)
      expect([...nr.corridors].sort()).toEqual([...station.corridors].sort())
      expect(tfl.stops.filter(stop => station.tflStopIds.includes(stop[4]!))).toHaveLength(station.tflStopIds.length)
      for (const alias of station.aliases) expect(boardInterchange(alias)).toBe(station)
      const boardRail = station.id === 'eurostar' ? eurostar.board as unknown as NetworkSnapshot : rail
      const calls = combinedStationCalls(station, '2026-09-04', source(tfl), source(boardRail))
      expect(new Set(calls.map(call => call.id)).size).toBe(calls.length)
      for (const [kind, snapshot, ids] of [['tfl', tfl, station.tflStopIds], ['national-rail', boardRail, [station.railStopId ?? `crs:${station.railCode}`]]] as const) {
        for (const direction of ['arrival', 'departure'] as const) {
          let expected = 0
          for (const value of snapshot.trains) {
            const train = value as NationalRailTrain
            train.stops.forEach(([stop, arrival, departure], i) => {
              if (!(ids as readonly string[]).includes(snapshot.stops[stop][4]!) || train.passIndexes?.includes(i)) return
              if (direction === 'arrival' ? i === 0 || train.pickupOnlyIndexes?.includes(i) : i === train.stops.length - 1 || train.setDownOnlyIndexes?.includes(i)) return
              const time = direction === 'arrival' ? arrival : departure
              if (time >= 0 && time < 86400) expected++
            })
          }
          const actual = calls.filter(call => call.source === kind && call[direction] >= 0 && call[direction] < 86400 && (direction === 'arrival' ? call.allowsArrival : call.allowsDeparture))
          expect(actual.length, `${station.name} ${kind} ${direction}`).toBe(expected)
          expect(actual.length).toBeGreaterThan(0)
        }
      }
      const routes = [...new Set(calls.map(call => call.train.route))]
      if (station.id === 'stratford') expect(routes.sort()).toEqual(['Central', 'DLR', 'Elizabeth line', 'Greater Anglia', 'Jubilee', 'Mildmay'])
      if (station.id === 'clapham-junction') expect(routes).toEqual(expect.arrayContaining(['Mildmay', 'Windrush', 'Southern', 'South Western Railway']))
    }
    expect(boardInterchange('Stratford International')).toBeUndefined()
    expect(boardInterchange('Stratford High Street')).toBeUndefined()
    expect(boardInterchange('Waterloo East')).toBeUndefined()
    expect(boardInterchange('London Waterloo East')).toBeUndefined()
    expect(boardInterchange('Euston Square')).toBeUndefined()
    expect(boardInterchange('Royal Victoria')).toBeUndefined()
    expect(boardInterchange('Stratford (London)')?.id).toBe('stratford')
  })
  it('retains repeated visits and same-time services, deduplicates IDs and honours source ownership', () => {
    const station = BOARD_INTERCHANGES[0]
    const snapshot: NetworkSnapshot = { ...tfl, stops: [[0, 0, 'Start', '', 'start'], [0, 0, 'Alias', '', station.tflStopIds[0]], [0, 0, 'Elsewhere', '', 'other'], [0, 0, 'Rail', '', 'crs:SRA'], [0, 0, 'End', '', 'end']], trains: [] }
    const train: NetworkTrain = { id: 'same-id', route: 'Central', headsign: 'End', mode: 'tube', shortName: 'A', category: 'metro', start: -60, end: 400, stops: [[0, -60, -60], [1, 0, 10], [2, 100, 100], [1, 200, 210], [4, 400, 400]] }
    const national: NationalRailTrain = { ...train, mode: 'national-rail', route: 'Greater Anglia', direction: 'outbound', source: { table: 'test', column: 1 }, stops: [[0, -60, -60], [3, 0, 10], [2, 100, 100], [3, 200, 210], [4, 400, 400]], pickupOnlyIndexes: [1], setDownOnlyIndexes: [3] }
    const tflSource = { ...snapshot, trains: [train, train, { ...train, id: 'second-train' }, national] }
    const railSource = { ...snapshot, trains: [national, national, { ...national, id: 'wrong-owner', mode: 'elizabeth-line' as const }] }
    const calls = combinedStationCalls(station, '2026-09-04', source(tflSource), source(railSource))
    expect(calls).toHaveLength(6)
    expect(calls.filter(call => call.train.id === train.id)).toHaveLength(4)
    expect(upcomingStationCalls(calls, 'arrival', 0, 0, 86400).filter(call => call.source === 'national-rail').map(call => call.index)).toEqual([3])
    expect(upcomingStationCalls(calls, 'departure', 0, 0, 86400, 'Greater Anglia').map(call => call.index)).toEqual([1])
    expect(calls.find(call => call.source === 'national-rail')!.train).toBe(national)
    expect(combinedStationCalls(station, '2026-09-05', source(tflSource), source(railSource))).toEqual([])
  })
  it('keeps the four rail areas of the shared Tube station distinct', () => {
    const areas = boardInterchanges("King's Cross St. Pancras")
    expect(areas.map(area => area.railCode)).toEqual(['KGX', 'STP', 'SPL', '7015400'])
    const railVisits = new Set<string>()
    const tflVisits: string[][] = []
    for (const area of areas) {
      const boardRail = area.id === 'eurostar' ? eurostar.board as unknown as NetworkSnapshot : rail
      const calls = combinedStationCalls(area, '2026-09-04', source(tfl), source(boardRail))
      tflVisits.push(calls.filter(call => call.source === 'tfl').map(call => call.id))
      for (const call of calls.filter(call => call.source === 'national-rail')) {
        expect(boardRail.stops[call.train.stops[call.index][0]][4]).toBe(area.railStopId ?? `crs:${area.railCode}`)
        expect(railVisits.has(call.id)).toBe(false)
        railVisits.add(call.id)
      }
    }
    expect(tflVisits[0].length).toBeGreaterThan(0)
    expect(tflVisits[1]).toEqual(tflVisits[0])
    expect(tflVisits[2]).toEqual(tflVisits[0])
    expect(tflVisits[3]).toEqual(tflVisits[0])
  })
  it('clips each source independently at a chunk boundary without losing the rest of the hour', () => {
    const calls = combinedStationCalls(BOARD_INTERCHANGES[0], '2026-09-04', source(tfl, 21600, 28800), source(rail))
    const upcoming = upcomingStationCalls(calls, 'departure', 27900, 0, 86400, '', 1000)
    expect(upcoming.some(call => call.source === 'tfl')).toBe(true)
    expect(upcoming.filter(call => call.source === 'tfl').every(call => call.departure < 28800)).toBe(true)
    expect(upcoming.some(call => call.source === 'national-rail' && call.departure >= 28800)).toBe(true)
    expect(upcomingStationCalls(calls, 'arrival', 86400, 0, 86400)).toEqual([])
    const partial = combinedStationCalls(BOARD_INTERCHANGES[0], '2026-09-04', undefined, source(rail))
    expect(partial.every(call => call.source === 'national-rail')).toBe(true)
  })
})
