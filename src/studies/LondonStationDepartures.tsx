import { useMemo, useState } from 'react'
import { formatServiceTime, type NetworkSnapshot } from '@motionstudies/core/domain/network'
import { SplitFlapBoard } from '@motionstudies/web/components/SplitFlapBoard'
import { stationBoardCalls, upcomingStationCalls, type StationBoardCall, type StationBoardDirection } from './station-board.ts'
import '@motionstudies/web/split-flap-board.css'
import './station-board.css'

export function LondonStationDepartures({ snapshot, stationName, time, windowStart, windowEnd, selectedId, onSelect, onSeek, onPulse, loading = false, error, onRetry, note, emptyMessage, maxRows = 4, animate = true, onDirection, providedCalls }: {
  snapshot: NetworkSnapshot; stationName: string; time: number; windowStart: number; windowEnd: number
  selectedId?: string; onSelect: (call: StationBoardCall) => void; onSeek?: (call: StationBoardCall, direction: StationBoardDirection) => void
  onPulse?: () => void; loading?: boolean; error?: string; onRetry?: () => void; note?: string; emptyMessage?: string
  maxRows?: number; animate?: boolean; onDirection?: (direction: StationBoardDirection) => void
  providedCalls?: readonly StationBoardCall[]
}) {
  const [direction, setDirection] = useState<StationBoardDirection>('departure')
  const [route, setRoute] = useState('')
  const [selectedCallId, setSelectedCallId] = useState<string>()
  const calls = useMemo(() => providedCalls ?? stationBoardCalls(snapshot, stationName), [providedCalls, snapshot, stationName])
  const routes = useMemo(() => [...new Set(calls.map(call => call.train.route))].sort(), [calls])
  // A route can disappear when the loaded two-hour chunk changes.
  const activeRoute = routes.includes(route) ? route : ''
  const upcoming = useMemo(() => upcomingStationCalls(calls, direction, time, windowStart, windowEnd, activeRoute, maxRows), [calls, direction, time, windowStart, windowEnd, activeRoute, maxRows])
  const selected = !error && !loading ? calls.find(call => call.id === selectedCallId && call.train.id === selectedId && (direction === 'arrival' ? call.allowsArrival : call.allowsDeparture)) : undefined
  const end = Math.min(windowEnd, time + 3600)
  const outside = time < windowStart || time >= windowEnd
  return <section className="london-station-departures" aria-label={`${stationName} timetable`} data-animate={animate}>
    <div className="london-station-board-tools">
    <div className="london-station-board-tabs" role="group" aria-label="Board direction">
      {(['departure', 'arrival'] as const).map(value => <button key={value} type="button" aria-pressed={direction === value} onClick={() => { setDirection(value); onDirection?.(value) }}>{value === 'departure' ? 'Departures' : 'Arrivals'}</button>)}
    </div>
    {routes.length > 1 && <label className="london-station-board-filter"><span className="sr-only">Line / service</span>
      <select aria-label={`${stationName} board line`} value={activeRoute} onChange={event => setRoute(event.target.value)}>
        <option value="">All lines</option>
        {routes.map(value => <option key={value} value={value}>{value}</option>)}
      </select>
    </label>}
    </div>
    <p className="london-station-board-window">{snapshot.metadata.serviceDate} · {outside ? 'Outside study window' : `${formatServiceTime(time)}–${formatServiceTime(end)}`}</p>
    {error && <p className="london-station-board-message" role="status">{error}{onRetry && <> · <button type="button" onClick={onRetry}>Retry board data</button></>}</p>}
    <SplitFlapBoard label={`${stationName} ${direction === 'departure' ? 'departures' : 'arrivals'}`} columns={[
      { key: 'time', label: 'Time', characters: 5 },
      { key: 'place', label: direction === 'departure' ? 'To' : 'From', characters: 18 },
      { key: 'line', label: 'Line / service', characters: routes.includes('Eurostar') ? 13 : 12 },
    ]} rows={error ? [] : upcoming.map(call => ({ id: call.id, cells: { time: formatServiceTime(call[direction]), place: direction === 'departure' ? call.destination : call.origin, line: serviceLabel(call) } }))}
      loading={loading} loadingRows={maxRows} loadingMessage="Loading station calls…"
      emptyMessage={error ? 'Timetable unavailable.' : outside ? 'Outside study window.' : emptyMessage ?? `No ${direction === 'departure' ? 'departures' : 'arrivals'} in this window.`}
      selectionColumn="place" selectedRowId={selected?.id}
      onSelectRow={id => { const call = upcoming.find(value => value.id === id)!; setSelectedCallId(id); onSelect(call) }} />
    {selected && onSeek && <div className="london-station-board-selection">
      <p>{direction === 'departure' ? selected.destination : `From ${selected.origin}`}</p>
      <p>{serviceLabel(selected)} · {formatServiceTime(selected[direction])}</p>
      {selected.movementAvailable === false ? <p>Timetable only · London movement unavailable for this service.</p> : <button type="button" onClick={() => onSeek(selected, direction)}>Show movement</button>}
    </div>}
    {onPulse && <button className="london-station-board-pulse" type="button" onClick={onPulse}>Open {stationName} pulse</button>}
    <p className="london-station-board-note">Published times · not live{note && <> · {note}</>}</p>
  </section>
}

function serviceLabel(call: StationBoardCall) {
  return call.train.route === 'Eurostar' ? `Eurostar ${call.train.shortName}` : call.train.route
}
