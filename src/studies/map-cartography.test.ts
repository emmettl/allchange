import snapshot from '../../fixtures/tfl/all-change-rail-led-morning.json'
import { BufferGeometry, Float32BufferAttribute } from 'three'
import { expect, it } from 'vitest'
import { compactMapLines } from './map-cartography'

it('removes repeated and reversed strokes without merging nearby tracks or adding brightness', () => {
  const geometry = new BufferGeometry()
    .setAttribute('position', new Float32BufferAttribute([
      0, 0, 0, 1, 0, 0,
      1, 0, 0, 0, 0, 0,
      0, 0, 0.01, 1, 0, 0.01,
      0, 0, 0, 0, 0, 0,
    ], 3))
    .setAttribute('color', new Float32BufferAttribute([
      0.2, 0.1, 0, 0.4, 0.2, 0,
      0.8, 0.3, 0, 0.3, 0.2, 0,
      1, 1, 1, 1, 1, 1,
      1, 1, 1, 1, 1, 1,
    ], 3))
  compactMapLines(geometry)
  expect(geometry.getAttribute('position').count).toBe(4)
  const colors = geometry.getAttribute('color')
  expect(colors.getX(0)).toBeCloseTo(0.3)
  expect(colors.getX(1)).toBeCloseTo(0.8)
  const once = Array.from(geometry.getAttribute('position').array)
  compactMapLines(geometry)
  expect(Array.from(geometry.getAttribute('position').array)).toEqual(once)
})

it('removes timetable overdraw in the actual opening fixture while retaining every distinct segment', () => {
  const positions: number[] = []
  snapshot.edges.forEach(([a, b]: number[], i: number) => {
    const path = snapshot.edgePaths?.[i]
    const points = path == null ? [snapshot.stops[a], snapshot.stops[b]] : snapshot.paths[path]
    for (let j = 1; j < points.length; j++) positions.push(Number(points[j - 1][0]), 0, Number(points[j - 1][1]), Number(points[j][0]), 0, Number(points[j][1]))
  })
  const geometry = new BufferGeometry().setAttribute('position', new Float32BufferAttribute(positions, 3))
  const segments = () => {
    const points = geometry.getAttribute('position'), result = new Set<string>()
    for (let i = 0; i < points.count; i += 2) {
      const a = [points.getX(i), points.getZ(i)].join(','), b = [points.getX(i + 1), points.getZ(i + 1)].join(',')
      if (a !== b) result.add([a, b].sort().join(':'))
    }
    return result
  }
  const before = segments()
  compactMapLines(geometry)
  expect(segments()).toEqual(before)
  expect(geometry.getAttribute('position').count).toBe(before.size * 2)
  expect(geometry.getAttribute('position').count).toBeLessThan(positions.length / 30)
})
