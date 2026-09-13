import { type NetworkTrain } from '@motionstudies/core/domain/network'

const orderedStops = new WeakMap<NetworkTrain['stops'], boolean>()

export function trainStopsAreOrdered(stops: NetworkTrain['stops']): boolean {
  let ordered = orderedStops.get(stops)
  if (ordered === undefined) {
    ordered = stops.every((stop, index) => Number.isFinite(stop[1]) && Number.isFinite(stop[2])
      && stop[1] <= stop[2] && (index === 0 || stops[index - 1][2] <= stop[1]))
    orderedStops.set(stops, ordered)
  }
  return ordered
}

export { positionForTrain as indexedPositionForTrain } from '@motionstudies/core/domain/network'
