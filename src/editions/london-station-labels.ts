import type { StationIndexEntry } from '@motionstudies/core/domain/network'

// Editorial order within each tier. Keep London's orientation points ahead of
// interchange scores, which omit the mainline services at many major termini.
export const LONDON_STATION_LABEL_TIERS = {
  overview: [
    "King's Cross St. Pancras", 'Waterloo', 'Victoria', 'Paddington',
    'Liverpool Street', 'London Bridge', 'Euston', 'Charing Cross',
    'Oxford Circus', 'Piccadilly Circus', 'Westminster', 'Canary Wharf',
  ],
  interchanges: [
    'Stratford', 'Bank', 'Farringdon', 'Baker Street', 'Bond Street',
    'Tottenham Court Road', 'Whitechapel', 'Highbury & Islington',
    'West Ham', 'Clapham Junction', "Earl's Court", 'Elephant & Castle',
    'Vauxhall', 'Canada Water', 'Canning Town', 'Wimbledon',
  ],
} as const

const editorialOrder = new Map<string, number>([
  ...LONDON_STATION_LABEL_TIERS.overview,
  ...LONDON_STATION_LABEL_TIERS.interchanges,
].map((name, index) => [name, index]))

export function londonStationLabels(stations: readonly StationIndexEntry[]): StationIndexEntry[] {
  return [...stations].sort((first, second) =>
    (editorialOrder.get(first.name) ?? Infinity) - (editorialOrder.get(second.name) ?? Infinity)
    || (first.labelRank ?? Infinity) - (second.labelRank ?? Infinity)
    || first.name.localeCompare(second.name, 'en-GB'),
  ).map((station, labelRank) => ({ ...station, labelRank }))
}

// Keep the existing collision budgets (8 / 20 / 48 / 96 labels), while
// allowing all stations in each editorial tier to compete when in view.
export function londonStationLabelRankLimit(cameraHeight: number): number {
  if (cameraHeight >= 30) return LONDON_STATION_LABEL_TIERS.overview.length
  if (cameraHeight >= 22) return editorialOrder.size
  if (cameraHeight >= 15) return 48
  if (cameraHeight >= 14) return 96
  return Infinity
}
