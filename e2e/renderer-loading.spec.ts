import { expect, test } from '@playwright/test'

test('the opening network does not fetch the optional shared road renderer', async ({ page }) => {
  const roadRequests: string[] = []
  page.on('request', request => {
    if (/RoadTrafficLayer(?:[-.]|\.js)/.test(request.url())) roadRequests.push(request.url())
  })
  await page.goto('/')
  await expect(page.locator('canvas').first()).toBeVisible()
  // Wait for the opening network's geometry, beyond the lazy scene import.
  await expect.poll(() => page.evaluate(() => document.querySelectorAll('canvas').length)).toBeGreaterThan(0)
  await page.waitForTimeout(1000)
  expect(roadRequests).toEqual([])
})
