import { expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'

it('rebuilds exactly from retained sources and converts agency time without midnight wrapping', () => {
  expect(execFileSync('python3', ['scripts/compile-eurostar.py', '--check'], { encoding: 'utf8' })).toContain('"boardJourneys": 55')
  const converted = execFileSync('python3', ['-c', "import runpy; m=runpy.run_path('scripts/compile-eurostar.py'); print(m['london_seconds']('08:04:00','Europe/Brussels'),m['london_seconds']('26:30:00','Europe/Brussels'))"], { encoding: 'utf8' }).trim()
  expect(converted).toBe('25440 91800') // 07:04 and 25:30 London, not GTFS's Brussels clock.
})
