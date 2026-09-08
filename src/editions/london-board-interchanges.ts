import type { RailCorridorId } from './london-national-rail.ts'

/** Explicit same-interchange identities from the retained TfL and rail catalogues. */
export interface BoardInterchange {
  id: string; name: string; aliases: readonly string[]; tflStopIds: readonly string[]
  railCode: string; corridors: readonly RailCorridorId[]
  tflArea?: string; note?: string
}
export const BOARD_INTERCHANGES: readonly BoardInterchange[] = [
  { id: 'stratford', name: 'Stratford', aliases: ['Stratford', 'Stratford (London)'],
    tflStopIds: ['940GZZLUSTD', '940GZZDLSTD', '910GSTFD'], railCode: 'SRA', corridors: ['liverpool-street'] },
  { id: 'liverpool-street', name: 'Liverpool Street', aliases: ['Liverpool Street', 'London Liverpool Street'],
    tflStopIds: ['940GZZLULVT', '910GLIVSTLL', '910GLIVST'], railCode: 'LST', corridors: ['liverpool-street'] },
  { id: 'clapham-junction', name: 'Clapham Junction', aliases: ['Clapham Junction'],
    tflStopIds: ['910GCLPHMJC', '910GCLPHMJ1'], railCode: 'CLJ', corridors: ['waterloo', 'southern'] },
  { id: 'paddington', name: 'Paddington', aliases: ['Paddington', 'London Paddington', 'Paddington (H&C Line)-Underground'],
    tflStopIds: ['940GZZLUPAC', '940GZZLUPAH', '910GPADTLL', '910GPADTON'], railCode: 'PAD', corridors: ['paddington'] },
  { id: 'waterloo', name: 'Waterloo', aliases: ['Waterloo', 'London Waterloo'],
    tflStopIds: ['940GZZLUWLO'], railCode: 'WAT', corridors: ['waterloo'] },
  { id: 'victoria', name: 'Victoria', aliases: ['Victoria', 'London Victoria'],
    tflStopIds: ['940GZZLUVIC'], railCode: 'VIC', corridors: ['southern', 'southeastern'] },
  { id: 'london-bridge', name: 'London Bridge', aliases: ['London Bridge'],
    tflStopIds: ['940GZZLULNB'], railCode: 'LBG', corridors: ['thameslink', 'southern', 'southeastern'] },
  { id: 'euston', name: 'Euston', aliases: ['Euston', 'London Euston'],
    tflStopIds: ['940GZZLUEUS', '910GEUSTON'], railCode: 'EUS', corridors: ['euston'] },
  { id: 'kings-cross', name: 'King’s Cross', aliases: ["London King's Cross", "King's Cross", 'King’s Cross'],
    tflArea: "King's Cross St. Pancras", tflStopIds: ['940GZZLUKSX'], railCode: 'KGX', corridors: ['kings-cross', 'thameslink'],
    note: 'King’s Cross mainline calls. St Pancras has separate boards.' },
  { id: 'st-pancras', name: 'St. Pancras International', aliases: ['London St. Pancras International', 'St. Pancras International'],
    tflArea: "King's Cross St. Pancras", tflStopIds: ['940GZZLUKSX'], railCode: 'STP', corridors: ['southeastern', 'st-pancras'],
    note: 'St Pancras domestic mainline and high-speed calls. Eurostar is not included; Thameslink has a separate board.' },
  { id: 'st-pancras-thameslink', name: 'St Pancras Thameslink', aliases: ['St Pancras International', 'St Pancras Thameslink'],
    tflArea: "King's Cross St. Pancras", tflStopIds: ['940GZZLUKSX'], railCode: 'SPL', corridors: ['thameslink'],
    note: 'St Pancras Thameslink calls. Mainline and high-speed services have a separate board.' },
]
export const boardInterchanges = (name?: string) => BOARD_INTERCHANGES.filter(station => station.aliases.includes(name ?? '') || Boolean(name && station.tflArea === name))
export const boardInterchange = (name?: string) => boardInterchanges(name)[0]
