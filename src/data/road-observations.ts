import type { NationalRoadStudySnapshot, NationalRoadSiteValue } from '@motionstudies/core/domain/road-day'

/** WebTRIS values describe the preceding interval, not an instantaneous reading. */
export function roadInterval(snapshot: NationalRoadStudySnapshot | undefined, time: number) {
  if (!snapshot || time < 0 || time > 86400) return undefined
  const interval = snapshot.minutes.find(([end]) => end > time || (time === 86400 && end === time))
  if (!interval || time < interval[0] - snapshot.metadata.sampleIntervalSeconds) return undefined
  return interval
}

export function observedRoadSnapshot(snapshot: NationalRoadStudySnapshot | undefined, time: number): NationalRoadStudySnapshot | undefined {
  if (!snapshot) return undefined
  const interval = roadInterval(snapshot, time)
  const sites = new Set(interval?.[1].map(value => value[0]))
  return {
    ...snapshot,
    // One measured interval: no interpolation towards missing readings or across chunk gaps.
    minutes: interval ? [interval] : [],
    sections: interval ? snapshot.sections.filter(section => sites.has(section.fromSiteIndex) && sites.has(section.toSiteIndex)) : [],
  }
}

export function measuredSpeedMph(values: readonly NationalRoadSiteValue[]): number | undefined {
  let flow = 0
  let speedTotal = 0
  for (const value of values) {
    flow += value[1] + value[3]
    speedTotal += value[1] * value[2] + value[3] * value[4]
  }
  return flow > 0 ? speedTotal / flow / 1.60934 : undefined
}

export function roadSpeedColor(mph: number): string {
  return mph < 30 ? '#ff7384' : mph < 50 ? '#ffc46b' : '#7fddd0'
}
