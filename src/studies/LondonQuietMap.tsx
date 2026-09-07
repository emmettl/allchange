import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { NetworkProjection } from '@motionstudies/three/NationalNetworkScene'

export interface QuietMapSceneExtension {
  readonly quietMap?: boolean
}

const SCRAPS = [
  { latitude: 51.57, radius: 0.007, duration: 113, phase: 0.22 },
  { latitude: 51.51, radius: 0.005, duration: 149, phase: 0.53 },
  { latitude: 51.44, radius: 0.006, duration: 179, phase: 0.78 },
] as const

const ROUTES = [
  [[12, 42], [12, 27], [26, 13], [39, 13], [50, 24], [50, 39], [38, 51], [25, 51], [16, 42], [16, 32], [29, 19], [37, 19], [44, 26], [44, 36], [34, 46], [27, 46]],
  [[10, 30], [23, 30], [39, 46], [46, 46], [53, 39], [53, 29], [37, 13], [29, 13], [20, 22], [20, 39], [31, 50], [38, 50]],
  [[23, 10], [23, 22], [44, 43], [44, 50]],
  [[12, 39], [23, 39], [43, 19], [51, 19]],
] as const
const COLORS = ['#89dce5', '#aa96c5', '#cabda7', '#cabda7', '#d5dce3']
const WEST = -0.49
const SPAN = 0.78

/** Small route tangles in the same geographic world as the tracks and Thames. */
export function LondonQuietMap({ projection, isPlaying }: {
  readonly projection: NetworkProjection
  readonly isPlaying: boolean
}) {
  const elapsed = useRef(0)
  const arrival = useRef(0)
  const reducedMotion = useRef(window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => { reducedMotion.current = media.matches }
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  const resources = useMemo(() => {
    const routes = ROUTES.map(points => new THREE.BufferGeometry().setFromPoints(
      points.map(([x, y]) => new THREE.Vector3((x - 32) / 24, (32 - y) / 24, 0)),
    ))
    const ring = new THREE.BufferGeometry().setFromPoints(Array.from({ length: 24 }, (_, i) => {
      const angle = i / 24 * Math.PI * 2
      return new THREE.Vector3(Math.cos(angle) * 0.09, Math.sin(angle) * 0.09, 0)
    }))
    const scraps = SCRAPS.map((_, index) => {
      const group = new THREE.Group()
      group.name = `london-quiet-scrap-${index}`
      const materials = COLORS.map(color => new THREE.LineBasicMaterial({
        color, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, fog: false,
      }))
      routes.forEach((geometry, routeIndex) => {
        const route = new THREE.Group()
        // Intersecting planes give the diagram fragments a little volume.
        route.rotation.set(routeIndex * 0.32, (routeIndex - 1) * 0.7, 0)
        route.add(new THREE.Line(geometry, materials[routeIndex]))
        const [x, y] = ROUTES[routeIndex][2]
        const station = new THREE.LineLoop(ring, materials[4])
        station.position.set((x - 32) / 24, (32 - y) / 24, 0)
        route.add(station)
        group.add(route)
      })
      return { group, materials }
    })
    return { scraps, routes, ring }
  }, [])

  useEffect(() => () => {
    resources.routes.forEach(geometry => geometry.dispose())
    resources.ring.dispose()
    resources.scraps.forEach(scrap => scrap.materials.forEach(material => material.dispose()))
  }, [resources])

  useFrame((_, delta) => {
    const step = Math.min(delta, 0.1)
    arrival.current += step
    if (isPlaying && !reducedMotion.current) elapsed.current += step
    const fadeIn = reducedMotion.current ? 1 : Math.min(1, arrival.current / 1.8)
    resources.scraps.forEach(({ group, materials }, index) => {
      const scrap = SCRAPS[index]
      const progress = (scrap.phase + elapsed.current / scrap.duration) % 1
      const longitude = WEST + SPAN * progress
      const latitude = scrap.latitude + Math.sin(progress * Math.PI * 4 + index) * 0.006
      const radius = scrap.radius * projection.scale
      group.position.set(
        (longitude - projection.centreLongitude) * projection.longitudeScale * projection.scale,
        radius + 0.08 + Math.abs(Math.sin(progress * Math.PI * 8)) * radius * 0.16,
        -(latitude - projection.centreLatitude) * projection.scale,
      )
      group.scale.setScalar(radius)
      // Roll according to distance on the map, independent of camera or zoom.
      group.rotation.set(0.2 + Math.sin(progress * Math.PI * 4) * 0.25, index * 0.8,
        -(SPAN * progress * projection.longitudeScale) / scrap.radius)
      const fade = Math.min(1, progress / 0.08, (1 - progress) / 0.08) * fadeIn
      materials.forEach(material => { material.opacity = 0.55 * fade })
    })
  })

  return <group name="london-quiet-map">
    {resources.scraps.map(({ group }) => <primitive key={group.name} object={group} />)}
  </group>
}
