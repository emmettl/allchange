// @vitest-environment jsdom
import '../test/dom.ts'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import type { ComponentProps } from 'react'
import type { NetworkSnapshot } from '@motionstudies/core/domain/network'
import type { NationalRailSnapshot } from '../data/national-rail.ts'
import { fixtureJson } from '../test/fixture-fetch.ts'
import { boardInterchange, boardInterchanges } from '../editions/london-board-interchanges.ts'
import LondonCombinedStationBoard from './LondonCombinedStationBoard.tsx'
import { LondonStationDepartures } from './LondonStationDepartures.tsx'

const tfl = fixtureJson<NetworkSnapshot>('fixtures/tfl/all-change-rail-led-morning.json')
const rail = fixtureJson<NationalRailSnapshot>('fixtures/national-rail/network-liverpool-street.json')
function props(): ComponentProps<typeof LondonCombinedStationBoard> {
  return { station: boardInterchange('Stratford')!, tfl, rail, snapshots: { 'liverpool-street': rail }, errors: {}, time: 27900,
    windowStart: 0, windowEnd: 86400, tflStart: 21600, tflEnd: 28800, tflLoading: false, tflError: false,
    onTflRetry: vi.fn(), onRailRetry: vi.fn(), onSelect: vi.fn(), onSeek: vi.fn(), onPulse: vi.fn(), animate: false }
}

it('keeps loaded calls through independent source failures, wires both retries and clips each source', () => {
  const value = props()
  const { rerender } = render(<LondonCombinedStationBoard {...value} snapshots={{}} errors={{ 'liverpool-street': true }} />)
  expect(document.querySelectorAll('tbody tr button')).toHaveLength(4)
  expect(screen.getByRole('combobox', { name: 'Stratford board line' }).textContent).not.toContain('Greater Anglia')
  fireEvent.click(screen.getByRole('button', { name: 'Retry National Rail board' }))
  expect(value.onRailRetry).toHaveBeenCalledOnce()
  rerender(<LondonCombinedStationBoard {...value} tflError />)
  expect(screen.queryByRole('combobox', { name: 'Stratford board line' })).toBeNull()
  expect(document.querySelector('tbody')!.textContent).toContain('Greater Anglia')
  expect(document.querySelectorAll('tbody tr button')).toHaveLength(4)
  fireEvent.click(screen.getByRole('button', { name: 'Retry TfL board' }))
  expect(value.onTflRetry).toHaveBeenCalledOnce()
  rerender(<LondonCombinedStationBoard {...value} />)
  expect(screen.getByRole('combobox', { name: 'Stratford board line' }).textContent).toContain('Greater Anglia')
  expect(screen.getByRole('combobox', { name: 'Stratford board line' }).textContent).toContain('Central')
  expect(screen.getByText(/TfL coverage does not span this whole window/)).toBeDefined()
  rerender(<LondonCombinedStationBoard {...value} time={86400} />)
  expect(document.querySelectorAll('tbody tr button')).toHaveLength(0)
  expect(screen.getAllByText(/Outside study window/).length).toBeGreaterThan(0)
})

it('offers four distinct northern station areas and passes the selected identity to the host', () => {
  const value = props(), areas = boardInterchanges("King's Cross St. Pancras"), onArea = vi.fn()
  render(<LondonCombinedStationBoard {...value} station={areas[0]} areas={areas} onArea={onArea} />)
  const picker = screen.getByRole('combobox', { name: 'Rail station area' })
  expect(within(picker).getAllByRole('option').map(option => option.textContent)).toEqual(['King’s Cross', 'St. Pancras International', 'St Pancras Thameslink', 'St Pancras Eurostar'])
  for (const area of areas) {
    fireEvent.change(picker, { target: { value: area.id } })
    expect(onArea).toHaveBeenLastCalledWith(area.id)
  }
})

it.each(['Central', 'Greater Anglia'])('filters %s before selecting and routes arrival/departure movement callbacks with the correct source', route => {
  const value = props()
  const { rerender } = render(<LondonCombinedStationBoard {...value} />)
  fireEvent.change(screen.getByRole('combobox', { name: 'Stratford board line' }), { target: { value: route } })
  const buttons = document.querySelectorAll<HTMLButtonElement>('tbody tr button')
  expect(buttons).toHaveLength(4)
  fireEvent.click(buttons[0])
  const call = vi.mocked(value.onSelect).mock.calls[0][0]
  expect(call.source).toBe(route === 'Central' ? 'tfl' : 'national-rail')
  expect(call.train.route).toBe(route)
  rerender(<LondonCombinedStationBoard {...value} selectedId={call.train.id} />)
  fireEvent.click(screen.getByRole('button', { name: 'Show movement' }))
  expect(value.onSeek).toHaveBeenLastCalledWith(call, 'departure')
  fireEvent.click(screen.getByRole('button', { name: 'Arrivals' }))
  fireEvent.click(document.querySelector<HTMLButtonElement>('tbody tr button')!)
  const arrival = vi.mocked(value.onSelect).mock.lastCall![0]
  rerender(<LondonCombinedStationBoard {...value} selectedId={arrival.train.id} />)
  fireEvent.click(screen.getByRole('button', { name: 'Show movement' }))
  expect(value.onSeek).toHaveBeenLastCalledWith(arrival, 'arrival')
})

it('exposes a failed station-board retry and clears rows at the study boundary', () => {
  const onRetry = vi.fn(), value = { snapshot: tfl, stationName: 'Whitechapel', time: 27900, windowStart: 21600, windowEnd: 28800, onSelect: vi.fn(), onRetry, animate: false }
  const { rerender } = render(<LondonStationDepartures {...value} error="Timetable download failed." />)
  fireEvent.click(screen.getByRole('button', { name: 'Retry board data' }))
  expect(onRetry).toHaveBeenCalledOnce()
  expect(document.querySelectorAll('tbody tr button')).toHaveLength(0)
  rerender(<LondonStationDepartures {...value} />)
  expect(document.querySelectorAll('tbody tr button')).toHaveLength(4)
  expect(screen.getByText(/07:45–08:00/)).toBeDefined()
  rerender(<LondonStationDepartures {...value} time={28800} />)
  expect(document.querySelectorAll('tbody tr button')).toHaveLength(0)
})
