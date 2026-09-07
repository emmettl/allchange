import { expect, test } from '@playwright/test'

test('edition controls expose desktop help without touch tooltips', async ({ page, isMobile }) => {
  await page.goto('/')
  const control = page.locator('button.london-air-toggle:visible').first()
  await expect(control).toBeVisible()
  await control.hover()
  if (isMobile) {
    await control.tap()
    await page.waitForTimeout(500)
    await expect(page.getByRole('tooltip')).toHaveCount(0)
  } else {
    await expect(page.getByRole('tooltip')).toHaveText('Show observed aircraft')
    await page.keyboard.press('Escape')
    await expect(page.getByRole('tooltip')).toHaveCount(0)
    await control.focus()
    await expect(page.getByRole('tooltip')).toHaveText('Show observed aircraft')
  }
  await expect(page.locator('button[title]')).toHaveCount(0)
})
