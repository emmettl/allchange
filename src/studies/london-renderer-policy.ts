import { FLAT_NETWORK_MAP_STYLE, type NetworkMapStyle } from '@motionstudies/three/scene-style'
import type { NetworkSceneExtensions } from '@motionstudies/three/scene-extensions'
import { londonDiagramOrderedPoints, londonDiagramSegmentKey } from '../editions/london-diagram-markers.ts'
import { londonStationLabelRankLimit } from '../editions/london-station-labels.ts'
import { LondonDiagramStations } from './LondonDiagramStations.tsx'
import { LondonRoadOverlay } from './LondonRoadOverlay.tsx'
import { pickMapTarget } from './map-selection.ts'

export const londonMapStyle: NetworkMapStyle = {
  ...FLAT_NETWORK_MAP_STYLE,
  vehicleElevation: 0.085,
  trailElevationOffset: -0.005,
  diagram: { laneSpacing: 0.11, casingWidth: 0.075, coreWidth: 0.04 },
  stationLabels: { rankLimit: londonStationLabelRankLimit, refreshInterval: 0.1 },
  trainLabels: { ...FLAT_NETWORK_MAP_STYLE.trainLabels, routeTextCategories: ['metro'], maxCameraHeight: { metro: 10 } },
  airports: { independent: true, labelRenderOrder: 30, fog: false },
  roads: {
    mainline: { color: '#a0a6b2', opacity: ({ selected, subdued }) => selected ? 0.25 : subdued ? 0.2 : 0.45, depthTest: false, toneMapped: false },
    connectors: { color: '#a0a6b2', opacity: ({ subdued }) => subdued ? 0.15 : 0.3, depthTest: false, toneMapped: false },
    selected: { color: '#a0a6b2', opacity: 0.65 },
  },
}

export const londonRendererExtensions: NetworkSceneExtensions = {
  stationPicking: 'custom',
  DiagramStations: LondonDiagramStations,
  diagramSegmentKey: londonDiagramSegmentKey,
  diagramOrderedPoints: londonDiagramOrderedPoints,
  RoadOverlay: LondonRoadOverlay,
  aircraftPicking: {
    event: 'click',
    accepts: event => event.dragDistance <= 5 && !pickMapTarget(event.scene, event.camera,
      event.canvas.getBoundingClientRect(), event.clientX, event.clientY, event.touch, undefined, true),
  },
}
