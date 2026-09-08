import type { NetworkSnapshot } from '@motionstudies/core/domain/network'
import type { BoardInterchange } from '../editions/london-board-interchanges.ts'
import { stationBoardCalls, type StationBoardCall } from './station-board.ts'

const TFL_MODES = new Set(['tube', 'dlr', 'tram', 'elizabeth-line', 'overground'])
export interface BoardSource { snapshot: NetworkSnapshot; windowStart: number; windowEnd: number }

/** Keep source-local train/stop indexes for selection; never join on name and time. */
export function combinedStationCalls(station: BoardInterchange, serviceDate: string, tfl?: BoardSource, rail?: BoardSource): readonly StationBoardCall[] {
  const calls: StationBoardCall[] = []
  for (const [kind, source, ids] of [
    ['tfl', tfl, station.tflStopIds], ['national-rail', rail, [`crs:${station.railCode}`]],
  ] as const) {
    if (!source || source.snapshot.metadata.serviceDate !== serviceDate) continue
    for (const call of stationBoardCalls(source.snapshot, station.name, ids)) {
      if (kind === 'tfl' ? !TFL_MODES.has(call.train.mode ?? '') : call.train.mode !== 'national-rail') continue
      calls.push({ ...call, source: kind, id: `${kind}:${call.id}`, windowStart: source.windowStart, windowEnd: source.windowEnd })
    }
  }
  return [...new Map(calls.map(call => [call.id, call])).values()]
}
