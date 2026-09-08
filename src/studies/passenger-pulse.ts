import { passengerInterval, type PassengerStation, PASSENGER_METRICS } from '../data/passenger-demand.ts'
export const PEOPLE_PER_MARK = 250
export const FLOW_COLOURS = { entries: '#a2d5c2', exits: '#edb779', interchanges: '#b8aff1' }
export function passengerFlows(station: PassengerStation, time: number) {
  const interval = passengerInterval(time)
  return PASSENGER_METRICS.map(metric => {
    const value = interval === undefined ? undefined : station[metric]?.[interval]
    return { metric, value, marks: value === undefined ? [] : Array.from({ length: Math.ceil(value / PEOPLE_PER_MARK) }, (_, index) => Math.min(1, (value - index * PEOPLE_PER_MARK) / PEOPLE_PER_MARK)) }
  })
}
export function flowMarkPosition(index: number, count: number, time: number, reducedMotion: boolean) {
  const t = ((index + 0.5) / Math.max(1, count) + (reducedMotion ? 0 : time / 30)) % 1
  return { x: 60 + 600 * t, y: 3 * (1 - t) ** 2 * t * -32 + 3 * (1 - t) * t ** 2 * 32 }
}
export function advancePassengerClock(time: number, delta: number, rate: number, start: number, end: number) {
  const next = time + Math.max(0, Math.min(delta, 0.25)) * rate
  return next > end ? start : Math.max(start, next)
}
