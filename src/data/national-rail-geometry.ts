import { positionForTrain, type NetworkPath } from '@motionstudies/core/domain/network'
import type { MapBoundary } from '@motionstudies/core/domain/boundary'
import type { NationalRailSnapshot, NationalRailTrain } from './national-rail.ts'

export interface RailPath {
  readonly points: readonly (readonly [number, number, number])[]
  readonly distances: readonly number[]
}

export function kilometres(a: readonly number[], b: readonly number[]) {
  return Math.hypot((a[0] - b[0]) * Math.cos((a[1] + b[1]) * Math.PI / 360), a[1] - b[1]) * 111.32
}

/** Full intensity inside the actual GLA polygon, smoothstep through its outer fringe. */
export function boundaryOpacity(point: readonly number[], boundary: MapBoundary, fringe = 4) {
  let inside = false, nearest = Infinity
  const cos = Math.cos(point[1] * Math.PI / 180)
  for (const ring of boundary.rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[j], b = ring[i]
      if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside
      const ax = (a[0] - point[0]) * cos, ay = a[1] - point[1]
      const dx = (b[0] - a[0]) * cos, dy = b[1] - a[1]
      const length = dx * dx + dy * dy
      const t = length ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / length)) : 0
      nearest = Math.min(nearest, Math.hypot(ax + t * dx, ay + t * dy) * 111.32)
    }
  }
  if (inside || nearest < 0.000001) return 1
  if (fringe <= 0) return 0
  const t = Math.min(1, nearest / fringe)
  return 1 - t * t * (3 - 2 * t)
}

/** Cache geography and fade at <=100 m intervals; no polygon scans in the animation loop. */
export function prepareRailPath(path: NetworkPath, boundary: MapBoundary, fringe: number): RailPath {
  const points: [number, number, number][] = []
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], steps = Math.max(1, Math.ceil(kilometres(a, b) / 0.1))
    for (let step = i === 1 ? 0 : 1; step <= steps; step++) {
      const t = step / steps
      const point = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t] as const
      points.push([...point, boundaryOpacity(point, boundary, fringe)])
    }
  }
  const distances = [0]
  for (let i = 1; i < points.length; i++) distances.push(distances[i - 1] + kilometres(points[i - 1], points[i]))
  return { points, distances }
}

export function railPosition(train: NationalRailTrain, time: number, snapshot: NationalRailSnapshot, paths: readonly RailPath[]): readonly [number, number, number] | undefined {
  const position = positionForTrain(train, time)
  if (!position) return
  if (position.fromStop === position.toStop) {
    // Endpoint lookup retains the same boundary treatment while dwelling.
    const index = train.stops.findIndex(([stop]) => stop === position.fromStop)
    const path = paths[train.pathSegments?.[Math.min(index, train.stops.length - 2)] ?? -1]
    const stop = snapshot.stops[position.fromStop]
    const endpoint = index === train.stops.length - 1 ? path?.points.at(-1) : path?.points[0]
    return endpoint ? [stop[0], stop[1], endpoint[2]] : undefined
  }
  const path = paths[train.pathSegments?.[position.segmentIndex ?? 0] ?? -1]
  if (!path?.points.length) return
  const target = (path.distances.at(-1) ?? 0) * position.progress
  let lo = 0, hi = path.distances.length - 1
  while (lo < hi) { const mid = (lo + hi) >> 1; if (path.distances[mid] < target) lo = mid + 1; else hi = mid }
  const index = Math.max(1, lo), a = path.points[index - 1], b = path.points[index]
  const length = path.distances[index] - path.distances[index - 1]
  const t = length ? (target - path.distances[index - 1]) / length : 0
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}
