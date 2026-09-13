import { lazy, Suspense } from 'react'
import type { RoadOverlayProps } from '@motionstudies/three/scene-extensions'

const LondonRoadOverlay = lazy(() => import('./LondonRoadOverlay.tsx').then(module => ({ default: module.LondonRoadOverlay })))

/** Road decoration loads with road topology; suspension never hides the map. */
export function LondonLazyRoadOverlay(props: RoadOverlayProps) {
  return <Suspense fallback={null}><LondonRoadOverlay {...props} /></Suspense>
}
