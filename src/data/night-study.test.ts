import { describe, expect, it } from 'vitest'
import fixture from '../../fixtures/night/study.json'
import { nightDepartures, validateNightStudy, type NightStudy } from './night-study.ts'
const data = fixture as unknown as NightStudy

describe('night departure context', () => {
  it('looks beyond the loaded chunk without wrapping time or treating missing coverage as closure', () => {
    const bank = nightDepartures(data, ['940GZZLUBNK', '940GZZDLBNK'], 9000)
    expect(bank.partial).toBe(true)
    expect(bank.previous?.[0]).toBe(2280)
    expect(bank.next?.[0]).toBe(19800)
    expect(bank.count).toBe(37)
    expect(nightDepartures(data, ['crs:WAT'], 60).next?.[0]).toBe(60)
    expect(nightDepartures(data, ['crs:WAT'], 1800).next?.[0]).toBe(1980)
    expect(nightDepartures(data, ['crs:WAT'], 9000).next?.[0]).toBe(18300)
    expect(nightDepartures(data, ['missing'], 0).available).toBe(false)
    for (const time of [-1, 18000, 86400]) expect(nightDepartures(data, ['crs:WAT'], time).next).toBeUndefined()
  })
  it('deduplicates repeated source IDs but retains simultaneous departures', () => {
    const profile = { ...data, profiles: { A: { name: 'Test', kind: 'rail' as const, calls: [[-60, 0], [10, 0], [10, 0], [18010, 0]] as const } } }
    expect(nightDepartures(profile, ['A', 'A'], 0).count).toBe(2)
    expect(nightDepartures(profile, ['A'], 0).previous?.[0]).toBe(-60)
  })
  it('rejects wrong dates, malformed call indexes and invalid checkpoints', () => {
    expect(validateNightStudy(data, '2026-09-04')).toBe(data)
    expect(() => validateNightStudy(data, '2026-09-05')).toThrow()
    expect(() => validateNightStudy({ ...data, checkpoints: [] }, '2026-09-04')).toThrow()
    expect(() => validateNightStudy({ ...data, profiles: { A: { name: 'Bad', kind: 'rail', calls: [[0, 999]] } } }, '2026-09-04')).toThrow()
  })
})
