import { describe, expect, it } from 'vitest'
import { alignBusTimetableStops, busStopMatcher, compileBusStudy, planBusOrigins, selectBusTimetables } from './compile-tfl-bus-study.mjs'
import { decodeBusChunk, encodeBusChunk } from '../src/data/bus-day.ts'

const stop = (id, lon) => ({ id, name: id, lon, lat: 51.5 })
const a = stop('A', -0.1), b = stop('B', -0.09)
const route = (id) => ({ lineId: id, lineName: id.toUpperCase(), direction: 'all', mode: 'bus',
  lineStrings: [JSON.stringify([[a.lon, a.lat], [b.lon, b.lat]])],
  orderedLineRoutes: [{ naptanIds: ['A', 'B'] }, { naptanIds: ['B', 'A'] }],
  stopPointSequences: [{ direction: 'outbound', stopPoint: [a, b] }, { direction: 'inbound', stopPoint: [b, a] }],
})
const schedule = (name, hour, minute = '0') => ({ name, knownJourneys: [{ hour, minute, intervalId: 0 }] })
const timetable = (id, origin, direction, schedules) => ({ lineId: id, direction, stops: [a, b],
  timetable: { departureStopId: origin, routes: [{ stationIntervals: [{ id: 0, intervals: [{ stopId: origin === 'A' ? 'B' : 'A', timeToArrival: 10 }] }], schedules }] },
})

describe('London-wide bus ingestion', () => {
  it('matches TfL platform aliases in the same nearby stop area without merging unrelated stops', () => {
    const source = route('20')
    source.stopPointSequences[0].stopPoint.push({ ...stop('platform-a', -0.1), parentId: 'area' })
    const data = { stops: [{ ...stop('platform-b', -0.1005), parentId: 'area' }, { ...stop('distant', -0.15), parentId: 'area' }, stop('unrelated', -0.1)] }
    const match = busStopMatcher(source, data)
    expect(match('platform-a', 'platform-b')).toBe(true)
    expect(match('platform-a', 'distant')).toBe(false)
    expect(match('platform-a', 'unrelated')).toBe(false)
  })

  it('aligns a platform alias only within a matching advertised branch', () => {
    const points = Array.from({ length: 10 }, (_, index) => ({ ...stop(`s${index}`, -0.1 + index * 0.001), parentId: `area${index}` }))
    const source = { orderedLineRoutes: [{ naptanIds: points.map(({ id }) => id) }], stopPointSequences: [{ stopPoint: points }] }
    const alias = { ...points[5], id: 'alias', lon: points[5].lon + 0.006 }
    const data = { stops: [...points, alias], timetable: { departureStopId: 's0', routes: [{ stationIntervals: [{ id: 0, intervals: points.slice(1).map((point, index) => ({ stopId: index === 4 ? 'alias' : point.id, timeToArrival: index + 1 })) }] }] } }
    const aligned = alignBusTimetableStops(source, data)
    expect(aligned.aliases).toEqual([{ from: 'alias', to: 's5' }])
    expect(aligned.timetable.timetable.routes[0].stationIntervals[0].intervals[4]).toEqual({ stopId: 's5', timeToArrival: 5 })
    expect(data.timetable.routes[0].stationIntervals[0].intervals[4].stopId).toBe('alias')
    alias.parentId = 'unrelated'
    expect(alignBusTimetableStops(source, data).aliases).toEqual([])
  })

  it('discovers every advertised branch origin and retains circular directions', () => {
    const source = route('1')
    expect(planBusOrigins(source)).toEqual([
      { direction: 'outbound', origin: 'A' }, { direction: 'inbound', origin: 'B' },
    ])
    // A terminus shared by two directions must be queried in both directions.
    source.orderedLineRoutes.push({ naptanIds: ['A', 'B', 'A'] })
    source.stopPointSequences[1].stopPoint = [b, a, b, a]
    expect(planBusOrigins(source)).toContainEqual({ direction: 'inbound', origin: 'A' })
  })

  it('uses school Friday and the preceding Thursday tail, never the holiday variant', () => {
    const source = timetable('1', 'A', 'outbound', [
      schedule('Mon-Fri Non-Schooldays', '8'), schedule('Mon-Fri Schooldays', '7'),
      schedule('School Friday', '9'), schedule('Mon-Th Schooldays', '25'),
    ])
    const selected = selectBusTimetables(source, '2026-09-04')
    expect(selected.map(({ timetable, timeOffsetSeconds }) => [timetable.timetable.routes[0].schedules[0].name, timeOffsetSeconds])).toEqual([
      ['Mon-Fri Schooldays', -86400], ['School Friday', 0],
    ])
    expect(selectBusTimetables(source, '2026-09-04', false)[1].timetable.timetable.routes[0].schedules[0].name).toBe('Mon-Fri Non-Schooldays')
  })

  it('places Thursday-night buses in early Friday and Friday-night buses after midnight', () => {
    const source = timetable('n1', 'A', 'outbound', [
      schedule('Friday Night/Saturday Morning', '25'),
      schedule('Mo-Th Nights/Tu-Fr Morning', '25'),
      schedule('Saturday Night/Sunday Morning', '25'),
    ])
    expect(selectBusTimetables(source, '2026-09-04').map(({ timetable, timeOffsetSeconds }) => [timetable.timetable.routes[0].schedules[0].name, timeOffsetSeconds])).toEqual([
      ['Mo-Th Nights/Tu-Fr Morning', -86400], ['Friday Night/Saturday Morning', 0],
    ])
  })

  it('compiles discovered routes, retains midnight crossings and audits missing source data', async () => {
    const snapshot = await compileBusStudy({
      serviceDate: '2026-09-04', retrievedAt: '2026-09-07T00:00:00Z',
      loadJson: async (path) => {
        if (path === '/Line/Mode/bus') return ['1', 'n1', '999'].map((id) => ({ id, name: id.toUpperCase(), modeName: 'bus' }))
        const [, , id, kind, origin] = path.split('/')
        if (id === '999') throw new Error('TfL HTTP 404')
        if (kind === 'Route') return route(id)
        const [stopId, query] = origin.split('?')
        const direction = new URLSearchParams(query).get('direction')
        return timetable(id, stopId, direction, id === 'n1' ? [schedule('Mo-Th Nights/Tu-Fr Morning', '25'), schedule('Friday Night/Saturday Morning', '25')]
          : [schedule('Monday to Thursday', '23', '55'), schedule('Friday', '8')])
      },
    })
    expect(snapshot.metadata.coverage).toMatchObject({ advertisedRouteCount: 3, activeRouteCount: 2, status: 'audited-with-gaps' })
    expect(snapshot.metadata.coverage.routes.find(({ lineId }) => lineId === '999').issues[0].reason).toContain('404')
    expect(snapshot.trains.some(({ route, start, end }) => route === '1' && start === -300 && end === 300)).toBe(true)
    expect(snapshot.trains.filter(({ route }) => route === 'N1').every(({ start }) => start === 3600)).toBe(true)
    expect(new Set(snapshot.trains.map(({ id }) => id)).size).toBe(snapshot.trains.length)
  })
})

describe('compact bus time chunks', () => {
  const train = { id: 'first', start: -300, end: 300, route: '1', shortName: '1', headsign: 'B', category: 'bus', mode: 'bus', stops: [[0, -300, -300], [1, 300, 300]], pathSegments: [0] }
  it('round-trips source identities, midnight times, stop calls and geometry', () => {
    const chunk = { windowStart: 0, windowEnd: 7200, trains: [train, { ...train, id: 'second', start: 300, end: 900, stops: [[0, 300, 300], [1, 900, 900]] }] }
    const packed = encodeBusChunk(chunk)
    expect(packed.patterns).toHaveLength(1)
    expect(decodeBusChunk(packed)).toEqual(chunk)
  })
  it('rejects an invalid pattern reference', () => {
    const packed = encodeBusChunk({ windowStart: 0, windowEnd: 7200, trains: [train] })
    expect(() => decodeBusChunk({ ...packed, journeys: [['bad', 0, 12]] })).toThrow('Invalid bus journey pattern')
  })
})
