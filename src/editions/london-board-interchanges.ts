import type { RailCorridorId } from './london-national-rail.ts'

/** Explicit same-interchange identities from the retained TfL and rail catalogues. */
export interface BoardInterchange {
  id: string; name: string; aliases: readonly string[]; tflStopIds: readonly string[]
  railCode: string; corridors: readonly RailCorridorId[]
}
export const BOARD_INTERCHANGES: readonly BoardInterchange[] = [
  { id: 'stratford', name: 'Stratford', aliases: ['Stratford', 'Stratford (London)'],
    tflStopIds: ['940GZZLUSTD', '940GZZDLSTD', '910GSTFD'], railCode: 'SRA', corridors: ['liverpool-street'] },
  { id: 'liverpool-street', name: 'Liverpool Street', aliases: ['Liverpool Street', 'London Liverpool Street'],
    tflStopIds: ['940GZZLULVT', '910GLIVSTLL', '910GLIVST'], railCode: 'LST', corridors: ['liverpool-street'] },
  { id: 'clapham-junction', name: 'Clapham Junction', aliases: ['Clapham Junction'],
    tflStopIds: ['910GCLPHMJC', '910GCLPHMJ1'], railCode: 'CLJ', corridors: ['waterloo', 'southern'] },
]
export const boardInterchange = (name?: string) => BOARD_INTERCHANGES.find(station => station.aliases.includes(name ?? ''))
