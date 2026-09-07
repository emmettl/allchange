import { useEffect, useMemo, useState } from 'react'
import type { NetworkDayManifest } from '@motionstudies/core/domain/network'
import { adjacentDayChunks, dayChunkForTime, networkSnapshotForDayChunk } from '@motionstudies/core/domain/network-day'
import { decodeBusChunk, validateBusChunk, type CompactBusChunk } from './bus-day.ts'

type BusManifest = NetworkDayManifest & { readonly format: 'tfl-bus-patterns-v1' }
interface BusState {
  key: string
  manifest?: BusManifest
  chunks: Readonly<Record<string, CompactBusChunk>>
  error?: string
}

export function useBusDay(manifestFile: string, active: boolean, time: number, resolveAssetUrl: (file: string) => string) {
  const key = resolveAssetUrl(manifestFile)
  const [stored, setStored] = useState<BusState>({ key, chunks: {} })
  const state: BusState = stored.key === key ? stored : { key, chunks: {} }
  if (stored.key !== key) setStored(state)
  const { manifest, chunks } = state
  const descriptor = useMemo(() => manifest ? dayChunkForTime(manifest, time) : undefined, [manifest, time])
  const chunk = descriptor ? chunks[descriptor.id] : undefined
  const decoded = useMemo(() => chunk ? decodeBusChunk(chunk) : undefined, [chunk])
  const network = useMemo(() => manifest ? networkSnapshotForDayChunk(manifest, decoded) : undefined, [manifest, decoded])

  useEffect(() => {
    if (!active || manifest) return
    const controller = new AbortController()
    void (async () => {
      try {
        const response = await fetch(key, { signal: controller.signal })
        if (!response.ok) throw new Error('Bus manifest unavailable')
        const next: BusManifest = await response.json()
        if (next.format !== 'tfl-bus-patterns-v1' || !next.chunks?.length) throw new Error('Invalid bus manifest')
        if (!controller.signal.aborted) setStored((current) => current.key === key ? { ...current, manifest: next, error: undefined } : current)
      } catch {
        if (!controller.signal.aborted) setStored((current) => current.key === key ? { ...current, error: 'manifest' } : current)
      }
    })()
    return () => controller.abort()
  }, [active, key, manifest])

  useEffect(() => {
    if (!active || !manifest || !descriptor) return
    const adjacent = adjacentDayChunks(manifest, descriptor)
    const targets = !chunk ? [descriptor] : adjacent.filter(({ id }) => !chunks[id])
    if (!targets.length) return
    const controller = new AbortController()
    for (const target of targets) void (async () => {
      try {
        const response = await fetch(resolveAssetUrl(target.path), { signal: controller.signal })
        if (!response.ok) throw new Error('Bus chunk unavailable')
        const bytes = await response.arrayBuffer()
        if (bytes.byteLength !== target.bytes) throw new Error('Bus chunk size mismatch')
        const digest = await crypto.subtle.digest('SHA-256', bytes)
        const hash = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
        if (hash !== target.sha256) throw new Error('Bus chunk integrity mismatch')
        const next: CompactBusChunk = JSON.parse(new TextDecoder().decode(bytes))
        if (next.windowStart !== target.windowStart || next.windowEnd !== target.windowEnd || next.journeys?.length !== target.tripCount) throw new Error('Bus chunk metadata mismatch')
        // Validate before storing; malformed patterns must enter the loading
        // error state rather than throw from a subsequent React render.
        validateBusChunk(next)
        if (!controller.signal.aborted) setStored((current) => current.key === key ? {
          ...current,
          chunks: { ...Object.fromEntries(Object.entries(current.chunks).filter(([id]) => adjacent.some((item) => item.id === id))), [target.id]: next },
          error: current.error === target.id ? undefined : current.error,
        } : current)
      } catch {
        if (!controller.signal.aborted && target.id === descriptor.id) setStored((current) => current.key === key ? { ...current, error: target.id } : current)
      }
    })()
    return () => controller.abort()
  }, [active, chunk, chunks, descriptor, key, manifest, resolveAssetUrl])

  const error = state.error === 'manifest' || Boolean(descriptor && state.error === descriptor.id)
  return { manifest, network, chunkReady: Boolean(chunk), loading: active && !error && (!manifest || !chunk), error }
}
