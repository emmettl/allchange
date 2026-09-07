import { describe, expect, it } from 'vitest'
import { parseTable } from './compile-national-rail.mjs'

const row = (label, values) => label.padEnd(44) + values.map(value => value.padEnd(24)).join('')
const table = [
  'MONDAYS TO FRIDAYS',
  row('Notes', ['A', 'B', 'FX', 'FO']),
  row('Facilities', ['E', 'E', 'E', 'E']),
  row('London Paddington d', ['0620', '0623', '0700', '0712']),
  row('Reading a', ['0700', '0700', '0723', '0738']),
].join('\n')

describe('GWR timetable importer', () => {
  it('filters date/weekday exceptions by column and retains source identities', () => {
    const result = parseTable(table, 'TS', 4, 'outbound')
    expect(result.journeys.map(train => train.start)).toEqual([22980, 25920])
    expect(result.journeys.map(train => train.source.column)).toEqual([2, 4])
    expect(result.excluded.map(item => item.reason)).toEqual(['Not Friday 4 September: A', 'Not Friday 4 September: FX'])
  })
  it('handles midnight without inventing extra departures on the same calendar day', () => {
    const text = ['MONDAYS TO FRIDAYS', row('Facilities', ['E', 'E', 'E']), row('London Paddington d', ['2337p', '2337', '0001']), row('Reading a', ['0022', '0022', '0048'])].join('\n')
    const result = parseTable(text, 'T10', 4, 'outbound')
    expect(result.journeys.map(train => [train.start, train.end])).toEqual([[-1380, 1320], [85020, 87720]])
    expect(result.excluded).toContainEqual(expect.objectContaining({ reason: 'Outside calendar study day' }))
  })
  it('fails closed on missing rows, unknown notes and nonmonotonic calls', () => {
    expect(() => parseTable(table.replace('London Paddington', 'Other terminal'), 'TS', 4, 'outbound')).toThrow('Missing Paddington')
    expect(() => parseTable(table.replace('Reading', 'Other station'), 'TS', 4, 'outbound')).toThrow('Missing Reading')
    expect(() => parseTable(table.replace('FX', 'ZZ'), 'TS', 4, 'outbound')).toThrow('Unreviewed note')
    expect(() => parseTable(table.replace('0738', '0600'), 'TS', 4, 'outbound')).toThrow('Non-monotonic')
  })
})
