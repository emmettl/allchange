import { describe, expect, it } from 'vitest'
import { callsAtHub, callsForHubFlowLens } from '@motionstudies/core/domain/hub'
import type { NetworkSnapshot } from '@motionstudies/core/domain/network'
import morningFixture from '../../fixtures/tfl/all-change-rail-led-morning.json'
import railFixture from '../../fixtures/national-rail/paddington.json'
import { LONDON_HUBS, LONDON_PULSE_CENTRE } from './london-hubs.ts'
import { isNationalRailCall, londonPulseCalls, londonPulseCallsNearTime, nationalRailPulseVisible, pulseCycleOffset, pulseFlowAllowed } from './london-pulse.ts'

const morning = morningFixture as unknown as NetworkSnapshot
const rail = railFixture as unknown as NetworkSnapshot
const paddington = LONDON_HUBS.find(hub => hub.id === 'paddington')!
const calls = londonPulseCalls(morning, paddington, rail)
const gwr = calls.filter(isNationalRailCall)

describe('London station pulses with National Rail', () => {
  it('combines Paddington mainline, Elizabeth and Underground calls exactly once', () => {
    const tfl = callsAtHub(morning, paddington)
    expect(tfl.some(call => call.train.category === 'metro')).toBe(true)
    expect(tfl.some(call => call.train.category === 'regional')).toBe(true)
    expect(gwr.length).toBeGreaterThan(20)
    expect(calls).toHaveLength(tfl.length + gwr.length)
    expect(new Set(calls.map(call => call.train.id)).size).toBe(calls.length)
    expect(gwr.every(call => call.hubStop[2] === 'London Paddington')).toBe(true)
    expect(gwr.every(call => call.arrival >= 24300 && call.arrival < 31500)).toBe(true)
    expect(londonPulseCalls(morning, paddington)).toEqual(tfl)
  })
  it('matches only the respective hub and retains each arrival/departure in its flow lens', () => {
    for (const hub of LONDON_HUBS.filter(hub => hub.id !== 'paddington')) {
      expect(londonPulseCalls(morning, hub, rail).some(isNationalRailCall)).toBe(false)
    }
    const radial = callsForHubFlowLens(gwr, 'radial', LONDON_PULSE_CENTRE)
    const orbital = callsForHubFlowLens(gwr, 'orbital', LONDON_PULSE_CENTRE)
    expect(radial.length + orbital.length).toBe(gwr.length)
    expect(radial.some(call => call.previousStop)).toBe(true)
    expect(radial.some(call => call.nextStop)).toBe(true)
  })
  it('uses the full-day window without mixing service dates', () => {
    const day = { ...morning, metadata: { ...morning.metadata, windowStart: 0, windowEnd: 86400 } }
    const dayRail = londonPulseCalls(day, paddington, rail).filter(isNationalRailCall)
    expect(dayRail.length).toBeGreaterThan(gwr.length)
    expect(dayRail).toHaveLength(rail.trains.filter(train => train.stops.some(([index, arrival]) => index === 0 && arrival >= 0 && arrival < 86400)).length)
    expect(() => londonPulseCalls(day, paddington, { ...rail, metadata: { ...rail.metadata, serviceDate: '2026-09-05' } })).toThrow('service date')
  })
  it('renders only the real side of terminal calls and never repeats them every two hours', () => {
    const inbound = gwr.find(call => call.previousStop && !call.nextStop)!
    const outbound = gwr.find(call => call.nextStop && !call.previousStop)!
    expect(pulseFlowAllowed(inbound, 'arrival')).toBe(true)
    expect(pulseFlowAllowed(inbound, 'departure')).toBe(false)
    expect(pulseFlowAllowed(outbound, 'arrival')).toBe(false)
    expect(pulseFlowAllowed(outbound, 'departure')).toBe(true)
    expect(nationalRailPulseVisible(inbound, inbound.arrival - 60, 900)).toBe(true)
    expect(nationalRailPulseVisible(inbound, inbound.departure + 60, 900)).toBe(false)
    expect(nationalRailPulseVisible(outbound, outbound.arrival - 60, 900)).toBe(false)
    expect(nationalRailPulseVisible(outbound, outbound.departure + 60, 900)).toBe(true)
    expect(pulseCycleOffset(inbound, inbound.arrival + 7200, 7200)).toBe(0)
    expect(nationalRailPulseVisible(inbound, inbound.arrival + 7200, 900)).toBe(false)
    expect(londonPulseCallsNearTime([inbound], inbound.arrival + 60)).toEqual([])
    expect(londonPulseCallsNearTime([outbound], outbound.departure + 60)).toEqual([outbound])
    const tfl = calls.find(call => !isNationalRailCall(call))!
    expect(pulseCycleOffset(tfl, (tfl.arrival + tfl.departure) / 2 + 7200, 7200)).toBe(7200)
  })
})
