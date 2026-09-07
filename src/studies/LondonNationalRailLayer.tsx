import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { MapBoundary } from '@motionstudies/core/domain/boundary'
import type { NetworkProjection } from '@motionstudies/three/NationalNetworkScene'
import { cachedRailPath, railPosition } from '../data/national-rail-geometry.ts'
import type { NationalRailSnapshot } from '../data/national-rail.ts'

export interface NationalRailSceneExtension {
  readonly nationalRailSnapshot?: NationalRailSnapshot
  readonly nationalRailSelectedId?: string
}

function setRailPickId(geometry: THREE.BufferGeometry, index: number, id: string | undefined) {
  geometry.userData.londonRailIds[index] = id
}

/** A London-only geographic overlay, sharing the host projection and playback clock. */
export function LondonNationalRailLayer({ snapshot, boundary, projection, time, isPlaying, playbackRate, windowStart, windowEnd, selectedId, subdued = false }: {
  snapshot: NationalRailSnapshot; boundary: MapBoundary; projection: NetworkProjection
  time: number; isPlaying: boolean; playbackRate: number; windowStart: number; windowEnd: number
  selectedId?: string; subdued?: boolean
}) {
  const localTime = useRef(time)
  const resources = useMemo(() => {
    const prepare = (path: NonNullable<NationalRailSnapshot['paths']>[number]) =>
      cachedRailPath(path, boundary, snapshot.fadeKilometres)
    const paths = snapshot.paths!.map(prepare)
    const corridor = snapshot.corridorPaths.map(prepare)
    const color = new THREE.Color('#ffd392')
    const trackPositions: number[] = [], trackColors: number[] = []
    const project = (point: readonly number[], height = 0.11) => [
      (point[0] - projection.centreLongitude) * projection.longitudeScale * projection.scale,
      height, -(point[1] - projection.centreLatitude) * projection.scale,
    ]
    for (const path of corridor) for (let i = 1; i < path.points.length; i++) {
      const a = path.points[i - 1], b = path.points[i]
      if (a[2] + b[2] <= 0) continue
      trackPositions.push(...project(a, 0.08), ...project(b, 0.08))
      for (const point of [a, b]) trackColors.push(color.r * point[2], color.g * point[2], color.b * point[2])
    }
    const tracks = new THREE.BufferGeometry()
    tracks.setAttribute('position', new THREE.Float32BufferAttribute(trackPositions, 3))
    tracks.setAttribute('color', new THREE.Float32BufferAttribute(trackColors, 3))
    const vehicles = new THREE.BufferGeometry(), trails = new THREE.BufferGeometry()
    vehicles.userData.londonRailIds = []
    for (const [geometry, capacity] of [[vehicles, snapshot.trains.length * 3], [trails, snapshot.trains.length * 18]] as const) {
      geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(capacity), 3).setUsage(THREE.DynamicDrawUsage))
      geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(capacity), 3).setUsage(THREE.DynamicDrawUsage))
      geometry.setDrawRange(0, 0)
    }
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64
    const context = canvas.getContext('2d')!
    const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32)
    gradient.addColorStop(0, 'white'); gradient.addColorStop(0.24, 'rgba(255,255,255,0.95)'); gradient.addColorStop(0.5, 'rgba(255,255,255,0.35)'); gradient.addColorStop(1, 'rgba(255,255,255,0)')
    context.fillStyle = gradient; context.fillRect(0, 0, 64, 64)
    const glow = new THREE.CanvasTexture(canvas)
    return { paths, tracks, vehicles, trails, project, color, glow }
  }, [snapshot, boundary, projection])
  useEffect(() => { localTime.current = time }, [time])
  useEffect(() => () => {
    resources.tracks.dispose(); resources.vehicles.dispose(); resources.trails.dispose(); resources.glow.dispose()
  }, [resources])
  useFrame((_, delta) => {
    if (isPlaying) {
      localTime.current += delta * playbackRate
      if (localTime.current > windowEnd) localTime.current = windowStart
    }
    const { vehicles, trails, paths, project, color } = resources
    const positions = vehicles.getAttribute('position'), colors = vehicles.getAttribute('color')
    const trailPositions = trails.getAttribute('position'), trailColors = trails.getAttribute('color')
    let active = 0, segments = 0
    for (const train of snapshot.trains) {
      const point = railPosition(train, localTime.current, snapshot, paths)
      if (!point || point[2] <= 0.001) continue
      const intensity = (selectedId ? train.id === selectedId ? 1 : 0.15 : subdued ? 0.18 : 1)
      positions.setXYZ(active, ...project(point) as [number, number, number])
      setRailPickId(vehicles, active, point[2] * intensity >= 0.1 ? train.id : undefined)
      colors.setXYZ(active, color.r * point[2] * intensity, color.g * point[2] * intensity, color.b * point[2] * intensity)
      active++
      let previous = point
      for (let step = 1; step <= 3; step++) {
        const next = railPosition(train, localTime.current - step * 8, snapshot, paths)
        if (!next) break
        for (const p of [previous, next]) {
          trailPositions.setXYZ(segments, ...project(p) as [number, number, number])
          const weight = p[2] * intensity * (1 - step / 4)
          trailColors.setXYZ(segments++, color.r * weight, color.g * weight, color.b * weight)
        }
        previous = next
      }
    }
    for (const attribute of [positions, colors, trailPositions, trailColors]) attribute.needsUpdate = true
    vehicles.setDrawRange(0, active); trails.setDrawRange(0, segments)
  })
  return <group>
    <lineSegments geometry={resources.tracks} renderOrder={5}>
      <lineBasicMaterial vertexColors transparent opacity={subdued ? 0.12 : 0.5} blending={THREE.AdditiveBlending} depthTest={false} depthWrite={false} toneMapped={false} fog={false} />
    </lineSegments>
    <lineSegments geometry={resources.trails} frustumCulled={false} renderOrder={10}>
      <lineBasicMaterial vertexColors transparent opacity={0.55} blending={THREE.AdditiveBlending} depthTest={false} depthWrite={false} toneMapped={false} fog={false} />
    </lineSegments>
    <points geometry={resources.vehicles} frustumCulled={false} renderOrder={11}>
      <pointsMaterial vertexColors map={resources.glow} size={17} sizeAttenuation={false} transparent opacity={0.23} blending={THREE.AdditiveBlending} depthTest={false} depthWrite={false} toneMapped={false} fog={false} />
    </points>
    <points geometry={resources.vehicles} frustumCulled={false} renderOrder={12}>
      <pointsMaterial vertexColors map={resources.glow} size={7} sizeAttenuation={false} transparent opacity={1} blending={THREE.AdditiveBlending} depthTest={false} depthWrite={false} toneMapped={false} fog={false} />
    </points>
  </group>
}
