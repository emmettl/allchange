import type { Page } from '@playwright/test'

export async function setMobileControls(page: Page, open: boolean) {
  const toggle = page.locator('#london-controls-toggle')
  if (await toggle.isVisible() && await toggle.getAttribute('aria-expanded') !== String(open)) {
    await toggle.click()
  }
}
