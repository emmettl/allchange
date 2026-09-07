/** Shared output boundary for operator tables or normalized machine-readable schedules. */
export function assembleRailCorridor({ journeys, geometry, metadata, bounds, excluded = [] }) {
  const ids = new Set(), paths = [], pathIndexes = new Map()
  const trains = journeys.map(train => {
    if (ids.has(train.id)) throw new Error(`Duplicate rail identity: ${train.id}`)
    ids.add(train.id)
    if (train.stops.length < 2 || !['inbound', 'outbound'].includes(train.direction)) throw new Error(`Invalid rail journey: ${train.id}`)
    for (let i = 0; i < train.stops.length; i++) {
      const [stop, a, d] = train.stops[i]
      if (!geometry.stops[stop] || !Number.isFinite(a) || !Number.isFinite(d) || d < a || (i && a < train.stops[i - 1][2])) throw new Error(`Non-monotonic rail journey: ${train.id}`)
    }
    return { ...train, start: train.stops[0][1], end: train.stops.at(-1)[2], pathSegments: train.stops.slice(1).map(([to], index) => {
      const from = train.stops[index][0], key = `${from}:${to}`
      if (from === to) throw new Error(`Repeated corridor station: ${train.id}`)
      if (pathIndexes.has(key)) return pathIndexes.get(key)
      if (geometry.pairPaths) {
        const path = geometry.pairPaths[key]
        if (!path || path.length < 2 || JSON.stringify(path[0]) !== JSON.stringify(geometry.stops[from].slice(0, 2)) || JSON.stringify(path.at(-1)) !== JSON.stringify(geometry.stops[to].slice(0, 2))) throw new Error(`Missing or disconnected rail path: ${key}`)
        const pathIndex = paths.length
        paths.push(path); pathIndexes.set(key, pathIndex)
        return pathIndex
      }
      const segments = geometry.paths.slice(Math.min(from, to), Math.max(from, to))
      if (segments.length !== Math.abs(to - from) || segments.some(path => path.length < 2)) throw new Error(`Missing corridor geometry: ${key}`)
      for (let i = 1; i < segments.length; i++) if (JSON.stringify(segments[i - 1].at(-1)) !== JSON.stringify(segments[i][0])) throw new Error(`Disconnected corridor geometry: ${key}`)
      const path = segments.flatMap((points, i) => i ? points.slice(1) : points)
      const pathIndex = paths.length
      paths.push(from < to ? path : [...path].reverse()); pathIndexes.set(key, pathIndex)
      return pathIndex
    }) }
  }).sort((a, b) => a.start - b.start || a.id.localeCompare(b.id))
  return { metadata: { ...metadata, coverage: { ...metadata.coverage, includedJourneys: trains.length, excluded } }, bounds, stops: geometry.stops, paths, edges: [], trains, corridorPaths: geometry.corridorPaths ?? geometry.paths, fadeKilometres: 4 }
}
