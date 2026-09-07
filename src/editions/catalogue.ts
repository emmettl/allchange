import type { MotionStudyIdentity } from '@motionstudies/core/edition'

export type MotionStudyStatus = 'released' | 'foundation' | 'planned'

export interface MotionStudyCatalogueEntry extends MotionStudyIdentity {
  readonly status: MotionStudyStatus
}

export const ALL_CHANGE_STUDY = {
  series: 'Motion Studies',
  catalogueNumber: '006',
  title: 'All Change',
  placeName: 'London',
  descriptor: 'A London motion study',
  status: 'foundation',
} as const satisfies MotionStudyCatalogueEntry

export function motionStudyMark(identity: MotionStudyIdentity): string {
  return `${identity.series.toUpperCase()} · ${identity.catalogueNumber}`
}
