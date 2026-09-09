// @vitest-environment jsdom
import '../test/dom.ts'
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { fixtureJson, installFixtureFetch } from '../test/fixture-fetch.ts'
import { deferred } from '../test/dom.ts'
import { loadPassengerSelection, type PassengerDemand, type PassengerArea } from '../data/passenger-demand.ts'
import { usePassengerDemand } from '../data/use-passenger-demand.ts'
import LondonPassengerDemand from './LondonPassengerDemand.tsx'
import LondonPassengerPulse from './LondonPassengerPulse.tsx'
import LondonMorningFlow from './LondonMorningFlow.tsx'
import LondonNightStudy from './LondonNightStudy.tsx'

vi.mock('../data/passenger-demand.ts', async original => ({ ...await original<typeof import('../data/passenger-demand.ts')>(), loadPassengerSelection: vi.fn() }))
const selection = (asc: string, preceding = false) => {
  const data = fixtureJson<PassengerDemand>(`fixtures/passenger-demand/${preceding ? 'preceding' : 'stations'}/${asc}.json`)
  const areas = fixtureJson<{ areas: Record<string, PassengerArea> }>('fixtures/passenger-demand/catalogue.json').areas
  return { data, areas: [areas[asc]] }
}
beforeEach(() => {
  installFixtureFetch()
  vi.mocked(loadPassengerSelection).mockReset().mockImplementation(async (name, area, preceding) => selection(area ?? (name === 'Bank' ? 'BNKu' : 'SFDu'), preceding))
})

it('ignores stale passenger results, retries the current area and resets an area override when the station changes', async () => {
  const held = deferred<Awaited<ReturnType<typeof loadPassengerSelection>>>()
  vi.mocked(loadPassengerSelection).mockImplementation(async name => { if (name === 'Bank') return held.promise; throw new Error('Unavailable') })
  const { result, rerender } = renderHook(({ name }) => usePassengerDemand(name), { initialProps: { name: 'Bank' } })
  rerender({ name: 'Stratford' })
  await waitFor(() => expect(result.current.failed).toBe(true))
  await act(async () => held.resolve(selection('BNKu')))
  expect(result.current.selection).toBeUndefined()
  vi.mocked(loadPassengerSelection).mockImplementation(async () => selection('SFDu'))
  act(() => result.current.retry())
  await waitFor(() => expect(result.current.selection?.data.station.asc).toBe('SFDu'))
  act(() => result.current.selectArea('SFDu'))
  rerender({ name: 'Bank' })
  await waitFor(() => expect(loadPassengerSelection).toHaveBeenLastCalledWith('Bank', undefined, false))
})

it('recovers the passenger card, changes carry-in source at 05:00 and preserves the metric across clock changes', async () => {
  vi.mocked(loadPassengerSelection).mockRejectedValueOnce(new Error('Unavailable'))
  const { rerender } = render(<LondonPassengerDemand stationName="Bank" time={27900} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Retry passenger data' }))
  fireEvent.click(await screen.findByRole('button', { name: /Changing/ }))
  expect(screen.getByTestId('passenger-marker').getAttribute('data-interval')).toBe('11')
  rerender(<LondonPassengerDemand stationName="Bank" time={3600} />)
  await screen.findByText(/Thursday tail/)
  await waitFor(() => expect(screen.getByTestId('passenger-marker').getAttribute('data-interval')).toBe('4'))
  expect(loadPassengerSelection).toHaveBeenLastCalledWith('Bank', undefined, true)
  rerender(<LondonPassengerDemand stationName="Bank" time={63000} />)
  await waitFor(() => expect(screen.getByTestId('passenger-marker').getAttribute('data-interval')).toBe('50'))
  expect(screen.getByRole('button', { name: /Changing/ }).getAttribute('aria-pressed')).toBe('true')
  expect(loadPassengerSelection).toHaveBeenLastCalledWith('Bank', undefined, false)
})

it('removes passenger pulse marks while a selected profile fails and restores them through its retry button', async () => {
  const props = { hubId: 'bank', stationName: 'Bank', time: 27900, isPlaying: false, playbackRate: 120, windowStart: 0, windowEnd: 86400, onTime: vi.fn(), onSeek: vi.fn(), onStation: vi.fn() }
  const { rerender } = render(<LondonPassengerPulse {...props} />)
  await waitFor(() => expect(document.querySelectorAll('[data-flow="entries"] circle').length).toBeGreaterThan(0))
  vi.mocked(loadPassengerSelection).mockRejectedValueOnce(new Error('Unavailable'))
  rerender(<LondonPassengerPulse {...props} stationName="Stratford" hubId="stratford" />)
  const retry = await screen.findByRole('button', { name: 'Retry passenger pulse' })
  expect(document.querySelectorAll('.london-passenger-pulse circle')).toHaveLength(0)
  fireEvent.click(retry)
  await waitFor(() => expect(document.querySelector('[data-flow="interchanges"]')?.getAttribute('data-value')).toBe('3226.197'))
  fireEvent.click(screen.getByRole('button', { name: '17:30 evening' }))
  expect(props.onSeek).toHaveBeenCalledWith(63000)
})

it('retries optional directional data and updates checkpoint, interval and station controls', async () => {
  const { overrides } = installFixtureFetch()
  overrides.set('all-change-morning-flow.json', () => new Response('', { status: 503 }))
  const props = { time: 30600, isPlaying: false, playbackRate: 120, mix: 0, onTime: vi.fn(), onSeek: vi.fn(), onClose: vi.fn() }
  const { rerender } = render(<LondonMorningFlow {...props} />)
  const retry = await screen.findByRole('button', { name: 'Retry morning flow' })
  overrides.clear()
  fireEvent.click(retry)
  await screen.findByText('≈2,169')
  fireEvent.change(screen.getByRole('combobox', { name: 'Morning flow station' }), { target: { value: 'SFDu' } })
  fireEvent.click(screen.getByRole('button', { name: '17:30 · The return' }))
  expect(props.onSeek).toHaveBeenCalledWith(63000)
  rerender(<LondonMorningFlow {...props} time={63000} mix={1} />)
  expect((screen.getByRole('combobox', { name: 'Morning flow station' }) as HTMLSelectElement).value).toBe('SFDu')
  expect(screen.getByText('≈2,591')).toBeDefined()
  rerender(<LondonMorningFlow {...props} time={3600} />)
  expect(screen.getByText('No matching Friday interval')).toBeDefined()
  expect(document.querySelectorAll('[data-link] circle')).toHaveLength(0)
})

it('retries independent night context, preserves honest gaps and only seeks departures inside the view', async () => {
  const { overrides } = installFixtureFetch()
  overrides.set('all-change-night-study.json', () => new Response('', { status: 503 }))
  const onTime = vi.fn(), onStation = vi.fn()
  const props = { date: '2026-09-04', time: 9000, onTime, onStation }
  const { rerender } = render(<LondonNightStudy {...props} />)
  const retry = await screen.findByRole('button', { name: 'Retry night context' })
  overrides.clear()
  fireEvent.click(retry)
  fireEvent.click(await screen.findByRole('button', { name: /Bank.*City interchange/ }))
  expect(onStation).toHaveBeenCalledWith('Bank')
  rerender(<LondonNightStudy {...props} name="Bank" stopIds={['940GZZLUBNK']} />)
  await screen.findByText(/beyond this night view/)
  expect(screen.queryByRole('button', { name: 'Go to next departure' })).toBeNull()
  expect(document.body.textContent).toContain('does not prove no service ran')
  rerender(<LondonNightStudy {...props} time={1800} name="Waterloo" stopIds={['crs:WAT']} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Go to next departure' }))
  expect(onTime).toHaveBeenCalledWith(1800)
  rerender(<LondonNightStudy {...props} time={18000} name="Waterloo" stopIds={['crs:WAT']} />)
  expect(document.body.textContent).toContain('Night view ends at 05:00')
})
