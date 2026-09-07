import type { RailBoardStation, RailCorridorId } from './london-national-rail.ts'
import type { HubDefinition } from '@motionstudies/core/domain/hub'

export type LondonHubId = string

export interface LondonPulseHub extends HubDefinition<LondonHubId> {
  readonly nationalRail?: readonly RailCorridorId[]
}

/** Charing Cross gives the radial/orbital comparison a stable London datum. */
export const LONDON_PULSE_CENTRE = [-0.1278, 51.5074] as const

/** Contrasting interchanges, chosen for network character rather than rank. */
export const LONDON_HUBS: readonly LondonPulseHub[] = [
  {
    id: 'paddington',
    name: 'Paddington',
    aliases: ['London Paddington', 'Paddington (H&C Line)-Underground'],
    displayName: 'Paddington',
    character: 'western gateway / mainline and cross-city rail',
    nationalRail: ['paddington'],
  },
  {
    id: 'kings-cross',
    name: "King's Cross St. Pancras",
    aliases: ["London King's Cross"],
    nationalRail: ['kings-cross', 'thameslink'],
    displayName: "King's Cross",
    character: 'national gateway / radial interchange',
  },
  {
    id: 'bank',
    name: 'Bank',
    displayName: 'Bank',
    character: 'deep interchange / City pressure',
  },
  {
    id: 'waterloo',
    name: 'Waterloo',
    aliases: ['London Waterloo'],
    nationalRail: ['waterloo'],
    displayName: 'Waterloo',
    character: 'terminus / south-bank exchange',
  },
  {
    id: 'clapham-junction',
    name: 'Clapham Junction',
    displayName: 'Clapham Junction',
    character: 'southwest mainline / orbital interchange',
    nationalRail: ['waterloo', 'southern'],
  },
  {
    id: 'stratford',
    name: 'Stratford',
    aliases: ['Stratford (London)'],
    displayName: 'Stratford',
    character: 'orbital meeting radial',
    nationalRail: ['liverpool-street'],
  },
]

export function railPulseHubs(stations: readonly RailBoardStation[]): readonly LondonPulseHub[] {
  return [...LONDON_HUBS.map(hub => ({ ...hub, nationalRail: stations.find(station => station.id === hub.id)?.corridors ?? hub.nationalRail })),
    ...stations.filter(station => !LONDON_HUBS.some(hub => hub.id === station.id)).map(station => ({ id: station.id, name: station.stationName, aliases: [station.name], displayName: station.name, character: 'passenger rail / London timetable', nationalRail: station.corridors }))]
}
