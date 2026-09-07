import { callsAtHub, callsNearTime, type HubCall, type HubDefinition } from '@motionstudies/core/domain/hub'
import type { NetworkSnapshot } from '@motionstudies/core/domain/network'
import { railFlowAllowed, type NationalRailTrain } from '../data/national-rail.ts'

interface RailHubCall extends HubCall { readonly railCallIndex?: number }

export const isNationalRailCall = (call: HubCall) => call.train.id.startsWith('national-rail:')

/** Match each source's station names before combining calls; stop indexes stay source-local. */
export function londonPulseCalls(network: NetworkSnapshot, hub: HubDefinition, nationalRail?: NetworkSnapshot): readonly HubCall[] {
  const calls = callsAtHub(network, hub)
  if (!nationalRail) return calls
  if (nationalRail.metadata.serviceDate !== network.metadata.serviceDate) throw new Error('Pulse sources must share a service date')
  const names = new Set([hub.name, ...(hub.aliases ?? [])])
  const extra: RailHubCall[] = nationalRail.trains.flatMap(value => {
    const train = value as NationalRailTrain
    return train.stops.flatMap(([stop, arrival, departure], index) => {
      if (!names.has(nationalRail.stops[stop][2]) || train.passIndexes?.includes(index) || departure < network.metadata.windowStart || arrival >= network.metadata.windowEnd) return []
      return [{ id: `${train.id}:call:${index}`, train, arrival, departure, railCallIndex: index, hubStop: nationalRail.stops[stop], previousStop: nationalRail.stops[train.stops[index - 1]?.[0]], nextStop: nationalRail.stops[train.stops[index + 1]?.[0]] }]
    })
  })
  return [...new Map([...calls, ...extra].map(call => [call.id, call])).values()]
    .sort((a, b) => a.arrival - b.arrival)
}

export function pulseFlowAllowed(call: RailHubCall, flow: 'arrival' | 'departure') {
  return !isNationalRailCall(call) || (call.railCallIndex === undefined ? Boolean(flow === 'arrival' ? call.previousStop : call.nextStop) : railFlowAllowed(call.train as NationalRailTrain, call.railCallIndex, flow))
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
