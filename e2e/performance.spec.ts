/// <reference lib="dom" />
import { expect, test } from '@playwright/test'
import { setMobileControls } from './mobile-controls'
import { installWebGLDrawCounters, sampleWebGLDraws } from './webgl-draws'

test('paused TfL and buses retain buffers through idle frames and redraw seeks and selection', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.scene canvas')).toBeVisible()
  await setMobileControls(page, true)
  await page.getByRole('button', { name: 'Show London buses', exact: true }).click()
  await expect(page.locator('.london-experience')).toHaveAttribute('data-bus-loading', 'false')
  await page.evaluate(() => {
    const probe = window as typeof window & { vehicleUploads: number }
    probe.vehicleUploads = 0
    const original = WebGL2RenderingContext.prototype.bufferSubData
    WebGL2RenderingContext.prototype.bufferSubData = function (this: WebGL2RenderingContext, ...args: Parameters<typeof original>) {
      probe.vehicleUploads++
      original.apply(this, args)
    } as typeof original
  })
  const count = () => page.evaluate(() => (window as typeof window & { vehicleUploads: number }).vehicleUploads)
  const reset = () => page.evaluate(() => { (window as typeof window & { vehicleUploads: number }).vehicleUploads = 0 })
  const sample = () => page.evaluate(async () => {
    const probe = window as typeof window & { vehicleUploads: number }
    for (let i = 0; i < 3; i++) await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    const before = probe.vehicleUploads
    for (let i = 0; i < 4; i++) await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    return probe.vehicleUploads - before
  })
  expect(await sample()).toBeGreaterThan(0)
  await page.getByRole('button', { name: 'Pause motion', exact: true }).click()
  await expect.poll(sample).toBe(0)
  await reset()
  await page.locator('.london-transport input[type="range"]').fill('27900')
  await expect.poll(count).toBeGreaterThan(0)
  await expect.poll(sample).toBe(0)
  await reset()
  await page.getByRole('searchbox').fill('bus 26')
  await page.getByRole('option').first().click()
  await expect.poll(count).toBeGreaterThan(0)
  await expect.poll(sample).toBe(0)
  await page.getByRole('button', { name: 'Resume motion', exact: true }).click()
  await expect.poll(sample).toBeGreaterThan(0)
})

test('air-only playback submits visible geometry without invisible hit-sphere draws', async ({ page }) => {
  await page.addInitScript(installWebGLDrawCounters)
  await page.goto('/')
  await expect(page.locator('.scene canvas')).toBeVisible()
  await setMobileControls(page, true)
  await page.getByRole('button', { name: 'Hide TfL rail', exact: true }).click()
  await page.getByRole('button', { name: 'Show observed aircraft', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Hide observed aircraft', exact: true })).toHaveAttribute('aria-busy', 'false')
  await expect(page.locator('.london-status-card')).toContainText(/[1-9]\d*\s*aircraft observed/)
  const draws = await page.evaluate(sampleWebGLDraws)
  expect(draws.draws).toBeGreaterThan(0)
  expect(draws.zeroOpacityDraws).toBe(0)
})

test('playback keeps map pointer listeners attached across clock updates', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.scene canvas')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Pause motion', exact: true })).toBeVisible()
  const result = await page.evaluate(async () => {
    const canvas = document.querySelector('.scene canvas')!
    const timeline = document.querySelector<HTMLInputElement>('input[type="range"]')!
    const start = timeline.value
    let removed = 0
    const original = canvas.removeEventListener
    canvas.removeEventListener = function (...args: Parameters<typeof original>) {
      if (args[0].startsWith('pointer')) removed++
      original.apply(this, args)
    }
    try {
      // Observe actual playback advances rather than assuming a frame rate.
      const deadline = performance.now() + 5000
      while (timeline.value === start && performance.now() < deadline) {
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
      }
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
      return { removed, advanced: timeline.value !== start }
    } finally {
      canvas.removeEventListener = original
    }
  })
  expect(result.advanced).toBe(true)
  expect(result.removed).toBe(0)
})

test('paused National Rail stops buffer uploads and redraws after seeking and resuming', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.scene canvas')).toBeVisible()
  await setMobileControls(page, true)
  await page.getByRole('button', { name: 'Hide TfL rail', exact: true }).click()
  await page.getByRole('button', { name: 'Show National Rail', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Hide National Rail', exact: true })).toHaveAttribute('aria-busy', 'false')
  await page.evaluate(() => {
    const probe = window as typeof window & { railUploads: number }
    probe.railUploads = 0
    const original = WebGL2RenderingContext.prototype.bufferSubData
    WebGL2RenderingContext.prototype.bufferSubData = function (this: WebGL2RenderingContext, ...args: Parameters<typeof original>) {
      probe.railUploads++
      original.apply(this, args)
    } as typeof original
  })
  const uploads = () => page.evaluate(async () => {
    const probe = window as typeof window & { railUploads: number }
    // Let effects and the first changed frame finish before observing idle work.
    for (let i = 0; i < 3; i++) await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    const before = probe.railUploads
    for (let i = 0; i < 4; i++) await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    return probe.railUploads - before
  })
  expect(await uploads()).toBeGreaterThan(0)
  await page.getByRole('button', { name: 'Pause motion', exact: true }).click()
  expect(await uploads()).toBe(0)
  await page.evaluate(() => { (window as typeof window & { railUploads: number }).railUploads = 0 })
  await page.locator('.london-transport input[type="range"]').fill('27900')
  await expect.poll(() => page.evaluate(() => (window as typeof window & { railUploads: number }).railUploads)).toBeGreaterThan(0)
  expect(await uploads()).toBe(0)
  await page.getByRole('button', { name: 'Resume motion', exact: true }).click()
  expect(await uploads()).toBeGreaterThan(0)
})
