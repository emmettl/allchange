import type { Plugin } from 'vite'

/** Close-zoom geography fixes for the pinned renderer. Run after the existing
 * adapters; package upgrades must explicitly reconcile these checked hooks. */
export function londonCartographyRenderer(): Plugin {
  return {
    name: 'london-cartography', enforce: 'pre',
    transform(source, id) {
      if (!id.split('?')[0].replaceAll('\\', '/').endsWith('/@motionstudies/three/NationalNetworkScene.js')) return
      let code = source
      const replace = (before: string, after: string) => {
        if (code.split(before).length !== 2) throw new Error(`London cartography hook needs review: ${before}`)
        code = code.replace(before, after)
      }
      const section = (start: string, end: string, change: (source: string) => string) => {
        const from = code.indexOf(start), to = code.indexOf(end, from)
        if (from < 0 || to < 0) throw new Error('London cartography component needs review')
        code = code.slice(0, from) + change(code.slice(from, to)) + code.slice(to)
      }
      replace('return { structural, local };', 'compactMapLines(structural); compactMapLines(local);\n        return { structural, local };')
      replace('return { weighted, pulse };', 'compactMapLines(weighted); compactMapLines(pulse);\n        return { weighted, pulse };')
      // Fixed painter order for map surfaces; transparent strokes cannot write
      // depth and randomly cut out a later layer at a crossing.
      section('function RailGraph(', 'function diagramRibbonGeometry(', source => source
        .replaceAll('blending: THREE.AdditiveBlending })', 'blending: THREE.NormalBlending, depthTest: false, depthWrite: false, toneMapped: false })')
        .replaceAll('geometry: railGeometry.structural,', 'geometry: railGeometry.structural, renderOrder: 3,')
        .replaceAll('geometry: railGeometry.local,', 'geometry: railGeometry.local, renderOrder: 3,'))
      section('function TrafficFlowLayer(', 'function trainLightTexture(', source => source
        .replaceAll('blending: THREE.AdditiveBlending, depthWrite: false', 'blending: THREE.NormalBlending, depthTest: false, depthWrite: false')
        .replaceAll('renderOrder: 1,', 'renderOrder: 4,').replaceAll('renderOrder: 2,', 'renderOrder: 4,'))
      section('function VehicleTrails(', 'function SelectedTrainMarker(', source => source
        .replace('renderOrder: 3 + index,', 'renderOrder: 5,')
        .replace('blending: THREE.AdditiveBlending, depthWrite: false', 'blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false'))
      // Lay out stations first, then reserve those same screen rectangles for
      // vehicle labels. Paused label caches must respond when stations change.
      const train = '_jsx(TrainLabels, { ...props, projectedStops: projectedStops, projectedPaths: projectedPaths, trainTimeIndex: trainTimeIndex }), '
      replace(train, '')
      replace('_jsx(NetworkCamera, {', `${train}_jsx(NetworkCamera, {`)
      section('function StationLabels(', 'function createTrainLabelTexture(', source => source
        .replace('retainedStationNames.current.clear();\n            return;', 'retainedStationNames.current.clear();\n            stationLabelBoxes.set(camera, emptyLabelBoxes);\n            return;')
        .replace('if (!layoutTransitioning) {', 'stationLabelBoxes.set(camera, occupied);\n        if (!layoutTransitioning) {'))
      section('function TrainLabels(', 'function SelectedStationRouteLayer(', source => source
        .replace('const labelWork = labelFrameBudget.update(', 'const stationBoxes = stationLabelBoxes.get(camera) ?? emptyLabelBoxes;\n        const labelWork = labelFrameBudget.update(')
        .replace('localTime.current, delta, isPlaying, playbackRate);', 'localTime.current, delta, isPlaying, playbackRate, stationBoxes);')
        .replace('const occupied = [];', 'const occupied = [...stationBoxes];')
        .replace('sprite.visible = true;', 'sprite.visible = true;\n            sprite.renderOrder = candidate.selected ? 21 : MAP_LAYER.trainLabel;')
        .replace('const width = trainLabelScreenWidth(text, screenHeight);', 'const width = trainLabelScreenWidth(text, screenHeight) * 1.12;')
        .replace('top: candidate.y - screenHeight / 2,', 'top: candidate.y - screenHeight * (candidate.comparisonIndex < 0 ? 1.3 : 0.5),')
        .replace('bottom: candidate.y + screenHeight / 2,', 'bottom: candidate.y + screenHeight * (candidate.comparisonIndex < 0 ? -0.3 : 0.5),')
        .replace('projected.set(position[0], 0.76, position[2]);', 'projected.set(position[0], 0.085, position[2]);')
        .replace('sprite.position.set(candidate.position[0], 0.76 + comparisonOffset, candidate.position[2]);', 'sprite.position.set(candidate.position[0], 0.085 + comparisonOffset, candidate.position[2]);\n            sprite.center.set(0.5, candidate.comparisonIndex < 0 ? -0.3 : 0.5);'))
      return { code: 'import { compactMapLines, stationLabelBoxes, emptyLabelBoxes } from "/src/studies/map-cartography.ts";\n' + code, map: null }
    },
  }
}
