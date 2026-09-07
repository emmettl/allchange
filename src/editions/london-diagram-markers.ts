import type { NetworkSnapshot } from '@motionstudies/core/domain/network'

export type DiagramPoint = readonly [number, number, number]
export interface DiagramMarker {
  stopIndex: number
  routes: string[]
  interchange: boolean
  normal: readonly [number, number]
}

/** Shared-track stations (e.g. Temple) get ticks; joining/diverging lines get rings. */
export function londonDiagramMarkers(
  snapshot: NetworkSnapshot,
  stops: readonly DiagramPoint[],
  paths: readonly { points: readonly DiagramPoint[] }[],
): DiagramMarker[] {
  const key = (index: number) => {
    const stop = snapshot.stops[index]
    // Coordinate identity is authored by the diagram and preserves separate
    // same-name stations, including the two Bethnal Greens.
    const point = stops[index]
    return `${stop?.[2]}:${point?.[0]}:${point?.[2]}`
  }
  const records = new Map<string, { stopIndex: number; routes: Set<string>; modes: Set<string>; neighbours: Map<string, Set<string>>; tangent?: DiagramPoint; tangentKey?: string }>()
  // Merge colocated stop IDs by position, including the differently named
  // Underground / Overground records for the same physical interchange.
  const positionKey = (index: number) => stops[index] ? `${stops[index][0]}:${stops[index][2]}` : key(index)
  const seen = new Set<string>()
  for (const train of snapshot.trains) {
    const pattern = `${train.route}:${train.stops.map(([index]) => index).join(',')}`
    if (seen.has(pattern)) continue
    seen.add(pattern)
    train.stops.forEach(([index], callIndex) => {
      if (!stops[index]) return
      const stationKey = positionKey(index)
      const record = records.get(stationKey) ?? { stopIndex: index, routes: new Set<string>(), modes: new Set<string>(), neighbours: new Map<string, Set<string>>(), tangent: undefined, tangentKey: undefined }
      record.stopIndex = Math.min(record.stopIndex, index)
      record.routes.add(train.route)
      record.modes.add(train.mode ?? train.category)
      for (const neighbourCall of [callIndex - 1, callIndex + 1]) {
        const neighbourIndex = train.stops[neighbourCall]?.[0]
        if (neighbourIndex === undefined || !stops[neighbourIndex]) continue
        const neighbourKey = positionKey(neighbourIndex)
        if (neighbourKey === stationKey) continue
        const routes = record.neighbours.get(neighbourKey) ?? new Set<string>()
        routes.add(train.route)
        record.neighbours.set(neighbourKey, routes)
        if (record.tangentKey === undefined || neighbourKey < record.tangentKey) {
          record.tangentKey = neighbourKey
          const pathIndex = train.pathSegments?.[Math.min(callIndex, neighbourCall)]
          const points = pathIndex == null ? undefined : paths[pathIndex]?.points
          const station = stops[index]
          let neighbour = stops[neighbourIndex]
          if (points && points.length >= 2) {
            const distance = (p: DiagramPoint) => Math.hypot(p[0] - station[0], p[2] - station[2])
            const ordered = distance(points[0]) < distance(points[points.length - 1]) ? points : [...points].reverse()
            neighbour = ordered.find(p => distance(p) > 0.00001) ?? neighbour
          }
          record.tangent = [neighbour[0] - station[0], 0, neighbour[2] - station[2]]
        }
      }
      records.set(stationKey, record)
    })
  }
  return [...records.values()].map(record => {
    const [dx, , dz] = record.tangent ?? [1, 0, 0]
    const length = Math.hypot(dx, dz) || 1
    // One stable side of the track, independent of timetable direction.
    const sign = dx < -0.00001 || (Math.abs(dx) < 0.00001 && dz < 0) ? -1 : 1
    const routes = [...record.routes].sort()
    const interchange = record.neighbours.size > 2 || (routes.length > 1 && record.modes.size > 1) || (routes.length > 1 &&
      [...record.neighbours.values()].some(neighbourRoutes => neighbourRoutes.size !== routes.length))
    return { stopIndex: record.stopIndex, routes, interchange, normal: [-dz / length * sign, dx / length * sign] }
  })
}

/** Different feeds/directions may give the same physical track different path IDs. */
export function londonDiagramSegmentKey(
  train: { stops: readonly (readonly number[])[] }, segmentIndex: number,
  stops: readonly DiagramPoint[],
): string {
  return [train.stops[segmentIndex]?.[0], train.stops[segmentIndex + 1]?.[0]]
    .map(index => stops[index] ? `${stops[index][0]}:${stops[index][2]}` : `missing:${index}`)
    .sort().join('|')
}

/** Parallel lanes must retain their side for both directions of service. */
export function londonDiagramOrderedPoints(points: readonly DiagramPoint[]): readonly DiagramPoint[] {
  const first = points[0], last = points[points.length - 1]
  return first[0] > last[0] || (first[0] === last[0] && first[2] > last[2]) ? [...points].reverse() : points
}
