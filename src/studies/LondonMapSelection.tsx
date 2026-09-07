import { useEffect, useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import type { NetworkTrain, StationIndexEntry } from '@motionstudies/core/domain/network'
import { MapTapGesture, pickMapTarget } from './map-selection.ts'

export interface MapSelectionSceneExtension {
  onSelectTrain?: (train: NetworkTrain) => void
  onSelectNationalRail?: (id: string) => void
}

export function LondonMapSelection({ stations, onSelectStation, onSelectTrain, onSelectNationalRail, disabled }: MapSelectionSceneExtension & {
  stations: readonly StationIndexEntry[]
  onSelectStation?: (station: StationIndexEntry) => void
  disabled?: boolean
}) {
  const { scene, camera, gl } = useThree()
  const byStop = useMemo(() => new Map(stations.flatMap(station => station.stopIndexes.map(index => [index, station] as const))), [stations])
  useEffect(() => {
    if (disabled) return
    const canvas = gl.domElement
    const gesture = new MapTapGesture()
    const down = (event: PointerEvent) => {
      if (event.button !== 0) return
      gesture.down(event.pointerId, event.clientX, event.clientY)
      canvas.setPointerCapture(event.pointerId)
    }
    const move = (event: PointerEvent) => gesture.move(event.pointerId, event.clientX, event.clientY)
    const up = (event: PointerEvent) => {
      if (!gesture.up(event.pointerId, event.clientX, event.clientY)) return
      const target = pickMapTarget(scene, camera, canvas.getBoundingClientRect(), event.clientX, event.clientY, event.pointerType === 'touch', byStop)
      if (target?.kind === 'station') onSelectStation?.(target.value)
      else if (target?.kind === 'train') onSelectTrain?.(target.value)
      else if (target?.kind === 'national-rail') onSelectNationalRail?.(target.value)
    }
    const cancel = (event: PointerEvent) => { gesture.up(event.pointerId, event.clientX, event.clientY, true) }
    canvas.addEventListener('pointerdown', down)
    canvas.addEventListener('pointermove', move)
    canvas.addEventListener('pointerup', up)
    canvas.addEventListener('pointercancel', cancel)
    canvas.addEventListener('lostpointercapture', cancel)
    return () => {
      canvas.removeEventListener('pointerdown', down)
      canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerup', up)
      canvas.removeEventListener('pointercancel', cancel)
      canvas.removeEventListener('lostpointercapture', cancel)
    }
  }, [byStop, camera, disabled, gl, onSelectNationalRail, onSelectStation, onSelectTrain, scene])
  return null
}
