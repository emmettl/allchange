import type { Plugin } from 'vite'

/** Bind picking to the pinned renderer's populated buffers and visible sprites. */
export function londonSelectionRenderer(): Plugin {
  return {
    name: 'london-selection', enforce: 'pre',
    transform(source, id) {
      if (id.split('?')[0].replaceAll('\\', '/').endsWith('/@motionstudies/three/AirTrafficLayer.js')) {
        let code = source
        for (const [before, after] of [
          ['ref: marker, position: position, renderOrder: 19,', 'ref: marker, position: position, renderOrder: 19, userData: { londonAirport: airport },'],
          ['ref: label, renderOrder: 30,', 'ref: label, renderOrder: 30, userData: { londonAirport: airport },'],
          ['const aircraftRef = useRef(currentAircraft(snapshot, time, projection));', 'const { scene, camera, gl } = useThree();\n    const aircraftRef = useRef(currentAircraft(snapshot, time, projection));'],
          ['onPointerDown: (event) => {\n                    if (event.instanceId === undefined)', 'onClick: (event) => {\n                    if (event.delta > 5 || pickMapTarget(scene, camera, gl.domElement.getBoundingClientRect(), event.clientX, event.clientY, event.pointerType === "touch", undefined, true)) return;\n                    if (event.instanceId === undefined)'],
        ]) {
          if (code.split(before).length !== 2) throw new Error(`London airport picking hook needs review: ${before}`)
          code = code.replace(before, after)
        }
        return { code: 'import { pickMapTarget } from "/src/studies/map-selection.ts";\n' + code, map: null }
      }
      if (!id.split('?')[0].replaceAll('\\', '/').endsWith('/@motionstudies/three/NationalNetworkScene.js')) return
      let code = source
      const replace = (before: string, after: string) => {
        if (code.split(before).length !== 2) throw new Error(`London selection hook needs review: ${before}`)
        code = code.replace(before, after)
      }
      const start = code.indexOf('function StationTapTarget(')
      const end = code.indexOf('function StationLabels(', start)
      if (start < 0 || end < 0) throw new Error('London selection component hook needs review')
      code = code.slice(0, start) + code.slice(end)
      replace('_jsx(StationTapTarget, { stations: props.stations, projectedStops: projectedStops, cameraFraming: props.cameraFraming, onSelectStation: props.airCategorySelected ? undefined : props.onSelectStation })',
        '_jsx(LondonMapSelection, { stations: props.stations, onSelectStation: props.onSelectStation, onSelectTrain: props.onSelectTrain, onSelectNationalRail: props.onSelectNationalRail, onSelectAirport: props.onSelectAirport, disabled: props.quietMap || props.airCategorySelected || props.roadCategorySelected })')
      replace('sprite.position.copy(label.position);',
        "sprite.position.copy(label.position);\n            sprite.userData.londonTarget = { kind: 'station', value: label.station };")
      replace('sprite.position.set(candidate.position[0], 0.76 + comparisonOffset, candidate.position[2]);',
        "sprite.position.set(candidate.position[0], 0.76 + comparisonOffset, candidate.position[2]);\n            sprite.userData.londonTarget = { kind: 'train', value: candidate.train };")
      replace('const offset = activeCounts[markerKind] * 3;',
        'const offset = activeCounts[markerKind] * 3;\n            (mutableGeometry.userData.londonTrains ??= [])[activeCounts[markerKind]] = train;')
      replace('mutableColors[offset] = color.r * intensity;',
        'if (intensity < 0.1) mutableGeometry.userData.londonTrains[activeCounts[markerKind]] = undefined;\n            mutableColors[offset] = color.r * intensity;')
      replace("geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));\n        return geometry;\n    }, [projectedStops]);",
        "geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));\n        geometry.userData.londonStops = projectedStops.map((_, index) => index);\n        return geometry;\n    }, [projectedStops]);")
      return { code: 'import { LondonMapSelection } from "/src/studies/LondonMapSelection.tsx";\n' + code, map: null }
    },
  }
}
