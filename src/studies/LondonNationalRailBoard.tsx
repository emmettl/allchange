import { useState } from 'react'
import { formatServiceTime } from '@motionstudies/core/domain/network'
import { paddingtonCalls, type NationalRailSnapshot } from '../data/national-rail.ts'

export function LondonNationalRailBoard({ snapshot, time, windowEnd, selectedId, onSelect, onSeek }: {
  snapshot: NationalRailSnapshot; time: number; windowEnd: number; selectedId?: string
  onSelect: (id: string | undefined) => void; onSeek: (time: number) => void
}) {
  const [expanded, setExpanded] = useState(() => !window.matchMedia('(max-width: 760px)').matches)
  const [direction, setDirection] = useState<'inbound' | 'outbound'>('outbound')
  const calls = paddingtonCalls(snapshot, time, direction, windowEnd)
  const selected = snapshot.trains.find(train => train.id === selectedId)
  return <section className="london-national-rail-board" aria-label="National Rail at Paddington">
    <details open={expanded} onToggle={event => setExpanded(event.currentTarget.open)}>
      <summary><span>National Rail</span><strong>Paddington</strong></summary>
      <div className="london-national-rail-directions" aria-label="Paddington board direction">
        <button type="button" aria-pressed={direction === 'outbound'} onClick={() => setDirection('outbound')}>Departures</button>
        <button type="button" aria-pressed={direction === 'inbound'} onClick={() => setDirection('inbound')}>Arrivals</button>
      </div>
      <ol>
        {calls.map(({ train, time: callTime }) => <li key={train.id}>
          <button type="button" aria-pressed={selectedId === train.id} onClick={() => onSelect(selectedId === train.id ? undefined : train.id)}>
            <time>{formatServiceTime(callTime)}</time>
            <span>{direction === 'outbound' ? train.headsign : 'Via Reading'}<small>{train.route}</small></span>
            <span aria-hidden="true">{direction === 'outbound' ? '↗' : '↙'}</span>
          </button>
        </li>)}
      </ol>
      {!calls.length && <p>No more calls in this study window.</p>}
      {selected && <div className="london-national-rail-selection">
        <span>{selected.direction === 'outbound' ? 'Paddington → Reading' : 'Reading → Paddington'}</span>
        <small>{formatServiceTime(selected.start)}–{formatServiceTime(selected.end)} · {selected.stops.length > 2 ? `${selected.stops.length - 2} intermediate calls` : 'Non-stop in this corridor'}</small>
        <button type="button" onClick={() => { onSeek(selected.direction === 'outbound' ? selected.start + 60 : selected.end - 120); setExpanded(false) }}>Show movement</button>
        <button type="button" onClick={() => onSelect(undefined)}>Clear</button>
      </div>}
      <p>GWR corridor proof · Friday timetable<br />Trains fade beyond London.</p>
      <a href={snapshot.metadata.sourceUrl} target="_blank" rel="noreferrer">Published times · not live</a>
    </details>
  </section>
}
