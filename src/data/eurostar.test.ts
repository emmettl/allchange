import { describe, expect, it } from 'vitest'
import fixture from '../../fixtures/eurostar/network.json'
import audit from '../../fixtures/eurostar/audit.json'
import domestic from '../../fixtures/national-rail/network-southeastern.json'
import geography from '../../fixtures/tfl/all-change-geography.json'
import { londonBoundary, type LondonGeographySnapshot } from '../editions/london-geography.ts'
import { boardInterchange } from '../editions/london-board-interchanges.ts'
import { combinedStationCalls } from '../studies/combined-station-board.ts'
import { upcomingStationCalls } from '../studies/station-board.ts'
import { boundaryOpacity, prepareRailPath, railPosition, validateNationalRail, type NationalRailSnapshot } from './national-rail.ts'
import { validateEurostar } from './eurostar.ts'

const network = fixture as unknown as NationalRailSnapshot
const date = '2026-09-04'
const station = boardInterchange('St Pancras Eurostar')!
const calls = combinedStationCalls(station, date, undefined, { snapshot: network.board!, movements: network, windowStart: 0, windowEnd: 86400 })

describe('dated Eurostar board and London movement', () => {
  it('shows all 55 unique public calls, correct destinations and passenger permissions', () => {
    expect(validateEurostar(validateNationalRail(network, date), date)).toBe(network)
    expect(calls).toHaveLength(55)
    expect(calls.filter(call => call.allowsDeparture)).toHaveLength(27)
    expect(calls.filter(call => call.allowsArrival)).toHaveLength(28)
    expect(calls.every(call => call.allowsDeparture !== call.allowsArrival)).toBe(true)
    expect(calls.filter(call => call.movementAvailable)).toHaveLength(40)
    const paris = calls.find(call => call.train.shortName === '9004')!
    expect([paris.departure, paris.destination, paris.movementAvailable]).toEqual([25440, 'Paris-Nord', false])
    const arrival = calls.find(call => call.train.shortName === '9007')!
    expect([arrival.arrival, arrival.origin, arrival.movementAvailable]).toEqual([30600, 'Paris-Nord', true])
    expect(new Set(calls.map(call => call.train.id)).size).toBe(55)
    expect(upcomingStationCalls(calls, 'departure', 86400, 0, 86400)).toEqual([])
    expect(combinedStationCalls(station, '2026-09-05', undefined, { snapshot: network.board!, windowStart: 0, windowEnd: 86400 })).toEqual([])
    expect(combinedStationCalls(boardInterchange('London St. Pancras International')!, date, undefined, { snapshot: network, windowStart: 0, windowEnd: 86400 })).toEqual([])
    expect(combinedStationCalls(station, date, undefined, { snapshot: domestic as unknown as NationalRailSnapshot, windowStart: 0, windowEnd: 86400 })).toEqual([])
  })
  it('uses only exact audited WTT matches and continuous London geometry with a boundary fade', () => {
    const boundary = londonBoundary(geography as unknown as LondonGeographySnapshot)
    const paths = network.paths!.map(path => prepareRailPath(path, boundary, 4))
    expect(boundaryOpacity(network.stops[0].slice(0, 2) as [number, number], boundary)).toBe(1)
    expect(boundaryOpacity(network.stops[1].slice(0, 2) as [number, number], boundary)).toBe(0)
    const used = new Set<string>()
    for (const train of network.trains) {
      const record = audit.services.find(service => service.id === train.id)!
      expect(record.status).toBe('movement')
      const matches = record.candidates.filter(candidate => candidate.times['0'] === record.londonTime)
      expect(matches).toHaveLength(1)
      const identity = `${matches[0].sheet}:${matches[0].column}`
      expect(used.has(identity)).toBe(false); used.add(identity)
      const path = network.paths![train.pathSegments![0]!]!
      expect(path[0]).toEqual(network.stops[train.stops[0][0]].slice(0, 2))
      expect(path.at(-1)).toEqual(network.stops[train.stops[1][0]].slice(0, 2))
      expect(train.end - train.start).toBeGreaterThan(600)
      expect(train.end - train.start).toBeLessThan(1800)
      const midpoint = railPosition(train, (train.start + train.end) / 2, network, paths)!
      expect(midpoint[0]).toBeGreaterThan(-0.13)
      expect(midpoint[0]).toBeLessThan(0.33)
    }
    expect(audit.services.filter(service => service.status === 'board-only')).toHaveLength(15)
  })
  it('rejects missing, wrong-date or mismatched boards before caching them', () => {
    expect(() => validateEurostar({ ...network, board: undefined }, date)).toThrow()
    expect(() => validateEurostar(network, '2026-09-05')).toThrow()
    const changed = structuredClone(network) as unknown as typeof fixture
    changed.board.trains[0].stops[0][1] += 60
    expect(() => validateEurostar(changed as unknown as NationalRailSnapshot, date)).toThrow()
    const wrongMovement = { ...network, trains: [{ ...network.trains[0], id: 'eurostar:missing:2026-09-04' }] }
    expect(() => validateEurostar(wrongMovement, date)).toThrow()
  })
})
