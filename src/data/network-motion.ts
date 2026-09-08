import { positionForTrain, type NetworkTrain } from '@motionstudies/core/domain/network'

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

/** Binary lookup preserves dwell/arrival boundaries, including reverse scrubbing.
 * Unordered observed calls retain the shared renderer's sequential semantics. */
export function indexedPositionForTrain(train: NetworkTrain, time: number): ReturnType<typeof positionForTrain> {
  if (train.realtime?.status === 'cancelled' || time < train.start || time > train.end || train.stops.length < 2) return undefined
  const stops = train.stops
  if (!Number.isFinite(time) || !trainStopsAreOrdered(stops)) return positionForTrain(train, time)
  if (time <= stops[0][2]) return { fromStop: stops[0][0], toStop: stops[0][0], progress: 0 }
  let low = 1
  let high = stops.length - 1
  while (low < high) {
    const middle = (low + high) >>> 1
    if (time > stops[middle][2]) low = middle + 1
    else high = middle
  }
  const next = stops[low]
  const previous = stops[low - 1]
  if (time <= next[1]) return {
    fromStop: previous[0], toStop: next[0],
    progress: Math.min(1, Math.max(0, (time - previous[2]) / Math.max(1, next[1] - previous[2]))),
    segmentIndex: low - 1,
  }
  return { fromStop: next[0], toStop: next[0], progress: 0 }
}
