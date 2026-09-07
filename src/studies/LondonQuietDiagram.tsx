import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import type { NetworkSnapshot } from '@motionstudies/core/domain/network'
import type { SpatialLayoutSnapshot, SpatialLayoutCoordinate } from '@motionstudies/core/domain/spatial-layout'

/** A ghost of the Tube diagram: track geometry only, with no stops or labels. */
export function LondonQuietDiagram({ snapshot, layout, mix }: {
  readonly snapshot: NetworkSnapshot
  readonly layout: SpatialLayoutSnapshot
  readonly mix: number
}) {
  const geometry = useMemo(() => {
    const positions: number[] = []
    const segments = new Set<string>()
    const paths = new Set<number>()
    const stops = new Map(layout.stops.map(([id, x, y]) => [id, [x, y] as const]))
    const scale = 51 / Math.max(0.000001, layout.bounds.maxX - layout.bounds.minX)
    const centreX = (layout.bounds.minX + layout.bounds.maxX) / 2
    const centreY = (layout.bounds.minY + layout.bounds.maxY) / 2
    const append = (from: SpatialLayoutCoordinate, to: SpatialLayoutCoordinate) => {
      const key = [`${from[0]}:${from[1]}`, `${to[0]}:${to[1]}`].sort().join('|')
      if (segments.has(key)) return
      segments.add(key)
      for (const [x, y] of [from, to]) positions.push((x - centreX) * scale, 0.075, -(y - centreY) * scale)
    }
    for (const train of snapshot.trains) {
      if (train.mode !== 'tube') continue
      for (let index = 1; index < train.stops.length; index++) {
        const pathIndex = train.pathSegments?.[index - 1]
        if (pathIndex != null && layout.paths[pathIndex]?.length >= 2) {
          paths.add(pathIndex)
        } else {
          const fromId = snapshot.stops[train.stops[index - 1][0]][4]
          const toId = snapshot.stops[train.stops[index][0]][4]
          const from = fromId ? stops.get(fromId) : undefined
          const to = toId ? stops.get(toId) : undefined
          if (from && to) append(from, to)
        }
      }
    }
    for (const index of paths) {
      const path = layout.paths[index]
      for (let point = 1; point < path.length; point++) append(path[point - 1], path[point])
    }
    const result = new THREE.BufferGeometry()
    result.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    return result
  }, [snapshot, layout])
  useEffect(() => () => geometry.dispose(), [geometry])

  return <lineSegments name="london-quiet-diagram" geometry={geometry} renderOrder={3}>
    <lineBasicMaterial color="#9bbec8" transparent opacity={0.24 * mix} depthTest={false} depthWrite={false} toneMapped={false} fog={false} />
  </lineSegments>
}
