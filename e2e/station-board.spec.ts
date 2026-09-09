import { expect, test } from '@playwright/test'
import { setMobileControls } from './mobile-controls.ts'

test('station board supports keyboard dismissal, preserves selection through reduced-motion layout and opens movement', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.scene canvas')).toBeVisible()
  await page.getByRole('button', { name: 'Pause motion', exact: true }).click()
  await page.locator('.london-transport input[type="range"]').fill('27900')
  const search = page.getByRole('searchbox')
  await search.fill('Whitechapel')
  await expect(page.getByRole('option', { name: /Whitechapel/ }).first()).toBeVisible()
  await search.press('Enter')
  const board = page.getByRole('region', { name: 'Whitechapel timetable', exact: true })
  await expect(board.locator('tbody tr:has(button)')).toHaveCount(4)
  await board.locator('tbody tr button').first().click()
  const selection = await board.locator('.london-station-board-selection').textContent()
  await expect(board.locator('.ms-flap__drum').first()).toHaveCSS('visibility', 'hidden')
  const bounds = (await page.locator('.has-station-board').boundingBox())!
  expect(bounds.x).toBeGreaterThanOrEqual(0)
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(page.viewportSize()!.width)

  const close = page.getByRole('button', { name: 'Close Whitechapel card', exact: true })
  const target = (await close.boundingBox())!
  expect(target.width).toBeGreaterThanOrEqual(44)
  expect(target.height).toBeGreaterThanOrEqual(44)
  await close.focus()
  await close.press('Enter')
  await expect(board).not.toBeVisible()
  await expect(search).toHaveValue('Whitechapel')
  await expect(page.getByRole('region', { name: 'Playback controls' })).toBeVisible()
  const reopen = page.getByRole('button', { name: 'Show Whitechapel card', exact: true })
  await expect(reopen).toBeFocused()
  expect((await page.locator('.london-status-card').boundingBox())!.height).toBeLessThan(64)
  await reopen.press('Enter')
  await expect(board.locator('.london-station-board-selection')).toHaveText(selection!)

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(board.locator('.ms-flap__face').first()).toHaveCSS('animation-name', 'none')
  await page.evaluate(() => {
    const root = document.querySelector('.london-experience')!
    const values: string[] = []
    const observer = new MutationObserver(() => values.push(root.getAttribute('data-layout-mix')!))
    observer.observe(root, { attributes: true, attributeFilter: ['data-layout-mix'] })
    Object.assign(window, { layoutSamples: values, layoutObserver: observer })
  })
  await setMobileControls(page, true)
  await page.getByRole('button', { name: 'Diagram layout', exact: true }).click()
  await expect(page.locator('.london-experience')).toHaveAttribute('data-layout-mix', '1.000')
  const samples = await page.evaluate(() => {
    const probe = window as typeof window & { layoutSamples: string[]; layoutObserver: MutationObserver }
    probe.layoutObserver.disconnect()
    return probe.layoutSamples
  })
  expect(samples.length).toBeGreaterThan(0)
  expect(samples.every(value => value === '0.000' || value === '1.000')).toBe(true)
  await setMobileControls(page, false)
  await expect(board.locator('.london-station-board-selection')).toHaveText(selection!)
  await expect(board.locator('tbody tr button[aria-pressed="true"]')).toHaveCount(1)
  await board.getByRole('button', { name: 'Show movement', exact: true }).click()
  await expect(board).not.toBeVisible()
  await expect(page.getByRole('button', { name: 'Resume motion', exact: true })).toBeVisible()
})
