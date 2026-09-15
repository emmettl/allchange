import { londonMapStyle as mapStyle } from '../src/studies/london-renderer-policy.ts'
import { setScenePickMetadata } from '@motionstudies/three/scene-picking'
import { trainLabelCollisionBox } from '@motionstudies/three/scene-style'
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import * as THREE from 'three'
import * as labels from '../node_modules/@motionstudies/three/train-labels.js'
import * as lod from '../node_modules/@motionstudies/three/regional-lod.js'
import { stationLabelWorldHeight } from '../node_modules/@motionstudies/three/station-labels.js'
import { LabelFrameBudget } from '../src/studies/label-frame-budget.ts'
import { stationLabelBoxes, emptyLabelBoxes } from '../src/studies/map-cartography.ts'

// Run the installed TrainLabels callback after both London transforms. Use real
// sprites/projection/collisions; stub React lifecycle and text rasterization.
function harness(source, camera, size) {
  let cursor = 0, effects = [], frame, searches = 0
  const slots = [], sprites = []
  // The shared motion layer schedules journeys on a frame budget; labels
  // read the position it draws from that table. Mirror its clock and fill the table before each frame.
  let motion, clock = 0, props = {}
  const place = () => {
    const trains = props.trainTimeIndex
    if (!motion || motion.trains !== trains) {
      motion = { trains, index: new Map(trains.map((train, i) => [train, i])), positions: new Float32Array(trains.length * 3),
        stamps: new Uint8Array(trains.length),
        displayed(i, _time, _stale, out) {
          if (this.stamps[i] !== 1) return false
          out[0] = this.positions[i * 3]; out[1] = this.positions[i * 3 + 1]; out[2] = this.positions[i * 3 + 2]
          return true
        } }
    }
    trains.forEach((train, i) => {
      const point = bindings.projectedTrainPosition(train, Math.min(clock, train.end), props.projectedStops)
      motion.stamps[i] = point ? 1 : 0
      if (point) motion.positions.set(point, i * 3)
    })
  }
  const memo = (factory, deps) => {
    const i = cursor++
    if (!slots[i] || deps.some((dep, index) => dep !== slots[i].deps[index])) slots[i] = { value: factory(), deps }
    return slots[i].value
  }
  const bindings = {
    ...labels, ...lod, THREE, LabelFrameBudget, stationLabelWorldHeight, stationLabelBoxes, emptyLabelBoxes,
    LakeAvoidingPathsContext: {}, useContext: () => undefined,
    useThree: () => ({ camera, size }), useMemo: memo,
    useRef: value => memo(() => ({ current: value }), []),
    useEffect: (effect, deps) => memo(() => { effects.push(effect) }, deps),
    useFrame: callback => { frame = callback },
    trainsNearTime: index => { searches++; return index },
    // Labels ask the motion layer how stale a drawn position may be; the stand-in table ignores it.
    motionStaleSeconds: () => 0,
    useMapStyle: () => mapStyle, trainLabelCollisionBox, setScenePickMetadata,
    useProjectedTrainPosition: () => bindings.projectedTrainPosition,
    projectedTrainPosition: (train, time, stops) => {
      return time < train.start || time > train.end ? undefined : [stops[0][0] + train.x + time * 0.001, 0.085, train.z]
    },
    trainLabelText: train => train.id,
    mixedRouteColor: () => '#ffffff',
    createTrainLabelTexture: (text, color) => {
      const texture = new THREE.Texture(); texture.name = `${text}:${color}`
      return { texture, aspect: 2 }
    },
    _Fragment: 'fragment', MAP_LAYER: { trainLabel: 16, stationLabel: 20 },
    _jsx: (type, props, key) => {
      if (type === 'sprite') {
        const sprite = sprites[key] ??= new THREE.Sprite(new THREE.SpriteMaterial())
        props.ref(sprite)
      }
    },
  }
  const component = new Function(...Object.keys(bindings), `${source}; return TrainLabels;`)(...Object.values(bindings))
  return {
    render(next) {
      if (next.time !== props.time) clock = next.time
      props = next; place()
      cursor = 0; effects = []; component({ ...props, motion }); effects.forEach(effect => effect())
    },
    frame() { if (props.isPlaying) clock += props.playbackRate / 60; place(); frame({}, 1 / 60) },
    get searches() { return searches },
    output: () => sprites.filter(s => s.visible).map(s => ({ text: s.material.map.name, position: s.position.toArray(), scale: s.scale.toArray(), opacity: s.material.opacity, order: s.renderOrder, center: s.center.toArray() })),
  }
}

it('bounds train searches while preserving movement, London zoom rules, palette and invalidation', () => {
  const id = '/node_modules/@motionstudies/three/NationalNetworkScene.js'
  let code = readFileSync(`.${id}`, 'utf8')
  const extract = code => code.slice(code.indexOf('function TrainLabels('), code.indexOf('function SelectedStationRouteLayer('))
  const originalSource = extract(code).replace(/const labelWork = labelFrameBudget\.update\([^;]+;/, "const labelWork = 'all';")
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
  render({ isPlaying: false }); frame()
  const pausedSearches = current.searches
  for (let i = 0; i < 20; i++) { render(); frame() }
  expect(current.searches).toBe(pausedSearches)
  render({ time: 150 }); frame()
  expect(current.searches).toBeGreaterThan(pausedSearches)
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

it('reserves station space at close zoom and releases it while paused without losing focused services', () => {
  const id = '/node_modules/@motionstudies/three/NationalNetworkScene.js'
  let code = readFileSync(`.${id}`, 'utf8')
  const source = code.slice(code.indexOf('function TrainLabels('), code.indexOf('function SelectedStationRouteLayer('))
  const camera = new THREE.PerspectiveCamera(44, 16 / 9, 0.1, 100)
  camera.position.set(0, 8, 1); camera.lookAt(0, 0, 0); camera.updateMatrixWorld()
  const current = harness(source, camera, { width: 1280, height: 720 })
  const train = { id: 'Central', category: 'metro', route: 'Central', start: 0, end: 10000, x: 0, z: 0 }
  const props = { snapshot: { metadata: { windowStart: 0, windowEnd: 10000 } }, projectedStops: [[0, 0, 0]], trainTimeIndex: [train],
    trainLabelMode: 'on', isPlaying: false, playbackRate: 1, time: 100, cameraFraming: {}, routeColors: { Central: '#ff0000' } }
  current.render(props); current.frame()
  expect(current.output()).toHaveLength(1)
  expect(current.output()[0].position[1]).toBe(0.085)
  expect(current.output()[0].center).toEqual([0.5, -0.3])
  stationLabelBoxes.set(camera, [{ left: 0, right: 1280, top: 0, bottom: 720 }])
  current.frame(); expect(current.output()).toHaveLength(0)
  const searches = current.searches
  current.frame(); expect(current.searches).toBe(searches)
  stationLabelBoxes.set(camera, emptyLabelBoxes)
  current.frame(); expect(current.output()).toHaveLength(1)
  stationLabelBoxes.set(camera, [{ left: 0, right: 1280, top: 0, bottom: 720 }])
  current.render({ ...props, selectedTrain: train }); current.frame()
  expect(current.output()).toHaveLength(1)
  expect(current.output()[0].order).toBe(21)
  stationLabelBoxes.delete(camera)
})
