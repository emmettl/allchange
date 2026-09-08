import { expect, test } from '@playwright/test'

// A fixed map viewport exercises the same visible airport in Chromium and
// touch-enabled WebKit. Picking tolerance at other zooms is covered separately.
test('airport labels and marker margins select the airport, while a drag pans', async ({ page }, info) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const openAir = async () => {
    await page.goto('/')
    await expect(page.locator('.scene canvas')).toBeVisible()
    await page.getByRole('button', { name: 'Pause motion', exact: true }).click()
    await page.getByRole('button', { name: 'Show observed aircraft', exact: true }).click()
    await expect(page.locator('.london-experience')).toHaveClass(/has-air-layer/)
    await page.screenshot({ path: info.outputPath('airport-targets.png') })
  }
  const experience = page.locator('.london-experience')
  await openAir()
  // Right-hand end of the rendered LHR label, away from the ring itself.
  await page.mouse.click(571, 394)
  await expect(experience).toHaveAttribute('data-selected-airport', 'heathrow')
  await expect(page.locator('.ms-airport-hero')).toBeVisible()
  await openAir()
  // A drag starting on the airport must never select it.
  await page.mouse.move(531, 413); await page.mouse.down()
  await page.mouse.move(571, 453, { steps: 8 }); await page.mouse.up()
  await expect(experience).not.toHaveAttribute('data-selected-airport')
  await openAir()
  // 20 CSS pixels from the centre: outside the visible ring, inside the target.
  if (info.project.name === 'iphone-webkit') await page.touchscreen.tap(551, 413)
  else await page.mouse.click(551, 413)
  await expect(experience).toHaveAttribute('data-selected-airport', 'heathrow')
  await expect(page.locator('.ms-airport-hero')).toBeVisible()
  expect(errors).toEqual([])
})
