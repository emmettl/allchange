import { useEffect, useMemo } from 'react'
import type {} from '@react-three/fiber'
import * as THREE from 'three'
import type { NetworkSnapshot } from '@motionstudies/core/domain/network'
import { londonDiagramMarkers, type DiagramPoint } from '../editions/london-diagram-markers.ts'

/** Edition-owned markers plugged into the pinned scene's line-map layer. */
export function LondonDiagramStations({ snapshot, projectedStops, projectedPaths, routeColors, opacity }: {
  snapshot: NetworkSnapshot
  projectedStops: readonly DiagramPoint[]
  projectedPaths: readonly { points: readonly DiagramPoint[] }[]
  routeColors: Readonly<Record<string, string>>
  opacity: number
}) {
  const geometry = useMemo(() => {
    const positions: number[] = [], colors: number[] = [], rings: number[] = []
    const markers = londonDiagramMarkers(snapshot, projectedStops, projectedPaths)
    for (const marker of markers) {
      const [x, , z] = projectedStops[marker.stopIndex]
      if (marker.interchange) { rings.push(x, 0.14, z); continue }
      const [nx, nz] = marker.normal
      const halfBundle = (marker.routes.length - 1) * 0.055
      const from = -halfBundle, to = halfBundle + 0.20, halfWidth = 0.025
      const corners = [
        [x + nx * from - nz * halfWidth, z + nz * from + nx * halfWidth],
        [x + nx * from + nz * halfWidth, z + nz * from - nx * halfWidth],
        [x + nx * to + nz * halfWidth, z + nz * to - nx * halfWidth],
        [x + nx * to - nz * halfWidth, z + nz * to + nx * halfWidth],
      ]
      const color = new THREE.Color(routeColors[marker.routes[0]] ?? '#fffdf4')
      for (const corner of [0, 1, 2, 0, 2, 3]) {
        positions.push(corners[corner][0], 0.14, corners[corner][1])
        colors.push(color.r, color.g, color.b)
      }
    }
    const ticks = new THREE.BufferGeometry()
    ticks.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    ticks.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    const interchanges = new THREE.BufferGeometry()
    interchanges.setAttribute('position', new THREE.Float32BufferAttribute(rings, 3))
    return { ticks, interchanges }
  }, [projectedPaths, projectedStops, routeColors, snapshot])
  const ring = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 64
    const context = canvas.getContext('2d')!
    context.beginPath(); context.arc(32, 32, 27, 0, Math.PI * 2)
    context.fillStyle = '#fffdf4'; context.fill()
    context.lineWidth = 7; context.strokeStyle = '#151425'; context.stroke()
    return new THREE.CanvasTexture(canvas)
  }, [])
  useEffect(() => () => { geometry.ticks.dispose(); geometry.interchanges.dispose() }, [geometry])
  useEffect(() => () => ring.dispose(), [ring])
  return <group>
    <mesh geometry={geometry.ticks} renderOrder={5}>
      <meshBasicMaterial vertexColors side={THREE.DoubleSide} transparent opacity={opacity} depthTest={false} depthWrite={false} toneMapped={false} fog={false} />
    </mesh>
    <points geometry={geometry.interchanges} renderOrder={6}>
      <pointsMaterial map={ring} size={9} sizeAttenuation={false} transparent opacity={opacity} alphaTest={0.08} depthTest={false} depthWrite={false} toneMapped={false} fog={false} />
    </points>
  </group>
}
