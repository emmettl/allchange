import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { constrainRiverPaths, pointInWater } from './river-paths.mjs'

const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'))
const snapshot = read('../fixtures/tfl/all-change-surface-day.json')
const geography = read('../fixtures/tfl/all-change-geography.json')
const distance = (a, b) => Math.hypot((a[0] - b[0]) * 69_300, (a[1] - b[1]) * 111_320)

describe('River Bus geometry', () => {
  it('keeps every ferry segment inside the Thames between short pier connectors', () => {
    const checked = new Set()
    for (const train of snapshot.trains.filter(train => train.category === 'ferry')) {
      train.pathSegments.forEach((pathIndex, index) => {
        const path = snapshot.paths[pathIndex]
        expect(path[0]).toEqual(snapshot.stops[train.stops[index][0]].slice(0, 2))
        expect(path.at(-1)).toEqual(snapshot.stops[train.stops[index + 1][0]].slice(0, 2))
        if (checked.has(pathIndex)) return
        checked.add(pathIndex)
        expect(distance(path[0], path[1])).toBeLessThan(250)
        expect(distance(path.at(-2), path.at(-1))).toBeLessThan(250)
        for (let vertex = 2; vertex < path.length - 1; vertex++) {
          const from = path[vertex - 1], to = path[vertex]
          const samples = Math.ceil(distance(from, to) / 5)
          for (let sample = 0; sample <= samples; sample++) {
            const point = from.map((value, axis) => value + (to[axis] - value) * sample / samples)
            expect(pointInWater(point, geography.thames), `path ${pathIndex}, vertex ${vertex}`).toBe(true)
          }
        }
      })
    }
    expect(checked.size).toBeGreaterThan(60)
  })

  it('routes around the Isle of Dogs and Greenwich bends without changing schedules or cable cars', () => {
    const original = structuredClone(snapshot)
    const ferry = original.trains.find(train => train.category === 'ferry' && train.stops.some(stop => original.stops[stop[0]][2] === 'Canary Wharf'))
    const index = ferry.stops.findIndex(stop => original.stops[stop[0]][2] === 'Greenwich')
    const pathIndex = ferry.pathSegments[index]
    // Simulate the old straight chord, across the Greenwich peninsula.
    original.paths[pathIndex] = [original.stops[ferry.stops[index][0]].slice(0, 2), original.stops[ferry.stops[index + 1][0]].slice(0, 2)]
    const repaired = constrainRiverPaths(original, geography)
    const path = repaired.paths[pathIndex]
    const length = path.slice(1).reduce((total, point, i) => total + distance(path[i], point), 0)
    expect(length).toBeGreaterThan(distance(path[0], path.at(-1)) * 1.4)
    expect(repaired.trains).toEqual(original.trains)
    expect(repaired.stops).toEqual(original.stops)
    expect(repaired.edges).toEqual(original.edges)
    for (const train of original.trains.filter(train => train.category !== 'ferry')) {
      for (const index of train.pathSegments) expect(repaired.paths[index]).toEqual(original.paths[index])
    }
  })
})
