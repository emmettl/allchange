import type { Plugin } from 'vite'

/** Temporary scene slot until the pinned renderer exposes edition-owned overlays. */
export function londonNationalRailRenderer(): Plugin {
  return {
    name: 'all-change-national-rail-renderer', enforce: 'pre',
    transform(source, id) {
      const moduleId = id.split('?')[0].replaceAll('\\', '/')
      if (moduleId.endsWith('/@motionstudies/three/HubPulseScene.js')) {
        let code = source
        for (const [before, after] of [
          ['return directions.flatMap(({ angle, flow }) => {', 'return directions.filter(({ flow }) => pulseFlowAllowed(call, flow)).flatMap(({ angle, flow }) => {'],
          ['const midpoint = (call.arrival + call.departure) / 2;\n            const cycleOffset = Math.round((localTime.current - midpoint) / cycle) * cycle;', 'const cycleOffset = pulseCycleOffset(call, localTime.current, cycle);'],
          ['const departure = call.departure + cycleOffset;', 'const departure = call.departure + cycleOffset;\n            if (!nationalRailPulseVisible(call, localTime.current, pulseHorizon)) return;'],
        ]) {
          if (code.split(before).length !== 2) throw new Error('The National Rail pulse hooks need review for this renderer version')
          code = code.replace(before, after)
        }
        return { code: 'import { pulseFlowAllowed, pulseCycleOffset, nationalRailPulseVisible } from "/src/editions/london-pulse.ts";\n' + code, map: null }
      }
      if (!moduleId.endsWith('/@motionstudies/three/NationalNetworkScene.js')) return
      const hook = '_jsx(VehicleTrails, { ...props,'
      if (source.split(hook).length !== 2) throw new Error('The National Rail scene slot needs review for this renderer version')
      return { code: 'import { LondonNationalRailLayer } from "/src/studies/LondonNationalRailLayer.tsx";\nimport { LondonQuietMap } from "/src/studies/LondonQuietMap.tsx";\n' + source.replace(hook,
        'props.quietMap && _jsx(LondonQuietMap, { projection, isPlaying: props.isPlaying }), ' +
        'props.nationalRailSnapshot && props.boundary && (props.spatialLayoutMix ?? 0) === 0 && _jsx(LondonNationalRailLayer, { snapshot: props.nationalRailSnapshot, boundary: props.boundary, projection, time: props.time, isPlaying: props.isPlaying, playbackRate: props.playbackRate, windowStart: props.snapshot.metadata.windowStart, windowEnd: props.snapshot.metadata.windowEnd, selectedId: props.nationalRailSelectedId, subdued: Boolean(props.selectedTrain || props.selectedRoute || props.selectedStation || props.selectedCategory || props.airCategorySelected || props.roadCategorySelected) }), ' + hook), map: null }
    },
  }
}
