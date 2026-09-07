/** Offline, water-constrained interpolation geometry; not a surveyed navigation channel. */
const METRES = 111_320
const LONGITUDE_METRES = METRES * Math.cos(51.5 * Math.PI / 180)
const CELL = 25

function inRing([x, y], ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, ay] = ring[i], [bx, by] = ring[j]
    if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside
  }
  return inside
}

export function pointInWater(point, geometry) {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
  return polygons.some(([outer, ...holes]) => inRing(point, outer) && !holes.some(hole => inRing(point, hole)))
}

class MinHeap {
  items = []
  push(item) {
    let index = this.items.length
    this.items.push(item)
    while (index > 0) {
      const parent = (index - 1) >>> 1
      if (this.items[parent][0] <= item[0]) break
      this.items[index] = this.items[parent]
      index = parent
    }
    this.items[index] = item
  }
  pop() {
    const first = this.items[0], last = this.items.pop()
    if (this.items.length) {
      let index = 0
      while (index * 2 + 1 < this.items.length) {
        let child = index * 2 + 1
        if (child + 1 < this.items.length && this.items[child + 1][0] < this.items[child][0]) child++
        if (this.items[child][0] >= last[0]) break
        this.items[index] = this.items[child]
        index = child
      }
      this.items[index] = last
    }
    return first
  }
}

function riverRouter(stops, water) {
  const west = Math.min(...stops.map(stop => stop[0])) - 0.015
  const south = Math.min(...stops.map(stop => stop[1])) - 0.015
  const width = Math.ceil((Math.max(...stops.map(stop => stop[0])) + 0.015 - west) * LONGITUDE_METRES / CELL)
  const height = Math.ceil((Math.max(...stops.map(stop => stop[1])) + 0.015 - south) * METRES / CELL)
  const size = width * height
  const coordinate = index => [west + (index % width) * CELL / LONGITUDE_METRES, south + Math.floor(index / width) * CELL / METRES]
  const clearance = new Int16Array(size).fill(-1)
  const queue = new Int32Array(size)
  let tail = 0
  for (let index = 0; index < size; index++) {
    if (!pointInWater(coordinate(index), water)) {
      clearance[index] = 0
      queue[tail++] = index
    }
  }
  const neighbours = index => {
    const x = index % width, y = Math.floor(index / width)
    return [x > 0 ? index - 1 : -1, x + 1 < width ? index + 1 : -1,
      y > 0 ? index - width : -1, y + 1 < height ? index + width : -1]
  }
  // Distance from the banks makes routes prefer open water over grazing the shore.
  for (let head = 0; head < tail; head++) {
    const index = queue[head]
    for (const next of neighbours(index)) {
      if (next >= 0 && clearance[next] < 0) {
        clearance[next] = clearance[index] + 1
        queue[tail++] = next
      }
    }
  }
  const nearest = point => {
    let best = -1, distance = Infinity
    for (let index = 0; index < size; index++) {
      if (clearance[index] < 2) continue
      const candidate = coordinate(index)
      const squared = ((point[0] - candidate[0]) * LONGITUDE_METRES) ** 2 + ((point[1] - candidate[1]) * METRES) ** 2
      if (squared < distance) { distance = squared; best = index }
    }
    if (best < 0 || distance > 250 ** 2) throw new Error(`River pier is too far from water: ${point}`)
    return best
  }
  const nodes = new Map(stops.map(stop => [stop, nearest(stop)]))
  const visible = (from, to) => {
    const a = coordinate(from), b = coordinate(to)
    const samples = Math.ceil(Math.hypot((a[0] - b[0]) * LONGITUDE_METRES, (a[1] - b[1]) * METRES) / (CELL / 4))
    for (let sample = 0; sample <= samples; sample++) {
      const x = a[0] + (b[0] - a[0]) * sample / samples
      const y = a[1] + (b[1] - a[1]) * sample / samples
      const index = Math.round((x - west) * LONGITUDE_METRES / CELL) + Math.round((y - south) * METRES / CELL) * width
      if (clearance[index] < 2 || !pointInWater([x, y], water)) return false
    }
    return true
  }
  return (from, to) => {
    const start = nodes.get(from), end = nodes.get(to)
    const costs = new Float64Array(size).fill(Infinity)
    const parents = new Int32Array(size).fill(-1)
    const heap = new MinHeap()
    costs[start] = 0
    heap.push([0, start, 0])
    while (heap.items.length) {
      const [, current, cost] = heap.pop()
      if (cost !== costs[current]) continue
      if (current === end) break
      for (const next of neighbours(current)) {
        if (next < 0 || clearance[next] < 2) continue
        const nextCost = cost + 1 + 6 / clearance[next] ** 2
        if (nextCost >= costs[next]) continue
        costs[next] = nextCost
        parents[next] = current
        const heuristic = Math.abs(next % width - end % width) + Math.abs(Math.floor(next / width) - Math.floor(end / width))
        heap.push([nextCost + heuristic, next, nextCost])
      }
    }
    if (!Number.isFinite(costs[end])) throw new Error(`No water route between ${from[2]} and ${to[2]}`)
    const route = [end]
    while (route.at(-1) !== start) route.push(parents[route.at(-1)])
    route.reverse()
    // Remove grid stair steps only where the resulting segment remains in water.
    const simplified = [start]
    for (let index = 0; index < route.length - 1;) {
      let next = Math.min(index + 40, route.length - 1)
      while (next > index + 1 && !visible(route[index], route[next])) next--
      simplified.push(route[next])
      index = next
    }
    return [from.slice(0, 2), ...simplified.map(coordinate), to.slice(0, 2)]
  }
}

export function constrainRiverPaths(snapshot, geography) {
  const ferries = snapshot.trains.filter(train => train.category === 'ferry')
  const stopIndexes = new Set(ferries.flatMap(train => train.stops.map(stop => stop[0])))
  const route = riverRouter([...stopIndexes].map(index => snapshot.stops[index]), geography.thames)
  const paths = [...snapshot.paths]
  const replacements = new Map()
  for (const train of ferries) {
    train.pathSegments.forEach((pathIndex, index) => {
      const from = train.stops[index][0], to = train.stops[index + 1][0]
      const key = `${Math.min(from, to)}:${Math.max(from, to)}`
      if (!replacements.has(key)) {
        replacements.set(key, route(snapshot.stops[Math.min(from, to)], snapshot.stops[Math.max(from, to)]))
      }
      const path = replacements.get(key)
      paths[pathIndex] = from < to ? path : [...path].reverse()
    })
  }
  return {
    ...snapshot,
    paths,
    metadata: {
      ...snapshot.metadata,
      geometry: {
        ...snapshot.metadata.geometry,
        model: 'TfL branch paths; River Bus paths constrained to the GLA Thames polygon',
        riverRouting: {
          sourceUrl: geography.metadata.sourceUrl,
          gridMetres: CELL,
          model: 'Water-constrained interpolation with short pier connectors; not surveyed navigation channels',
        },
      },
    },
  }
}
