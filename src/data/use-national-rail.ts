import { useEffect, useMemo, useRef, useState } from 'react'
import { mergeNetworkLayers } from '@motionstudies/core/domain/network-layers'
import { editionDataUrl } from '../editions/data-url.ts'
import { LONDON_RAIL_CORRIDORS, railBoardStations, RAIL_BOARD_STATIONS, type RailCatalogue, type RailCorridorId } from '../editions/london-national-rail.ts'
import { validateNationalRail, type NationalRailSnapshot } from './national-rail.ts'

/** Independently cached corridors: a failed download never removes another corridor. */
export function useNationalRail(files: Readonly<Record<RailCorridorId, string>>, requested: readonly RailCorridorId[], serviceDate: string | undefined) {
  const [snapshots, setSnapshots] = useState<Partial<Record<RailCorridorId, NationalRailSnapshot>>>({})
  const [errors, setErrors] = useState<Partial<Record<RailCorridorId, boolean>>>({})
  const [attempt, setAttempt] = useState(0)
  const cache = useRef<Partial<Record<RailCorridorId, NationalRailSnapshot>>>({})
  const key = [...requested].sort().join(',')
  useEffect(() => {
    if (!serviceDate || !key) return
    const controller = new AbortController()
    for (const id of key.split(',') as RailCorridorId[]) {
      if (cache.current[id]) continue
      fetch(editionDataUrl(files[id]), { signal: controller.signal })
        .then(response => {
          if (!response.ok) throw new Error('National Rail unavailable')
          return response.json() as Promise<NationalRailSnapshot>
        })
        .then(async value => {
          if (id === 'eurostar') (await import('./eurostar.ts')).validateEurostar(value, serviceDate)
          if (controller.signal.aborted) return
          const snapshot = validateNationalRail(value, serviceDate)
          cache.current[id] = snapshot
          setSnapshots(current => ({ ...current, [id]: snapshot }))
          setErrors(current => ({ ...current, [id]: false }))
        })
        .catch(() => {
          if (!controller.signal.aborted) setErrors(current => ({ ...current, [id]: true }))
        })
    }
    return () => controller.abort()
  }, [files, key, serviceDate, attempt])
  const snapshot = useMemo(() => {
    const loaded = LONDON_RAIL_CORRIDORS.flatMap(corridor => snapshots[corridor.id] ? [snapshots[corridor.id]!] : [])
    if (!loaded.length) return undefined
    return { ...mergeNetworkLayers(loaded), corridorPaths: [...new Map(loaded.flatMap(value => value.corridorPaths).map(path => [path.map(point => point.join(',')).sort().join('|'), path])).values()], fadeKilometres: 4 } as unknown as NationalRailSnapshot
  }, [snapshots])
  return { snapshot, snapshots, errors, loading: requested.some(id => !snapshots[id] && !errors[id]), error: requested.some(id => errors[id]), retry: () => { setErrors({}); setAttempt(value => value + 1) } }
}


export function useRailCatalogue(enabled: boolean, serviceDate?: string) {
  const [stations, setStations] = useState(RAIL_BOARD_STATIONS)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!enabled || !serviceDate || loaded) return
    const controller = new AbortController()
    fetch(editionDataUrl('all-change-national-rail-catalogue.json'), { signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error('Rail stations unavailable'); return response.json() as Promise<RailCatalogue> })
      .then(value => {
        if (value.serviceDate !== serviceDate || !value.stations?.length || value.stations.some(station => !station.corridors.length || station.corridors.some(id => !LONDON_RAIL_CORRIDORS.some(corridor => corridor.id === id)))) throw new Error('Invalid rail catalogue')
        if (!controller.signal.aborted) { setStations(railBoardStations(value)); setLoaded(true); setError(false) }
      }).catch(() => { if (!controller.signal.aborted) setError(true) })
    return () => controller.abort()
  }, [enabled, serviceDate, loaded, attempt])
  return { stations, loaded, error, retry: () => { setError(false); setAttempt(value => value + 1) } }
}
