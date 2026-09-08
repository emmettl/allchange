import { useEffect, useEffectEvent, useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import type { NetworkTrain, StationIndexEntry } from '@motionstudies/core/domain/network'
import type { StudyAirport } from '@motionstudies/core/domain/airport'
import { MapTapGesture, pickMapTarget, type MapSelection } from './map-selection.ts'

export interface MapSelectionSceneExtension {
  onSelectTrain?: (train: NetworkTrain) => void
  onSelectNationalRail?: (id: string) => void
  onSelectAirport?: (airport: StudyAirport) => void
}

export function LondonMapSelection({ stations, onSelectStation, onSelectTrain, onSelectNationalRail, onSelectAirport, disabled }: MapSelectionSceneExtension & {
  stations: readonly StationIndexEntry[]
  onSelectStation?: (station: StationIndexEntry) => void
  disabled?: boolean
}) {
  const { scene, camera, gl } = useThree()
  const airportEnabled = Boolean(onSelectAirport)
  const byStop = useMemo(() => new Map(stations.flatMap(station => station.stopIndexes.map(index => [index, station] as const))), [stations])
  // Playback callbacks change with the clock; keep the gesture/listeners intact.
  const select = useEffectEvent((target: MapSelection | undefined) => {
    if (target?.kind === 'station') onSelectStation?.(target.value)
    else if (target?.kind === 'train') onSelectTrain?.(target.value)
    else if (target?.kind === 'national-rail') onSelectNationalRail?.(target.value)
    else if (target?.kind === 'airport') onSelectAirport?.(target.value)
  })
  useEffect(() => {
    if (disabled && !airportEnabled) return
    const canvas = gl.domElement
    const previousCursor = canvas.style.cursor
    const gesture = new MapTapGesture()
    const down = (event: PointerEvent) => {
      if (event.button !== 0) return
      gesture.down(event.pointerId, event.clientX, event.clientY)
      canvas.setPointerCapture(event.pointerId)
    }
    const airportAt = (event: PointerEvent) => airportEnabled && pickMapTarget(scene, camera, canvas.getBoundingClientRect(), event.clientX, event.clientY, event.pointerType === 'touch', undefined, true)
    const move = (event: PointerEvent) => {
      gesture.move(event.pointerId, event.clientX, event.clientY)
      canvas.style.cursor = airportAt(event) ? 'pointer' : previousCursor
    }
    const up = (event: PointerEvent) => {
      if (!gesture.up(event.pointerId, event.clientX, event.clientY)) return
      const target = pickMapTarget(scene, camera, canvas.getBoundingClientRect(), event.clientX, event.clientY, event.pointerType === 'touch', byStop, disabled)
      select(target)
    }
    const cancel = (event: PointerEvent) => { gesture.up(event.pointerId, event.clientX, event.clientY, true) }
    canvas.addEventListener('pointerdown', down)
    canvas.addEventListener('pointermove', move)
    canvas.addEventListener('pointerup', up)
    canvas.addEventListener('pointercancel', cancel)
    canvas.addEventListener('lostpointercapture', cancel)
    return () => {
      canvas.style.cursor = previousCursor
      canvas.removeEventListener('pointerdown', down)
      canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerup', up)
      canvas.removeEventListener('pointercancel', cancel)
      canvas.removeEventListener('lostpointercapture', cancel)
    }
  }, [byStop, camera, disabled, gl, scene, airportEnabled])
  return null
}
