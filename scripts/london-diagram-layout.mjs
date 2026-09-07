/** London-authored corridors, independent of geographic station density. */
export function canonicalStationName(name) {
  const clean = String(name).replace(/^London\s+/i, '').replace(/\s+\(London\)$/i, '')
    .replace(/\s+\(H&C Line\)-Underground$/i, '').replace(/-Underground$/i, '')
    .replace(/\s+/g, ' ').trim()
  return ({ 'Queens Park': "Queen's Park", 'Shepherds Bush': "Shepherd's Bush (Central)",
    'Custom House (for ExCel)': 'Custom House' })[clean] ?? clean
}

export function octilinearPath(from, to) {
  if (from[0] > to[0] || (from[0] === to[0] && from[1] > to[1])) {
    return octilinearPath(to, from).reverse()
  }
  const dx = to[0] - from[0], dy = to[1] - from[1]
  if (Math.hypot(dx, dy) < 1e-8) return [from]
  if (Math.abs(dx) < 1e-8 || Math.abs(dy) < 1e-8 || Math.abs(Math.abs(dx) - Math.abs(dy)) < 1e-8) return [from, to]
  // Put the diagonal between two straight approaches. Stations next to a
  // junction retain a useful straight run rather than landing on an elbow.
  const diagonal = Math.min(Math.abs(dx), Math.abs(dy))
  if (Math.abs(dx) > Math.abs(dy)) {
    const straight = (Math.abs(dx) - diagonal) / 2
    return [from, [from[0] + straight, from[1]], [to[0] - straight, to[1]], to]
  }
  const straight = (Math.abs(dy) - diagonal) / 2 * Math.sign(dy)
  return [from, [from[0], from[1] + straight], [to[0], to[1] - straight], to]
}

function distances(path) {
  const sums = [0]
  for (let i = 1; i < path.length; i++) sums.push(sums[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]))
  return sums
}
function pointAt(path, sums, distance) {
  for (let i = 1; i < path.length; i++) {
    if (distance > sums[i]) continue
    const t = (distance - sums[i - 1]) / (sums[i] - sums[i - 1])
    return path[i - 1].map((v, axis) => v + (path[i][axis] - v) * t)
  }
  return path.at(-1)
}
function slicePath(path, sums, start, end) {
  return [pointAt(path, sums, start), ...path.filter((_, i) => sums[i] > start + 1e-8 && sums[i] < end - 1e-8), pointAt(path, sums, end)]
}

export function buildLondonDiagram(network, overrides) {
  const positions = new Map()
  const links = new Map()
  const names = new Map(network.stops.map(stop => [stop[4], canonicalStationName(stop[2])]))
  // The Weaver and Central Bethnal Green stations are separate places.
  names.set('910GBTHNLGR', '910GBTHNLGR')
  const available = new Set(names.values())
  const keyFor = name => names.get(name) ?? canonicalStationName(name)
  for (const [name, point] of Object.entries(overrides.anchors)) {
    const key = keyFor(name)
    if (!available.has(key)) throw new Error(`Unknown diagram anchor: ${name}`)
    if (point.length !== 2 || !point.every(Number.isFinite)) throw new Error(`Invalid diagram anchor: ${name}`)
    positions.set(key, point)
  }
  const routeGraphs = new Map()
  const corridors = overrides.corridors.map(corridor => {
    const stations = (Array.isArray(corridor) ? corridor : corridor.stops).map(name => {
      const key = keyFor(name)
      if (!available.has(key)) throw new Error(`Unknown corridor station: ${name}`)
      return key
    })
    if (corridor.route) {
      const graph = routeGraphs.get(corridor.route) ?? new Map()
      stations.forEach((station, i) => {
        const neighbours = graph.get(station) ?? new Set()
        for (const neighbour of [stations[i - 1], stations[i + 1]]) {
          if (neighbour !== undefined) neighbours.add(neighbour)
        }
        graph.set(station, neighbours)
      })
      routeGraphs.set(corridor.route, graph)
    }
    return stations
  })
  for (const corridor of corridors) {
    const fixed = corridor.flatMap((name, index) => positions.has(name) ? [index] : [])
    if (fixed[0] !== 0 || fixed.at(-1) !== corridor.length - 1) throw new Error(`Corridor needs positioned ends: ${corridor.join(' / ')}`)
    for (let i = 1; i < fixed.length; i++) {
      const start = fixed[i - 1], end = fixed[i]
      const from = positions.get(corridor[start]), to = positions.get(corridor[end])
      // Reuse an already authored link, including all bends, in both directions.
      const path = links.get(`${corridor[start]}|${corridor[end]}`) ?? octilinearPath(from, to)
      const sums = distances(path), length = sums.at(-1)
      for (let j = start; j < end; j++) {
        const section = slicePath(path, sums, length * (j - start) / (end - start), length * (j + 1 - start) / (end - start))
        positions.set(corridor[j + 1], section.at(-1))
        const key = `${corridor[j]}|${corridor[j + 1]}`
        if (!links.has(key)) {
          links.set(key, section)
          links.set(`${corridor[j + 1]}|${corridor[j]}`, [...section].reverse())
        }
      }
    }
  }
  const missing = [...available].filter(name => !positions.has(name))
  if (missing.length) throw new Error(`Stations need authored corridors: ${missing.join(', ')}`)
  const stops = network.stops.map(stop => [stop[4], ...positions.get(names.get(stop[4]))])
  const edges = new Map()
  network.edgePaths.forEach((pathIndex, index) => {
    if (pathIndex != null && !edges.has(pathIndex)) edges.set(pathIndex, network.edges[index])
  })
  const pathRoutes = new Map()
  for (const train of network.trains) {
    if (!routeGraphs.has(train.route)) continue
    for (const index of train.pathSegments ?? []) {
      if (index != null) pathRoutes.set(index, train.route)
    }
  }
  // Timetable calls are not track topology: an express service must follow
  // the same corridor through skipped stations, including branch junctions.
  const corridorPath = (route, from, to) => {
    const graph = routeGraphs.get(route)
    const previous = new Map([[from, null]])
    const queue = [from]
    for (const station of queue) {
      if (station === to) break
      for (const neighbour of graph.get(station) ?? []) {
        if (previous.has(neighbour)) continue
        previous.set(neighbour, station)
        queue.push(neighbour)
      }
    }
    if (!previous.has(to)) throw new Error(`No authored ${route} corridor: ${from} / ${to}`)
    const sections = []
    for (let station = to; previous.get(station) != null; station = previous.get(station)) {
      sections.push(links.get(`${previous.get(station)}|${station}`))
    }
    return sections.reverse().flatMap((section, i) => i ? section.slice(1) : section)
  }
  const nearest = point => {
    let best = 0, distance = Infinity
    network.stops.forEach((stop, index) => {
      const d = ((point[0] - stop[0]) * 0.62) ** 2 + (point[1] - stop[1]) ** 2
      if (d < distance) { distance = d; best = index }
    })
    return best
  }
  const paths = network.paths.map((path, index) => {
    const edge = edges.get(index)
    const fromIndex = edge?.[0] ?? nearest(path[0]), toIndex = edge?.[1] ?? nearest(path.at(-1))
    const from = names.get(network.stops[fromIndex][4]), to = names.get(network.stops[toIndex][4])
    const route = pathRoutes.get(index)
    if (route) return from === to ? [positions.get(from)] : corridorPath(route, from, to)
    return links.get(`${from}|${to}`) ?? octilinearPath(positions.get(from), positions.get(to))
  })
  const waterPaths = overrides.context?.waterPaths ?? []
  const coordinates = [...stops.map(stop => stop.slice(1)), ...paths.flat(), ...waterPaths.flat()]
  return {
    bounds: { minX: Math.min(...coordinates.map(p => p[0])), maxX: Math.max(...coordinates.map(p => p[0])), minY: Math.min(...coordinates.map(p => p[1])), maxY: Math.max(...coordinates.map(p => p[1])) },
    stops, paths, context: { waterPaths },
  }
}
