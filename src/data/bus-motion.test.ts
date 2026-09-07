import { describe, expect, it } from 'vitest'
import { positionForTrain, type NetworkTrain } from '@motionstudies/core/domain/network'
import { cachedBusPosition } from './bus-motion'

type Point = [number, number, number]
function path(points: Point[]) {
  const cumulativeDistances = [0]
  for (let i = 1; i < points.length; i++) cumulativeDistances.push(cumulativeDistances[i - 1]
    + Math.hypot(...points[i].map((value, axis) => value - points[i - 1][axis])))
  return { points, cumulativeDistances, length: cumulativeDistances.at(-1)! }
}
const stops: Point[] = [[0, 0, 0], [10, 0, 10], [20, 0, 0]]
const paths = [path([[0.1, 0, 0], [4, 0, 0], [4, 0, 7], [10, 0, 9.9]]),
  path([[20, 0, 0], [20, 0, 0], [17, 0, 8], [10, 0, 10]])]
const train: NetworkTrain = { id: '26', route: '26', shortName: '26', headsign: 'Test', category: 'bus',
  start: 0, end: 150, stops: [[0, 0, 5], [1, 60, 70], [2, 120, 125]], pathSegments: [0, 1] }

// Independent sequential interpolation, using the published timetable semantics.
function reference(service: NetworkTrain, time: number, projectedStops = stops, projectedPaths = paths): Point | undefined {
  const position = positionForTrain(service, time)
  if (!position) return undefined
  const start = projectedStops[position.fromStop]
  const selected = position.segmentIndex === undefined ? undefined : projectedPaths[service.pathSegments![position.segmentIndex]!]
  if (!selected) return [start[0], 0.085, start[2]]
  const distanceTo = (point: Point) => point.reduce((sum, value, axis) => sum + (value - start[axis]) ** 2, 0)
  const forward = distanceTo(selected.points[0]) <= distanceTo(selected.points.at(-1)!)
  const distance = selected.length * (forward ? position.progress : 1 - position.progress)
  for (let i = 1; i < selected.points.length; i++) {
    if (selected.cumulativeDistances[i] < distance) continue
    const length = selected.cumulativeDistances[i] - selected.cumulativeDistances[i - 1]
    const progress = length ? (distance - selected.cumulativeDistances[i - 1]) / length : 0
    const from = selected.points[i - 1], to = selected.points[i]
    return [from[0] + (to[0] - from[0]) * progress, 0.085, from[2] + (to[2] - from[2]) * progress]
  }
}
function check(service: NetworkTrain, times: number[], projectedStops = stops, projectedPaths = paths) {
  for (const time of times) {
    const expected = reference(service, time, projectedStops, projectedPaths)
    const actual = cachedBusPosition(service, time, projectedStops, projectedPaths) ?? expected
    if (!expected) expect(actual).toBeUndefined()
    else for (let axis = 0; axis < 3; axis++) expect(actual![axis]).toBeCloseTo(expected[axis], 8)
  }
}
describe('bus motion span cache', () => {
  it('preserves forward and reversed roads, turns, dwell and arrival snapping', () => {
    const times = Array.from({ length: 1501 }, (_, i) => i / 10)
    check(train, [...times, ...[...times].reverse(), -1, 151])
    check(train, [4.999, 5, 5.001, 59.999, 60, 60.001, 69.999, 70, 70.001, 120, 120.001])
  })
  it('shares exact spans across marker and historical trail samples during fast playback', () => {
    for (let time = 100; time < 125; time += 0.067) check(train, [time, time - 45, time - 90, time - 135, time])
    expect(cachedBusPosition(train, 100, stops, paths)).toBeDefined()
  })
  it('invalidates positions when the map projection or journey changes', () => {
    check(train, [40, 40.1])
    const shiftedStops = stops.map(point => [point[0] + 100, point[1], point[2]] as Point)
    const shiftedPaths = paths.map(record => path(record.points.map(point => [point[0] + 100, point[1], point[2]])))
    check(train, [40.2, 40.3], shiftedStops, shiftedPaths)
    check({ ...train, start: 20, end: 170, stops: train.stops.map(([stop, arrival, departure]) => [stop, arrival + 20, departure + 20]) }, [40.2, 40.3])
    check(train, [40.4])
  })
  it('defers cancellations, unordered calls, degenerate and missing paths to the renderer', () => {
    expect(cachedBusPosition({ ...train, realtime: { status: 'cancelled', delaySeconds: 0, skippedStops: 0, generatedAt: '' } }, 40, stops, paths)).toBeUndefined()
    expect(cachedBusPosition({ ...train, stops: [[0, 0, 5], [1, 60, 70], [2, 65, 66]] }, 40, stops, paths)).toBeUndefined()
    expect(cachedBusPosition({ ...train, pathSegments: [] }, 40, stops, paths)).toBeUndefined()
    expect(cachedBusPosition(train, 40, stops, [path([[0, 0, 0], [0, 0, 0]])])).toBeUndefined()
  })
})
