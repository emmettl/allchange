import { describe, expect, it } from 'vitest'
import catalogueFixture from '../../fixtures/passenger-demand/catalogue.json'
import bank from '../../fixtures/passenger-demand/stations/BNKu.json'
import stratford from '../../fixtures/passenger-demand/stations/SFDu.json'
import clapham from '../../fixtures/passenger-demand/stations/CLJr.json'
import audit from '../../fixtures/passenger-demand/audit.json'
import { decodePassengerCatalogue, decodePassengerDemand, passengerAreaIds, passengerInterval, type PassengerDemand } from './passenger-demand.ts'

const profiles = import.meta.glob('../../fixtures/passenger-demand/stations/*.json', { eager: true, import: 'default' })
const catalogue = decodePassengerCatalogue(catalogueFixture)
const decode = (value: unknown, asc = 'BNKu') => decodePassengerDemand(value, catalogue.areas[asc], catalogue.source.sha256)
describe('audited NUMBAT coverage', () => {
  it('validates every shipped source area and its metric totals', () => {
    expect(Object.keys(profiles)).toHaveLength(Object.keys(catalogue.areas).length)
    for (const [asc, area] of Object.entries(catalogue.areas)) {
      const data = decodePassengerDemand(profiles[`../../fixtures/passenger-demand/stations/${asc}.json`], area, catalogue.source.sha256)
      expect(data.station.entries).toHaveLength(96)
      expect(data.station.exits).toHaveLength(96)
    }
  })
  it('retains the pilot identities and reconciles directed interchange links', () => {
    for (const [fixture, asc, count] of [[bank, 'BNKu', 49], [stratford, 'SFDu', 126]] as const) {
      const data = decode(fixture, asc)
      const links = audit.stations[asc].interchanges.links
      expect(links).toHaveLength(count)
      expect(new Set(links.map(link => link.id)).size).toBe(count)
      expect(links.reduce((sum, link) => sum + link.total, 0)).toBeCloseTo(data.station.totals.interchanges!, 2)
    }
    expect(decode(bank).station.totals.entries).toBe(49893.338)
    expect(decode(stratford, 'SFDu').station.totals.exits).toBe(86358.112)
  })
  it('maps wider coverage without combining source areas or tram placeholders', () => {
    expect(Object.keys(catalogue.areas)).toHaveLength(432)
    expect(passengerAreaIds(catalogue, 'Whitechapel')).toEqual(['WCLu'])
    expect(passengerAreaIds(catalogue, 'Bank')).toEqual(['BNKu'])
    expect(passengerAreaIds(catalogue, 'Monument')).toEqual(['BNKu'])
    expect(passengerAreaIds(catalogue, 'Stratford (London)')).toEqual(['SFDu'])
    expect(passengerAreaIds(catalogue, 'Stratford High Street')).toEqual(['SHSd'])
    expect(passengerAreaIds(catalogue, 'Stratford International')).toEqual(['STId'])
    expect(passengerAreaIds(catalogue, 'Canary Wharf')).toEqual(['CWFu', 'CAWd', 'CWXr'])
    expect(passengerAreaIds(catalogue, 'Edgware Road (Bakerloo)')).toEqual(['ERBu'])
    expect(passengerAreaIds(catalogue, 'Edgware Road (Circle Line)')).toEqual(['ERDu'])
    for (const name of ['Addington Village', 'Surbiton', 'West Hampstead Thameslink', '__proto__']) expect(passengerAreaIds(catalogue, name)).toEqual([])
    expect(audit.excluded).toHaveLength(39)
  })
  it('withholds ambiguous interchange totals while retaining entry and exit profiles', () => {
    const station = decode(clapham, 'CLJr').station
    expect(station.entries).toHaveLength(96)
    expect(station.exits).toHaveLength(96)
    expect(station.interchanges).toBeUndefined()
    expect(station.totals.interchanges).toBeUndefined()
    expect(station.unavailable?.interchanges).toContain('duplicate')
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
  it.each(['missing', 'negative', 'short', 'identity', 'total', 'day', 'hash'] as const)('rejects %s data instead of showing misleading counts', corruption => {
    const data = structuredClone(bank) as PassengerDemand
    if (corruption === 'missing') (data.station.entries as unknown[])[0] = null
    if (corruption === 'negative') data.station.entries![0] = -1
    if (corruption === 'short') data.station.entries!.pop()
    if (corruption === 'identity') data.station.asc = 'CSTu'
    if (corruption === 'total') data.station.totals.entries = 1
    if (corruption === 'day') Object.assign(data.source, { dayType: 'Saturday' })
    if (corruption === 'hash') data.source.sha256 = '0'.repeat(64)
    expect(() => decode(data)).toThrow()
  })
})
