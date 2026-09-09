// @vitest-environment jsdom
import '../test/dom.ts'
import { act, renderHook, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { useNationalRail } from './use-national-rail.ts'
import { useProgressiveAirDay } from '@motionstudies/web/use-progressive-air-day'
import { useBusDay } from './use-bus-day.ts'
import { LONDON_EDITION } from '../editions/london.ts'
import { fixtureResponse, installFixtureFetch } from '../test/fixture-fetch.ts'
import { deferred } from '../test/dom.ts'
import { webcrypto } from 'node:crypto'

it.each(['paddington', 'waterloo', 'kings-cross'] as const)('retries %s independently, retains TfL-independent rail data and caches successful corridors', async failed => {
  const { overrides, requests } = installFixtureFetch()
  overrides.set(`network-${failed}.json`, () => new Response('', { status: 503 }))
  const other = failed === 'paddington' ? 'waterloo' : 'paddington'
  const { result, rerender } = renderHook(({ requested }) => useNationalRail(LONDON_EDITION.data.nationalRail, requested, '2026-09-04'), { initialProps: { requested: [other, failed] as ('paddington' | 'waterloo' | 'kings-cross')[] } })
  await waitFor(() => expect(result.current.errors[failed]).toBe(true))
  await waitFor(() => expect(result.current.snapshots[other]).toBeDefined())
  const retained = result.current.snapshots[other]
  overrides.delete(`network-${failed}.json`)
  act(() => result.current.retry())
  await waitFor(() => expect(result.current.snapshots[failed]).toBeDefined())
  expect(result.current.snapshots[other]).toBe(retained)
  expect(result.current.error).toBe(false)
  rerender({ requested: [other] })
  rerender({ requested: [other, failed] as ('paddington' | 'waterloo' | 'kings-cross')[] })
  expect(requests(`network-${other}.json`)).toHaveLength(1)
  expect(requests(`network-${failed}.json`)).toHaveLength(2)
})

it('ignores cancelled corridor responses when the requested station changes', async () => {
  const { overrides } = installFixtureFetch()
  const held = deferred<Response>()
  overrides.set('network-waterloo.json', () => held.promise)
  const { result, rerender } = renderHook(({ requested }) => useNationalRail(LONDON_EDITION.data.nationalRail, requested, '2026-09-04'), { initialProps: { requested: ['waterloo'] as ('waterloo' | 'paddington')[] } })
  rerender({ requested: ['paddington'] })
  await waitFor(() => expect(result.current.snapshots.paddington).toBeDefined())
  await act(async () => held.resolve(fixtureResponse('/data/all-change-national-rail-network-waterloo.json')))
  expect(result.current.snapshots.waterloo).toBeUndefined()
  expect(result.current.error).toBe(false)
})

it('rejects a corrupt bus chunk before rendering, then recovers on reactivation and scrubs to another chunk', async () => {
  vi.stubGlobal('crypto', webcrypto)
  const { overrides, requests } = installFixtureFetch()
  overrides.set('all-change-bus-day-chunks/06-08.json', () => Response.json({}))
  const resolveAsset = (file: string) => `/data/${file}`
  const { result, rerender } = renderHook(({ active, time }) => useBusDay('all-change-bus-day-manifest.json', active, time, resolveAsset), { initialProps: { active: true, time: 27900 } })
  await waitFor(() => expect(result.current.error).toBe(true))
  expect(result.current.chunkReady).toBe(false)
  expect(result.current.loading).toBe(false)
  rerender({ active: false, time: 27900 })
  overrides.clear()
  rerender({ active: true, time: 27900 })
  await waitFor(() => expect(result.current.chunkReady).toBe(true))
  expect(result.current.error).toBe(false)
  expect(result.current.network!.trains.length).toBeGreaterThan(0)
  rerender({ active: true, time: 66600 })
  await waitFor(() => expect(result.current.chunkReady).toBe(true))
  expect(result.current.network!.trains.some(train => train.end >= 64800)).toBe(true)
  expect(requests('/18-20.json').length).toBeGreaterThan(0)
})


it('loads aircraft only on activation and follows the clock into another hourly chunk', async () => {
  const { requests } = installFixtureFetch()
  const resolveAsset = (file: string) => `/data/${file}`
  const { result, rerender } = renderHook(({ active, time }) => useProgressiveAirDay('all-change-air-day-manifest.json', active, time, resolveAsset), { initialProps: { active: false, time: 27900 } })
  expect(requests('all-change-air-')).toHaveLength(0)
  rerender({ active: true, time: 27900 })
  await waitFor(() => expect(result.current.chunkReady).toBe(true))
  expect(requests('all-change-air-day-07.json')).toHaveLength(1)
  const morning = result.current.snapshot
  rerender({ active: true, time: 66600 })
  await waitFor(() => expect(result.current.chunkReady).toBe(true))
  expect(requests('all-change-air-day-18.json')).toHaveLength(1)
  expect(result.current.snapshot).not.toBe(morning)
  expect(result.current.snapshot!.tracks.length).toBeGreaterThan(0)
  expect(requests('all-change-air-day-manifest.json')).toHaveLength(1)
})
