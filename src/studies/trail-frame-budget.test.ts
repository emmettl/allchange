import { expect, it } from 'vitest'
import { TrailFrameBudget } from './trail-frame-budget'

it('keeps full trail detail on smooth frames and reduces work under sustained load', () => {
  const budget = new TrailFrameBudget()
  for (let i = 0; i < 120; i++) expect(budget.interval(1 / 60)).toBe(1 / 30)
  expect(budget.interval(1 / 30)).toBe(1 / 30)
  for (let i = 0; i < 30; i++) budget.interval(1 / 30)
  expect(budget.interval(1 / 30)).toBe(1 / 15)
})

it('uses hysteresis to avoid oscillation and restores detail after sustained recovery', () => {
  const budget = new TrailFrameBudget()
  for (let i = 0; i < 30; i++) budget.interval(1 / 25)
  for (let i = 0; i < 180; i++) expect(budget.interval(1 / 45)).toBe(1 / 15)
  for (let i = 0; i < 120; i++) expect(budget.interval(1 / 60)).toBe(1 / 15)
  for (let i = 0; i < 150; i++) budget.interval(1 / 60)
  expect(budget.interval(1 / 60)).toBe(1 / 30)
})

it('ignores invalid deltas and isolated background-tab gaps', () => {
  for (const delta of [NaN, Infinity, -1, 0, 2, 60]) {
    const budget = new TrailFrameBudget()
    expect(budget.interval(delta)).toBe(1 / 30)
    expect(budget.interval(1 / 60)).toBe(1 / 30)
  }
})

it('leaves alternate frames free of trail rebuilds even below the 15 Hz cap', () => {
  const budget = new TrailFrameBudget()
  for (let i = 0; i < 30; i++) budget.interval(0.1)
  let elapsed = 0
  let updates = 0
  let previous = false
  for (let i = 0; i < 40; i++) {
    elapsed += 0.1
    const update = budget.shouldUpdateTrail(0.1, elapsed)
    expect(previous && update).toBe(false)
    if (update) { updates++; elapsed = 0 }
    previous = update
  }
  expect(updates).toBe(20)
})

it('retains the time cap and resumes normal trail updates after recovery', () => {
  const budget = new TrailFrameBudget()
  for (let i = 0; i < 30; i++) budget.interval(0.1)
  expect(budget.shouldUpdateTrail(1 / 60, 1)).toBe(true)
  expect(budget.shouldUpdateTrail(1 / 60, 1)).toBe(false)
  expect(budget.shouldUpdateTrail(1 / 60, 1 / 30)).toBe(false)
  for (let i = 0; i < 300; i++) budget.interval(1 / 60)
  expect(budget.shouldUpdateTrail(1 / 60, 1 / 30)).toBe(true)
  // At full cadence, elapsed time alone decides: no mandatory cooldown.
  expect(budget.shouldUpdateTrail(1 / 60, 1 / 30)).toBe(true)
  expect(budget.shouldUpdateTrail(1 / 60, 1 / 60)).toBe(false)
})


it('refreshes immediately when a seek, projection or selection invalidates trails', () => {
  const budget = new TrailFrameBudget()
  for (let i = 0; i < 30; i++) budget.interval(0.1)
  expect(budget.shouldUpdateTrail(0.1, 1)).toBe(true)
  expect(budget.shouldUpdateTrail(0.1, 0, true)).toBe(true)
  expect(budget.shouldUpdateTrail(0.1, 1)).toBe(false)
})


it('recognizes sustained overload below four FPS without treating one gap as load', () => {
  const budget = new TrailFrameBudget()
  expect(budget.interval(0.4)).toBe(1 / 30)
  expect(budget.interval(0.4)).toBe(1 / 15)
  expect(budget.shouldUpdateTrail(0.4, 1)).toBe(true)
  expect(budget.shouldUpdateTrail(0.4, 1)).toBe(false)
})


it('preserves the National Rail per-frame cadence on fast displays', () => {
  const budget = new TrailFrameBudget(0)
  for (let i = 0; i < 120; i++) expect(budget.shouldUpdateTrail(1 / 120, 1 / 120)).toBe(true)
  for (let i = 0; i < 30; i++) budget.interval(1 / 25)
  expect(budget.interval(1 / 25)).toBe(1 / 15)
})
