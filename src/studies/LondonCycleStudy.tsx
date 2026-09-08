import { useEffect, useMemo, useRef, useState } from 'react'
import type { LondonGeographySnapshot } from '../editions/london-geography.ts'
import type { NetworkSnapshot } from '@motionstudies/core/domain/network'
import { activeCycleTrips, cycleInterval, cycleProfiles, cycleProgress, loadCycleDay, type CycleDay } from '../data/cycle-hire.ts'
import { advancePassengerClock } from './passenger-pulse.ts'
import { HeroCardDismiss } from './HeroCardDismiss.tsx'
import './cycle-study.css'

const DEPART = '#edb779', RETURN = '#a2d5c2'
const number = (value: number) => value.toLocaleString('en-GB')
const clock = (time: number) => `${String(Math.floor(time / 3600)).padStart(2, '0')}:${String(Math.floor(time % 3600 / 60)).padStart(2, '0')}`

export default function LondonCycleStudy({ time, onTime, isPlaying, onPlaying, rate, onRate, onClose, geography, railStops }: {
  time: number; onTime: (time: number) => void; isPlaying: boolean; onPlaying: (playing: boolean) => void
  rate: number; onRate: (rate: number) => void; onClose: () => void; geography?: LondonGeographySnapshot; railStops?: NetworkSnapshot['stops']
}) {
  const [day, setDay] = useState<CycleDay>()
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [selected, setSelected] = useState<number>()
  const [dismissed, setDismissed] = useState(() => window.matchMedia('(max-width: 760px)').matches)
  const [query, setQuery] = useState('')
  const [choice, setChoice] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const canvas = useRef<HTMLCanvasElement>(null)
  const search = useRef<HTMLInputElement>(null)
  const positions = useRef<[number, number][]>([])
  const localTime = useRef(time)
  useEffect(() => { localTime.current = time }, [time])
  useEffect(() => { search.current?.focus({ preventScroll: true }) }, [])
  useEffect(() => {
    let active = true
    loadCycleDay().then(data => { if (active) setDay(data) }).catch(() => { if (active) setFailed(true) })
    return () => { active = false }
  }, [attempt])
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduced(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  useEffect(() => {
    if (!isPlaying || !day) return
    let frame = 0, last = performance.now(), report = last
    const tick = (now: number) => {
      if (!document.hidden) {
        localTime.current = advancePassengerClock(localTime.current, (now - last) / 1000, rate, 0, 86400)
        if (now - report >= 100) { onTime(localTime.current); report = now }
      }
      last = now
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [day, isPlaying, rate, onTime])
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement)?.closest('input,select,textarea,button,a,[contenteditable="true"]')) return
      if (event.key === ' ') { event.preventDefault(); onPlaying(!isPlaying) }
      if (event.key === 'Escape') { setSelected(undefined); setQuery(''); setZoom(1) }
    }
    window.addEventListener('keydown', keyboard)
    return () => window.removeEventListener('keydown', keyboard)
  }, [isPlaying, onPlaying])
  const indexed = useMemo(() => day ? cycleProfiles(day) : undefined, [day])
  const interval = cycleInterval(time)
  const dock = selected === undefined ? undefined : day?.stations[selected]
  const interchanges = useMemo(() => {
    const names = new Set(['Waterloo', 'London Bridge', 'Paddington', 'Victoria', 'Bank', "King's Cross St. Pancras", 'Stratford'])
    return (railStops ?? []).filter(stop => { if (!names.has(stop[2])) return false; names.delete(stop[2]); return true })
  }, [railStops])
  const nearby = dock ? interchanges.map(stop => ({ name: stop[2], metres: Math.hypot((stop[0] - dock.lon) * .623, stop[1] - dock.lat) * 111320 })).filter(stop => stop.metres < 750).sort((a, b) => a.metres - b.metres)[0] : undefined
  const profile = selected === undefined ? indexed?.total : indexed?.profiles[selected]
  const departures = interval === undefined ? undefined : profile?.departures[interval]
  const returns = interval === undefined ? undefined : profile?.returns[interval]
  const active = useMemo(() => indexed && interval !== undefined ? activeCycleTrips(indexed.active[interval], time, selected) : [], [indexed, interval, time, selected])
  const choices = useMemo(() => query.trim() ? day?.stations.map((station, i) => ({ station, i })).filter(({ station }) => station.name.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 8) ?? [] : [], [query, day])
  const selectDock = (i: number) => { setSelected(i); setDismissed(false); setQuery(''); setChoice(0) }
  const seek = (next: number) => { onTime(next); onPlaying(false) }

  useEffect(() => {
    const element = canvas.current
    if (!element || !day || !indexed) return
    const draw = () => {
      const { width, height } = element.getBoundingClientRect()
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      element.width = Math.round(width * ratio); element.height = Math.round(height * ratio)
      const ctx = element.getContext('2d')
      if (!ctx) return
      ctx.scale(ratio, ratio)
      // Longitude scaled to local metres; north stays up. Connections are straight.
      const west = Math.min(...day.stations.map(s => s.lon)), east = Math.max(...day.stations.map(s => s.lon))
      const south = Math.min(...day.stations.map(s => s.lat)), north = Math.max(...day.stations.map(s => s.lat))
      const centre = dock ?? { lon: (west + east) / 2, lat: (south + north) / 2 }
      const scale = Math.min((width - 52) / ((east - west) * 0.623), (height - 52) / (north - south)) * zoom
      const xy = (lon: number, lat: number): [number, number] => [width / 2 + (lon - centre.lon) * 0.623 * scale, height / 2 - (lat - centre.lat) * scale]
      ctx.fillStyle = '#0b1726'; ctx.strokeStyle = '#305766'; ctx.lineWidth = 0.7
      if (geography) {
        const polygons = geography.thames.type === 'Polygon' ? [geography.thames.coordinates] : geography.thames.coordinates
        ctx.beginPath()
        for (const polygon of polygons) for (const ring of polygon) ring.forEach(([lon, lat], i) => { const [x, y] = xy(lon, lat); if (!i) ctx.moveTo(x, y); else ctx.lineTo(x, y) })
        ctx.fill('evenodd'); ctx.stroke()
      }
      positions.current = day.stations.map(station => xy(station.lon, station.lat))
      for (const trip of active) {
        const from = positions.current[trip[2]], to = positions.current[trip[3]]
        const outbound = selected === undefined || trip[2] === selected
        ctx.strokeStyle = selected === undefined ? '#a2d5c218' : outbound ? '#edb77966' : '#a2d5c266'
        ctx.lineWidth = selected === undefined ? 0.65 : 1.2
        if (trip[2] === trip[3]) {
          ctx.beginPath(); ctx.arc(from[0], from[1], 8, 0, Math.PI * 2); ctx.stroke()
          continue
        }
        ctx.beginPath(); ctx.moveTo(...from); ctx.lineTo(...to); ctx.stroke()
        if (!reduced) {
          const progress = cycleProgress(trip, time)
          ctx.fillStyle = outbound ? DEPART : RETURN
          ctx.beginPath(); ctx.arc(from[0] + (to[0] - from[0]) * progress, from[1] + (to[1] - from[1]) * progress, selected === undefined ? 1.5 : 2.8, 0, Math.PI * 2); ctx.fill()
        }
      }
      day.stations.forEach((_, i) => {
        const [x, y] = positions.current[i]
        const p = indexed.profiles[i], out = interval === undefined ? 0 : p.departures[interval], back = interval === undefined ? 0 : p.returns[interval]
        ctx.fillStyle = back > out ? RETURN : out > back ? DEPART : '#857e94'
        ctx.globalAlpha = selected === undefined || selected === i ? 0.9 : 0.45
        ctx.beginPath(); ctx.arc(x, y, selected === i ? 7 : Math.min(5, 1.6 + Math.sqrt(out + back) * 0.45), 0, Math.PI * 2); ctx.fill()
        if (selected === i) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke() }
      })
      ctx.globalAlpha = 1
      const labels: [number, number, number, number][] = []
      const label = (name: string, x: number, y: number) => {
        if (x < 0 || x > width || y < 0 || y > height) return
        ctx.font = '10px "DM Mono", monospace'
        const labelWidth = ctx.measureText(name).width
        const left = Math.max(4, Math.min(width - labelWidth - 4, x + 9)), top = Math.max(12, Math.min(height - 4, y - 9))
        if (labels.some(([a, b, w, h]) => left < a + w && left + labelWidth > a && top - 10 < b + h && top > b)) return
        labels.push([left - 4, top - 14, labelWidth + 8, 18])
        ctx.fillStyle = '#070714dd'; ctx.fillRect(left - 2, top - 10, labelWidth + 4, 13)
        ctx.fillStyle = '#eee9d7'; ctx.fillText(name, left, top)
      }
      if (dock && selected !== undefined) label(dock.name.split(',')[0], ...positions.current[selected])
      ctx.strokeStyle = '#ded5ee'; ctx.lineWidth = 1
      for (const stop of interchanges) {
        const [x, y] = xy(stop[0], stop[1])
        ctx.beginPath(); ctx.moveTo(x, y - 4); ctx.lineTo(x + 4, y); ctx.lineTo(x, y + 4); ctx.lineTo(x - 4, y); ctx.closePath(); ctx.stroke()
        label(stop[2].replace(' St. Pancras', ''), x, y)
      }
    }
    draw()
    const observer = new ResizeObserver(draw); observer.observe(element)
    return () => observer.disconnect()
  }, [day, indexed, geography, active, interval, time, dock, selected, zoom, reduced, interchanges])

  const maximum = profile ? Math.max(1, ...profile.departures, ...profile.returns) : 1
  const line = (values: number[]) => values.map((v, i) => `${i * 3},${62 - v / maximum * 56}`).join(' ')
  return <main className="cycle-study london-experience" data-reduced-motion={reduced}>
    <header className="cycle-header"><div><p>ALL CHANGE · SURFACE MOVEMENT</p><h1>London by cycle</h1><span>Friday 29 May 2026 · Santander Cycles</span></div><button onClick={onClose}>Back to rail</button></header>
    <div className="cycle-toolbar">
      <div className="cycle-search"><input ref={search} type="search" role="combobox" aria-label="Find a docking station" aria-expanded={choices.length > 0} aria-controls="cycle-results" aria-activedescendant={choices[choice] ? `cycle-choice-${choice}` : undefined} placeholder="Find a docking station…" value={query} onChange={event => { setQuery(event.target.value); setChoice(0) }} onKeyDown={event => {
        if (event.key === 'ArrowDown') { event.preventDefault(); setChoice(i => Math.min(choices.length - 1, i + 1)) }
        if (event.key === 'ArrowUp') { event.preventDefault(); setChoice(i => Math.max(0, i - 1)) }
        if (event.key === 'Enter' && choices[choice]) { event.preventDefault(); selectDock(choices[choice].i) }
        if (event.key === 'Escape') setQuery('')
      }} />
      {query && <div id="cycle-results" role="listbox" aria-label="Docking stations">{choices.map(({ station, i }, position) => <button id={`cycle-choice-${position}`} key={station.id} role="option" aria-selected={position === choice} onClick={() => selectDock(i)}>{station.name}</button>)}{!choices.length && <p>No matching dock in this study.</p>}</div>}</div>
      <nav aria-label="Compare cycle peaks"><button onClick={() => seek(8.5 * 3600)}>08:30 morning</button><button onClick={() => seek(17.5 * 3600)}>17:30 evening</button></nav>
    </div>
    {!day ? <section className="cycle-loading" role="status">{failed ? <>Cycle study unavailable. <button onClick={() => { setFailed(false); setAttempt(n => n + 1) }}>Retry cycle study</button></> : 'Loading the cycle-hire day…'}</section> : <div className="cycle-content">
      <section className="cycle-map" aria-label="Cycle-hire geography">
        <canvas ref={canvas} role="img" aria-label={`${number(active.length)} recorded hires in progress${dock ? ` involving ${dock.name}` : ''}. Straight dock connections; positions are schematic. Use the station search to select a dock.`} onClick={event => {
          const box = event.currentTarget.getBoundingClientRect(), x = event.clientX - box.left, y = event.clientY - box.top
          let closest = -1, distance = 24
          positions.current.forEach(([px, py], i) => { const next = Math.hypot(px - x, py - y); if (next < distance) { distance = next; closest = i } })
          if (closest >= 0) selectDock(closest)
        }} />
        <div className="cycle-map-tools"><button aria-label="Zoom in on cycle map" disabled={zoom >= 4} onClick={() => setZoom(z => Math.min(4, z * 1.5))}>+</button><button aria-label="Zoom out on cycle map" disabled={zoom <= 1} onClick={() => setZoom(z => Math.max(1, z / 1.5))}>−</button><button onClick={() => { setZoom(1); setSelected(undefined); setDismissed(false) }}>All docks</button></div>
        <span className="cycle-map-count">{number(active.length)} hires in progress</span>
        <p className="cycle-map-key"><span style={{ color: DEPART }}>● More departures</span> <span style={{ color: RETURN }}>● More returns</span><br />Dock balance in this 15 min · larger dots mean more activity<br />◇ Rail interchange · geographic reference</p>
      </section>
      <aside className="cycle-card" data-hero-dismissed={dismissed} aria-label={dock ? `Cycle hire at ${dock.name}` : 'Cycle-hire day summary'}>
        <HeroCardDismiss name={dock?.name.split(',')[0] ?? 'Cycle'} dismissed={dismissed} onToggle={() => setDismissed(v => !v)} />
        <h2>{dock?.name ?? 'Across the docks'}</h2><p>{interval === undefined ? 'End of day · no interval' : `${clock(interval * 900)}–${clock((interval + 1) * 900)} · recorded hires`}</p>
        {nearby && <p>Near {nearby.name} · ≈{Math.round(nearby.metres / 25) * 25} m straight-line distance</p>}
        <div className="cycle-counts"><span>Departures<strong style={{ color: DEPART }}>{departures === undefined ? '—' : number(departures)}</strong></span><span>Returns<strong style={{ color: RETURN }}>{returns === undefined ? '—' : number(returns)}</strong></span></div>
        <p>{departures === undefined || returns === undefined ? 'No interval at 24:00.' : `${returns - departures > 0 ? '+' : ''}${number(returns - departures)} net returns this interval`}</p>
        <p>{number(active.length)} hires in progress{dock ? ' involving this dock' : ''}</p>
        {profile && <><svg viewBox="0 0 285 80" role="img" aria-label="Daily departures and returns profile"><polyline points={line(profile.departures)} fill="none" stroke={DEPART} strokeWidth="1.7" /><polyline points={line(profile.returns)} fill="none" stroke={RETURN} strokeWidth="1.7" /><line x1={time / 86400 * 285} x2={time / 86400 * 285} y1="0" y2="65" stroke="#fff" strokeDasharray="2 3" /><text x="0" y="78">00:00</text><text x="285" y="78" textAnchor="end">24:00</text></svg><p>Day total: {number(profile.departures.reduce((a, b) => a + b, 0))} departures · {number(profile.returns.reduce((a, b) => a + b, 0))} returns</p></>}
        <details><summary>About this day</summary><p>{number(day.stations.length)} matched docks. {number(day.excludedJourneys)} records excluded for unmatched or reused station identities, or hires over 24 hours. Counts cover included records.</p><p>Station coordinates: {day.source.stationsRetrieved}. Minute-resolution times. Same-dock hires stay at the dock; same-minute hires count without animation.</p><p>Net returns exclude fleet rebalancing and do not show bikes available. Santander hires represent part of London's cycling.</p><a href={day.source.url} target="_blank" rel="noreferrer">TfL journey source</a></details>
      </aside>
    </div>}
    <footer className="cycle-footer"><p>Recorded endpoints and times · straight connections, not street routes{reduced ? ' · motion reduced' : ''}</p><div className="cycle-time"><span>00:00</span><strong>{clock(time)}</strong><span>24:00</span></div><input type="range" aria-label="Cycle time of day" min="0" max="86400" step="60" value={time} disabled={!day} onChange={event => seek(Number(event.target.value))} /><div className="cycle-playback"><button aria-label={isPlaying ? 'Pause cycle motion' : 'Resume cycle motion'} disabled={!day} onClick={() => onPlaying(!isPlaying)}>{isPlaying ? 'Ⅱ' : '▶'}</button><select aria-label="Cycle playback speed" value={rate} onChange={event => onRate(Number(event.target.value))}>{[30, 120, 480, 1920].map(value => <option key={value} value={value}>{value / 30}×</option>)}</select><span>1× = 30 study seconds / second</span></div><small>Powered by TfL Open Data · Thames © GLA, OGL v3.0 · cycle date differs from rail</small></footer>
  </main>
}
