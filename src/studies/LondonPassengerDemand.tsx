import { useState, type CSSProperties } from 'react'
import { passengerInterval, PASSENGER_METRICS, type PassengerMetric } from '../data/passenger-demand.ts'
import { usePassengerDemand } from '../data/use-passenger-demand.ts'
import './passenger-demand.css'

const labels = { entries: 'Entering', exits: 'Leaving', interchanges: 'Changing' }
const colours = { entries: '#a2d5c2', exits: '#edb779', interchanges: '#b8aff1' }
const number = (value: number) => Math.round(value).toLocaleString('en-GB')
function intervalLabel(index: number) {
  const minutes = 300 + index * 15
  const clock = (value: number) => `${String(Math.floor(value / 60) % 24).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`
  return `${clock(minutes)}–${clock(minutes + 15)}${minutes >= 1440 ? ' Sat' : ''}`
}

export default function LondonPassengerDemand({ stationName, time, onPulse }: { stationName: string; time: number; onPulse?: () => void }) {
  const { selection, loading, failed, retry, selectArea } = usePassengerDemand(stationName)
  const [selectedMetric, setMetric] = useState<PassengerMetric>('entries')
  const station = selection?.data.station
  const metrics = PASSENGER_METRICS.filter(key => station?.[key])
  const metric = metrics.includes(selectedMetric) ? selectedMetric : metrics[0] ?? 'entries'
  if (!loading && !failed && !station) return null
  const interval = passengerInterval(time)
  const values = station?.[metric] ?? []
  const peak = Math.max(1, ...values)
  const peakIndex = values.indexOf(Math.max(...values))
  const path = values.map((v, i) => `${i ? 'L' : 'M'}${(4 + (i + 0.5) * 3.5).toFixed(1)},${(66 - v / peak * 58).toFixed(1)}`).join(' ')
  return <section className="london-passenger-demand" aria-label="Typical passenger demand">
    <header><strong>Passenger rhythm</strong><span>Typical Friday · autumn 2025</span></header>
    {!station ? <p role="status">{failed ? <>Passenger data unavailable. <button type="button" onClick={retry}>Retry passenger data</button></> : 'Loading passenger profile…'}</p> : <>
      <p className="passenger-scope">{station.name} · NUMBAT source area</p>
      {selection!.areas.length > 1 && <label className="passenger-area">Source area <select aria-label="Passenger source area" value={station.asc} onChange={event => selectArea(event.target.value)}>{selection!.areas.map(area => <option key={area.asc} value={area.asc}>{area.name}</option>)}</select></label>}
      <p className="passenger-interval">{interval === undefined ? 'No matching interval in this study day' : `${intervalLabel(interval)} · estimated people / 15 min`}</p>
      <div className="passenger-metrics" role="group" aria-label="Passenger profile metric">
        {metrics.map(key => <button type="button" key={key} aria-pressed={key === metric} onClick={() => setMetric(key)} style={{ '--passenger-colour': colours[key] } as CSSProperties}>
          <span>{labels[key]}</span><strong>{interval === undefined ? '—' : `≈${number(station[key]![interval])}`}</strong>
        </button>)}
      </div>
      <svg viewBox="0 0 344 90" role="img" aria-label={`${labels[metric]} daily profile. Peak ${intervalLabel(peakIndex)}, approximately ${number(values[peakIndex])} people per 15 minutes.`}>
        <rect x="270" y="3" width="70" height="65" fill="#ffffff07" />
        <path d="M4 66H340" stroke="#ffffff26" />
        <path d={path} fill="none" stroke={colours[metric]} strokeWidth="1.8" />
        {interval !== undefined && <g data-testid="passenger-marker" data-interval={interval}>
          <line x1={4 + (interval + 0.5) * 3.5} x2={4 + (interval + 0.5) * 3.5} y1="3" y2="67" stroke="#eee9d7" strokeDasharray="2 3" />
          <circle cx={4 + (interval + 0.5) * 3.5} cy={66 - values[interval] / peak * 58} r="3" fill={colours[metric]} />
        </g>}
        <g fill="#bdb8ca" fontSize="9"><text x="4" y="84">05</text><text x="99" y="84">12</text><text x="183" y="84">18</text><text x="270" y="84">00</text><text x="340" y="84" textAnchor="end">05 Sat</text></g>
      </svg>
      <p className="passenger-peak">{labels[metric]} peak: {intervalLabel(peakIndex)} · ≈{number(values[peakIndex])}/15 min<br />≈{number(station.totals[metric]!)} across the traffic day</p>
      {onPulse && <button type="button" onClick={onPulse}>Explore passenger flow</button>}
      {station.unavailable?.interchanges && <p className="passenger-peak">Changing unavailable: {station.unavailable.interchanges.toLowerCase()}.</p>}
      <details><summary>About this profile</summary>
        <p>Typical demand, not live counts or train occupancy. Scrub the study clock to compare its rhythm with scheduled movements. Each profile uses its own vertical scale.</p>
        <p>Entries and exits are based on gateline data; changes between platforms are modelled. These are separate movements, not unique visitors. {station.asc === 'BNKu' ? 'Bank includes Monument. Nearby Cannon Street and Mansion House flows are excluded.' : 'Counts apply to the named source area, not necessarily the whole interchange or every operator. Separate areas are never added together.'} Modelled links to National Rail have lower confidence. {station.crossAreaLinksExcluded > 0 && 'Changing covers only links within this area; cross-area links are excluded.'}</p>
        <p>Traffic day: Friday 05:00 to Saturday 05:00. The shaded tail is Saturday; it is not mapped onto Friday’s early hours. Timetable: September 2026. Demand: autumn 2025.</p>
        <a href="https://crowding.data.tfl.gov.uk/NUMBAT/NUMBAT%202025/NBT25FRI_Outputs.xlsx" target="_blank" rel="noreferrer">Powered by TfL Open Data · NUMBAT 2025 Friday</a>
      </details>
    </>}
  </section>
}
