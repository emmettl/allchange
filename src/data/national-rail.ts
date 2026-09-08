import { type NetworkPath, type NetworkSnapshot, type NetworkTrain } from '@motionstudies/core/domain/network'
export { kilometres, boundaryOpacity, prepareRailPath, railPosition } from './national-rail-geometry.ts'

export interface NationalRailTrain extends NetworkTrain {
  readonly direction: 'inbound' | 'outbound'
  readonly origin?: string
  /** Ordinals in train.stops, preserved when network layers remap station indexes. */
  readonly passIndexes?: readonly number[]
  readonly pickupOnlyIndexes?: readonly number[]
  readonly setDownOnlyIndexes?: readonly number[]
  readonly source: { readonly table: string; readonly page?: number; readonly block?: number; readonly sheet?: string; readonly column: number }
}
export interface NationalRailSnapshot extends NetworkSnapshot {
  readonly trains: readonly NationalRailTrain[]
  readonly corridorPaths: readonly NetworkPath[]
  readonly fadeKilometres: number
  /** Published calls may outnumber services with supported movement geometry. Never render this network. */
  readonly board?: NetworkSnapshot
}
export function stationRailCalls(snapshot: NationalRailSnapshot, stationName: string, time: number, flow: 'arrival' | 'departure', windowEnd = 86400) {
  const station = snapshot.stops.findIndex(stop => stop[2] === stationName)
  return snapshot.trains.flatMap(train => train.stops.flatMap((stop, index) => {
    if (stop[0] !== station || !railFlowAllowed(train, index, flow)) return []
    const callTime = stop[flow === 'arrival' ? 1 : 2]
    return callTime >= time && callTime < windowEnd ? [{ train, index, time: callTime }] : []
  })).sort((a, b) => a.time - b.time || a.train.id.localeCompare(b.train.id)).slice(0, 3)
}

export function railFlowAllowed(train: NationalRailTrain, index: number, flow: 'arrival' | 'departure') {
  return !train.passIndexes?.includes(index) && (flow === 'arrival'
    ? index > 0 && !train.pickupOnlyIndexes?.includes(index)
    : index < train.stops.length - 1 && !train.setDownOnlyIndexes?.includes(index))
}

export function paddingtonCalls(snapshot: NationalRailSnapshot, time: number, direction: NationalRailTrain['direction'], windowEnd = 86400) {
  return snapshot.trains.filter(train => train.direction === direction)
    .map(train => ({ train, time: direction === 'outbound' ? train.start : train.end }))
    .filter(call => call.time >= time && call.time < windowEnd)
    .sort((a, b) => a.time - b.time).slice(0, 3)
}

export function validateNationalRail(value: NationalRailSnapshot, serviceDate: string): NationalRailSnapshot {
  if (value.metadata?.serviceDate !== serviceDate || value.metadata.windowStart !== 0 || value.metadata.windowEnd !== 86400 || !Array.isArray(value.trains) || !value.trains.length || !value.paths?.length || !value.corridorPaths?.length || value.fadeKilometres !== 4) throw new Error('Invalid National Rail study')
  if ([...value.paths, ...value.corridorPaths].some(path => path.length < 2 || path.some(point => !Number.isFinite(point[0]) || !Number.isFinite(point[1]))) || value.trains.some((train: NationalRailTrain) => train.mode !== 'national-rail' || !['inbound', 'outbound'].includes(train.direction) || train.stops.length < 2 || train.pathSegments?.length !== train.stops.length - 1 || train.pathSegments.some(index => index === null || !Number.isInteger(index) || !value.paths?.[index]) || train.stops.some(([stop, arrival, departure], i) => !value.stops[stop] || !Number.isFinite(arrival) || !Number.isFinite(departure) || departure < arrival || (i > 0 && arrival < train.stops[i - 1][2])))) throw new Error('Invalid National Rail journeys')
  if (value.trains.some((train: NationalRailTrain) => [train.passIndexes, train.pickupOnlyIndexes, train.setDownOnlyIndexes].some(indexes => indexes?.some(index => !Number.isInteger(index) || index < 0 || index >= train.stops.length)))) throw new Error('Invalid National Rail passing points')
  return value
}
