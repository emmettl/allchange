import { useEffect, useState } from 'react'
import { CYCLE_DATES, type CycleDate, type CycleManifest } from '../data/cycle-hire.ts'
import { loadCycleComparison, type CycleComparison } from '../data/cycle-comparison.ts'
import { CYCLE_GUIDES } from './cycle-guides.ts'

const number = (value: number) => value.toLocaleString('en-GB')
const labels = ['Thursday 28 May', 'Friday 29 May', 'Saturday 30 May', 'Sunday 31 May']

export default function LondonCycleComparison({ dockId, manifest, date, time, onDate }: {
  dockId: string; manifest: CycleManifest; date: CycleDate; time: number; onDate: (date: CycleDate) => void
}) {
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState<{ key: string; data?: CycleComparison; failed?: boolean }>()
  const key = `${dockId}:${manifest.sourceSha256}:${attempt}`
  const current = result?.key === key ? result : undefined
  useEffect(() => {
    let active = true
    loadCycleComparison(dockId, manifest).then(data => { if (active) setResult({ key, data }) }).catch(() => { if (active) setResult({ key, failed: true }) })
    return () => { active = false }
  }, [dockId, manifest, key])
  const data = current?.data
  const guide = CYCLE_GUIDES.find(guide => guide.dockId === dockId)
  const points = (values: number[]) => values.map((value, i) => `${i * 3},${40 - value / data!.maximum * 36}`).join(' ')
  return <section className="cycle-comparison" aria-label="Four-day dock comparison">
    {!data ? <p role="status">{current?.failed ? <>Comparison unavailable. <button onClick={() => setAttempt(value => value + 1)}>Retry dock comparison</button></> : 'Loading this dock’s four-day profiles…'}</p> : <>
      <p>28–31 May 2026 · same scale, same clock<br /><span style={{ color: '#edb779' }}>Departures</span> / <span style={{ color: '#a2d5c2' }}>returns</span> · select a day to explore</p>
      {data.profiles.map((profile, i) => <button key={data.dates[i]} className="cycle-comparison-row" aria-label={labels[i]} aria-pressed={date === data.dates[i]} onClick={() => onDate(CYCLE_DATES[i])}>
        <span>{date === data.dates[i] && <span aria-hidden="true">● </span>}{labels[i]}</span>
        {profile ? <><small>{number(profile.departures.reduce((a, b) => a + b, 0))} departures · {number(profile.returns.reduce((a, b) => a + b, 0))} returns</small>
          <svg viewBox="0 0 288 44" aria-hidden="true"><polyline points={points(profile.departures)} fill="none" stroke="#edb779" strokeWidth="1.7" /><polyline points={points(profile.returns)} fill="none" stroke="#a2d5c2" strokeWidth="1.7" /><line x1={time / 86400 * 288} x2={time / 86400 * 288} y1="0" y2="42" stroke="#fff" strokeDasharray="2 3" /></svg></> : <small>No included records · unavailable</small>}
      </button>)}
      <div className="cycle-comparison-axis"><span>00:00</span><span>12:00</span><span>24:00</span></div>
      <p>0–{number(data.maximum)} hires / 15 min on every row. Totals cover each full day.</p>
      {guide && <details><summary>Why this example?</summary><p className="cycle-guide-copy">{guide.text}</p></details>}
      <p>Four observed dates; these do not establish a typical week or explain why people travelled.</p>
    </>}
  </section>
}
