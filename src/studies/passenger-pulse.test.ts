import { expect, it } from 'vitest'
import bank from '../../fixtures/passenger-demand/stations/BNKu.json'
import { advancePassengerClock, flowMarkPosition, passengerFlows, PEOPLE_PER_MARK } from './passenger-pulse.ts'

it('gives each metric its own proportional mark count, including fractional marks', () => {
  const flows = passengerFlows(bank.station, 27900)
  expect(flows.map(flow => flow.value)).toEqual([253.675, 1359.927, 1550.7])
  for (const flow of flows) expect(flow.marks.reduce((a, b) => a + b, 0) * PEOPLE_PER_MARK).toBeCloseTo(flow.value!, 8)
  expect(flows[0].marks).toHaveLength(2)
})
it('does not invent movements from unavailable intervals or zeroes', () => {
  expect(passengerFlows(bank.station, 0).every(flow => flow.value === undefined && !flow.marks.length)).toBe(true)
  const station = { ...bank.station, entries: Array(96).fill(0), interchanges: undefined }
  const flows = passengerFlows(station, 18000)
  expect(flows[0].value).toBe(0)
  expect(flows[0].marks).toEqual([])
  expect(flows[2].value).toBeUndefined()
})
it('freezes positional motion for reduced motion and follows scrubbed study time otherwise', () => {
  expect(flowMarkPosition(0, 10, 27900, true)).toEqual(flowMarkPosition(0, 10, 27915, true))
  expect(flowMarkPosition(0, 10, 27900, false)).not.toEqual(flowMarkPosition(0, 10, 27915, false))
  expect(advancePassengerClock(31500, 0.1, 4, 24300, 31500)).toBe(24300)
  expect(advancePassengerClock(27900, 0.1, 4, 24300, 31500)).toBe(27900.4)
  expect(advancePassengerClock(27900, 100, 4, 24300, 31500)).toBe(27901)
})
