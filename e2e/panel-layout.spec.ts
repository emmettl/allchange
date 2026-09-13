import { expect, test } from '@playwright/test'

test('selected panels fit above playback and keep airport evidence reachable', async ({ page, isMobile }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await expect(page.locator('.scene canvas')).toBeVisible()
  await page.getByRole('button', { name: 'Pause motion', exact: true }).click()
  for (const [width, height] of (isMobile ? [[390, 664]] : [[1440, 900], [1024, 600]])) {
    await page.setViewportSize({ width, height })
    for (const query of ['Whitechapel', 'Heathrow']) {
      await page.getByRole('searchbox').fill(query)
      await page.getByRole('option').first().click()
      const panel = page.locator('.ms-study-panel').first()
      await expect(panel).toBeVisible()
      await expect.poll(async () => {
        const box = await panel.boundingBox()
        const playback = await page.locator('.london-transport').boundingBox()
        return Boolean(box && playback && box.x >= 0 && box.x + box.width <= width && box.height > 40 && box.y + box.height <= playback.y)
      }).toBe(true)
      expect(await panel.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
      if (query === 'Heathrow') {
        await expect(panel.locator('.ms-airport-hero__code')).toHaveCSS('font-size', '40px')
        const evidence = panel.getByRole('link').last()
        await evidence.focus()
        await expect(evidence).toBeInViewport()
        await page.screenshot({ path: `test-results/panel-airport-${width}.png` })
      }
    }
  }
})
