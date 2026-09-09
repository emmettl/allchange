// @vitest-environment jsdom
import '../test/dom.ts'
import { useState } from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { deferred } from '../test/dom.ts'
import { fixtureJson } from '../test/fixture-fetch.ts'
import LondonCycleStudy from './LondonCycleStudy.tsx'
import LondonCycleComparison from './LondonCycleComparison.tsx'
import { loadCycleDay, type CycleDay, type CycleDate, type CycleManifest } from '../data/cycle-hire.ts'
import { loadCycleComparison, type CycleComparison } from '../data/cycle-comparison.ts'

vi.mock('../data/cycle-hire.ts', async original => ({ ...await original<typeof import('../data/cycle-hire.ts')>(), loadCycleDay: vi.fn() }))
vi.mock('../data/cycle-comparison.ts', async original => ({ ...await original<typeof import('../data/cycle-comparison.ts')>(), loadCycleComparison: vi.fn() }))
const manifest = fixtureJson<CycleManifest>('fixtures/cycle-hire/manifest.json')
const day = (date: CycleDate) => ({ manifest, day: fixtureJson<CycleDay>(`fixtures/cycle-hire/days/${date}.json`) })
const profile = (dock: string) => fixtureJson<CycleComparison>(`fixtures/cycle-hire/profiles/${dock}.json`)
const change = (name: string, value: string) => fireEvent.change(screen.getByRole('combobox', { name }), { target: { value } })
beforeEach(() => {
  vi.mocked(loadCycleDay).mockReset().mockImplementation(async date => day(date ?? '2026-05-29'))
  vi.mocked(loadCycleComparison).mockReset().mockImplementation(async dock => profile(dock))
})
function Study() {
  const [time, onTime] = useState(30600), [playing, onPlaying] = useState(false)
  return <LondonCycleStudy time={time} onTime={onTime} isPlaying={playing} onPlaying={onPlaying} rate={120} onRate={() => {}} onClose={() => {}} />
}

it('ignores late day success after a newer failure and retries the selected day without resetting time', async () => {
  const held = deferred<Awaited<ReturnType<typeof loadCycleDay>>>()
  vi.mocked(loadCycleDay).mockImplementation(async date => {
    if (date === '2026-05-30') return held.promise
    if (date === '2026-05-31') throw new Error('Unavailable')
    return day(date!)
  })
  render(<Study />)
  await screen.findByRole('img', { name: /recorded hires/ })
  fireEvent.click(screen.getByRole('button', { name: '17:30 evening' }))
  change('Cycle study day', '2026-05-30')
  expect(screen.getByRole('status').textContent).toContain('Loading')
  change('Cycle study day', '2026-05-31')
  await screen.findByRole('button', { name: 'Retry cycle study' })
  await act(async () => held.resolve(day('2026-05-30')))
  expect(screen.getByRole('status').textContent).toMatch(/Sunday.*unavailable/)
  vi.mocked(loadCycleDay).mockImplementation(async date => day(date!))
  fireEvent.click(screen.getByRole('button', { name: 'Retry cycle study' }))
  await screen.findByRole('img', { name: /recorded hires/ })
  expect((screen.getByRole('combobox', { name: 'Cycle study day' }) as HTMLSelectElement).value).toBe('2026-05-31')
  expect((screen.getByRole('slider') as HTMLInputElement).value).toBe('63000')
})

it('keeps a newer comparison failure when the previous dock resolves, retries and exposes missing dates', async () => {
  const held = deferred<CycleComparison>(), onDate = vi.fn()
  vi.mocked(loadCycleComparison).mockImplementation(async dock => { if (dock === '1072') return held.promise; throw new Error('Unavailable') })
  const props = { manifest, date: '2026-05-29' as const, time: 30600, onDate }
  const { rerender } = render(<LondonCycleComparison {...props} dockId="1072" />)
  rerender(<LondonCycleComparison {...props} dockId="999" />)
  await screen.findByRole('button', { name: 'Retry dock comparison' })
  await act(async () => held.resolve(profile('1072')))
  expect(screen.getByRole('status').textContent).toContain('Comparison unavailable')
  vi.mocked(loadCycleComparison).mockImplementation(async dock => profile(dock))
  fireEvent.click(screen.getByRole('button', { name: 'Retry dock comparison' }))
  await screen.findByRole('button', { name: 'Thursday 28 May' })
  rerender(<LondonCycleComparison {...props} dockId="1084" />)
  const saturday = await screen.findByRole('button', { name: 'Saturday 30 May' })
  expect(saturday.textContent).toContain('No included records · unavailable')
  fireEvent.click(saturday)
  expect(onDate).toHaveBeenCalledWith('2026-05-30')
  expect(saturday.querySelector('svg')).toBeNull()
})

it('preserves dock identity, missing-day semantics, profile scale, clock and dismissal across all four dates', async () => {
  render(<Study />)
  await screen.findByRole('img', { name: /recorded hires/ })
  change('Find a docking station', 'Pindar Street')
  fireEvent.click(screen.getByRole('option', { name: 'Pindar Street, Liverpool Street' }))
  const card = screen.getByRole('complementary', { name: 'Cycle hire at Pindar Street, Liverpool Street' })
  const scale = card.querySelector('.cycle-profile-scale')!.textContent
  for (const date of manifest.dates) {
    change('Cycle study day', date)
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull())
    const current = screen.getByRole('complementary', { name: 'Cycle hire at Pindar Street, Liverpool Street' })
    expect((screen.getByRole('slider') as HTMLInputElement).value).toBe('30600')
    if (date === '2026-05-30') {
      expect(current.textContent).toContain('No included records for this dock on this date')
      expect([...current.querySelectorAll('.cycle-counts strong')].map(node => node.textContent)).toEqual(['—', '—'])
      expect(within(current).queryByRole('img')).toBeNull()
    } else expect(current.querySelector('.cycle-profile-scale')!.textContent).toBe(scale)
  }
  fireEvent.click(screen.getByRole('button', { name: /^Close Pindar/ }))
  change('Cycle study day', '2026-05-29')
  await screen.findByRole('button', { name: /^Show Pindar/ })
})

it.each(['1072', '999', '1075'])('opens guided dock %s at its authored date and checkpoint with a comparison', async id => {
  render(<Study />)
  await screen.findByRole('img', { name: /recorded hires/ })
  change('Explore a cycle pattern', id)
  await screen.findByRole('region', { name: 'Four-day dock comparison' })
  const weekend = id === '1075'
  await screen.findByRole('button', { name: weekend ? 'Sunday 31 May' : 'Thursday 28 May' })
  expect((screen.getByRole('slider') as HTMLInputElement).value).toBe(weekend ? '50400' : '30600')
  expect((screen.getByRole('combobox', { name: 'Cycle study day' }) as HTMLSelectElement).value).toBe(weekend ? '2026-05-31' : '2026-05-28')
})
