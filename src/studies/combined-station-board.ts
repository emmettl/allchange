import type { NetworkSnapshot } from '@motionstudies/core/domain/network'
import { combinedStationCalls as combineSources } from '@motionstudies/core/domain/station-calls'
import type { BoardInterchange } from '../editions/london-board-interchanges.ts'
import { londonCallPolicy, type StationBoardCall } from './station-board.ts'

const TFL_MODES = new Set(['tube', 'dlr', 'tram', 'elizabeth-line', 'overground'])
export interface BoardSource { snapshot: NetworkSnapshot; windowStart: number; windowEnd: number; movements?: NetworkSnapshot }

/** Interchange identities and source ownership remain London-authored. */
export function combinedStationCalls(station: BoardInterchange, serviceDate: string, tfl?: BoardSource, rail?: BoardSource): readonly StationBoardCall[] {
  return combineSources(serviceDate, [
    ...(tfl ? [{ ...tfl, id: 'tfl', selection: { name: station.name, stopIds: station.tflStopIds },
      policy: { ...londonCallPolicy, includeTrain: (train: NetworkSnapshot['trains'][number]) => TFL_MODES.has(train.mode ?? '') } }] : []),
    ...(rail ? [{ ...rail, id: 'national-rail', selection: { name: station.name, stopIds: [station.railStopId ?? `crs:${station.railCode}`] },
      policy: { ...londonCallPolicy, includeTrain: (train: NetworkSnapshot['trains'][number]) => train.mode === 'national-rail' } }] : []),
  ])
}
