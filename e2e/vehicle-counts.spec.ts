import { expect, test, type Page } from '@playwright/test'
import { setMobileControls } from './mobile-controls.ts'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.scene canvas')).toBeVisible()
  await setMobileControls(page, true)
})

async function prepareVehicleCounts(page: Page, time: number) {
  await page.getByRole('button', { name: '24-hour study' }).click()
  await page.getByRole('button', { name: 'Pause motion' }).click()
  await page.locator('.london-transport input[type="range"]').fill(String(time))
  const experience = page.locator('.london-experience')
  const status = page.locator('.london-status-card')
  const layers = [
    { name: 'TfL rail', categories: ['Tube · DLR', 'Elizabeth · Overground', 'Tramlink'] },
    { name: 'observed aircraft', categories: ['AIR'] },
    { name: 'reconstructed motorway traffic', categories: ['ROAD'] },
    { name: 'London buses', categories: ['Buses'] },
    { name: 'River Bus and cable car', categories: ['River', 'Cable'] },
    { name: 'National Rail', categories: [] },
  ]
  let currentMask = 1
  const setLayers = async (mask: number) => {
    for (const [index, layer] of layers.entries()) {
      const bit = 1 << index
      if ((currentMask & bit) === (mask & bit)) continue
      await page.getByRole('button', {
        name: `${mask & bit ? 'Show' : 'Hide'} ${layer.name}`, exact: true,
      }).click()
    }
    currentMask = mask
    await expect(experience).toHaveAttribute('data-day-loading', 'false')
    await expect(experience).toHaveAttribute('data-bus-loading', 'false')
    for (const [index, layer] of layers.entries()) {
      if (index && (mask & (1 << index))) {
        await expect(page.getByRole('button', { name: `Hide ${layer.name}`, exact: true })).toHaveAttribute('aria-busy', 'false')
      }
    }
  }
  const readCount = async () => Number((await status.locator('strong').first().innerText()).replaceAll(',', ''))
  return { status, layers, setLayers, readCount }
}

for (const time of [27900, 66600]) {
  // Bound each browser session on software-rendered CI runners. Together the
  // four batches still exercise all 64 masks at each time in both browsers.
  for (const start of [0, 16, 32, 48]) {
    test(`vehicle count layer combinations ${start + 1}–${start + 16} of 64 at ${time}`, async ({ page }) => {
      test.setTimeout(240_000)
      const { status, layers, setLayers, readCount } = await prepareVehicleCounts(page, time)
      const individualCounts: number[] = []
      for (const [index, layer] of layers.entries()) {
        await setLayers(1 << index)
        await expect.poll(readCount, `${layer.name} should have active vehicles`).toBeGreaterThan(0)
        individualCounts.push(await readCount())
      }

      // Gray-code order exercises every combination with one toggle per transition.
      for (let step = start; step < start + 16; step++) {
        const mask = step ^ (step >> 1)
        const enabled = layers.filter((_, index) => mask & (1 << index)).map(layer => layer.name)
        await test.step(enabled.join(' + ') || 'All layers off', async () => {
          await setLayers(mask)
          if (!mask) {
            await expect(status).toContainText('All quiet.')
            return
          }
          const expected = individualCounts.reduce((sum, count, index) => sum + (mask & (1 << index) ? count : 0), 0)
          await expect.poll(readCount, `Total for ${enabled.join(' + ')}`).toBe(expected)
          const label = mask === 2 ? 'aircraft observed'
            : mask === 4 ? 'vehicles reconstructed'
            : mask & (2 | 4 | 8 | 16) ? 'vehicles in motion' : 'trains in motion'
          await expect(status.locator('div > span').first()).toHaveText(label)
          await expect(page.locator('.london-transport input[type="range"]')).toHaveValue(String(time))
        })
      }
    })
  }

  test(`vehicle count category selections exclude other enabled layers at ${time}`, async ({ page }) => {
    test.setTimeout(240_000)
    const { layers, setLayers, readCount } = await prepareVehicleCounts(page, time)
    const individualCounts: number[] = []
    const categoryCounts = new Map<string, number>()
    for (const [index, layer] of layers.entries()) {
      await setLayers(1 << index)
      await expect.poll(readCount, `${layer.name} should have active vehicles`).toBeGreaterThan(0)
      individualCounts.push(await readCount())
      for (const name of layer.categories) {
        const category = page.getByRole('button', { name, exact: true })
        await category.click()
        categoryCounts.set(name, await readCount())
        await category.click()
        await expect.poll(readCount).toBe(individualCounts[index])
      }
    }

    await setLayers(63)
    const total = individualCounts.reduce((sum, count) => sum + count, 0)
    for (const [name, count] of categoryCounts) {
      const category = page.getByRole('button', { name, exact: true })
      // The expanded rail board can overlap the long desktop legend. Keyboard
      // activation keeps this count regression independent of panel placement.
      await category.focus()
      await page.keyboard.press('Enter')
      await expect.poll(readCount, `${name} must exclude other enabled layers`).toBe(count)
      await category.focus()
      await page.keyboard.press('Enter')
      await expect.poll(readCount).toBe(total)
    }
  })
}
