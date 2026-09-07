import { useMemo } from 'react'
import { formatServiceTime } from '@motionstudies/core/domain/network'
import type { NationalRoadStudySnapshot } from '@motionstudies/core/domain/road-day'
import type { RoadTopologySnapshot } from '@motionstudies/core/domain/road'
import { roadObservationSummary } from '../data/road-summary.ts'
import '../styles/london-road-observations.css'

export function LondonRoadObservations({ snapshot, topology, time, road, date }: {
  snapshot?: NationalRoadStudySnapshot; topology?: RoadTopologySnapshot; time: number; road?: string; date: string
}) {
  const summary = useMemo(() => roadObservationSummary(snapshot, topology, time, road), [snapshot, topology, time, road])
  if (!summary) return null
  return <section className="london-road-observations" aria-label="Recorded motorway conditions">
    <p className="london-road-date">Recorded {date}</p>
    <dl>
      <div><dt>Mean speed</dt><dd>{summary.speedMph === undefined ? '—' : Math.round(summary.speedMph)} <span>mph</span></dd></div>
      <div><dt>Mean detector flow</dt><dd>{summary.meanFlowPerHour === undefined ? '—' : Math.round(summary.meanFlowPerHour).toLocaleString('en-GB')} <span>veh/h</span></dd></div>
    </dl>
    <p>{summary.intervalEnd === undefined ? 'No observations for this interval' : `${formatServiceTime(summary.intervalEnd - summary.intervalSeconds)}–${formatServiceTime(summary.intervalEnd)} recorded interval`}</p>
    <p>{summary.reportingSites}/{summary.candidateSites} detectors reporting · {summary.availableSections}/{summary.candidateSections} sections reconstructed</p>
    <div className="london-road-speed-key" aria-label="Measured speed colours">
      <span><i style={{ background: '#ff7384' }} />&lt;30 mph</span>
      <span><i style={{ background: '#ffc46b' }} />30–50</span>
      <span><i style={{ background: '#7fddd0' }} />50+</span>
    </div>
    <p className="london-road-method">Speed weighted by detector flow. Flow is the average at a detector, not a motorway total. Uncoloured stretches lack paired speed readings.</p>
  </section>
}
