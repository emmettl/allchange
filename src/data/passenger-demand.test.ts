import { describe, expect, it } from 'vitest'
import fixture from '../../fixtures/passenger-demand/numbat-2025-friday.json'
import audit from '../../fixtures/passenger-demand/audit.json'
import { decodePassengerDemand, passengerInterval } from './passenger-demand.ts'
import { passengerStationId } from '../editions/london-passenger-stations.ts'

describe('audited NUMBAT pilot', () => {
  it('retains both station identities, source totals and one count per interchange link', () => {
    const data = decodePassengerDemand(fixture)
    expect(data.source.sha256).toBe(audit.source.sha256)
    expect(data.stations.bank.totals.entries).toBe(49893.338)
    expect(data.stations.stratford.totals.exits).toBe(86358.112)
    for (const id of ['bank', 'stratford'] as const) {
      const links = audit.stations[id].interchanges.links
      expect(links).toHaveLength(id === 'bank' ? 49 : 126)
      expect(new Set(links.map(link => link.id)).size).toBe(links.length)
      expect(links.reduce((sum, link) => sum + link.total, 0)).toBeCloseTo(data.stations[id].totals.interchanges, 2)
      for (const metric of ['entries', 'exits', 'interchanges'] as const) {
        expect(data.stations[id][metric].reduce((a, b) => a + b, 0)).toBeCloseTo(audit.stations[id][metric].total, 1)
      }
    }
  })
  it('does not match Stratford International, High Street or nearby Bank stations', () => {
    expect(passengerStationId('Bank')).toBe('bank')
    expect(passengerStationId('Monument')).toBe('bank')
    expect(passengerStationId('Stratford (London)')).toBe('stratford')
    for (const name of ['Stratford International', 'Stratford High Street', 'Cannon Street', 'Mansion House', undefined]) expect(passengerStationId(name)).toBeUndefined()
  })
  it('aligns 15-minute boundaries without rolling Saturday onto Friday', () => {
    expect(passengerInterval(17999)).toBeUndefined()
    expect(passengerInterval(18000)).toBe(0)
    expect(passengerInterval(18899)).toBe(0)
    expect(passengerInterval(18900)).toBe(1)
    expect(passengerInterval(27900)).toBe(11)
    expect(passengerInterval(86399)).toBe(75)
    for (const time of [0, -1, 86400, 90000, NaN]) expect(passengerInterval(time)).toBeUndefined()
  })
  it.each(['missing', 'negative', 'short', 'identity', 'total', 'day'] as const)('rejects %s data instead of showing misleading counts', corruption => {
    const data = structuredClone(fixture)
    if (corruption === 'missing') (data.stations.bank.entries as unknown[])[0] = null
    if (corruption === 'negative') data.stations.bank.entries[0] = -1
    if (corruption === 'short') data.stations.bank.entries.pop()
    if (corruption === 'identity') data.stations.bank.asc = 'CSTu'
    if (corruption === 'total') data.stations.bank.totals.entries = 1
    if (corruption === 'day') data.source.dayType = 'Saturday'
    expect(() => decodePassengerDemand(data)).toThrow()
  })
})
