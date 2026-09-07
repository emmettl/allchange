/** Narrow adapters for the pinned renderer; shared package files stay untouched. */
export function londonMotionRenderer() {
  return {
    name: 'london-motion-performance',
    enforce: 'pre' as const,
    transform(source: string, id: string) {
      const moduleId = id.split('?')[0]
      if (moduleId.endsWith('/@motionstudies/three/network-paths.js')) {
        // This endpoint lookup runs for every vehicle and every trail sample.
        const hook = 'const last = path.points.at(-1);'
        if (source.split(hook).length !== 2) throw new Error('London path lookup needs review')
        return { code: source.replace(hook, 'const last = path.points[path.points.length - 1];'), map: null }
      }
      if (moduleId.endsWith('/@motionstudies/three/train-labels.js')) {
        const hook = "first.id.localeCompare(second.id, 'de-CH', { numeric: true })"
        if (source.split(hook).length !== 2) throw new Error('London label comparator needs review')
        return { code: "const londonLabelCollator = new Intl.Collator('de-CH', { numeric: true });\n"
          + source.replace(hook, 'londonLabelCollator.compare(first.id, second.id)'), map: null }
      }
      if (!moduleId.endsWith('/@motionstudies/three/NationalNetworkScene.js')) return
      let code = source
      const replace = (before: string, after: string) => {
        if (code.split(before).length !== 2) throw new Error(`London motion renderer needs review: ${before}`)
        code = code.replace(before, after)
      }
      replace("import { positionForTrain, } from '@motionstudies/core/domain/network';",
        'import { indexedPositionForTrain as positionForTrain } from "/src/data/network-motion.ts";')
      replace('const position = positionForTrain(train, time);',
        `if (train.category === 'bus') {
        const cached = cachedBusPosition(train, time, projectedStops, projectedPaths);
        if (cached) return cached;
    }
    const position = positionForTrain(train, time);`)
      // Resolve the zoom thresholds once per frame instead of once per vehicle.
      for (const [start, end] of [
        ['function TrainSwarm(', 'function VehicleTrails('],
        ['function VehicleTrails(', 'function SelectedTrainMarker('],
      ]) {
        const from = code.indexOf(start), to = code.indexOf(end, from)
        if (from < 0 || to < 0) throw new Error('London motion loop needs review')
        let section = code.slice(from, to)
        const loop = 'for (const train of trainsNearTime(trainTimeIndex, localTime.current)) {'
        const camera = start.includes('TrainSwarm') ? 'state.camera' : 'camera'
        if (section.split(loop).length !== 2) throw new Error('London motion loop needs review')
        section = section.replace(loop, `const visibleBus = vehicleIsVisibleAtZoom('bus', ${camera}.position.y, cameraFraming);
        const visibleTram = vehicleIsVisibleAtZoom('tram', ${camera}.position.y, cameraFraming);
        ${loop}`)
        const visibility = start.includes('TrainSwarm')
          ? 'vehicleIsVisibleAtZoom(train.category, state.camera.position.y, cameraFraming, focused)'
          : 'vehicleIsVisibleAtZoom(train.category, camera.position.y, cameraFraming, Boolean(selectedTrain || selectedRoute || selectedCategory || selectedStation))'
        const focus = start.includes('TrainSwarm') ? 'focused' : 'Boolean(selectedTrain || selectedRoute || selectedCategory || selectedStation)'
        if (section.split(visibility).length !== 2) throw new Error('London motion visibility needs review')
        section = section.replace(visibility, `(${focus} || (train.category === 'bus' ? visibleBus : train.category === 'tram' ? visibleTram : true))`)
        code = code.slice(0, from) + section + code.slice(to)
      }
      // Upload only populated prefixes of buffers sized for the whole time chunk.
      replace("mutableGeometry.getAttribute('position').needsUpdate = true;\n            mutableGeometry.getAttribute('color').needsUpdate = true;",
        `for (const name of ['position', 'color']) {
                const attribute = mutableGeometry.getAttribute(name);
                attribute.clearUpdateRanges();
                if (activeCounts[kind]) { attribute.addUpdateRange(0, activeCounts[kind] * 3); attribute.needsUpdate = true; }
            }`)
      replace("geometry.getAttribute('position').needsUpdate = true;\n            geometry.getAttribute('color').needsUpdate = true;",
        `for (const name of ['position', 'color']) {
                const attribute = geometry.getAttribute(name);
                attribute.clearUpdateRanges();
                if (segmentCounts[index]) { attribute.addUpdateRange(0, segmentCounts[index] * 6); attribute.needsUpdate = true; }
            }`)
      return { code: 'import { cachedBusPosition } from "/src/data/bus-motion.ts";\n' + code, map: null }
    },
  }
}
