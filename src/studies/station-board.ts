import type { NetworkSnapshot } from '@motionstudies/core/domain/network'
import { stationCalls, type StationCallPolicy, type StationCall, type StationCallDirection } from '@motionstudies/core/domain/station-calls'
import { railFlowAllowed, type NationalRailTrain } from '../data/national-rail.ts'

export { upcomingStationCalls } from '@motionstudies/core/domain/station-calls'
export type StationBoardCall = StationCall
export type StationBoardDirection = StationCallDirection
export const londonCallPolicy: StationCallPolicy = {
  allows: (train, index, direction) => railFlowAllowed(train as NationalRailTrain, index, direction),
  origin: train => (train as NationalRailTrain).origin,
}
export function stationBoardCalls(snapshot: NetworkSnapshot, stationName: string, stopIds?: readonly string[]): readonly StationBoardCall[] {
  return stationCalls(snapshot, { name: stationName, stopIds }, londonCallPolicy)
}
