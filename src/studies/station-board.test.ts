import { describe, expect, it } from 'vitest'
import type { NetworkSnapshot, NetworkTrain } from '@motionstudies/core/domain/network'
import type { NationalRailTrain } from '../data/national-rail.ts'
import { stationBoardCalls, upcomingStationCalls } from './station-board.ts'

const train: NetworkTrain = { id: 'loop', route: 'Loop line', shortName: 'L1', headsign: 'Terminus', category: 'metro', start: 0, end: 600,
  stops: [[0, 0, 0], [1, 100, 110], [2, 200, 210], [3, 400, 420], [4, 600, 600]] }
const snapshot: NetworkSnapshot = {
  metadata: { publisher: 'Test', feedVersion: 'test', serviceDate: '2026-09-04', windowStart: 0, windowEnd: 86400, focusTime: 0, sourceUrl: '', model: 'test', note: '' },
  bounds: { minLongitude: 0, maxLongitude: 1, minLatitude: 0, maxLatitude: 1 }, edges: [],
  stops: [[0, 0, 'Origin'], [0, 0, 'Station', '1'], [0, 0, 'Elsewhere'], [0, 0, 'Station', '2'], [0, 0, 'Terminus']],
  trains: [train],
}

describe('station departure board', () => {
  it('keeps separate visits and all platform records under the same station name', () => {
    const calls = stationBoardCalls(snapshot, 'Station')
    expect(calls.map(call => call.id)).toEqual(['loop:call:1', 'loop:call:3'])
    expect(upcomingStationCalls(calls, 'arrival', 0, 0, 86400).map(call => call.arrival)).toEqual([100, 400])
    expect(upcomingStationCalls(calls, 'departure', 120, 0, 86400).map(call => call.departure)).toEqual([420])
    expect(calls[0].origin).toBe('Origin')
    expect(calls[0].destination).toBe('Terminus')
  })
  it('respects terminals, passing points and pickup/set-down-only calls', () => {
    expect(upcomingStationCalls(stationBoardCalls(snapshot, 'Origin'), 'arrival', 0, 0, 86400)).toEqual([])
    expect(upcomingStationCalls(stationBoardCalls(snapshot, 'Terminus'), 'departure', 0, 0, 86400)).toEqual([])
    const rail: NationalRailTrain = { ...train, direction: 'inbound', source: { table: 'test', column: 1 }, passIndexes: [1], pickupOnlyIndexes: [2], setDownOnlyIndexes: [3], origin: 'Published origin' }
    const source = { ...snapshot, trains: [rail] }
    const calls = stationBoardCalls(source, 'Station')
    expect(upcomingStationCalls(calls, 'arrival', 0, 0, 86400).map(call => call.index)).toEqual([3])
    expect(upcomingStationCalls(calls, 'departure', 0, 0, 86400)).toEqual([])
    expect(upcomingStationCalls(stationBoardCalls(source, 'Elsewhere'), 'arrival', 0, 0, 86400)).toEqual([])
    expect(upcomingStationCalls(stationBoardCalls(source, 'Elsewhere'), 'departure', 0, 0, 86400)[0].origin).toBe('Published origin')
  })
  it('keeps real midnight continuations without wrapping, including exact window boundaries', () => {
    const overnight = { ...train, stops: [[0, -100, -100], [1, 0, 10], [4, 100, 100]] as const }
    const calls = stationBoardCalls({ ...snapshot, trains: [overnight] }, 'Station')
    expect(upcomingStationCalls(calls, 'arrival', 0, 0, 100)).toHaveLength(1)
    expect(upcomingStationCalls(calls, 'departure', 0, 0, 10)).toEqual([])
    expect(upcomingStationCalls(calls, 'departure', 86400, 0, 86400)).toEqual([])
    expect(upcomingStationCalls(calls, 'departure', -1, 0, 86400)).toEqual([])
    expect(upcomingStationCalls(calls, 'departure', NaN, 0, 86400)).toEqual([])
  })
  it('filters lines before limiting rows and clips the one-hour horizon to loaded coverage', () => {
    const second = { ...train, id: 'other', route: 'Other line' }
    const calls = stationBoardCalls({ ...snapshot, trains: [train, second, train] }, 'Station')
    expect(calls).toHaveLength(4)
    expect(upcomingStationCalls(calls, 'departure', 0, 0, 300, 'Other line', 1).map(call => call.id)).toEqual(['other:call:1'])
    expect(upcomingStationCalls(calls, 'departure', 0, 0, 86400, 'Missing line')).toEqual([])
    const late = calls.map(call => ({ ...call, departure: 3600 }))
    expect(upcomingStationCalls(late, 'departure', 0, 0, 86400)).toEqual([])
  })
})
