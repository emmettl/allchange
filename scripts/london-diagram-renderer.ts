// A narrow compatibility adapter for the pinned alpha.4 renderer, which has
// no public station-marker slot or per-category label zoom setting yet.
// Transform at build time; never modify or
// vendor the installed package. Fail closed when an upstream release changes
// the expected hook so upgrades cannot silently lose the London treatment.
import type { Plugin } from 'vite'

export function londonDiagramRenderer(): Plugin {
  return {
    name: 'all-change-diagram-renderer',
    enforce: 'pre',
    transform(source, id) {
      const moduleId = id.split('?')[0].replaceAll('\\', '/')
      if (moduleId.endsWith('/@motionstudies/three/RoadTrafficLayer.js')) {
        const hook = 'topology && (_jsx(RoadTopology, { snapshot: topology, projection: projection, subdued: subdued, selectedRoadId: selectedRoadId }))'
        if (source.split(hook).length !== 2) throw new Error('The London road label adapter needs review for this renderer version')
        const selectedAxis = 'color: "#fff1cf", transparent: true, opacity: 0.92, blending: THREE.AdditiveBlending'
        if (source.split(selectedAxis).length !== 2) throw new Error('The London road speed context adapter needs review')
        // Geometry remains visible independently of observation coverage or selection.
        const roadAxis = 'color: "#ffb36b", transparent: true, opacity: selectedRoadId ? 0.008 : subdued ? 0.018 : 0.062, blending: THREE.AdditiveBlending, depthWrite: false'
        const connectors = 'color: "#bc8058", transparent: true, opacity: selectedRoadId ? 0.003 : subdued ? 0.008 : 0.018, depthWrite: false'
        if (source.split(roadAxis).length !== 2 || source.split(connectors).length !== 2) throw new Error('The London road baseline adapter needs review')
        return {
          code: 'import { LondonRoadLabels } from "/src/studies/LondonRoadLabels.tsx";\nimport { LondonRoadSpeeds } from "/src/studies/LondonRoadSpeeds.tsx";\n'
            + source.replace(selectedAxis, 'color: "#a0a6b2", transparent: true, opacity: 0.65, blending: THREE.AdditiveBlending')
              .replace(roadAxis, 'color: "#a0a6b2", transparent: true, opacity: selectedRoadId ? 0.25 : subdued ? 0.2 : 0.45, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, toneMapped: false')
              .replace(connectors, 'color: "#a0a6b2", transparent: true, opacity: subdued ? 0.15 : 0.3, depthTest: false, depthWrite: false, toneMapped: false')
              .replace(hook, `${hook}, topology && _jsx(LondonRoadLabels, { topology, projection, subdued, selectedRoadId }), topology && _jsx(LondonRoadSpeeds, { topology, snapshot: nationalSnapshot, projection, subdued, selectedRoadId })`),
          map: null,
        }
      }
      if (moduleId.endsWith('/@motionstudies/three/AirTrafficLayer.js')) {
        // Airport infrastructure belongs to the enabled Air layer, independently
        // of flight loading, category isolation, selection or vehicle labels.
        const markerStart = source.indexOf('function AirportMarker(')
        const markerEnd = source.indexOf('export function AirTrafficLayer(', markerStart)
        const airportMap = 'visibleAirports.map((airport) => (_jsx(AirportMarker, { airport: airport, projection: projection, showLabel: airportLabelsAreVisible(labelMode), selected: airport.id === selectedAirport?.id }, airport.id)))'
        if (markerStart < 0 || markerEnd < 0 || source.split(airportMap).length !== 2) {
          throw new Error('The London airport visibility adapter needs review for this renderer version')
        }
        const marker = source.slice(markerStart, markerEnd)
        const labelOrder = 'ref: label, renderOrder: 20,'
        if (marker.split(labelOrder).length !== 2) throw new Error('The London airport label priority hook needs review')
        return {
          code: (source.slice(0, markerStart) + marker
            .replace('function AirportMarker(', 'export function AirportMarker(')
            .replace(labelOrder, 'ref: label, renderOrder: 30,')
            .replaceAll('depthTest: false, depthWrite: false', 'depthTest: false, depthWrite: false, fog: false')
            + source.slice(markerEnd)).replace(airportMap, 'null'),
          map: null,
        }
      }
      if (!moduleId.endsWith('/@motionstudies/three/NationalNetworkScene.js')) return
      const start = 'lineMapStyle && (_jsxs(_Fragment, { children: [_jsx("points", { geometry: diagramStationGeometries.stops,'
      const end = '!lineMapStyle && (_jsx("points", { geometry: diagramStationGeometries.interchanges,'
      const from = source.indexOf(start), to = source.indexOf(end, from)
      if (from < 0 || to < 0) throw new Error('The London diagram marker adapter needs review for this renderer version')
      let code = source.slice(0, from) + 'lineMapStyle && _jsx(LondonDiagramStations, { snapshot, projectedStops, projectedPaths, routeColors, opacity: routeColorMix * (subdued ? 0.48 : 0.98) }), ' + source.slice(to)
      for (const [before, after] of [
        ["import { AirTrafficLayer } from './AirTrafficLayer.js';", "import { AirTrafficLayer, AirportMarker } from './AirTrafficLayer.js';"],
        ['props.airSnapshot && (_jsx(AirTrafficLayer,', 'props.airports?.map((airport) => _jsx(AirportMarker, { airport, projection, showLabel: true, selected: airport.id === props.selectedAirport?.id }, airport.id)), props.airSnapshot && (_jsx(AirTrafficLayer,'],
      ]) {
        if (code.split(before).length !== 2) throw new Error(`London airport scene hook needs review: ${before}`)
        code = code.replace(before, after)
      }
      // Timetable chunks contain only nearby journeys. Use the complete route
      // reference for infrastructure so overnight service gaps cannot erase it.
      // Traffic, vehicle playback and vehicle labels still use the live chunk.
      for (const [before, after] of [
        ['function RailGraph({ snapshot,', 'function RailGraph({ snapshot, infrastructureSnapshot = snapshot,'],
        ['_jsx(RailGraph, { snapshot: props.snapshot,', '_jsx(RailGraph, { snapshot: props.snapshot, infrastructureSnapshot: props.referenceSnapshot,'],
        ['_jsx(RouteIdentityLayer, { snapshot: snapshot,', '_jsx(RouteIdentityLayer, { snapshot: infrastructureSnapshot,'],
        ['_jsx(LondonDiagramStations, { snapshot,', '_jsx(LondonDiagramStations, { snapshot: infrastructureSnapshot,'],
      ]) {
        if (code.split(before).length !== 2) throw new Error(`London infrastructure hook needs review: ${before}`)
        code = code.replace(before, after)
      }
      const markersStart = code.indexOf('const diagramStationGeometries = useMemo(')
      const markersEnd = code.indexOf('}, [projectedStops, snapshot.stops, snapshot.trains]);', markersStart)
      if (markersStart < 0 || markersEnd < 0) throw new Error('The London infrastructure station hook needs review')
      code = code.slice(0, markersStart)
        + code.slice(markersStart, markersEnd).replaceAll('snapshot.trains', 'infrastructureSnapshot.trains')
        + code.slice(markersEnd).replace('}, [projectedStops, snapshot.stops, snapshot.trains]);', '}, [projectedStops, snapshot.stops, infrastructureSnapshot.trains]);')
      const identityStart = code.indexOf('function RouteIdentityLayer(')
      const identityEnd = code.indexOf('function TrafficFlowLayer(', identityStart)
      if (identityStart < 0 || identityEnd < 0 || code.slice(identityStart, identityEnd).split('const key = routeSegmentKey(train, index - 1);').length !== 3) {
        throw new Error('The London parallel-track adapter needs review for this renderer version')
      }
      const identity = code.slice(identityStart, identityEnd)
        .replaceAll('const key = routeSegmentKey(train, index - 1);',
          'const key = lineMapStyle ? londonDiagramSegmentKey(train, index - 1, projectedStops) : routeSegmentKey(train, index - 1);')
        .replace('offsetProjectedPath(points, laneOffset)', 'offsetProjectedPath(lineMapStyle ? londonDiagramOrderedPoints(points) : points, laneOffset)')
      code = code.slice(0, identityStart) + identity + code.slice(identityEnd)
      const stationRankHook = 'const rankLimit = stationLabelRankLimit(semanticHeight);'
      if (code.split(stationRankHook).length !== 2) {
        throw new Error('The London station label tier adapter needs review for this renderer version')
      }
      code = code.replace(stationRankHook, 'const rankLimit = londonStationLabelRankLimit(semanticHeight);')
      // Camera damping can keep resetting the settle timer long after a wheel
      // event. Refresh at least every 100 ms during motion; retained labels
      // still win collision checks, and layout morphs retain their own gate.
      for (const [before, after] of [
        ['const cameraStableSeconds = useRef(Number.POSITIVE_INFINITY);',
          'const cameraStableSeconds = useRef(Number.POSITIVE_INFINITY);\n    const labelRefreshSeconds = useRef(0);'],
        ['const canRepopulate = stationLabelsCanRepopulate(cameraStableSeconds.current, settleSeconds);',
          'labelRefreshSeconds.current += delta;\n        const canRepopulate = stationLabelsCanRepopulate(cameraStableSeconds.current, settleSeconds) || labelRefreshSeconds.current >= 0.1;\n        if (canRepopulate) labelRefreshSeconds.current = 0;'],
      ]) {
        if (code.split(before).length !== 2) throw new Error(`London station label refresh hook needs review: ${before}`)
        code = code.replace(before, after)
      }
      // Tube and DLR share the metro category. Require close zoom (about 4×
      // home) even for focused services and the explicit label-on mode.
      const labelHook = 'const arrivalOpacity = trainLabelArrivalOpacity(localTime.current, train.end, playbackRate);'
      if (code.split(labelHook).length !== 2) {
        throw new Error('The London train label zoom adapter needs review for this renderer version')
      }
      code = code.replace(labelHook,
        `if (train.category === 'metro' && semanticCameraHeight >= 10) continue;\n            ${labelHook}`)
      // Tube and DLR labels retain their line identity in both layouts.
      // Include the resolved colour in the cache key so a reused texture
      // cannot carry another line's colour or a previous layout's palette.
      for (const [before, after] of [
        ['function createTrainLabelTexture(label, color) {',
          "function createTrainLabelTexture(label, color, textColor = '#f8f7ff') {"],
        ["context.fillStyle = '#f8f7ff';\n        context.fillText(label, 56, 38);",
          'context.fillStyle = textColor;\n        context.fillText(label, 56, 38);'],
        ['const textureKey = `${candidate.train.category}:${text}`;',
          `const lineColor = candidate.train.category === 'metro' ? routeColors?.[candidate.train.route] : undefined;
            const labelColor = lineColor ?? mixedRouteColor(candidate.train.category, candidate.train.route, routeColors, routeColorMix);
            const textureKey = \`\${candidate.train.category}:\${labelColor}:\${text}\`;`],
        ['createTrainLabelTexture(text, mixedRouteColor(candidate.train.category, candidate.train.route, routeColors, routeColorMix))',
          'createTrainLabelTexture(text, labelColor, lineColor)'],
      ]) {
        if (code.split(before).length !== 2) throw new Error(`London train label colour hook needs review: ${before}`)
        code = code.replace(before, after)
      }
      // Keep vehicles just above the diagram track cores (y = 0.078),
      // reducing close-zoom parallax in Geography as well. Cover path,
      // detour and straight-line interpolation, including selected markers.
      const vehicleStart = code.indexOf('function projectedTrainPosition(')
      const vehicleEnd = code.indexOf('function NationalGround(', vehicleStart)
      const vehiclePosition = code.slice(vehicleStart, vehicleEnd)
      if (vehicleStart < 0 || vehicleEnd < 0 || vehiclePosition.split('0.2,').length !== 4) {
        throw new Error('The London vehicle height adapter needs review for this renderer version')
      }
      code = code.slice(0, vehicleStart) + vehiclePosition.replaceAll('0.2,', '0.085,') + code.slice(vehicleEnd)
      const trailHook = 'position: [0, -0.035, 0], children:'
      if (code.split(trailHook).length !== 2) {
        throw new Error('The London vehicle trail height adapter needs review for this renderer version')
      }
      code = code.replace(trailHook, 'position: [0, -0.005, 0], children:')
      // More track between junctions: slim cores and restrained parallel lanes.
      for (const [before, after] of [
        ['(lineMapStyle ? 0.24 : 0.11)', '(lineMapStyle ? 0.11 : 0.11)'],
        ['diagramRibbonGeometry(record.positions, 0.16, 0.072)', 'diagramRibbonGeometry(record.positions, 0.075, 0.072)'],
        ['diagramRibbonGeometry(record.positions, 0.1, 0.078)', 'diagramRibbonGeometry(record.positions, 0.04, 0.078)'],
      ]) {
        if (!code.includes(before)) throw new Error(`London diagram renderer hook missing: ${before}`)
        code = code.replace(before, after)
      }
      return { code: 'import { LondonDiagramStations } from "/src/studies/LondonDiagramStations.tsx";\nimport { londonDiagramSegmentKey, londonDiagramOrderedPoints } from "/src/editions/london-diagram-markers.ts";\nimport { londonStationLabelRankLimit } from "/src/editions/london-station-labels.ts";\n' + code, map: null }
    },
  }
}
