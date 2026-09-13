import type { RoadOverlayProps } from '@motionstudies/three/scene-extensions'
import { LondonRoadLabels } from './LondonRoadLabels.tsx'
import { LondonRoadSpeeds } from './LondonRoadSpeeds.tsx'

export function LondonRoadOverlay(props: RoadOverlayProps) {
  return <><LondonRoadLabels {...props} /><LondonRoadSpeeds {...props} /></>
}
