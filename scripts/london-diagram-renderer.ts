// A narrow compatibility adapter for the pinned alpha.2 renderer, which has
// no public station-marker slot yet. Transform at build time; never modify or
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
      return { code: 'import { LondonDiagramStations } from "/src/studies/LondonDiagramStations.tsx";\nimport { londonDiagramSegmentKey, londonDiagramOrderedPoints } from "/src/editions/london-diagram-markers.ts";\n' + code, map: null }
    },
  }
}
