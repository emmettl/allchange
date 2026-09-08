import { expect, it } from 'vitest'
import { PerspectiveCamera } from 'three'
import { StationLabelFrame } from './station-label-frame'

it('reuses settled labels but refreshes for camera, viewport and projection changes', () => {
  const frame = new StationLabelFrame()
  const camera = new PerspectiveCamera(44, 16 / 9, 0.1, 100)
  const size = { width: 1280, height: 720 }
  const names = new Set(['Paddington'])
  const update = () => frame.shouldUpdate(camera, size, true, names)
  expect(update()).toBe(true)
  expect(update()).toBe(false)
  camera.position.x += 0.00001 // Even sub-threshold camera damping must redraw.
  camera.updateMatrixWorld()
  expect(update()).toBe(true)
  expect(update()).toBe(false)
  camera.rotation.z += 0.2
  camera.updateMatrixWorld()
  expect(update()).toBe(true)
  camera.zoom = 2
  camera.updateProjectionMatrix()
  expect(update()).toBe(true)
  size.width++
  expect(update()).toBe(true)
  size.height++
  expect(update()).toBe(true)
  expect(update()).toBe(false)
})

it('settles retention priorities and observes repopulation and selection clears', () => {
  const camera = new PerspectiveCamera()
  const size = { width: 1280, height: 720 }
  const frame = new StationLabelFrame()
  const retained = new Set<string>()
  expect(frame.shouldUpdate(camera, size, false, retained)).toBe(true)
  retained.add('Waterloo')
  expect(frame.shouldUpdate(camera, size, false, retained)).toBe(true)
  expect(frame.shouldUpdate(camera, size, false, new Set(retained))).toBe(false)
  expect(frame.shouldUpdate(camera, size, true, retained)).toBe(true)
  expect(frame.shouldUpdate(camera, size, true, retained)).toBe(false)
  retained.clear()
  expect(frame.shouldUpdate(camera, size, true, retained)).toBe(true)
  // A changed layout/selection creates a new frame guard, even at the same camera.
  expect(new StationLabelFrame().shouldUpdate(camera, size, true, retained)).toBe(true)
})
