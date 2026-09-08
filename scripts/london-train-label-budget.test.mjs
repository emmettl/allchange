import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import * as THREE from 'three'
import * as labels from '../node_modules/@motionstudies/three/train-labels.js'
import * as lod from '../node_modules/@motionstudies/three/regional-lod.js'
import { stationLabelWorldHeight } from '../node_modules/@motionstudies/three/station-labels.js'
import { LabelFrameBudget } from '../src/studies/label-frame-budget.ts'
import { londonDiagramRenderer } from './london-diagram-renderer.ts'
import { londonMotionRenderer } from './london-motion-renderer.ts'
import { londonPerformanceRenderer } from './london-performance-renderer.ts'

// Run the installed TrainLabels callback after both London transforms. Use real
// sprites/projection/collisions; stub React lifecycle and text rasterization.
function harness(source, camera, size) {
  let cursor = 0, effects = [], frame, searches = 0, samples = 0
  const slots = [], sprites = []
  const memo = (factory, deps) => {
    const i = cursor++
    if (!slots[i] || deps.some((dep, index) => dep !== slots[i].deps[index])) slots[i] = { value: factory(), deps }
    return slots[i].value
  }
  const bindings = {
    ...labels, ...lod, THREE, LabelFrameBudget, stationLabelWorldHeight,
    LakeAvoidingPathsContext: {}, useContext: () => undefined,
    useThree: () => ({ camera, size }), useMemo: memo,
    useRef: value => memo(() => ({ current: value }), []),
    useEffect: (effect, deps) => memo(() => { effects.push(effect) }, deps),
    useFrame: callback => { frame = callback },
    trainsNearTime: index => { searches++; return index },
    projectedTrainPosition: (train, time, stops) => {
      samples++
      return time < train.start || time > train.end ? undefined : [stops[0][0] + train.x + time * 0.001, 0.085, train.z]
    },
    trainLabelText: train => train.id,
    mixedRouteColor: () => '#ffffff',
    createTrainLabelTexture: (text, color) => {
      const texture = new THREE.Texture(); texture.name = `${text}:${color}`
      return { texture, aspect: 2 }
    },
    _Fragment: 'fragment', MAP_LAYER: { trainLabel: 20 },
    _jsx: (type, props, key) => {
      if (type === 'sprite') {
        const sprite = sprites[key] ??= new THREE.Sprite(new THREE.SpriteMaterial())
        props.ref(sprite)
      }
    },
  }
  const component = new Function(...Object.keys(bindings), `${source}; return TrainLabels;`)(...Object.values(bindings))
  return {
    render(props) { cursor = 0; effects = []; component(props); effects.forEach(effect => effect()) },
    frame() { frame({}, 1 / 60) },
    get searches() { return searches }, get samples() { return samples },
    output: () => sprites.filter(s => s.visible).map(s => ({ text: s.material.map.name, position: s.position.toArray(), scale: s.scale.toArray(), opacity: s.material.opacity })),
  }
}

it('bounds train searches while preserving movement, London zoom rules, palette and invalidation', () => {
  const id = '/node_modules/@motionstudies/three/NationalNetworkScene.js'
  let code = londonDiagramRenderer().transform(readFileSync(`.${id}`, 'utf8'), id).code
  code = londonMotionRenderer().transform(code, id).code
  const extract = code => code.slice(code.indexOf('function TrainLabels('), code.indexOf('function SelectedStationRouteLayer('))
  const originalSource = extract(code)
  code = londonPerformanceRenderer().transform(code, id).code
  const camera = new THREE.PerspectiveCamera(44, 16 / 9, 0.1, 100)
  camera.position.set(0, 8, 0); camera.lookAt(0, 0, 0); camera.updateMatrixWorld()
  const size = { width: 1280, height: 720 }
  const current = harness(extract(code), camera, size), original = harness(originalSource, camera, size)
  const trains = Array.from({ length: 100 }, (_, i) => ({ id: `Train ${i}`, category: 'metro', route: 'Central', start: 0, end: 10000, x: i === 0 ? 0 : 100 + i, z: 0 }))
  let props = { snapshot: { metadata: { windowStart: 0, windowEnd: 10000 } }, projectedStops: [[0, 0, 0]], trainTimeIndex: trains,
    trainLabelMode: 'on', isPlaying: true, playbackRate: 1, time: 100, cameraFraming: {}, routeColors: { Central: '#ff0000' } }
  const render = (changes = {}) => { props = { ...props, ...changes }; current.render(props); original.render(props) }
  const frame = () => { current.frame(); original.frame(); expect(current.output()).toEqual(original.output()) }
  render(); frame()
  const first = current.output()
  expect(first).toHaveLength(1)
  for (let i = 0; i < 60; i++) frame()
  expect(current.output()).not.toEqual(first)
  expect(current.searches).toBeLessThanOrEqual(11)
  expect(original.searches).toBe(61)
  expect(current.samples).toBeLessThan(original.samples / 4)
  render({ isPlaying: false }); frame()
  const pausedSamples = current.samples, pausedSearches = current.searches
  for (let i = 0; i < 20; i++) { render(); frame() }
  expect(current.samples).toBe(pausedSamples)
  expect(current.searches).toBe(pausedSearches)
  render({ time: 150 }); frame()
  expect(current.samples).toBeGreaterThan(pausedSamples)
  camera.position.y = 18; camera.updateMatrixWorld(); frame()
  expect(current.output()).toHaveLength(0) // London Tube labels require close zoom.
  camera.position.y = 8; camera.updateMatrixWorld(); frame()
  expect(current.output()).toHaveLength(1)
  render({ routeColors: { Central: '#00ff00' } }); frame()
  expect(current.output()[0].text).toContain('#00ff00')
  render({ projectedStops: [[0.1, 0, 0]], layoutTransitioning: true }); frame()
  render({ layoutTransitioning: false, selectedTrain: trains[1] }); frame()
  expect(current.output()).toHaveLength(0)
  render({ selectedTrain: undefined, trainLabelMode: 'off' }); frame()
  expect(current.output()).toHaveLength(0)
  render({ trainLabelMode: 'on' }); frame()
  size.width = 390; camera.aspect = size.width / size.height; camera.updateProjectionMatrix(); frame()
  render({ isPlaying: true, time: 0 }); frame()
})
