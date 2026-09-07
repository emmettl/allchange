import { readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { parseKingsCrossWtt, wttRunsOn, wttTime } from './compile-kings-cross-national-rail.mjs'
const rail = JSON.parse(readFileSync('fixtures/national-rail/kings-cross.json'))
const headers = ['TID', 'UID', 'Operator', 'Origin', 'Destination', 'Timing Load', 'Dates of Operation', 'Running Days', 'Service Code']
const emptySheet = () => headers.map(label => ['', label])
const forward = (uid = 'C12345') => [
  ...headers.map((label, i) => ['', label, ['1D01', uid, 'GR', 'LONDON KINGS CROSS\n23:50', 'LEEDS\n02:00', '800', '18/05/2026 to 11/12/2026', 'SX', '21702001'][i]]),
  ['LONDON KINGS CROSS', 'dep', '23TB50'], ['FINSBURY PARK', 'pass', '23/54'], ['ALEXANDRA PALACE', 'pass', '23/55½'], ['WELWYN GARDEN CITY', 'pass', '00/04'],
]
const sheets = rows => ({ 'Mondays to Fridays Forward': rows, 'Mondays to Fridays Reverse': emptySheet() })

describe('King’s Cross working timetable import', () => {
  it('retains half minutes and rejects unreviewed timing and calendar codes', () => {
    expect(wttTime('07/45½')).toBe(27930)
    expect(wttTime('07TBK KE18')).toBe(26280)
    expect(() => wttTime('07ZZ45')).toThrow('Unreviewed')
    expect(() => wttTime('07T99')).toThrow('Unreviewed')
    const range = '18/05/2026 to 11/12/2026'
    expect(wttRunsOn('MX', range, '2026-09-04')).toBe(true)
    expect(wttRunsOn('MO', range, '2026-09-04')).toBe(false)
    expect(wttRunsOn('MO', range, '2026-09-07')).toBe(true)
    expect(wttRunsOn('SX', range, '2026-09-05')).toBe(false)
    expect(wttRunsOn('SX', range, '2026-12-14')).toBe(false)
    expect(() => wttRunsOn('ZZ', range, '2026-09-04')).toThrow('Unreviewed')
  })
  it('keeps both calendar-day edges, passing points and column identities', () => {
    const result = parseKingsCrossWtt(sheets(forward()))
    expect(result.journeys.map(train => [train.stops[0][1], train.stops.at(-1)[2]])).toEqual([[-600, 240], [85800, 86640]])
    expect(result.journeys[0].passIndexes).toEqual([1, 2, 3])
    const rows = forward().map(row => [...row, row[2]])
    rows[1][3] = 'C12346'
    expect(parseKingsCrossWtt(sheets(rows)).journeys).toHaveLength(4)
    rows[1][3] = 'C12345'
    expect(() => parseKingsCrossWtt(sheets(rows))).toThrow('Duplicate active WTT UID')
  })
  it('rejects incomplete routes and excludes empty stock without inventing calls', () => {
    const rows = forward()
    rows.at(-1)[2] = '..'
    expect(parseKingsCrossWtt(sheets(rows)).excluded[0].reason).toContain('No Welwyn')
    const stock = forward(); stock[0][2] = '5D01'
    expect(parseKingsCrossWtt(sheets(stock)).journeys).toEqual([])
    expect(() => parseKingsCrossWtt({ 'Mondays to Fridays Forward': forward() })).toThrow('Both weekday')
  })
  it('matches audited YA01 cells, public terminal times and Friday operator totals', () => {
    expect(rail.trains).toHaveLength(431)
    expect(rail.metadata.coverage.operators).toEqual({ 'Great Northern': 181, LNER: 194, Lumo: 12, 'Hull Trains': 15, 'Grand Central': 20, Thameslink: 9 })
    // YA01 Forward CH11 / CH69 / CH113 / CH187 / CH211 (column 86).
    const express = rail.trains.find(train => train.source.uid === 'C02085')
    expect(express.stops).toEqual([[0, 20400, 20400], [1, 20640, 20640], [4, 20730, 20730], [9, 21000, 21000], [13, 21240, 21240]])
    expect(express.passIndexes).toEqual([1, 2, 3, 4])
    // YA01 Reverse N5 advertises 00:36; N215 is the working arrival 00:33.
    const arrival = rail.trains.find(train => train.source.uid === 'C02017')
    expect(arrival.source.workingTerminalTime).toBe(1980)
    expect(arrival.end).toBe(2160)
    // Forward K67/K68 retains an explicit Finsbury Park dwell from 00:12 to 00:13.
    expect(rail.trains.find(train => train.source.uid === 'C18626').stops[1]).toEqual([1, 720, 780])
    expect(rail.trains.filter(train => train.start < 0)).toHaveLength(3)
    expect(rail.trains.filter(train => train.end > 86400)).toHaveLength(3)
    expect(rail.trains.every(train => train.source.days !== 'MO')).toBe(true)
    expect(gzipSync(readFileSync('fixtures/national-rail/kings-cross.json')).length).toBeLessThan(64 * 1024)
    expect(rail.metadata.sources[0].sha256).toMatch(/^[a-f0-9]{64}$/)
  })
})
