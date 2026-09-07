import { useState } from 'react'
import { formatServiceTime } from '@motionstudies/core/domain/network'
import { stationRailCalls, type NationalRailSnapshot } from '../data/national-rail.ts'
import { LONDON_RAIL_CORRIDORS, type RailBoardStation, type RailBoardStationId } from '../editions/london-national-rail.ts'

export function LondonNationalRailBoard({ snapshot, stations, stationId, time, windowEnd, selectedId, onStation, onSelect, onSeek, onPulse }: {
  snapshot: NationalRailSnapshot; stations: readonly RailBoardStation[]; stationId: RailBoardStationId; time: number; windowEnd: number; selectedId?: string
  onStation: (id: RailBoardStationId) => void; onSelect: (id: string | undefined) => void; onSeek: (time: number) => void; onPulse: () => void
}) {
  const [expanded, setExpanded] = useState(() => !window.matchMedia('(max-width: 760px)').matches)
  const [direction, setDirection] = useState<'arrival' | 'departure'>('departure')
  const station = stations.find(value => value.id === stationId)!
  const calls = stationRailCalls(snapshot, station.stationName, time, direction, windowEnd)
  const selected = snapshot.trains.find(train => train.id === selectedId)
  const selectedCalls = selected?.stops.filter(([index], ordinal) => snapshot.stops[index][2] === station.stationName && !selected.passIndexes?.includes(ordinal))
  const selectedCall = selectedCalls?.find(stop => stop[direction === 'departure' ? 2 : 1] >= time) ?? selectedCalls?.at(-1)
  const intermediateCalls = selected?.stops.slice(1, -1).filter((_, index) => !selected.passIndexes?.includes(index + 1)).length ?? 0
  return <section className="london-national-rail-board" aria-label={`National Rail at ${station.name}`}>
    <details open={expanded} onToggle={event => setExpanded(event.currentTarget.open)}>
      <summary><span>National Rail</span><strong>{station.name}</strong></summary>
      <label className="london-rail-station-picker">Station
        <select aria-label="National Rail station" value={stationId} onChange={event => onStation(event.target.value as RailBoardStationId)}>
          {stations.map(value => <option key={value.id} value={value.id}>{value.name}</option>)}
        </select>
      </label>
      <div className="london-national-rail-directions" aria-label={`${station.name} board direction`}>
        <button type="button" aria-pressed={direction === 'departure'} onClick={() => setDirection('departure')}>Departures</button>
        <button type="button" aria-pressed={direction === 'arrival'} onClick={() => setDirection('arrival')}>Arrivals</button>
      </div>
      <ol>
        {calls.map(({ train, index, time: callTime }) => <li key={`${train.id}:${index}`}>
          <button type="button" aria-pressed={selectedId === train.id} onClick={() => onSelect(selectedId === train.id ? undefined : train.id)}>
            <time>{formatServiceTime(callTime)}</time>
            <span>{direction === 'departure' ? train.headsign : `From ${train.origin ?? snapshot.stops[train.stops[0][0]][2]}`}<small>{train.route}</small></span>
            <span aria-hidden="true">{direction === 'departure' ? '↗' : '↙'}</span>
          </button>
        </li>)}
      </ol>
      {!calls.length && <p>{station.note ?? 'No more calls in this study window.'}</p>}
      {selected && <div className="london-national-rail-selection">
        <span>{snapshot.stops[selected.stops[0][0]][2].replace('London ', '')} → {snapshot.stops[selected.stops.at(-1)![0]][2].replace('London ', '')}</span>
        <small>{formatServiceTime(selected.start)}–{formatServiceTime(selected.end)} · {intermediateCalls ? `${intermediateCalls} intermediate calls` : 'Non-stop in the mapped area'}</small>
        <button type="button" onClick={() => { onSeek(selectedCall ? direction === 'departure' ? selectedCall[2] + 60 : selectedCall[1] - 120 : selected.start); setExpanded(false) }}>Show movement</button>
        <button type="button" onClick={() => onSelect(undefined)}>Clear</button>
      </div>}
      <button className="london-rail-pulse-link" type="button" onClick={onPulse}>Open {station.name} pulse</button>
      <p>{station.corridors.map(id => LONDON_RAIL_CORRIDORS.find(value => value.id === id)!.operator).join(' · ')} · Friday timetable<br />Trains fade beyond London.</p>
      <a className="london-rail-attribution" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">Rail geometry © OpenStreetMap contributors</a>
      <a href={snapshot.metadata.sourceUrl} target="_blank" rel="noreferrer">Published times · not live</a>
    </details>
  </section>
}
