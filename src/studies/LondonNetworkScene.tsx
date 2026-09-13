import { FLAT_NETWORK_MAP_STYLE, type NetworkMapStyle } from '@motionstudies/three/scene-style'
import { lazy, Suspense, type ComponentType } from 'react'
import { NationalNetworkScene, type NationalNetworkSceneProps } from '@motionstudies/three/NationalNetworkScene'
import { useNetworkScene, type NetworkSceneExtensions } from '@motionstudies/three/scene-extensions'
import { cachedBusPosition } from '../data/bus-motion.ts'
import { nationalRoadConditionsAtTime } from './road-conditions.ts'
import type { QuietMapSceneExtension } from './LondonQuietMap.tsx'
import type { NationalRailSceneExtension } from './LondonNationalRailLayer.tsx'
import type { MapSelectionSceneExtension } from './LondonMapSelection.tsx'

const LondonQuietMap = lazy(() => import('./LondonQuietMap.tsx').then(module => ({ default: module.LondonQuietMap })))
const LondonNationalRailLayer = lazy(() => import('./LondonNationalRailLayer.tsx').then(module => ({ default: module.LondonNationalRailLayer })))
const mapStyle: NetworkMapStyle = { ...FLAT_NETWORK_MAP_STYLE,
  trainLabels: { ...FLAT_NETWORK_MAP_STYLE.trainLabels, routeTextCategories: ['metro'] } }
const extensions: NetworkSceneExtensions = {
  trainPosition: (train, time, stops, paths) => train.category === 'bus' ? cachedBusPosition(train, time, stops, paths) : undefined,
  roadConditions: nationalRoadConditionsAtTime,
}
// Picking metadata remains in the existing edition adapter until its visual policy migrates.
const Scene = NationalNetworkScene as ComponentType<NationalNetworkSceneProps & MapSelectionSceneExtension>
type Props = NationalNetworkSceneProps & NationalRailSceneExtension & QuietMapSceneExtension & MapSelectionSceneExtension

function LondonLayers({ quietMap, quietDiagramSnapshot, nationalRailSnapshot, nationalRailSelectedId }: NationalRailSceneExtension & QuietMapSceneExtension) {
  const { props, projection } = useNetworkScene()
  return <>
    {quietMap && <Suspense fallback={null}><LondonQuietMap projection={projection} isPlaying={props.isPlaying}
      diagramSnapshot={quietDiagramSnapshot} spatialLayout={props.spatialLayout} spatialLayoutMix={props.spatialLayoutMix} /></Suspense>}
    {nationalRailSnapshot && props.boundary && (props.spatialLayoutMix ?? 0) === 0 && <Suspense fallback={null}>
      <LondonNationalRailLayer snapshot={nationalRailSnapshot} boundary={props.boundary} projection={projection}
        time={props.time} isPlaying={props.isPlaying} playbackRate={props.playbackRate}
        windowStart={props.snapshot.metadata.windowStart} windowEnd={props.snapshot.metadata.windowEnd}
        selectedId={nationalRailSelectedId} subdued={Boolean(props.selectedTrain || props.selectedRoute || props.selectedStation || props.selectedCategory || props.airCategorySelected || props.roadCategorySelected)} />
    </Suspense>}
  </>
}

export function LondonNetworkScene({ quietMap, quietDiagramSnapshot, nationalRailSnapshot, nationalRailSelectedId, children, ...props }: Props) {
  return <Scene {...props} extensions={extensions} mapStyle={mapStyle}>
    <LondonLayers quietMap={quietMap} quietDiagramSnapshot={quietDiagramSnapshot}
      nationalRailSnapshot={nationalRailSnapshot} nationalRailSelectedId={nationalRailSelectedId} />
    {children}
  </Scene>
}
