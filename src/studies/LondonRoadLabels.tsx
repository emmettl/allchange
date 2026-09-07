import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { RoadTopologySnapshot } from '@motionstudies/core/domain/road'
import type { NetworkProjection } from '@motionstudies/three/NationalNetworkScene'

const LABEL_WIDTH = 38
const LABEL_HEIGHT = 19
const LABEL_SPACING = 180

function routeBadge(road: string) {
  const canvas = document.createElement('canvas')
  canvas.width = LABEL_WIDTH * 3
  canvas.height = LABEL_HEIGHT * 3
  const context = canvas.getContext('2d')!
  context.scale(3, 3)
  context.beginPath()
  context.roundRect(0.75, 0.75, LABEL_WIDTH - 1.5, LABEL_HEIGHT - 1.5, 4)
  context.fillStyle = '#171522'
  context.fill()
  context.strokeStyle = '#ab8463'
  context.lineWidth = 0.75
  context.stroke()
  context.font = '600 11px system-ui, sans-serif'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillStyle = '#ffe0b3'
  context.fillText(road, LABEL_WIDTH / 2, LABEL_HEIGHT / 2 + 0.5)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

/** Screen-spaced motorway shields, shared by both carriageways. */
export function LondonRoadLabels({ topology, projection, selectedRoadId, subdued = false }: {
  topology: RoadTopologySnapshot
  projection: NetworkProjection
  selectedRoadId?: string
  subdued?: boolean
}) {
  const lastView = useRef({ matrix: new THREE.Matrix4(), width: 0, height: 0, resources: undefined as object | undefined })
  const resources = useMemo(() => {
    const group = new THREE.Group()
    const roads = [...new Set(topology.paths.filter(path => path.mainline).map(path => path.road))]
    // Selection gets first refusal at junctions and overlapping carriageways.
    roads.sort((a, b) => Number(b === selectedRoadId) - Number(a === selectedRoadId))
    const entries = roads.map(road => {
      const texture = routeBadge(road)
      const material = new THREE.SpriteMaterial({
        map: texture, transparent: true, depthTest: false, depthWrite: false,
        sizeAttenuation: false, toneMapped: false, fog: false,
        opacity: selectedRoadId ? road === selectedRoadId ? 1 : 0.3 : subdued ? 0.35 : 0.9,
      })
      const sprites = Array.from({ length: 48 }, () => {
        const sprite = new THREE.Sprite(material)
        sprite.visible = false
        sprite.renderOrder = 19
        group.add(sprite)
        return sprite
      })
      const paths = topology.paths.filter(path => path.mainline && path.road === road).map(path =>
        path.points.map(([longitude, latitude]) => new THREE.Vector3(
          (longitude - projection.centreLongitude) * projection.longitudeScale * projection.scale,
          0.09,
          -(latitude - projection.centreLatitude) * projection.scale,
        )),
      )
      return { texture, material, sprites, paths }
    })
    return { group, entries }
  }, [projection, selectedRoadId, subdued, topology])

  useEffect(() => () => {
    for (const entry of resources.entries) {
      entry.texture.dispose()
      entry.material.dispose()
    }
  }, [resources])

  useFrame(({ camera, size }) => {
    const matrix = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    const view = lastView.current
    if (view.resources === resources && matrix.equals(view.matrix) && size.width === view.width && size.height === view.height) return
    view.matrix.copy(matrix)
    view.width = size.width
    view.height = size.height
    view.resources = resources
    const occupied: { x: number; y: number; road: number }[] = []
    const perspective = camera instanceof THREE.PerspectiveCamera
    const pixelScale = perspective
      ? 2 / (camera.projectionMatrix.elements[5] * size.height)
      : 2 / size.height / camera.projectionMatrix.elements[5]
    resources.entries.forEach((entry, road) => {
      let count = 0
      for (const sprite of entry.sprites) sprite.visible = false
      for (const path of entry.paths) {
        const screen = path.map(point => point.clone().project(camera))
        const lengths = screen.slice(1).map((point, index) => Math.hypot(
          (point.x - screen[index].x) * size.width / 2,
          (point.y - screen[index].y) * size.height / 2,
        ))
        const total = lengths.reduce((sum, length) => sum + length, 0)
        // Short roads still get a central badge; longer roads repeat evenly.
        const intervals = Math.max(1, Math.floor(total / LABEL_SPACING))
        const spacing = total / intervals
        let next = spacing / 2
        let travelled = 0
        for (let index = 0; index < lengths.length; index++) {
          const length = lengths[index]
          if (length === 0) continue
          while (next <= travelled + length && count < entry.sprites.length) {
            const mix = (next - travelled) / length
            next += spacing
            const point = path[index].clone().lerp(path[index + 1], mix)
            const projected = point.clone().project(camera)
            const x = (projected.x + 1) * size.width / 2
            const y = (1 - projected.y) * size.height / 2
            if (projected.z < -1 || projected.z > 1 || x < 24 || x > size.width - 24 || y < 16 || y > size.height - 16) continue
            if (occupied.some(other => other.road === road
              ? Math.hypot(x - other.x, y - other.y) < LABEL_SPACING * 0.72
              : Math.abs(x - other.x) < LABEL_WIDTH + 12 && Math.abs(y - other.y) < LABEL_HEIGHT + 12)) continue
            occupied.push({ x, y, road })
            const sprite = entry.sprites[count++]
            sprite.position.copy(point)
            sprite.scale.set(LABEL_WIDTH * pixelScale, LABEL_HEIGHT * pixelScale, 1)
            sprite.visible = true
          }
          travelled += length
        }
      }
    })
  })

  return <primitive object={resources.group} />
}
