import { useEffect, useRef, useState } from 'react'
import { usePassengerDemand } from '../data/use-passenger-demand.ts'
import { advancePassengerClock, FLOW_COLOURS, flowMarkPosition, passengerFlows } from './passenger-pulse.ts'
import { passengerInterval } from '../data/passenger-demand.ts'
import './passenger-pulse.css'

const labels = { entries: 'Entering', exits: 'Leaving', interchanges: 'Changing' }
const endpoints = { entries: 'Street → platforms', exits: 'Platforms → street', interchanges: 'Platform → platform' }
export default function LondonPassengerPulse({ stationName, hubId, time, isPlaying, playbackRate, windowStart, windowEnd, onTime, onSeek, onStation }: {
  stationName: string; hubId: string; time: number; isPlaying: boolean; playbackRate: number; windowStart: number; windowEnd: number
  onTime: (time: number) => void; onSeek: (time: number) => void; onStation: (id: string) => void
}) {
  const { selection, loading, failed, retry } = usePassengerDemand(stationName, time >= 0 && time < 18000)
  const localTime = useRef(time)
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => { localTime.current = time }, [time])
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReducedMotion(query.matches)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  useEffect(() => {
    if (!isPlaying) return
    let frame = 0, last = performance.now(), report = last
    const tick = (now: number) => {
      if (!document.hidden) {
        localTime.current = advancePassengerClock(localTime.current, (now - last) / 1000, playbackRate, windowStart, windowEnd)
        if (now - report >= 100) { onTime(localTime.current); report = now }
      }
      last = now
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [isPlaying, playbackRate, windowStart, windowEnd, onTime])
  const station = selection?.data.station
  const interval = passengerInterval(time, selection?.data)
  const flows = station ? passengerFlows(station, time, selection?.data) : []
  return <section className="london-passenger-pulse" aria-label="Passenger flow study" data-reduced-motion={reducedMotion}>
    <header>
      <label>Passenger flow <select aria-label="Passenger pulse station" value={hubId} onChange={event => onStation(event.target.value)}><option value="bank">Bank & Monument</option><option value="stratford">Stratford</option></select></label>
      <p>{selection?.data.start === 0 ? 'Thursday tail · typical Tue–Thu' : 'Typical Friday'} · autumn 2025 · {interval === undefined ? 'No matching interval' : `${String(Math.floor(time / 3600)).padStart(2, '0')}:${String(Math.floor(time % 3600 / 900) * 15).padStart(2, '0')} · 15-minute demand`}</p>
    </header>
    {failed ? <p role="status">Passenger data unavailable. <button onClick={retry}>Retry passenger pulse</button></p> : loading ? <p role="status">Loading passenger flow…</p> : station ? <>
      <svg viewBox="0 0 720 340" role="img" aria-label={`${station.name}. ${flows.map(flow => `${labels[flow.metric]}: ${flow.value === undefined ? 'unavailable' : `approximately ${Math.round(flow.value).toLocaleString('en-GB')}`} movements per 15 minutes`).join('. ')}`}>
        {flows.map(({ metric, value, marks }, row) => <g key={metric} transform={`translate(0 ${row * 110})`} data-flow={metric} data-value={value === undefined ? 'unavailable' : value}>
          <text x="60" y="30" fill={FLOW_COLOURS[metric]} fontSize="24">{labels[metric]}</text>
          <text x="660" y="30" textAnchor="end" fill={FLOW_COLOURS[metric]} fontSize="24">{value === undefined ? 'Unavailable' : `≈${Math.round(value).toLocaleString('en-GB')}`}</text>
          <path d="M60 62 C260 30 460 94 660 62" fill="none" stroke={FLOW_COLOURS[metric]} strokeOpacity="0.3" strokeWidth="2" />
          {marks.map((fraction, index) => { const point = flowMarkPosition(index, marks.length, time, reducedMotion); return <circle key={index} cx={point.x} cy={62 + point.y} r={5 * Math.sqrt(fraction)} fill={FLOW_COLOURS[metric]} /> })}
          <text x="60" y="99" fill="#c6c0d1" fontSize="18">{endpoints[metric]}</text>
        </g>)}
      </svg>
      <p className="passenger-pulse-key">One full dot ≈250 movements per 15 min; a smaller dot is a fraction. Schematic flow, not tracked paths or train occupancy.</p>
      <nav aria-label="Compare passenger peaks"><button onClick={() => onSeek(8.5 * 3600)}>08:30 morning</button><button onClick={() => onSeek(17.5 * 3600)}>17:30 evening</button></nav>
    </> : <p>No validated passenger profile for this station.</p>}
  </section>
}
