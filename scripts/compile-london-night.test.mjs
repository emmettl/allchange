import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { compileNightStudy } from './compile-london-night.mjs'
import { selectBusTimetables } from './compile-tfl-bus-study.mjs'
const data = JSON.parse(readFileSync('fixtures/night/study.json'))

describe('night source and service-day audit', () => {
  it('rebuilds from committed, hash-checked source chunks and preserves the prior-day carry-in evidence', async () => {
    expect(await compileNightStudy()).toEqual(data)
    expect(data.audit.carryIn).toEqual({ tfl: 0, rail: 136, bus: 3256 })
    expect(data.audit.previousServiceDate).toBe('2026-09-03')
    expect(data.audit.coverage.tfl).toContain('Partial')
    expect(data.audit.coverage.demand).toContain('Unavailable before 05:00')
  })
  it('assigns Friday Night 24+ to Saturday rather than the Friday-morning view', () => {
    const source = { timetable: { routes: [{ schedules: ['Monday to Thursday Night', 'Friday Night'].map(name => ({ name, knownJourneys: [{ hour: '25', minute: '30' }] })) }] } }
    const schedules = selectBusTimetables(source, '2026-09-04')
    expect(schedules.map(s => [s.timetable.timetable.routes[0].schedules[0].name, s.timeOffsetSeconds + 25.5 * 3600])).toEqual([
      ['Monday to Thursday Night', 5400], ['Friday Night', 91800],
    ])
  })
  it('keeps precise source identities, preserves passing restrictions, and never calls a TfL gap closure', () => {
    expect(data.comparisons.map(c => [c.name, c.ids.flatMap(id => data.profiles[id].calls).filter(([time]) => time >= 0 && time < 18000).length])).toEqual([['Waterloo', 5], ['Bank', 0], ['Upminster', 8]])
    expect(data.profiles['tiploc:EBSFWJN'].calls).toEqual([])
    expect(data.profiles['940GZZLUBNK'].kind).toBe('tfl')
    expect(data.checkpoints[5].bus.routes).toContain('N26')
    expect(data.checkpoints[5].tfl.journeys).toBe(0)
  })
})
