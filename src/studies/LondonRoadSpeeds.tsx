import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import type { RoadTopologySnapshot } from '@motionstudies/core/domain/road'
import type { NationalRoadStudySnapshot } from '@motionstudies/core/domain/road-day'
import type { NetworkProjection } from '@motionstudies/three/NationalNetworkScene'
import { measuredSpeedMph, roadSpeedColor } from '../data/road-observations.ts'

/** Colour only sections with two measured endpoints in the displayed interval. */
export function LondonRoadSpeeds({ topology, snapshot, projection, selectedRoadId, subdued = false }: {
  topology: RoadTopologySnapshot
  snapshot?: NationalRoadStudySnapshot
  projection: NetworkProjection
  selectedRoadId?: string
  subdued?: boolean
}) {
  const geometry = useMemo(() => {
    const positions: number[] = []
    const colors: number[] = []
    const values = new Map(snapshot?.minutes[0]?.[1].map(value => [value[0], value]))
    const paths = new Map(topology.sections.map(section => [section.id, section.path]))
    for (const section of snapshot?.sections ?? []) {
      if (selectedRoadId && section.road !== selectedRoadId) continue
      const from = values.get(section.fromSiteIndex)
      const to = values.get(section.toSiteIndex)
      const path = paths.get(section.id)
      if (!from || !to || !path) continue
      const speed = measuredSpeedMph([from, to])
      if (speed === undefined) continue
      const color = new THREE.Color(roadSpeedColor(speed))
      for (let index = 1; index < path.length; index++) {
        for (const [longitude, latitude] of [path[index - 1], path[index]]) {
          positions.push((longitude - projection.centreLongitude) * projection.longitudeScale * projection.scale, 0.095, -(latitude - projection.centreLatitude) * projection.scale)
          colors.push(color.r, color.g, color.b)
        }
      }
    }
    const result = new THREE.BufferGeometry()
    result.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    result.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    return result
  }, [projection, selectedRoadId, snapshot, topology])
  useEffect(() => () => geometry.dispose(), [geometry])
  return <lineSegments geometry={geometry} renderOrder={10}>
    <lineBasicMaterial vertexColors transparent opacity={subdued && !selectedRoadId ? 0.15 : 0.85} depthTest={false} depthWrite={false} toneMapped={false} />
  </lineSegments>
}
