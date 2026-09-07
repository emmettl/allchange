import { readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { calendarJourneys, enrichSwrCalls, parseSwrRows } from './compile-swr-national-rail.mjs'
import { assembleRailCorridor } from './national-rail-corridor.mjs'
import { railCorridorGeometry } from './compile-national-rail-geometry.mjs'
const rail = JSON.parse(readFileSync('fixtures/national-rail/waterloo.json'))
const geometry = JSON.parse(readFileSync('fixtures/national-rail/waterloo-geometry.json'))
const names = rail.stops.map(stop => stop[2])
const row = (label, values) => ({ words: [{ x: 50, text: label }, ...values.map((text, i) => ({ x: 100 + i * 20, text }))] })

describe('SWR column and calendar import', () => {
  it('preserves columns with gaps, boarding notes and Friday exceptions', () => {
    const rows = [row('MONDAY TO FRIDAY', []), row('Notes', ['FX', 'FO', '']), row('London Waterloo d', ['0600', '0610', '0620']), row('Clapham Junction d', ['0607u', 'v', '0627']), row('Woking a', ['0630', '0640', '0650'])]
    const columns = parseSwrRows(rows, { table: 'test', page: 1, direction: 'outbound', names })
    const result = calendarJourneys(columns, '2026-09-04', names)
    expect(result.journeys).toHaveLength(2)
    expect(result.journeys[0].stops).toEqual([[0, 22200, 22200], [15, 24000, 24000]])
    expect(result.journeys[1].stops).toEqual([[0, 22800, 22800], [2, 23220, 23220], [15, 24600, 24600]])
    expect(() => parseSwrRows([rows[0], row('Notes', ['ZZ', '', '']), ...rows.slice(2)], { table: 'test', page: 1, direction: 'outbound', names })).toThrow('Unreviewed')
  })
  it('keeps Thursday overnight tails and Friday departures with Saturday-morning restrictions', () => {
    const rows = [row('MONDAY TO FRIDAY', []), row('Notes', ['FX', 'FO', 'SX', 'SO']), row('London Waterloo d', ['2350', '2355', '0010', '0020']), row('Woking a', ['0020', '0025', '0040', '0050'])]
    const result = calendarJourneys(parseSwrRows(rows, { table: 'test', page: 1, direction: 'outbound', names }), '2026-09-04', names)
    expect(result.journeys.map(train => [train.source.column, train.start, train.end])).toEqual([[1, -600, 1200], [2, 86100, 87900], [3, 600, 2400]])
  })
  it('retains separate trains arriving in the same minute and refuses ambiguous enrichment', () => {
    const train = rail.trains.find(train => train.source.enrichedFrom)
    const result = enrichSwrCalls([train], [train, { ...train, id: 'another' }], names)
    expect(result.journeys[0]).toBe(train)
    expect(result.audit[0].reason).toContain('Ambiguous')
    const sameMinute = rail.trains.filter(train => train.direction === 'inbound' && train.end === 7 * 3600 + 26 * 60)
    expect(sameMinute).toHaveLength(2)
    expect(sameMinute[0].id).not.toBe(sameMinute[1].id)
  })
  it('matches reviewed printed columns, including arrival/departure dwell and the closed station', () => {
    expect(rail.trains).toHaveLength(451)
    expect(rail.trains.filter(train => train.source.enrichedFrom)).toHaveLength(133)
    const first = rail.trains.find(train => train.id === 'national-rail:SWR06:4:1:1')
    expect(first.stops).toEqual([[15, 16200, 16200], [8, 17580, 17760], [4, 18240, 18240], [2, 18600, 18600], [0, 19140, 19140]])
    expect(rail.trains.find(train => train.id === 'national-rail:SWR06:6:3:5:previous-day').end).toBe(1920)
    expect(rail.trains.some(train => train.stops.some(([index]) => index === names.indexOf('Berrylands')))).toBe(false)
    expect(new Set(rail.trains.map(train => train.id)).size).toBe(rail.trains.length)
    expect(rail.trains.filter(train => train.start < 0)).toHaveLength(7)
    expect(rail.trains.filter(train => train.end > 86400)).toHaveLength(10)
  })
})

describe('reusable rail corridor assembly', () => {
  it('rebuilds either operator from normalized journeys and connected geometry', () => {
    for (const snapshot of [rail, JSON.parse(readFileSync('fixtures/national-rail/paddington.json'))]) {
      const result = assembleRailCorridor({ journeys: snapshot.trains, geometry: { stops: snapshot.stops, paths: snapshot.corridorPaths }, bounds: snapshot.bounds, metadata: snapshot.metadata })
      expect(result.trains).toHaveLength(snapshot.trains.length)
      for (const train of result.trains) train.pathSegments.forEach((pathIndex, segment) => {
        const path = result.paths[pathIndex]
        expect(path[0]).toEqual(result.stops[train.stops[segment][0]].slice(0, 2))
        expect(path.at(-1)).toEqual(result.stops[train.stops[segment + 1][0]].slice(0, 2))
      })
    }
    expect(() => assembleRailCorridor({ journeys: [rail.trains[0], rail.trains[0]], geometry, metadata: rail.metadata, bounds: rail.bounds })).toThrow('Duplicate')
    expect(() => assembleRailCorridor({ journeys: rail.trains, geometry: { ...geometry, paths: [] }, metadata: rail.metadata, bounds: rail.bounds })).toThrow('Missing corridor')
  })
  it('retains connected OSM railway provenance and modest independently loaded payloads', () => {
    expect(geometry.metadata.licence).toBe('ODbL 1.0')
    expect(geometry.wayIds.length).toBeGreaterThan(100)
    expect(geometry.paths.flat().length).toBeGreaterThan(500)
    for (const id of ['paddington', 'waterloo']) expect(gzipSync(readFileSync(`fixtures/national-rail/${id}.json`)).length).toBeLessThan(64 * 1024)
    expect(() => railCorridorGeometry({ elements: [] }, ['WAT', 'WOK'])).toThrow('Missing OSM station')
  })
})
