/// <reference lib="dom" />
import { expect, test } from '@playwright/test'
import { setMobileControls } from './mobile-controls'
import { installWebGLDrawCounters, sampleWebGLDraws } from './webgl-draws'

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
