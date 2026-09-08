import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import * as THREE from 'three'
import * as labelFunctions from '../node_modules/@motionstudies/three/station-labels.js'
import { StationLabelFrame } from '../src/studies/station-label-frame.ts'
import { londonStationLabelRankLimit } from '../src/editions/london-station-labels.ts'
import { londonDiagramRenderer } from './london-diagram-renderer.ts'
import { londonMotionRenderer } from './london-motion-renderer.ts'
import { londonPerformanceRenderer } from './london-performance-renderer.ts'

// Exercise the installed layout algorithm and real Three sprites. Only React's
// lifecycle and canvas text rasterization are stubbed; compare visible output
// with the same algorithm running on every frame.
function harness(source, camera, size) {
  let cursor = 0, effects = [], onFrame, layouts = 0
  const slots = [], sprites = []
  function memo(factory, deps) {
    const index = cursor++
    if (!slots[index] || deps.some((dep, i) => dep !== slots[index].deps[i])) {
      slots[index] = { value: factory(), deps }
    }
    return slots[index].value
  }
  const bindings = {
    ...labelFunctions, THREE, StationLabelFrame, londonStationLabelRankLimit,
    _Fragment: 'fragment', STATION_SURFACE_Y: 0.08, MAP_LAYER: { stationLabel: 19 },
    useThree: () => ({ camera, size }),
    useMemo: memo,
    useRef: value => memo(() => ({ current: value }), []),
    useEffect: (effect, deps) => memo(() => { effects.push(effect) }, deps),
    useFrame: frame => { onFrame = frame },
    stationCentre: (station, stops) => new THREE.Vector3(...stops[station.stopIndexes[0]]),
    stationLabelPriority: (...args) => { layouts++; return labelFunctions.stationLabelPriority(...args) },
    stationLabelTexture: name => {
      const texture = new THREE.Texture()
      texture.name = name
      return { texture, aspect: 3, anchorX: 0 }
    },
    _jsx: (type, props, key) => {
      if (type === 'sprite') {
        const sprite = sprites[key] ??= new THREE.Sprite(new THREE.SpriteMaterial())
        props.ref(sprite)
      }
    },
  }
  const component = new Function(...Object.keys(bindings), `${source}; return StationLabels;`)(...Object.values(bindings))
  return {
    render(props) { cursor = 0; effects = []; component(props); effects.forEach(effect => effect()) },
    frame() { onFrame({}, 1 / 60) },
    get layouts() { return layouts },
    output: () => sprites.filter(sprite => sprite.visible).map(sprite => ({
      name: sprite.material.map.name, position: sprite.position.toArray(), scale: sprite.scale.toArray(),
      center: sprite.center.toArray(), opacity: sprite.material.opacity,
    })),
  }
}

it('preserves station sprites across settling, pan, zoom, resize, selection and layout changes', () => {
  const id = '/node_modules/@motionstudies/three/NationalNetworkScene.js'
  let code = readFileSync(`.${id}`, 'utf8')
  for (const plugin of [londonDiagramRenderer(), londonMotionRenderer(), londonPerformanceRenderer()]) {
    code = plugin.transform(code, id).code
  }
  const source = code.slice(code.indexOf('function StationLabels('), code.indexOf('function createTrainLabelTexture('))
  const camera = new THREE.PerspectiveCamera(44, 16 / 9, 0.1, 100)
  camera.position.set(0, 18, 1)
  camera.lookAt(0, 0, 0)
  camera.updateMatrixWorld()
  const size = { width: 1280, height: 720 }
  const cached = harness(source, camera, size)
  const original = harness(source.replace('if (!stationLabelFrame.shouldUpdate(camera, size, canRepopulate, retainedStationNames.current)) return;', ''), camera, size)
  const stations = Array.from({ length: 80 }, (_, index) => ({
    name: `Station ${index}`, labelRank: index, trainIds: [], routes: [], stopIndexes: [index],
  }))
  let props = {
    stations, snapshot: { trains: [], stops: stations.map(station => [0, 0, station.name]) },
    projectedStops: stations.map((_, i) => [(i % 10 - 5) * 1.1, 0, (Math.floor(i / 10) - 4) * 1.2]),
    cameraFraming: { homeDistanceScale: 1 },
  }
  function render(changes = {}) {
    props = { ...props, ...changes }
    original.render(props); cached.render(props)
  }
  function frames(count = 20) {
    for (let i = 0; i < count; i++) {
      original.frame(); cached.frame()
      expect(cached.output()).toEqual(original.output())
    }
  }
  render(); frames()
  expect(cached.output().length).toBeGreaterThan(0)
  const cachedLayouts = cached.layouts, originalLayouts = original.layouts
  // Clock-driven React renders must preserve the guard and its sprites.
  for (let i = 0; i < 10; i++) { render(); frames(3) }
  expect(cached.layouts).toBe(cachedLayouts)
  expect(original.layouts).toBeGreaterThan(originalLayouts)
  for (let i = 0; i < 12; i++) {
    camera.position.x += 0.03
    camera.updateMatrixWorld()
    frames(1)
  }
  frames()
  camera.zoom = 1.8; camera.updateProjectionMatrix(); frames()
  size.width = 390; size.height = 844
  camera.aspect = size.width / size.height; camera.updateProjectionMatrix(); frames()
  render({ selectedStation: stations[44] }); frames()
  render({ hidden: true }); frames()
  expect(cached.output()).toHaveLength(0)
  render({ hidden: false, lineMapMix: 1, layoutTransitioning: true }); frames()
  render({ layoutTransitioning: false, selectedStation: undefined, tierLimit: 8 }); frames()
  render({ projectedStops: props.projectedStops.map(([x, y, z]) => [x + 1, y, z + 1]) }); frames()
})
