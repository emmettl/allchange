import type { NetworkSnapshot, NetworkTrain } from '@motionstudies/core/domain/network'
import { railFlowAllowed, type NationalRailTrain } from '../data/national-rail.ts'

export type StationBoardDirection = 'arrival' | 'departure'
export interface StationBoardCall {
  readonly id: string
  readonly train: NetworkTrain
  readonly index: number
  readonly arrival: number
  readonly departure: number
  readonly origin: string
  readonly destination: string
  readonly allowsArrival: boolean
  readonly allowsDeparture: boolean
  readonly source?: 'tfl' | 'national-rail'
  readonly windowStart?: number
  readonly windowEnd?: number
}

/** Build once per loaded timetable, retaining each visit and source-local stop index. */
export function stationBoardCalls(snapshot: NetworkSnapshot, stationName: string, stopIds?: readonly string[]): readonly StationBoardCall[] {
  const stops = new Set(snapshot.stops.flatMap((stop, index) => (stopIds ? Boolean(stop[4] && stopIds.includes(stop[4])) : stop[2] === stationName) ? [index] : []))
  const calls = snapshot.trains.flatMap(train => train.stops.flatMap(([stop, arrival, departure], index) => {
    if (!stops.has(stop)) return []
    const rail = train as NationalRailTrain
    const allowsArrival = railFlowAllowed(rail, index, 'arrival'), allowsDeparture = railFlowAllowed(rail, index, 'departure')
    if (!allowsArrival && !allowsDeparture) return []
    return [{ id: `${train.id}:call:${index}`, train, index, arrival, departure,
      origin: rail.origin ?? snapshot.stops[train.stops[0][0]][2],
      destination: train.headsign || snapshot.stops[train.stops.at(-1)![0]][2],
      allowsArrival, allowsDeparture,
    }]
  }))
  return [...new Map(calls.map(call => [call.id, call])).values()]
}

/** No wrapping: a bounded or partially loaded study cannot invent the next day's calls. */
export function upcomingStationCalls(calls: readonly StationBoardCall[], direction: StationBoardDirection, time: number, windowStart: number, windowEnd: number, route = '', maxRows = 4): readonly StationBoardCall[] {
  if (!Number.isFinite(time) || time < windowStart || time >= windowEnd) return []
  const end = Math.min(windowEnd, time + 3600)
  return calls.filter(call => (direction === 'arrival' ? call.allowsArrival : call.allowsDeparture)
    && call[direction] >= (call.windowStart ?? windowStart) && call[direction] < (call.windowEnd ?? windowEnd)
    && (!route || call.train.route === route) && call[direction] >= time && call[direction] < end)
    .sort((a, b) => a[direction] - b[direction] || a.id.localeCompare(b.id))
    .slice(0, maxRows)
}
