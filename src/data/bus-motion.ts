import type { NetworkTrain } from '@motionstudies/core/domain/network'
import { indexedPositionForTrain, trainStopsAreOrdered } from './network-motion'

type Point = readonly [number, number, number]
interface ProjectedPath {
  points: readonly Point[]
  cumulativeDistances: readonly number[]
  length: number
}
interface Span {
  start: number
  end: number
  x: number
  z: number
  vx: number
  vz: number
}
interface MotionCache {
  stops: readonly Point[]
  paths: readonly ProjectedPath[]
  spans: Span[]
  next: number
}
const journeys = new WeakMap<NetworkTrain, MotionCache>()

/** Reuse exact linear motion until the next road vertex or stop boundary.
 * Eight spans cover the marker, three historical samples, and their next turns. There is
 * no time quantisation: turns, dwell times and arbitrary scrubs remain exact. */
export function cachedBusPosition(train: NetworkTrain, time: number,
  stops: readonly Point[], paths: readonly ProjectedPath[]): Point | undefined {
  if (train.realtime?.status === 'cancelled' || time < train.start || time > train.end) return undefined
  let cache = journeys.get(train)
  if (!cache || cache.stops !== stops || cache.paths !== paths) {
    if (!trainStopsAreOrdered(train.stops)) return undefined
    cache = { stops, paths, spans: [], next: 0 }
    journeys.set(train, cache)
  }
  for (const span of cache.spans) {
    // Arrival belongs to the incoming segment; departure belongs to the stop.
    if (time > span.start && time <= span.end) {
      const elapsed = time - span.start
      return [span.x + span.vx * elapsed, 0.085, span.z + span.vz * elapsed]
    }
  }
  const position = indexedPositionForTrain(train, time)
  if (!position || position.segmentIndex === undefined) return undefined
  const segment = position.segmentIndex
  const pathIndex = train.pathSegments?.[segment]
  const path = pathIndex == null ? undefined : paths[pathIndex]
  const origin = stops[position.fromStop]
  // Let the shared renderer handle dwell, missing paths and detours.
  if (!path || !origin || path.points.length < 2 || path.length <= 0) return undefined
  const first = path.points[0], last = path.points[path.points.length - 1]
  const forward = (first[0] - origin[0]) ** 2 + (first[1] - origin[1]) ** 2 + (first[2] - origin[2]) ** 2
    <= (last[0] - origin[0]) ** 2 + (last[1] - origin[1]) ** 2 + (last[2] - origin[2]) ** 2
  const distance = (forward ? position.progress : 1 - position.progress) * path.length
  let low = 1, high = path.cumulativeDistances.length - 1
  while (low < high) {
    const middle = (low + high) >>> 1
    if (path.cumulativeDistances[middle] < distance) low = middle + 1
    else high = middle
  }
  const lowerDistance = path.cumulativeDistances[low - 1]
  const upperDistance = path.cumulativeDistances[low]
  if (upperDistance <= lowerDistance) return undefined
  const departure = train.stops[segment][2]
  const arrival = train.stops[segment + 1][1]
  const duration = Math.max(1, arrival - departure)
  const start = departure + (forward ? lowerDistance / path.length : 1 - upperDistance / path.length) * duration
  const end = departure + (forward ? upperDistance / path.length : 1 - lowerDistance / path.length) * duration
  const from = path.points[forward ? low - 1 : low]
  const to = path.points[forward ? low : low - 1]
  if (!(end > start)) return undefined
  const span = {
    start, end: Math.min(end, arrival), x: from[0], z: from[2],
    vx: (to[0] - from[0]) / (end - start), vz: (to[2] - from[2]) / (end - start),
  }
  cache.spans[cache.next] = span
  cache.next = (cache.next + 1) % 8
  const elapsed = time - start
  return [span.x + span.vx * elapsed, 0.085, span.z + span.vz * elapsed]
}
