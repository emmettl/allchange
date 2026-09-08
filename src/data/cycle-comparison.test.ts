import { describe, expect, it } from 'vitest'
import manifestFixture from '../../fixtures/cycle-hire/manifest.json'
import waterlooFixture from '../../fixtures/cycle-hire/profiles/1072.json'
import { decodeCycleComparison } from './cycle-comparison.ts'
import { cycleProfiles, decodeCycleDay, decodeCycleManifest } from './cycle-hire.ts'
import { CYCLE_GUIDES } from '../studies/cycle-guides.ts'

const manifest = decodeCycleManifest(manifestFixture)
const profiles = import.meta.glob('../../fixtures/cycle-hire/profiles/*.json', { eager: true, import: 'default' })
const days = import.meta.glob('../../fixtures/cycle-hire/days/*.json', { eager: true, import: 'default' })
const profileFor = (id: string) => decodeCycleComparison(profiles[`../../fixtures/cycle-hire/profiles/${id}.json`], id, manifest)
const sum = (values: number[], start: number, end: number) => values.slice(start * 4, end * 4).reduce((a, b) => a + b, 0)

describe('four-day dock profiles', () => {
  it('reconciles every interval to audited journeys and retains missing-day coverage', () => {
    expect(Object.keys(profiles)).toHaveLength(manifest.stations.length)
    const expected = manifest.dates.map(date => {
      const day = decodeCycleDay(days[`../../fixtures/cycle-hire/days/${date}.json`], date, manifest)
      const indexed = cycleProfiles(day)
      return new Map(day.stations.map((dock, i) => [dock.id, indexed.profiles[i]]))
    })
    for (const dock of manifest.stations) {
      const data = profileFor(dock.id)
      expect(data.profiles).toEqual(expected.map(day => day.get(dock.id) ?? null))
    }
    expect(profileFor('1084').profiles[2]).toBeNull()
  })
  it('supports all authored counts and time windows without inferring journey purposes', () => {
    expect(CYCLE_GUIDES.map(guide => guide.dockId)).toEqual(['1072', '999', '1075'])
    for (const guide of CYCLE_GUIDES) {
      expect(manifest.dates).toContain(guide.date)
      expect(guide.time).toBeGreaterThanOrEqual(0)
      expect(guide.time).toBeLessThan(86400)
      expect(profileFor(guide.dockId).profiles.every(Boolean)).toBe(true)
    }
    for (const [id, counts] of [['1072', [205, 2, 10, 164]], ['999', [12, 137, 85, 23]]] as const) {
      const profile = profileFor(id).profiles[0]!
      expect([sum(profile.departures, 7, 10), sum(profile.returns, 7, 10), sum(profile.departures, 16, 19), sum(profile.returns, 16, 19)]).toEqual(counts)
    }
    expect(profileFor('1075').profiles.map(p => sum(p!.departures, 12, 17) + sum(p!.returns, 12, 17))).toEqual([110, 193, 214, 272])
  })
  it.each(['identity', 'source', 'dates', 'scale', 'length', 'count', 'missing'] as const)('rejects corrupted %s comparisons', corruption => {
    const data = structuredClone(waterlooFixture)
    if (corruption === 'identity') data.dockId = '999'
    if (corruption === 'source') data.sourceSha256 = '0'.repeat(64)
    if (corruption === 'dates') data.dates.reverse()
    if (corruption === 'scale') data.maximum++
    if (corruption === 'length') data.profiles[0].returns.pop()
    if (corruption === 'count') data.profiles[0].departures[0] = -1
    if (corruption === 'missing') data.profiles = []
    expect(() => decodeCycleComparison(data, '1072', manifest)).toThrow()
  })
})
