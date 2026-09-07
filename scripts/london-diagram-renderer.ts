// A narrow compatibility adapter for the pinned alpha.2 renderer, which has
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
      if (!id.split('?')[0].replaceAll('\\', '/').endsWith('/@motionstudies/three/NationalNetworkScene.js')) return
      const start = 'lineMapStyle && (_jsxs(_Fragment, { children: [_jsx("points", { geometry: diagramStationGeometries.stops,'
      const end = '!lineMapStyle && (_jsx("points", { geometry: diagramStationGeometries.interchanges,'
      const from = source.indexOf(start), to = source.indexOf(end, from)
      if (from < 0 || to < 0) throw new Error('The London diagram marker adapter needs review for this renderer version')
      let code = source.slice(0, from) + 'lineMapStyle && _jsx(LondonDiagramStations, { snapshot, projectedStops, projectedPaths, routeColors, opacity: routeColorMix * (subdued ? 0.48 : 0.98) }), ' + source.slice(to)
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
      // Opacity zero still submits geometry to WebGL. Keep these resources
      // mounted for a smooth return to Geography, but cull fully faded layers.
      for (const [before, after] of [
        ['position: [0, -0.072, 0], children:', 'position: [0, -0.072, 0], visible: opacityScale > 0, children:'],
        ['children: [geometry.ribbons.map', 'visible: opacity > 0, children: [geometry.ribbons.map'],
        ['children: tubes.map(({ id, glow, core })', 'visible: opacityScale > 0, children: tubes.map(({ id, glow, core })'],
        ['geometry: railGeometry.structural, children:', 'geometry: railGeometry.structural, visible: !lineMapStyle || routeColorMix < 1, children:'],
        ['geometry: railGeometry.local, children:', 'geometry: railGeometry.local, visible: !lineMapStyle || routeColorMix < 1, children:'],
        ['position: [0, 0.055, 0], children:', 'position: [0, 0.055, 0], visible: identityAttenuation > 0, children:'],
        ['geometry: stationGeometry, position:', 'geometry: stationGeometry, visible: !lineMapStyle || routeColorMix < 1, position:'],
      ]) {
        if (code.split(before).length !== 2) throw new Error(`London layer visibility hook needs review: ${before}`)
        code = code.replace(before, after)
      }
      // Flat ribbons need no separate back/front transparency passes.
      // More track between junctions: slim cores and restrained parallel lanes.
      for (const [before, after] of [
        ['color: color, transparent: true, opacity: opacity * (subdued ? 0.28 : 0.94)', 'color: color, side: THREE.DoubleSide, forceSinglePass: true, transparent: true, opacity: opacity * (subdued ? 0.28 : 0.94)'],
        ['color: "#050510", transparent: true, opacity: opacity * (subdued ? 0.52 : 0.96)', 'color: "#050510", side: THREE.DoubleSide, forceSinglePass: true, transparent: true, opacity: opacity * (subdued ? 0.52 : 0.96)'],
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
