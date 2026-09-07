import { writeFile } from 'node:fs/promises'
import { parseArgs } from 'node:util'
import { chromium } from '@playwright/test'

const { values } = parseArgs({ options: {
  url: { type: 'string', default: 'http://127.0.0.1:4177' },
  channel: { type: 'string' },
  headless: { type: 'boolean', default: false },
  width: { type: 'string', default: '1920' },
  height: { type: 'string', default: '1080' },
  dpr: { type: 'string', default: '1.5' },
  duration: { type: 'string', default: '5000' },
  fps: { type: 'string', default: '60' },
  output: { type: 'string' },
} })
const numeric = Object.fromEntries(
  ['width', 'height', 'dpr', 'duration', 'fps'].map((key) => [key, Number(values[key])]),
)
for (const [key, value] of Object.entries(numeric)) {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`--${key} must be positive`)
}
if (!Number.isInteger(numeric.width) || !Number.isInteger(numeric.height)) {
  throw new Error('--width and --height must be integers')
}

const browser = await chromium.launch({ channel: values.channel, headless: values.headless })
try {
  const page = await browser.newPage({
    viewport: { width: numeric.width, height: numeric.height },
    deviceScaleFactor: numeric.dpr,
  })
  page.setDefaultTimeout(30_000)
  await page.goto(values.url)
  await page.locator('.london-status-card').filter({ hasText: 'trains in motion' }).waitFor()
  await page.locator('.scene canvas').waitFor()
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Performance.enable')
  const scenarios = []
  async function sample(name) {
    // Exclude lazy loading, camera settling, and initial shader compilation.
    await page.waitForTimeout(2500)
    const before = await cdp.send('Performance.getMetrics')
    const intervals = await page.evaluate((duration) => new Promise((resolve) => {
      const samples = []
      let started
      let previous
      const frame = (now) => {
        started ??= now
        if (previous !== undefined) samples.push(now - previous)
        previous = now
        if (now - started >= duration) resolve(samples)
        else requestAnimationFrame(frame)
      }
      requestAnimationFrame(frame)
    }), numeric.duration)
    const after = await cdp.send('Performance.getMetrics')
    const round = (number) => Math.round(number * 100) / 100
    const sorted = [...intervals].sort((a, b) => a - b)
    const percentile = (fraction) => round(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))])
    const budget = 1000 / numeric.fps
    const percentage = (limit) => round(100 * intervals.filter((ms) => ms > limit).length / intervals.length)
    const metrics = Object.fromEntries(
      ['TaskDuration', 'ScriptDuration', 'LayoutDuration', 'RecalcStyleDuration'].map((name) => [
        name,
        round(1000 * (after.metrics.find((metric) => metric.name === name).value
          - before.metrics.find((metric) => metric.name === name).value)),
      ]),
    )
    scenarios.push({
      name,
      frames: intervals.length,
      meanFps: round(1000 * intervals.length / intervals.reduce((sum, ms) => sum + ms, 0)),
      p50Ms: percentile(0.5),
      p95Ms: percentile(0.95),
      p99Ms: percentile(0.99),
      maxMs: round(sorted.at(-1)),
      overBudgetPercent: percentage(budget),
      // Allows timestamp jitter around one refresh; exposes clearly missed frames.
      overOneAndHalfBudgetsPercent: percentage(budget * 1.5),
      mainThreadMilliseconds: metrics,
    })
  }
  await sample('opening')
  await page.getByRole('searchbox').fill('Bakerloo')
  await page.getByRole('option', { name: /Bakerloo/ }).first().waitFor()
  await sample('search-open')
  await page.getByRole('option', { name: /Bakerloo/ }).first().click()
  await sample('selected-search-closed')
  await page.getByRole('button', { name: 'Clear search and selection' }).click()
  await page.getByRole('button', { name: 'Diagram layout' }).click()
  await page.locator('.london-experience[data-layout-transitioning="false"][data-layout-mix="1.000"]').waitFor()
  await sample('diagram')
  const environment = await page.evaluate(() => {
    const canvas = document.querySelector('.scene canvas')
    const gl = canvas.getContext('webgl2')
    const debug = gl?.getExtension('WEBGL_debug_renderer_info')
    return {
      userAgent: navigator.userAgent,
      renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : 'unavailable',
      canvas: { width: canvas.width, height: canvas.height },
    }
  })
  const report = JSON.stringify({
    capturedAt: new Date().toISOString(),
    platform: process.platform,
    browserVersion: browser.version(),
    settings: { ...numeric, channel: values.channel ?? 'chromium', headless: values.headless },
    environment,
    scenarios,
  }, null, 2)
  if (values.output) await writeFile(values.output, `${report}\n`)
  console.log(report)
} finally {
  await browser.close()
}
