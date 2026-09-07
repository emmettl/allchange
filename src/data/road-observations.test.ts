import { describe, expect, it } from 'vitest'
import type { NationalRoadStudySnapshot } from '@motionstudies/core/domain/road-day'
import type { RoadTopologySnapshot } from '@motionstudies/core/domain/road'
import manifest from '../../public/data/all-change-road-day-manifest.json'
import topologyFixture from '../../public/data/all-change-road-topology.json'
import { roadObservationSummary } from './road-summary.ts'
import { measuredSpeedMph, observedRoadSnapshot, roadInterval } from './road-observations.ts'

const snapshot: NationalRoadStudySnapshot = {
  metadata: { ...manifest.metadata, measurementKind: 'recorded' },
  siteIds: ['a', 'b', 'c'],
  sections: [
    { id: 'ab', road: 'M1', direction: 'positive', fromSiteIndex: 0, toSiteIndex: 1, distanceKm: 1 },
    { id: 'bc', road: 'M1', direction: 'positive', fromSiteIndex: 1, toSiteIndex: 2, distanceKm: 1 },
  ],
  minutes: [
    [900, [[0, 100, 80, 0, 80], [1, 300, 40, 0, 40]]],
    [1800, [[0, 0, 0, 0, 0], [1, 300, 80, 0, 80], [2, 100, 80, 0, 80]]],
    [3600, [[0, 100, 80, 0, 80]]],
    [86400, [[0, 100, 80, 0, 80]]],
  ],
}
const sourceTopology = topologyFixture as unknown as RoadTopologySnapshot
const topology: RoadTopologySnapshot = {
  ...sourceTopology,
  sites: ['a', 'b', 'c'].map(id => ({ ...sourceTopology.sites[0], id, match: { ...sourceTopology.sites[0].match, road: 'M1' } })),
  sections: ['ab', 'bc'].map(id => ({ ...sourceTopology.sections[0], id, road: 'M1' })),
}

describe('recorded road intervals', () => {
  it('uses the preceding measured interval with exact quarter-hour boundaries', () => {
    expect(roadInterval(snapshot, 0)?.[0]).toBe(900)
    expect(roadInterval(snapshot, 899)?.[0]).toBe(900)
    expect(roadInterval(snapshot, 900)?.[0]).toBe(1800)
    expect(roadInterval(snapshot, 86400)?.[0]).toBe(86400)
    expect(roadInterval(snapshot, 86401)).toBeUndefined()
  })

  it('does not extend observations through a missing interval or across a chunk boundary', () => {
    expect(observedRoadSnapshot(snapshot, 1800)?.sections).toEqual([])
    expect(observedRoadSnapshot(snapshot, 1800)?.minutes).toEqual([])
    expect(roadInterval({ ...snapshot, minutes: snapshot.minutes.slice(0, 1) }, 900)).toBeUndefined()
  })

  it('animates only sections with both endpoints and retains genuine zero-flow observations', () => {
    expect(observedRoadSnapshot(snapshot, 450)?.sections.map(section => section.id)).toEqual(['ab'])
    expect(observedRoadSnapshot(snapshot, 450)?.minutes).toEqual([snapshot.minutes[0]])
    expect(observedRoadSnapshot(snapshot, 900)?.sections.map(section => section.id)).toEqual(['ab', 'bc'])
  })

  it('reports flow per detector rather than adding repeated vehicles along the road', () => {
    const summary = roadObservationSummary(snapshot, topology, 450, 'M1')!
    expect(summary).toMatchObject({ reportingSites: 2, candidateSites: 3, availableSections: 1, candidateSections: 2, meanFlowPerHour: 200 })
    expect(summary.speedMph).toBeCloseTo(50 / 1.60934)
    expect(roadObservationSummary(snapshot, topology, 2000, 'M1')?.speedMph).toBeUndefined()
    expect(measuredSpeedMph([[0, 0, 0, 0, 0]])).toBeUndefined()
  })
})
