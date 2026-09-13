import { lazy, Suspense, useMemo, useState } from 'react'
import { formatServiceTime, type NetworkSnapshot } from '@motionstudies/core/domain/network'
import { RailStationHeroCard } from '@motionstudies/web/components/RailStationHeroCard'
import { stationBoardCalls, upcomingStationCalls, type StationBoardCall, type StationBoardDirection } from './station-board.ts'
import '@motionstudies/web/transport-hero-cards.css'
import './station-board.css'

const BusStopHeroCard = lazy(() => import('@motionstudies/web/components/BusStopHeroCard').then(module => ({ default: module.BusStopHeroCard })))

export function LondonStationDepartures({ snapshot, stationName, time, windowStart, windowEnd, selectedId, onSelect, onSeek, onPulse, loading = false, error, onRetry, note, emptyMessage, maxRows = 4, animate = true, onDirection, providedCalls }: {
  snapshot: NetworkSnapshot; stationName: string; time: number; windowStart: number; windowEnd: number
  selectedId?: string; onSelect: (call: StationBoardCall) => void; onSeek?: (call: StationBoardCall, direction: StationBoardDirection) => void
  onPulse?: () => void; loading?: boolean; error?: string; onRetry?: () => void; note?: string; emptyMessage?: string
  maxRows?: number; animate?: boolean; onDirection?: (direction: StationBoardDirection) => void
  providedCalls?: readonly StationBoardCall[]
}) {
  const [direction, setDirection] = useState<StationBoardDirection>('departure')
  const departing = direction === 'departure'
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
  const sourceNote = <>Published times · not live{note && <> · {note}</>}</>
  const selectDeparture = (id: string) => {
    const call = upcoming.find(value => value.id === id)!
    setSelectedCallId(id)
    onSelect(call)
  }
  const heroProps = { boardHeight: 300, loading, error, onRetry, selectedDepartureId: selected?.id, onSelectDeparture: selectDeparture, note: sourceNote }
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
    {calls.length > 0 && calls.every(call => call.train.category === 'bus') ? <Suspense fallback={<p role="status">Loading station calls…</p>}><BusStopHeroCard stop={{ name: stationName }}
      {...heroProps} lineCount={maxRows}
      labels={{ departures: departing ? 'Bus departures from' : 'Bus arrivals at', due: 'Time', empty: outside ? 'Outside study window.' : emptyMessage ?? 'No calls in this window.' }}
      departures={error ? [] : upcoming.map(call => ({ id: call.id, route: serviceLabel(call), destination: departing ? call.destination : call.origin, due: formatServiceTime(call[direction]).slice(0, 5) }))}
      /></Suspense> : <RailStationHeroCard station={{ name: stationName }} presentation="uk-rail"
      {...heroProps} lineCount={maxRows * 2}
      labels={{ departures: departing ? 'Departures' : 'Arrivals', destination: departing ? 'To' : 'From', loading: 'Loading station calls…', empty: outside ? 'Outside study window.' : emptyMessage ?? `No ${departing ? 'departures' : 'arrivals'} in this window.` }}
      departures={error ? [] : upcoming.map(call => ({ id: call.id, time: formatServiceTime(call[direction]).slice(0, 5), destination: departing ? call.destination : call.origin, serviceNote: serviceLabel(call) }))}
      clockLabel={formatServiceTime(time)} />}

    {selected && onSeek && <div className="london-station-board-selection">
      <p>{departing ? selected.destination : `From ${selected.origin}`}</p>
      <p>{serviceLabel(selected)} · {formatServiceTime(selected[direction])}</p>
      {selected.movementAvailable === false ? <p>Timetable only · London movement unavailable for this service.</p> : <button type="button" onClick={() => onSeek(selected, direction)}>Show movement</button>}
    </div>}
    {onPulse && <button className="london-station-board-pulse" type="button" onClick={onPulse}>Open {stationName} pulse</button>}
    <p className="london-station-board-note">{sourceNote}</p>
  </section>
}

function serviceLabel(call: StationBoardCall) {
  return call.train.route === 'Eurostar' ? `Eurostar ${call.train.shortName}` : call.train.route
}
