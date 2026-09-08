import type { NationalRailSnapshot } from './national-rail.ts'

/** The complete passenger board has no geometry; only the reconciled subset can move. */
export function validateEurostar(value: NationalRailSnapshot, date: string) {
  const board = value.board
  if (!board || board.metadata.serviceDate !== date || board.metadata.windowStart !== 0 || board.metadata.windowEnd !== 86400 || !board.stops?.length || !board.trains?.length || board.paths?.length || board.edges?.length) throw new Error('Invalid Eurostar board')
  const ids = new Set(board.trains.map(train => train.id))
  if (ids.size !== board.trains.length || board.stops.some(stop => !Number.isFinite(stop[0]) || !Number.isFinite(stop[1])) || board.trains.some(train => !train.id.startsWith('eurostar:') || train.mode !== 'national-rail' || train.route !== 'Eurostar' || !train.shortName || train.stops.length < 2 || train.stops.some(([stop, arrival, departure], index) => !board.stops[stop] || !Number.isFinite(arrival) || departure < arrival || !Number.isFinite(departure) || (index > 0 && arrival < train.stops[index - 1][2])) || train.stops.filter(([stop]) => board.stops[stop][4] === 'eurostar:7015400').length !== 1)) throw new Error('Invalid Eurostar calls')
  if (value.trains.some(train => {
    const published = board.trains.find(call => call.id === train.id)
    const london = train.stops.find(([stop]) => value.stops[stop][4] === 'eurostar:7015400')
    const call = published?.stops.find(([stop]) => board.stops[stop][4] === 'eurostar:7015400')
    return !published || !london || !call || london[1] !== call[1] || london[2] !== call[2]
  })) throw new Error('Eurostar movement does not match its published call')
  return value
}
