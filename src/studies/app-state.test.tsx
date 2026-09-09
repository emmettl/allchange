// @vitest-environment jsdom
import '../test/dom.ts'
import { beforeEach, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { installFixtureFetch } from '../test/fixture-fetch.ts'
import { deferred } from '../test/dom.ts'
import { LONDON_EDITION } from '../editions/london.ts'
import { LondonStudyApp } from './LondonStudyApp.tsx'

// The production app, feeds, boards and selection handlers stay real. Only the
// GPU boundary is replaced; E2E verifies that these props render and can be hit.
vi.mock('@motionstudies/three/NationalNetworkScene', () => ({ NationalNetworkScene: (props: { time: number; selectedTrain?: { id: string }; nationalRailSelectedId?: string }) =>
  <div data-testid="map" data-time={props.time} data-tfl={props.selectedTrain?.id} data-rail={props.nationalRailSelectedId} /> }))
vi.mock('@motionstudies/three/HubPulseScene', () => ({ HubPulseScene: (props: { time: number; hub: { id: string }; calls: unknown[] }) =>
  <div data-testid="pulse" data-hub={props.hub.id} data-time={props.time} data-calls={props.calls.length} /> }))

let network: ReturnType<typeof installFixtureFetch>
beforeEach(() => { network = installFixtureFetch() })
const button = (name: string | RegExp) => screen.getAllByRole('button', { name })[0]
const change = (element: HTMLElement, value: string) => fireEvent.change(element, { target: { value } })
const clock = () => document.querySelector<HTMLInputElement>('.london-transport input[type="range"]')!
async function open() {
  render(<LondonStudyApp edition={LONDON_EDITION} />)
  await screen.findByTestId('map')
  fireEvent.click(button('Pause motion'))
  change(clock(), '27900')
}
async function search(query: string, match: RegExp) {
  change(screen.getByRole('searchbox'), query)
  let option: HTMLElement | undefined
  await waitFor(() => {
    option = screen.queryAllByRole('option').find(value => match.test(value.textContent?.trim() ?? '') || match.test(value.querySelector('strong')?.textContent ?? ''))
    expect(option, query).toBeDefined()
  })
  fireEvent.click(option!)
}

// This single integration covers twenty real 302-option boards; allow slower CI CPUs.
it('opens gateway and branch stations through the actual station picker and pulse callbacks', async () => {
  await open()
  fireEvent.click(button('Show National Rail'))
  // The first rail board compiles its lazy modules on demand. Hosted CPUs can
  // exceed the normal DOM wait while the fixture audit is running alongside it.
  const picker = await screen.findByRole('combobox', { name: 'National Rail station' }, { timeout: 10_000 })
  await waitFor(() => expect((picker as HTMLSelectElement).options).toHaveLength(302))
  for (const id of ['paddington', 'waterloo', 'kings-cross', 'victoria', 'london-bridge', 'charing-cross', 'cannon-street', 'liverpool-street', 'euston', 'marylebone', 'fenchurch-street', 'st-pancras', 'st-pancras-thameslink', 'moorgate', 'rail:HXX', 'rail:CSS', 'rail:HYS', 'rail:WAE', 'rail:BCZ', 'rail:LEB']) {
    const currentPicker = screen.getByRole('combobox', { name: 'National Rail station' })
    change(currentPicker, id)
    await waitFor(() => expect(document.querySelectorAll('.london-national-rail-board tbody tr button').length, id).toBeGreaterThan(0))
    const name = (currentPicker as HTMLSelectElement).selectedOptions[0].textContent
    fireEvent.click(await screen.findByRole('button', { name: `Open ${name} pulse` }))
    const pulse = await screen.findByTestId('pulse')
    expect(pulse.getAttribute('data-hub')).toBe(id)
    await waitFor(() => expect(Number(pulse.getAttribute('data-calls'))).toBeGreaterThan(0))
    expect(clock().value).toBe('27900')
    expect(button('Resume motion')).toBeDefined()
    fireEvent.click(button('Exit interchange pulse'))
  }
  expect(network.requests('network-waterloo.json')).toHaveLength(1)
  expect(network.requests('network-paddington.json')).toHaveLength(1)
}, 30_000)

it.each([
  ['KGX', 'King’s Cross', 'LNER'], ['STP', 'St. Pancras International', 'East Midlands Railway'], ['SPL', 'St Pancras Thameslink', 'Thameslink'],
  ['PAD', 'Paddington', 'GWR'], ['WAT', 'Waterloo', 'South Western Railway'], ['VIC', 'Victoria', 'Southern'], ['LBG', 'London Bridge', 'Thameslink'], ['EUS', 'Euston', 'Avanti West Coast'],
])('routes %s search to its rail calls and shared TfL board', async (code, name, operator) => {
  await open()
  await search(code, new RegExp(`NATIONAL RAIL · ${code}`))
  const card = await screen.findByRole('region', { name: `National Rail at ${name}` })
  const line = await within(card).findByRole('combobox', { name: `${name} board line` })
  await waitFor(() => expect(line.textContent).toContain(operator))
  expect(within(line).getAllByRole('option').length).toBeGreaterThan(2)
  expect(within(card).queryByRole('combobox', { name: 'Rail station area' })).toBeNull()
  expect(clock().value).toBe('27900')
  if (['PAD', 'WAT', 'VIC', 'LBG', 'EUS'].includes(code)) {
    change(line, operator)
    const calls = [...card.querySelectorAll('tbody tr')].map(row => row.textContent)
    fireEvent.focus(screen.getByRole('searchbox'))
    change(screen.getByRole('searchbox'), name)
    const station = screen.getAllByRole('option').find(option => option.querySelector('strong')?.textContent === name && /\d+ lines/.test(option.textContent!))!
    expect(station).toBeDefined()
    fireEvent.click(station)
    const board = await screen.findByRole('region', { name: `${name} timetable` })
    change(within(board).getByRole('combobox', { name: `${name} board line` }), operator)
    expect([...board.querySelectorAll('tbody tr')].map(row => row.textContent)).toEqual(calls)
  }
})

it('retains independent rail sources and a dismissed card through an actual deferred retry', async () => {
  network.overrides.set('network-liverpool-street.json', () => new Response('', { status: 503 }))
  await open()
  await search('SRA', /NATIONAL RAIL · SRA/)
  const card = await screen.findByRole('region', { name: 'National Rail at Stratford' })
  await within(card).findByText(/some National Rail services unavailable/)
  expect(card.querySelectorAll('tbody tr button')).toHaveLength(4)
  const held = deferred<Response>()
  network.overrides.set('network-liverpool-street.json', () => held.promise)
  fireEvent.click(within(card).getByRole('button', { name: 'Retry National Rail board' }))
  fireEvent.click(button('Close Stratford National Rail card'))
  const { fixtureResponse } = await import('../test/fixture-fetch.ts')
  await act(async () => { held.resolve(fixtureResponse('/data/all-change-national-rail-network-liverpool-street.json')) })
  await waitFor(() => expect(card.textContent).toContain('National Rail calls loaded'))
  expect(card.getAttribute('data-hero-dismissed')).toBe('true')
  fireEvent.click(button('Show Stratford National Rail card'))
  expect(within(card).getByRole('combobox', { name: 'Stratford board line' }).textContent).toContain('Greater Anglia')
})

it('preserves passenger metric and area selection through dismissal, station changes and rail-to-pulse handoff', async () => {
  await open()
  await search('Bank', /^Bank/)
  const demand = await screen.findByRole('region', { name: 'Typical passenger demand' })
  await within(demand).findByRole('button', { name: /Changing/ })
  fireEvent.click(within(demand).getByRole('button', { name: /Changing/ }))
  fireEvent.click(button('Close Bank card'))
  expect(screen.getByRole('searchbox').getAttribute('value')).toBe('Bank')
  fireEvent.click(button('Show Bank card'))
  expect(within(demand).getByRole('button', { name: /Changing/ }).getAttribute('aria-pressed')).toBe('true')
  await search('Canary Wharf', /^Canary Wharf/)
  const area = await screen.findByRole('combobox', { name: 'Passenger source area' })
  expect(within(area).getAllByRole('option')).toHaveLength(3)
  change(area, 'CAWd')
  await screen.findByText('Canary Wharf DLR · NUMBAT source area')
  await search('CLJ', /NATIONAL RAIL · CLJ/)
  await screen.findByText(/Changing unavailable: ambiguous duplicate/)
  expect(screen.queryByRole('button', { name: /^Changing/ })).toBeNull()
  await search('SRA', /NATIONAL RAIL · SRA/)
  await screen.findByText('Stratford · NUMBAT source area')
  fireEvent.click(button('Open Stratford pulse'))
  expect((await screen.findByTestId('pulse')).getAttribute('data-hub')).toBe('stratford')
  await screen.findByText('Stratford · NUMBAT source area')
  await search('Addington Village', /^Addington Village/)
  await screen.findByRole('region', { name: 'Addington Village timetable' })
  await waitFor(() => expect(document.querySelector('.london-status-card .london-passenger-demand')).toBeNull())
  expect(network.requests('/stations/ADVt.json')).toHaveLength(0)
})

it('hands off night to directional demand with a paused checkpoint and clears night restrictions', async () => {
  await open()
  fireEvent.click(button('After midnight study'))
  expect(clock().max).toBe('18000')
  fireEvent.click(button('Where does the morning go?'))
  const study = await screen.findByRole('region', { name: 'Where does the morning go?' })
  await waitFor(() => expect(study.textContent).toContain('≈2,169'))
  expect((button('Diagram layout') as HTMLButtonElement).disabled).toBe(false)
  fireEvent.click(button('Diagram layout'))
  await waitFor(() => expect(study.getAttribute('data-layout-mix')).toBe('1'))
  expect(clock().value).toBe('30600')
  expect(button('Resume motion')).toBeDefined()
})

it('finds UIC and Eurostar service numbers and keeps the end of day empty', async () => {
  await open()
  await search('7015400', /NATIONAL RAIL · 7015400/)
  const card = await screen.findByRole('region', { name: 'National Rail at St Pancras Eurostar' })
  await waitFor(() => expect(card.textContent).toContain('40 of 55'))
  expect(within(card).queryByRole('combobox', { name: 'Rail station area' })).toBeNull()
  await search('9008', /Eurostar 9008/)
  expect(document.querySelector('.london-experience')?.getAttribute('data-selected-rail-service')).toBe('eurostar:9008-0904:2026-09-04')
  await waitFor(() => expect(clock().max).toBe('86400'))
  change(clock(), '86400')
  await waitFor(() => expect(card.querySelectorAll('tbody tr button')).toHaveLength(0))
  await waitFor(() => expect(screen.getByRole('region', { name: 'National Rail at St Pancras Eurostar' }).textContent).toContain('Outside study window'))
})

it('wires category and station selection to the count and restores it on release', async () => {
  await open()
  const count = () => Number(document.querySelector('.london-status-card strong')!.textContent!.replaceAll(',', ''))
  const total = count()
  expect(total).toBeGreaterThan(0)
  fireEvent.click(button('Tube · DLR'))
  expect(count()).toBeLessThan(total)
  expect(count()).toBeGreaterThan(0)
  fireEvent.click(button('Tube · DLR'))
  expect(count()).toBe(total)
  await search('Whitechapel', /^Whitechapel/)
  expect(count()).toBeLessThan(total)
  expect(count()).toBeGreaterThan(0)
  fireEvent.click(button('Release'))
  expect(count()).toBe(total)
})

it('dismisses and restores the airport host without clearing isolation or the selected airport', async () => {
  await open()
  await search('LHR', /Heathrow Airport/)
  await screen.findByRole('button', { name: 'Close LHR card' })
  const card = document.querySelector('.edition-airport-card')!
  fireEvent.click(button('Close LHR card'))
  expect(card.getAttribute('data-hero-dismissed')).toBe('true')
  expect(document.querySelector('.london-experience')!.getAttribute('data-selected-airport')).toBe('heathrow')
  expect(document.querySelector('.london-experience')!.classList.contains('has-air-category')).toBe(true)
  fireEvent.click(button('Show LHR card'))
  expect(card.getAttribute('data-hero-dismissed')).toBe('false')
  fireEvent.click(within(card as HTMLElement).getByRole('button', { name: 'Arrivals' }))
  expect(within(card as HTMLElement).getByRole('region', { name: 'LHR Arrivals' })).toBeDefined()
})
