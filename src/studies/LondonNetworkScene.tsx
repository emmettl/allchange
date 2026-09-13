import { londonMapStyle, londonRendererExtensions } from './london-renderer-policy.ts'
import { lazy, Suspense } from 'react'
import { NationalNetworkScene, type NationalNetworkSceneProps } from '@motionstudies/three/NationalNetworkScene'
import { useNetworkScene, type NetworkSceneExtensions } from '@motionstudies/three/scene-extensions'
import { cachedBusPosition } from '../data/bus-motion.ts'
import { nationalRoadConditionsAtTime } from './road-conditions.ts'
import type { QuietMapSceneExtension } from './LondonQuietMap.tsx'
import type { NationalRailSceneExtension } from './LondonNationalRailLayer.tsx'
import { LondonMapSelection, type MapSelectionSceneExtension } from './LondonMapSelection.tsx'

const LondonQuietMap = lazy(() => import('./LondonQuietMap.tsx').then(module => ({ default: module.LondonQuietMap })))
const LondonNationalRailLayer = lazy(() => import('./LondonNationalRailLayer.tsx').then(module => ({ default: module.LondonNationalRailLayer })))
const extensions: NetworkSceneExtensions = {
  ...londonRendererExtensions,
  trainPosition: (train, time, stops, paths) => train.category === 'bus' ? cachedBusPosition(train, time, stops, paths) : undefined,
  roadConditions: nationalRoadConditionsAtTime,
}
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
  return <NationalNetworkScene {...props} infrastructureSnapshot={props.referenceSnapshot} extensions={extensions} mapStyle={londonMapStyle}>
    <LondonLayers quietMap={quietMap} quietDiagramSnapshot={quietDiagramSnapshot}
      nationalRailSnapshot={nationalRailSnapshot} nationalRailSelectedId={nationalRailSelectedId} />
    <LondonMapSelection stations={props.stations} onSelectStation={props.onSelectStation}
      onSelectTrain={props.onSelectTrain} onSelectNationalRail={props.onSelectNationalRail}
      onSelectAirport={props.onSelectAirport} disabled={quietMap || props.airCategorySelected || props.roadCategorySelected} />
    {children}
  </NationalNetworkScene>
}
