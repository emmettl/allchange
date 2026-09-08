import { describe, expect, it } from 'vitest'
import fixture from '../../fixtures/cycle-hire/days/2026-05-29.json'
import audit from '../../fixtures/cycle-hire/audits/2026-05-29.json'
import manifestFixture from '../../fixtures/cycle-hire/manifest.json'
import { activeCycleTrips, cycleInterval, cycleProfiles, cycleProgress, decodeCycleDay, decodeCycleManifest, type CycleDay, type CycleTrip } from './cycle-hire.ts'

const days = import.meta.glob('../../fixtures/cycle-hire/days/*.json', { eager: true, import: 'default' })
const audits = import.meta.glob('../../fixtures/cycle-hire/audits/*.json', { eager: true, import: 'default' })

describe('cycle-hire day', () => {
  it('audits four independently loaded days against shared identities and fixed scales', () => {
    const manifest = decodeCycleManifest(manifestFixture)
    const peakByDock: Record<string, number> = {}, totals: number[] = []
    for (const date of manifest.dates) {
      const day = decodeCycleDay(days[`../../fixtures/cycle-hire/days/${date}.json`], date, manifest)
      const evidence = audits[`../../fixtures/cycle-hire/audits/${date}.json`] as typeof audit
      const { profiles, total } = cycleProfiles(day)
      expect(day.trips.length + day.excludedJourneys).toBe(evidence.counts.overlappingRows)
      expect(total.departures.reduce((a, b) => a + b, 0)).toBe(evidence.counts.departures)
      expect(total.returns.reduce((a, b) => a + b, 0)).toBe(evidence.counts.returns)
      profiles.forEach((p, i) => { const id = day.stations[i].id; peakByDock[id] = Math.max(peakByDock[id] ?? 1, ...p.departures, ...p.returns) })
      totals.push(Math.max(...total.departures, ...total.returns))
      if (date === '2026-05-30') expect(day.stations.some(dock => dock.id === '1084')).toBe(false)
      else expect(day.stations.some(dock => dock.id === '1084')).toBe(true)
    }
    expect(peakByDock).toEqual(manifest.profileMax)
    expect(Math.max(...totals)).toBe(manifest.totalProfileMax)
    expect(manifest.totalProfileMax).toBe(1227)
  })
  it('rejects mismatched dates, sources and reused identities during comparison', () => {
    const manifest = decodeCycleManifest(manifestFixture)
    expect(() => decodeCycleDay(fixture, '2026-05-30', manifest)).toThrow()
    const changed = structuredClone(fixture)
    changed.stations[0].name = 'A different dock'
    expect(() => decodeCycleDay(changed, '2026-05-29', manifest)).toThrow()
    expect(() => decodeCycleDay(fixture, '2026-05-29', { ...manifest, sourceSha256: '0'.repeat(64) })).toThrow()
    expect(() => decodeCycleManifest({ ...manifest, totalProfileMax: 0 })).toThrow()
    expect(() => decodeCycleManifest({ ...manifest, bounds: [0, 0, 0, 0] })).toThrow()
  })
  it('reconciles all mapped endpoint events to the audited day', () => {
    const day = decodeCycleDay(fixture), { total } = cycleProfiles(day)
    expect(day.stations).toHaveLength(792)
    expect(day.trips).toHaveLength(31247)
    expect(day.excludedJourneys).toBe(295)
    expect(day.trips.length + day.excludedJourneys).toBe(audit.counts.overlappingRows)
    expect(total.departures.reduce((a, b) => a + b, 0)).toBe(31096)
    expect(total.returns.reduce((a, b) => a + b, 0)).toBe(30983)
    expect(new Set(day.stations.map(s => s.id)).size).toBe(792)
    expect(day.stations.some(s => s.id === '2639')).toBe(false)
  })
  it('keeps carry-in, carry-out and instantaneous events on their actual dates', () => {
    const trips: CycleTrip[] = [[-60, 60, 0, 1], [900, 900, 0, 0], [86340, 86460, 1, 0]]
    const day = { stations: [{}, {}], trips } as CycleDay
    const { profiles, active, total } = cycleProfiles(day)
    expect(total.departures.reduce((a, b) => a + b, 0)).toBe(2)
    expect(total.returns.reduce((a, b) => a + b, 0)).toBe(2)
    expect(profiles[0].departures[1]).toBe(1)
    expect(profiles[0].returns[1]).toBe(1)
    expect(activeCycleTrips(active[0], 0)).toEqual([trips[0]])
    expect(activeCycleTrips(active[0], 60)).toEqual([])
    expect(activeCycleTrips(active[1], 900)).toEqual([])
    expect(activeCycleTrips(active[95], 86399)).toEqual([trips[2]])
    expect(activeCycleTrips(active[95], 86400)).toEqual([])
  })
  it('filters selected dock journeys and interpolates only within recorded bounds', () => {
    const trips: CycleTrip[] = [[0, 600, 0, 1], [60, 600, 1, 2], [120, 600, 2, 2]]
    expect(activeCycleTrips(trips, 300, 0)).toEqual([trips[0]])
    expect(activeCycleTrips(trips, 300, 2)).toHaveLength(2)
    expect(cycleProgress(trips[0], 300)).toBe(.5)
    expect(cycleProgress(trips[0], -1)).toBe(0)
    expect(cycleProgress(trips[0], 700)).toBe(1)
    expect(cycleInterval(899)).toBe(0)
    expect(cycleInterval(900)).toBe(1)
    for (const time of [-1, NaN, 86400]) expect(cycleInterval(time)).toBeUndefined()
  })
  it.each(['identity', 'date', 'coordinate', 'index', 'duration', 'order'] as const)('rejects corrupted %s data', corruption => {
    const day = structuredClone(fixture)
    if (corruption === 'identity') day.stations[1].id = day.stations[0].id
    if (corruption === 'date') day.date = '2026-09-04'
    if (corruption === 'coordinate') day.stations[0].lat = NaN
    if (corruption === 'index') day.trips[0][2] = day.stations.length
    if (corruption === 'duration') day.trips[0][1] = day.trips[0][0] - 1
    if (corruption === 'order') day.trips.reverse()
    expect(() => decodeCycleDay(day)).toThrow()
  })
})
