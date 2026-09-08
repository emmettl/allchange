import { useEffect, useState } from 'react'
import { formatServiceTime } from '@motionstudies/core/domain/network'
import { editionDataUrl } from '../editions/data-url.ts'
import { nightDepartures, validateNightStudy, type NightStudy } from '../data/night-study.ts'
import './night-study.css'

let cached: NightStudy | undefined
let pending: Promise<NightStudy> | undefined
function loadNight(date: string) {
  if (cached?.serviceDate === date) return Promise.resolve(cached)
  pending ??= fetch(editionDataUrl('all-change-night-study.json'))
    .then(response => { if (!response.ok) throw new Error('Night study unavailable'); return response.json() as Promise<NightStudy> })
    .then(value => { cached = validateNightStudy(value, date); return cached })
    .finally(() => { pending = undefined })
  return pending
}
export default function LondonNightStudy({ date, time, name, stopIds, onTime, onStation }: {
  date: string; time: number; name?: string; stopIds?: readonly string[]
  onTime: (time: number) => void; onStation?: (name: string) => void
}) {
  const [data, setData] = useState<NightStudy | undefined>(() => cached?.serviceDate === date ? cached : undefined)
  const [error, setError] = useState(false), [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (data?.serviceDate === date) return
    let active = true
    loadNight(date)
      .then(value => { if (active) { setData(validateNightStudy(value, date)); setError(false) } })
      .catch(() => { if (active) setError(true) })
    return () => { active = false }
  }, [data, date, attempt])
  if (error || !data || data.serviceDate !== date) return <section className="london-night" aria-label="After midnight" role="status">
    {error ? <>Night context unavailable. <button onClick={() => { setError(false); setAttempt(value => value + 1) }}>Retry night context</button></> : 'Loading night context…'}
  </section>
  if (stopIds) {
    const comparison = data.comparisons.find(comparison => comparison.name === name)
    const summary = nightDepartures(data, comparison?.ids ?? stopIds, time)
    return <section className="london-night" aria-label={`${name} night departures`}>
      <h3>Rail after midnight</h3>
      {!summary.inside ? <p>Night view ends at 05:00.</p> : !summary.available ? <p>No audited night context for this station.</p> : <>
        {summary.next ? <p>Next retained departure <strong>{formatServiceTime(summary.next[0])}</strong> · {data.routes[summary.next[1]]} · in {Math.ceil((summary.next[0] - time) / 60)} min{summary.next[0] >= 18000 && ' · beyond this night view'}.</p> : <p>No later departure in the retained calendar-day data.</p>}
        {summary.previous && <p>Previous retained departure: {summary.previous[0] < 0 ? 'before midnight' : formatServiceTime(summary.previous[0])}.{summary.next && <> {Math.round((summary.next[0] - summary.previous[0]) / 60)} min between these retained calls.</>}</p>}
        {summary.next && summary.next[0] < 18000 && <button onClick={() => onTime(summary.next![0])}>Go to next departure</button>}
        <p>{summary.partial ? 'Thursday rail carry-in is audited; source branch exclusions remain. A timetable gap does not prove no service ran.' : 'Published timetable gaps, not live running or a guaranteed connection.'} Rail only; buses are separate. Early-Friday passenger profiles use typical Tuesday–Thursday demand.</p>
      </>}
    </section>
  }
  const checkpoint = data.checkpoints[Math.min(9, Math.max(0, Math.floor(time / 1800)))]
  return <section className="london-night" aria-label="After midnight">
    <h3>What stays connected after midnight?</h3>
    <p><strong>Friday 4 September · 00:00–05:00</strong><br />Thursday night into Friday morning. This is not Friday night’s service.</p>
    <p>Thursday rail carry-in is included. Source branch exclusions remain; map gaps do not prove closure. Early-Friday passenger profiles use typical Tuesday–Thursday demand.</p>
    <div className="london-night-times" aria-label="Night checkpoints">{[1800, 9000, 16200].map(value => <button key={value} aria-pressed={time === value} onClick={() => onTime(value)}>{formatServiceTime(value)}</button>)}</div>
    <p>{time >= 18000 ? 'Night view ends at 05:00. Choose a checkpoint or return to 24 hours.' : `Retained services moving at ${formatServiceTime(checkpoint.time)}: ${checkpoint.bus.journeys} buses on ${checkpoint.bus.routes.length} routes; ${checkpoint.rail.journeys} National Rail trains; ${checkpoint.tfl.journeys} TfL rail services (audited scope).`}</p>
    <details><summary>Compare the night</summary><table><caption>Retained services moving · fixed half-hour checkpoints</caption><thead><tr><th>Time</th><th>Bus</th><th>Rail*</th></tr></thead><tbody>{data.checkpoints.filter(point => [1800, 9000, 16200].includes(point.time)).map(point => <tr key={point.time}><th>{formatServiceTime(point.time)}</th><td>{point.bus.journeys}</td><td>{point.rail.journeys + point.tfl.journeys}</td></tr>)}</tbody></table><p>*National Rail plus TfL rail within audited source coverage. Scheduled movement, not passenger counts.</p></details>
    {time < 18000 && <details><summary>Bus routes at {formatServiceTime(checkpoint.time)} ({checkpoint.bus.routes.length})</summary><p>{checkpoint.bus.routes.join(', ')}</p></details>}
    <div className="london-night-comparisons">{data.comparisons.map(comparison => <button key={comparison.name} onClick={() => onStation?.(comparison.name)}><strong>{comparison.name}</strong><span>{comparison.description} · {nightDepartures(data, comparison.ids, time).count} retained rail departures, 00:00–05:00</span></button>)}</div>
    <details><summary>Sources and coverage</summary><p>TfL recurring bus schedules include Thursday’s overnight tail. National Rail retains dated working-timetable carry-in. TfL rail includes Thursday carry-in from audited recurring schedules and shared-weekday PDF columns. The full-day source branch exclusions still apply. Friday before 05:00 uses Thursday’s typical demand tail. Saturday service and Friday demand’s Saturday tail are not wrapped into Friday morning.</p><p>Sources: Transport for London (transport data terms); Network Rail working timetable. Geometry and interpolation are the existing study’s model; none of these counts is live.</p></details>
  </section>
}
