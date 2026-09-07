import type { RoadTopologySnapshot } from '@motionstudies/core/domain/road'
import type { NationalRoadStudySnapshot } from '@motionstudies/core/domain/road-day'
import { roadInterval, measuredSpeedMph } from './road-observations.ts'

export function roadObservationSummary(snapshot: NationalRoadStudySnapshot | undefined, topology: RoadTopologySnapshot | undefined, time: number, road?: string) {
  if (!snapshot || !topology) return undefined
  const interval = roadInterval(snapshot, time)
  const candidateSites = topology.sites.filter(site => !road || site.match.road === road)
  const ids = new Set(candidateSites.map(site => site.id))
  const values = (interval?.[1] ?? []).filter(value => ids.has(snapshot.siteIds[value[0]]))
  const measured = new Set(values.map(value => value[0]))
  const availableSections = snapshot.sections.filter(section => (!road || section.road === road) && measured.has(section.fromSiteIndex) && measured.has(section.toSiteIndex)).length
  return {
    intervalEnd: interval?.[0],
    intervalSeconds: snapshot.metadata.sampleIntervalSeconds,
    speedMph: measuredSpeedMph(values),
    // Mean at a detector, not the sum of repeated counts along a motorway.
    meanFlowPerHour: values.length ? values.reduce((total, value) => total + value[1] + value[3], 0) / values.length : undefined,
    reportingSites: values.length,
    candidateSites: candidateSites.length,
    availableSections,
    candidateSections: topology.sections.filter(section => !road || section.road === road).length,
  }
}
