import { useEffect, useMemo, useRef, useState } from 'react'
import { flowDots, flowInterval, flowPosition, loadMorningFlow, type FlowPoint, type MorningFlow } from '../data/morning-flow.ts'
import { advancePassengerClock } from './passenger-pulse.ts'
import './morning-flow.css'

const number = (value?: number) => value === undefined ? 'Unavailable' : `≈${Math.round(value).toLocaleString('en-GB')}`
const chapters = [
  { time: 27000, label: '07:30 · Gathering', copy: 'Start in the east. Follow westbound demand from Leyton through Stratford and towards the City.' },
  { time: 30600, label: '08:30 · Into the City', copy: 'At 08:30, westbound travel is stronger on these links. Select a station to see where people board and alight.' },
  { time: 63000, label: '17:30 · The return', copy: 'Compare the same tracks and the same scale. At 17:30, eastbound demand is stronger between the City and Stratford.' },
]
export default function LondonMorningFlow({ time, isPlaying, playbackRate, mix, onTime, onSeek, onClose }: {
  time: number; isPlaying: boolean; playbackRate: number; mix: number
  onTime: (time: number) => void; onSeek: (time: number) => void; onClose: () => void
}) {
  const [data,setData] = useState<MorningFlow>(), [failed,setFailed] = useState(false), [attempt,setAttempt] = useState(0)
  const [selected,setSelected] = useState('BNKu'), [chapter,setChapter] = useState(1), [zoom,setZoom] = useState(1)
  const [reduced,setReduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches)
  const clock = useRef(time)
  useEffect(() => { clock.current = time }, [time])
  useEffect(() => {
    let active = true
    loadMorningFlow().then(value => { if (active) { setData(value); setFailed(false) } }).catch(() => { if(active) setFailed(true) })
    return () => { active = false }
  }, [attempt])
  useEffect(() => {
    const query = matchMedia('(prefers-reduced-motion: reduce)'), update = () => setReduced(query.matches)
    query.addEventListener('change',update); return () => query.removeEventListener('change',update)
  }, [])
  useEffect(() => {
    if (!isPlaying) return
    let frame = 0, last = performance.now(), report = last
    const tick = (now: number) => {
      if (!document.hidden) {
        clock.current = advancePassengerClock(clock.current,(now-last)/1000,playbackRate,0,86400)
        if(now-report >= 100) { onTime(clock.current); report = now }
      }
      last = now; frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick); return () => cancelAnimationFrame(frame)
  }, [isPlaying,playbackRate,onTime])
  const geometry = useMemo(() => {
    if (!data) return undefined
    const project = (kind: 'geo' | 'diagram') => {
      const points = data.stations.map(station => station[kind])
      const xs = points.map(p=>p[0] * (kind === 'geo' ? 0.622 : 1)), ys = points.map(p=>-p[1])
      const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys)
      const scale = Math.min(580/(maxX-minX),310/(maxY-minY))
      return (point: FlowPoint): FlowPoint => [350+(point[0]*(kind === 'geo' ? 0.622 : 1)-(minX+maxX)/2)*scale,210+(-point[1]-(minY+maxY)/2)*scale]
    }
    const geo = project('geo'), diagram = project('diagram')
    const blend = (a: FlowPoint,b: FlowPoint): FlowPoint => { const p=geo(a),q=diagram(b); return [p[0]+(q[0]-p[0])*mix,p[1]+(q[1]-p[1])*mix] }
    return { stations: data.stations.map(s=>blend(s.geo,s.diagram)), paths: data.links.map(l=>l.geo.map((p,i)=>blend(p,l.diagram[i]))) }
  },[data,mix])
  const interval = flowInterval(time), station = data?.stations.find(s=>s.asc===selected)
  const west = data?.links.find(l=>l.from==='SFDu' && l.to==='MLEu'), east = data?.links.find(l=>l.from==='MLEu' && l.to==='SFDu')
  const viewWidth = 700/zoom, viewHeight = 360/zoom
  return <section className="london-morning-flow" aria-label="Where does the morning go?" data-reduced-motion={reduced} data-time={Math.floor(time)} data-layout-mix={mix}>
    <div className="morning-flow-copy">
      <header><p className="morning-flow-kicker">Passenger study · Central line</p><h2>Where does the <br/>morning go?</h2><button className="morning-flow-close" aria-label="Close morning flow" onClick={onClose}>×</button></header>
      <p className="morning-flow-source">Typical Friday · autumn 2025 <br/>Leyton ↔ St Paul’s · estimated people / 15 min</p>
      <nav aria-label="Morning flow chapters">{chapters.map((item,i)=><button key={item.time} aria-pressed={chapter===i} onClick={()=>{setChapter(i);onSeek(item.time)}}>{item.label}</button>)}</nav>
      <p className="morning-flow-story">{chapters[chapter].copy}</p>
      {failed ? <p role="status">Directional demand unavailable. <button onClick={()=>{setFailed(false);setAttempt(v=>v+1)}}>Retry morning flow</button></p> : !data ? <p role="status">Loading directional demand…</p> : <>
        <label className="morning-flow-station">At the station<select aria-label="Morning flow station" value={selected} onChange={event=>setSelected(event.target.value)}>{data.stations.map(s=><option key={s.asc} value={s.asc}>{s.label}</option>)}</select></label>
        {station && <p className="morning-flow-boarding" data-testid="morning-boarding">Central line · boarding {number(interval===undefined ? undefined : station.boarders[interval])} · alighting {number(interval===undefined ? undefined : station.alighters[interval])}</p>}
      </>}
      <details><summary>How to read this study</summary><p>One full dot represents about 250 people passing along that directional link in 15 minutes. A smaller dot represents the remainder. Dot speed is schematic. Counts are modelled aggregate demand, not tracked people or individual train occupancy. Adjacent link counts must not be added as unique passengers.</p><p>Boarding and alighting combine the Central line’s two directional platform rows at the selected station. The source estimates routes from ticketing data; interchange estimates have lower confidence. The 2025 typical demand and September 2026 timetable describe different days. Friday before 05:00 is outside this directional source window.</p><a href={data?.source.url ?? 'https://crowding.data.tfl.gov.uk/'} target="_blank" rel="noreferrer">Powered by TfL Open Data · NUMBAT 2025 Friday</a></details>
    </div>
    <div className="morning-flow-map">
      <div className="morning-flow-map-tools"><span>{mix > 0.5 ? 'Diagram' : 'Geography'}</span><button aria-label="Zoom directional study in" disabled={zoom>=1.4} onClick={()=>setZoom(v=>Math.min(1.4,v+0.2))}>+</button><button aria-label="Zoom directional study out" disabled={zoom<=1} onClick={()=>setZoom(v=>Math.max(1,v-0.2))}>−</button></div>
      {data && <div className="morning-flow-summary">        <p className="morning-flow-comparison">Stratford ↔ Mile End <span>{interval === undefined ? 'No matching Friday interval' : `${String(Math.floor(time/3600)).padStart(2,'0')}:${String(Math.floor(time%3600/900)*15).padStart(2,'0')}`}</span></p>
        <dl className="morning-flow-counts"><div><dt>← Westbound</dt><dd>{number(interval === undefined ? undefined : west?.values[interval])}</dd></div><div><dt>Eastbound →</dt><dd>{number(interval === undefined ? undefined : east?.values[interval])}</dd></div></dl>
</div>}
      <svg viewBox={`${350-viewWidth/2} ${210-viewHeight/2} ${viewWidth} ${viewHeight}`} role="img" aria-label="Central line directional demand between St Paul's and Leyton. Mint is westbound, amber eastbound.">
        {data && geometry && <>
          {data.links.map((link,index)=>{
            const points = geometry.paths[index], colour = link.direction==='WB' ? '#a2d5c2' : '#edb779', offset = link.direction==='WB' ? -5 : 5
            const values = interval===undefined ? [] : flowDots(link.values[interval])
            return <g key={link.id} transform={`translate(0 ${offset})`} data-link={link.id} data-value={interval===undefined ? 'unavailable' : link.values[interval]}>
              <path d={points.map((p,i)=>`${i ? 'L' : 'M'}${p[0]},${p[1]}`).join(' ')} stroke={colour} strokeWidth="1.3" strokeOpacity="0.35" fill="none"/>
              {values.map((fraction,i)=>{const p=flowPosition(points,(i+0.5)/values.length+(reduced ? 0 : time/240));return <circle key={i} cx={p[0]} cy={p[1]} r={3.8*Math.sqrt(fraction)} fill={colour}/>})}
            </g>
          })}
          {data.stations.map((s,i)=>{const p=geometry.stations[i];return <g key={s.asc} className="morning-flow-stop" role="button" tabIndex={0} aria-label={`Show ${s.label} passenger demand`} aria-pressed={selected===s.asc} onClick={()=>setSelected(s.asc)} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();setSelected(s.asc)}}}>
            <circle cx={p[0]} cy={p[1]} r="22" fill="transparent"/><circle cx={p[0]} cy={p[1]} r={selected===s.asc ? 7 : 4} fill="#101021" stroke={selected===s.asc ? '#eee9d7' : '#9c94ae'} strokeWidth="2"/>
            <text x={p[0]+(i%2 ? 12 : -12)} y={p[1]+(i===6 ? 18 : i%2 ? 23 : -18)} textAnchor={i%2 ? 'start' : 'end'}>{s.label}</text>
          </g>})}
        </>}
      </svg>
      <p className="morning-flow-legend"><span>● Westbound</span><span>● Eastbound</span><span>Full dot ≈250 / 15 min · fixed scale</span></p>
    </div>
  </section>
}
