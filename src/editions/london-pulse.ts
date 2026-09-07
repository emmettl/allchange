import { callsAtHub, callsNearTime, type HubCall, type HubDefinition } from '@motionstudies/core/domain/hub'
import type { NetworkSnapshot } from '@motionstudies/core/domain/network'

export const isNationalRailCall = (call: HubCall) => call.train.id.startsWith('national-rail:')

/** Match each source's station names before combining calls; stop indexes stay source-local. */
export function londonPulseCalls(network: NetworkSnapshot, hub: HubDefinition, nationalRail?: NetworkSnapshot): readonly HubCall[] {
  const calls = callsAtHub(network, hub)
  if (!nationalRail) return calls
  if (nationalRail.metadata.serviceDate !== network.metadata.serviceDate) throw new Error('Pulse sources must share a service date')
  const extra = callsAtHub(nationalRail, hub).filter(call =>
    call.departure >= network.metadata.windowStart && call.arrival < network.metadata.windowEnd,
  )
  return [...new Map([...calls, ...extra].map(call => [call.train.id, call])).values()]
    .sort((a, b) => a.arrival - b.arrival)
}

export function pulseFlowAllowed(call: HubCall, flow: 'arrival' | 'departure') {
  return !isNationalRailCall(call) || Boolean(flow === 'arrival' ? call.previousStop : call.nextStop)
}

/** A bounded timetable must not invent a second GWR call by wrapping the morning window. */
export function pulseCycleOffset(call: HubCall, time: number, cycle: number) {
  return isNationalRailCall(call) ? 0 : Math.round((time - (call.arrival + call.departure) / 2) / cycle) * cycle
}

export function nationalRailPulseVisible(call: HubCall, time: number, horizon: number) {
  if (!isNationalRailCall(call)) return true
  if (time < call.arrival - horizon || time > call.departure + horizon) return false
  if (time < call.arrival) return pulseFlowAllowed(call, 'arrival')
  if (time > call.departure) return pulseFlowAllowed(call, 'departure')
  return true
}

export function londonPulseCallsNearTime(calls: readonly HubCall[], time: number) {
  return callsNearTime(calls, time).filter(call => nationalRailPulseVisible(call, time, 15 * 60))
}
