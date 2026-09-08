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
  'study-time': { type: 'string' },
  'playback-rate': { type: 'string' },
  settle: { type: 'string', default: '2500' },
  scenarios: { type: 'string' },
  fps: { type: 'string', default: '60' },
  output: { type: 'string' },
  'profile-dir': { type: 'string' },
  buses: { type: 'boolean', default: false },
  rail: { type: 'boolean', default: false },
  'air-roads': { type: 'boolean', default: false },
  angle: { type: 'string' },
  'cpu-throttle': { type: 'string', default: '1' },
} })
const numeric = Object.fromEntries(
  ['width', 'height', 'dpr', 'duration', 'fps', 'cpu-throttle', 'settle'].map((key) => [key, Number(values[key])]),
)
for (const [key, value] of Object.entries(numeric)) {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`--${key} must be positive`)
}
if (!Number.isInteger(numeric.width) || !Number.isInteger(numeric.height)) {
  throw new Error('--width and --height must be integers')
}

if (numeric['cpu-throttle'] < 1) throw new Error('--cpu-throttle must be at least 1')
if (values['study-time'] !== undefined && (!Number.isInteger(Number(values['study-time'])) || Number(values['study-time']) < 0 || Number(values['study-time']) > 86400)) {
  throw new Error('--study-time must be service seconds between 0 and 86400')
}
if (values['playback-rate'] !== undefined && !['30', '120', '480', '1920'].includes(values['playback-rate'])) {
  throw new Error('--playback-rate must be 30, 120, 480 or 1920')
}
const browser = await chromium.launch({ channel: values.channel, headless: values.headless,
  args: values.angle ? [`--use-angle=${values.angle}`] : [],
})
try {
  const page = await browser.newPage({
    viewport: { width: numeric.width, height: numeric.height },
    deviceScaleFactor: numeric.dpr,
  })
  page.setDefaultTimeout(90_000)
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(values.url)
  await page.locator('.london-status-card').filter({ hasText: 'trains in motion' }).waitFor()
  await page.locator('.scene canvas').waitFor()
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Performance.enable')
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: numeric['cpu-throttle'] })
  const scenarios = []
  async function sample(name) {
    if (values.scenarios && !values.scenarios.split(',').includes(name)) return
    // Reset the same study time so throttled loading cannot move the
    // comparison into another traffic window. Record the actual start too.
    if (values['playback-rate']) await page.getByRole('combobox', { name: 'Playback speed' }).selectOption(values['playback-rate'])
    if (values['study-time']) {
      const pause = page.getByRole('button', { name: 'Pause motion', exact: true })
      if (await pause.count()) await pause.click()
      await page.locator('.london-transport input[type="range"]').fill(values['study-time'])
      await page.waitForTimeout(numeric.settle)
      await page.getByRole('button', { name: 'Resume motion', exact: true }).click()
    }
    // Exclude lazy loading, camera settling, and initial shader compilation.
    await page.waitForTimeout(numeric.settle)
    const studyTime = await page.locator('.london-transport input[type="range"]').inputValue()
    if (values['profile-dir']) {
      await cdp.send('Profiler.enable')
      await cdp.send('Profiler.start')
    }
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
    if (values['profile-dir']) {
      const { profile } = await cdp.send('Profiler.stop')
      await writeFile(`${values['profile-dir']}/${name}.cpuprofile`, JSON.stringify(profile))
    }
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
      studyTime: Number(studyTime),
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
      scriptMsPerFrame: round(metrics.ScriptDuration / intervals.length),
    })
  }
  await sample('opening')
  if (values['air-roads']) {
    await page.getByRole('button', { name: 'Show observed aircraft', exact: true }).click()
    await page.getByRole('button', { name: 'Show reconstructed motorway traffic', exact: true }).click()
    for (const name of ['Hide observed aircraft', 'Hide reconstructed motorway traffic']) {
      await page.getByRole('button', { name, exact: true }).and(page.locator('[aria-busy="false"]')).waitFor()
    }
    await sample('rail-air-roads')
    await page.getByRole('button', { name: 'Hide TfL rail', exact: true }).click()
    await sample('air-roads')
  } else if (values.rail) {
    await page.getByRole('button', { name: 'Show National Rail', exact: true }).click()
    await page.getByRole('button', { name: 'Hide National Rail', exact: true }).and(page.locator('[aria-busy="false"]')).waitFor()
    await sample('all-national-rail')
    await page.getByRole('button', { name: 'Interchange pulse', exact: true }).click()
    await page.getByRole('combobox', { name: 'Pulse interchange' }).selectOption('london-bridge')
    await sample('london-bridge-pulse')
  } else if (values.buses) {
    await page.getByRole('button', { name: 'Show London buses' }).click()
    await page.locator('.london-experience[data-bus-loading="false"]').waitFor({ timeout: 90_000 })
    await sample('all-buses')
    await page.getByRole('searchbox').fill('bus 26')
    await page.getByRole('option').first().click()
    await sample('selected-bus-route')
  } else {
    await page.getByRole('searchbox').fill('Bakerloo')
    await page.getByRole('option', { name: /Bakerloo/ }).first().waitFor()
    await sample('search-open')
    await page.getByRole('option', { name: /Bakerloo/ }).first().click()
    await sample('selected-search-closed')
    await page.getByRole('button', { name: 'Clear search and selection' }).click()
    await page.getByRole('button', { name: 'Diagram layout' }).click()
    await page.locator('.london-experience[data-layout-transitioning="false"][data-layout-mix="1.000"]').waitFor()
    await sample('diagram')
  }
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
    settings: { ...numeric, channel: values.channel ?? 'chromium', headless: values.headless,
      scenarioFilter: values.scenarios, studyTime: values['study-time'], playbackRate: values['playback-rate'], profiling: Boolean(values['profile-dir']),
      angle: values.angle ?? 'default', buses: values.buses, rail: values.rail, airRoads: values['air-roads'] },
    environment,
    errors,
    scenarios,
  }, null, 2)
  if (values.output) await writeFile(values.output, `${report}\n`)
  console.log(report)
} finally {
  await browser.close()
}
