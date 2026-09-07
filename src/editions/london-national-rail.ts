export type RailCorridorId = 'paddington' | 'waterloo' | 'kings-cross' | 'thameslink' | 'southern' | 'southeastern' | 'liverpool-street' | 'euston' | 'marylebone' | 'fenchurch-street' | 'st-pancras'
export interface RailCorridor { readonly id: RailCorridorId; readonly operator: string }
export const LONDON_RAIL_CORRIDORS: readonly RailCorridor[] = ([
  ['paddington', 'GWR · Heathrow Express'], ['waterloo', 'SWR'], ['kings-cross', 'GN · LNER + others'],
  ['thameslink', 'Thameslink'], ['southern', 'Southern · Gatwick Express'], ['southeastern', 'Southeastern · High Speed'],
  ['liverpool-street', 'Greater Anglia'], ['euston', 'Avanti · LNWR · Sleeper'], ['marylebone', 'Chiltern'],
  ['fenchurch-street', 'c2c'], ['st-pancras', 'EMR'],
] as const).map(([id, operator]) => ({ id, operator }))
export interface RailBoardStation {
  readonly id: string
  readonly code: string
  readonly note?: string
  readonly name: string
  readonly stationName: string
  readonly corridors: readonly RailCorridorId[]
  readonly focus: readonly [number, number]
}
export type RailBoardStationId = string
export interface RailCatalogue {
  readonly serviceDate: string
  readonly stations: readonly { id: string; code: string; name: string; displayName?: string; longitude: number; latitude: number; corridors: readonly RailCorridorId[]; note?: string }[]
}

export function railBoardStations(catalogue: RailCatalogue): readonly RailBoardStation[] {
  return catalogue.stations.map(station => ({ id: station.id, code: station.code, note: station.note, name: station.displayName ?? station.name, stationName: station.name, corridors: station.corridors, focus: [station.longitude, station.latitude] as const }))
}
/** Small gateway fallback, available before the optional station catalogue loads. */
export const RAIL_BOARD_STATIONS: readonly RailBoardStation[] = railBoardStations({ serviceDate: '2026-09-04', stations: [
  { id: 'paddington', code: 'PAD', name: 'London Paddington', longitude: -0.177, latitude: 51.516, corridors: ['paddington'] },
  { id: 'waterloo', code: 'WAT', name: 'London Waterloo', longitude: -0.113, latitude: 51.503, corridors: ['waterloo'] },
  { id: 'clapham-junction', code: 'CLJ', name: 'Clapham Junction', longitude: -0.171, latitude: 51.464, corridors: ['waterloo', 'southern'] },
  { id: 'kings-cross', code: 'KGX', name: "London King's Cross", longitude: -0.123, latitude: 51.532, corridors: ['kings-cross', 'thameslink'] },
] })
