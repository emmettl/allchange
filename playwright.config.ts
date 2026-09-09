import { defineConfig, devices } from '@playwright/test'

const environment = (globalThis as { process?: { env?: { CI?: string; E2E_SUITE?: string; E2E_PREBUILT?: string } } }).process?.env
const runningInCi = Boolean(environment?.CI)
const suiteName = environment?.E2E_SUITE || 'all'

export default defineConfig({
  testDir: './e2e',
  // Divide individual tests between CI shards, including tests in large specs.
  // One worker per CI runner below still keeps WebGL rendering serial there.
  fullyParallel: runningInCi,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  forbidOnly: true,
  // Retry transient hosted software-renderer failures once in CI.
  retries: runningInCi ? 1 : 0,
  // Two continuously rendered WebGL editions can starve Chromium's input and
  // animation loop on the shared CI runner. Keep local feedback parallel, but
  // run CI shards on separate runners with one worker each.
  workers: runningInCi ? 1 : 2,
  reporter: runningInCi
    ? [
        ['list'],
        ['github'],
        ['html', { outputFolder: `playwright-report/${suiteName}`, open: 'never' }],
        ['./scripts/playwright-summary-reporter.mjs'],
      ]
    : 'list',
  outputDir: runningInCi ? `test-results/${suiteName}` : 'test-results',
  use: {
    baseURL: 'http://127.0.0.1:4177',
    colorScheme: 'dark',
    locale: 'en-CH',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'iphone-webkit',
      use: { ...devices['iPhone 13'] },
    },
  ],
  webServer: {
    // CI downloads the checked build; local runs still build automatically.
    command: `${environment?.E2E_PREBUILT === '1' ? '' : 'npm run build && '}npm run preview -- --host 127.0.0.1 --port 4177 --strictPort`,
    url: 'http://127.0.0.1:4177',
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
