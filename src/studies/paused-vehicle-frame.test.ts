import { expect, it } from 'vitest'
import { PausedVehicleFrame } from './paused-vehicle-frame'

it('retains submitted buffers while paused and redraws seeks, zooms and resumed motion', () => {
  const frame = new PausedVehicleFrame()
  expect(frame.needsUpdate(false, 100, 20)).toBe(true)
  frame.record(100, 20)
  expect(frame.needsUpdate(false, 100, 20)).toBe(false)
  expect(frame.needsUpdate(false, 99, 20)).toBe(true)
  expect(frame.needsUpdate(false, 101, 20)).toBe(true)
  expect(frame.needsUpdate(false, 100, 19)).toBe(true)
  expect(frame.needsUpdate(true, 100, 20)).toBe(true)
  expect(new PausedVehicleFrame().needsUpdate(false, 100, 20)).toBe(true)
})

it('does not consume a seek when a trail frame is skipped by the cadence budget', () => {
  const frame = new PausedVehicleFrame()
  frame.record(100, 20)
  expect(frame.needsUpdate(true, 101, 20)).toBe(true)
  // No record: the trail callback yielded before submitting its new buffers.
  expect(frame.needsUpdate(false, 101, 20)).toBe(true)
  frame.record(101, 20)
  expect(frame.needsUpdate(false, 101, 20)).toBe(false)
})
