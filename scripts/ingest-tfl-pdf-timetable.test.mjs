import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { parsePdfGridJourneys } from './ingest-tfl-pdf-timetable.mjs'
import { planPdfCoverage, uniquePdfJourneys } from './compile-tfl-pdf-lattice.mjs'

const stops = [
  { id: 'A', name: 'Alpha Rail Station' },
  { id: 'B', name: 'Bravo Rail Station' },
  { id: 'C', name: 'Charlie Rail Station' },
]

describe('TfL public timetable PDF adapter', () => {
  it('does not borrow Liverpool Street times for a non-calling Iver stop', () => {
    const journeys = parsePdfGridJourneys({
      text: ['Elizabeth line – Eastbound', 'Mondays to Fridays',
        'Reading          1229', 'Iver                 ', 'West Drayton     1259',
        'Liverpool St     1337', 'Abbey Wood       1358'].join('\n'),
      stops: [{ id: 'R', name: 'Reading' }, { id: 'I', name: 'Iver' },
        { id: 'W', name: 'West Drayton' }, { id: 'L', name: 'Liverpool Street' },
        { id: 'A', name: 'Abbey Wood' }],
      originId: 'R', destinationId: 'A', sectionTitle: 'Elizabeth line – Eastbound', allowSkippedStops: true,
    })
    expect(journeys).toHaveLength(1)
    expect(journeys[0].calls.map(call => call.stopId)).toEqual(['R', 'W', 'L', 'A'])
  })

  it('keeps Elizabeth surface and tunnel platforms distinct', () => {
    const text = ['Elizabeth line – Eastbound', 'Mondays to Fridays',
      'Reading                       0600 0610',
      'Paddington Plts A & B          0630     ',
      'Paddington Plts 11 & 12             0640'].join('\n')
    for (const [id, time] of [['910GPADTLL', 6.5 * 3600], ['910GPADTON', 6 * 3600 + 40 * 60]]) {
      const journeys = parsePdfGridJourneys({ text,
        stops: [{ id: 'R', name: 'Reading' }, { id, name: 'London Paddington Rail Station' }],
        originId: 'R', destinationId: id, sectionTitle: 'Elizabeth line – Eastbound',
      })
      expect(journeys).toHaveLength(1)
      expect(journeys[0].calls.at(-1).arrival).toBe(time)
    }
  })

  it('keeps a through train once without merging different departures or platforms', () => {
    const train = (id, stops, route = 'Elizabeth line') => ({ id, route, stops })
    const through = train('through', [[1, 100, 100], [2, 200, 200], [3, 300, 300]])
    const next = train('next', [[2, 201, 201], [3, 301, 301]])
    const surface = train('surface', [[4, 200, 200], [3, 300, 300]])
    const other = train('other', through.stops, 'Other line')
    expect(uniquePdfJourneys([
      train('tail', through.stops.slice(1)), next, surface, through,
      train('prefix', through.stops.slice(0, 2)), train('copy', through.stops), other,
    ]).map(train => train.id)).toEqual(['next', 'surface', 'through', 'other'])
  })

  it('rejects a backwards clock instead of disguising it as a skipped stop', () => {
    expect(parsePdfGridJourneys({
      text: ['Example line westbound', 'Mondays to Fridays',
        'Alpha       0700', 'Bravo       0655', 'Charlie     0710'].join('\n'),
      stops, originId: 'A', destinationId: 'C', sectionTitle: 'Example line westbound', allowSkippedStops: true,
    })).toEqual([])
  })

  it('accepts only complete monotonic timetable columns', () => {
    const text = [
      'Example line westbound',
      'Mondays to Fridays',
      'Alpha       0645 0700',
      'Bravo       0650     ',
      'Charlie     0655 0710',
    ].join('\n')
    const journeys = parsePdfGridJourneys({
      text,
      stops,
      originId: 'A',
      destinationId: 'C',
      sectionTitle: 'Example line westbound',
    })

    expect(journeys).toHaveLength(1)
    expect(journeys[0].calls.map(({ stopId, arrival }) => [stopId, arrival])).toEqual([
      ['A', 24_300],
      ['B', 24_600],
      ['C', 24_900],
    ])
  })

  it('accepts an explicitly enabled ordered limited-stop column', () => {
    const text = [
      'Example line westbound',
      'Mondays to Saturdays',
      'Alpha       0645',
      'Bravo           ',
      'Charlie     0655',
    ].join('\n')

    expect(parsePdfGridJourneys({
      text,
      stops,
      originId: 'A',
      destinationId: 'C',
      sectionTitle: 'Example line westbound',
    })).toHaveLength(0)
    expect(parsePdfGridJourneys({
      text,
      stops,
      originId: 'A',
      destinationId: 'C',
      sectionTitle: 'Example line westbound',
      allowSkippedStops: true,
    })[0].calls.map(({ stopId }) => stopId)).toEqual(['A', 'C'])
  })

  it('still rejects a partial column without the requested destination', () => {
    const text = [
      'Example line westbound',
      'Monday to Friday',
      'Alpha       0645',
      'Bravo       0650',
    ].join('\n')
    expect(parsePdfGridJourneys({
      text,
      stops,
      originId: 'A',
      destinationId: 'C',
      sectionTitle: 'Example line westbound',
      allowSkippedStops: true,
    })).toHaveLength(0)
  })

  it('keeps side-by-side timetable grids in their own column bands', () => {
    const text = [
      'Example line westbound                 Example line eastbound',
      'Mondays to Saturdays                   Mondays to Saturdays',
      'Alpha       0645                       Charlie      0647',
      'Bravo       0650                       Bravo        0652',
      'Charlie     0655                       Alpha        0657',
    ].join('\n')
    const westbound = parsePdfGridJourneys({
      text,
      stops,
      originId: 'A',
      destinationId: 'C',
      sectionTitle: 'Example line westbound',
    })
    const eastbound = parsePdfGridJourneys({
      text,
      stops: [...stops].reverse(),
      originId: 'C',
      destinationId: 'A',
      sectionTitle: 'Example line eastbound',
    })

    expect(westbound[0].calls.map(({ arrival }) => arrival)).toEqual([24_300, 24_600, 24_900])
    expect(eastbound[0].calls.map(({ arrival }) => arrival)).toEqual([24_420, 24_720, 25_020])
  })

  it.each([
    ['Elizabeth line', 'fixtures/tfl/all-change-elizabeth-morning.json', 'elizabeth-line', 27, 10],
    ['Elizabeth line eastbound', 'fixtures/tfl/all-change-elizabeth-eastbound-morning.json', 'elizabeth-line', 2, 10],
    ['Lioness', 'fixtures/tfl/all-change-lioness-morning.json', 'overground', 12, 19],
    ['Lioness northbound', 'fixtures/tfl/all-change-lioness-northbound-morning.json', 'overground', 12, 19],
  ])('keeps the committed %s PDF proof complete and source-audited', async (_label, path, mode, trainCount, stopCount) => {
    const snapshot = JSON.parse(await readFile(path, 'utf8'))

    expect(snapshot.metadata.model).toContain('PDF grid extraction')
    expect(snapshot.metadata.sourceSha256).toMatch(/^[a-f0-9]{64}$/)
    expect(snapshot.metadata.validFrom).toBe('2026-05-17')
    expect(snapshot.metadata.modes).toEqual([mode])
    expect(snapshot.trains).toHaveLength(trainCount)
    expect(snapshot.stops).toHaveLength(stopCount)
    expect(snapshot.trains.every((train) =>
      train.stops.length === stopCount && train.pathSegments.length === stopCount - 1
    )).toBe(true)
  })

  it('assembles the expanded morning lattice across all five rail-led modes', async () => {
    const snapshot = JSON.parse(
      await readFile('fixtures/tfl/all-change-rail-led-morning.json', 'utf8'),
    )
    expect(new Set(snapshot.metadata.modes)).toEqual(new Set(['tube', 'dlr', 'tram', 'overground', 'elizabeth-line']))
    expect(snapshot.trains).toHaveLength(1_750)
    expect(snapshot.stops).toHaveLength(508)
    expect(snapshot.paths).toHaveLength(1_122)
    expect(snapshot.metadata.note).toContain('all advertised Tube, DLR and Tramlink lines')
    expect(snapshot.metadata.note).toContain('all six named London Overground lines')
    expect(snapshot.metadata.labelHierarchy).toEqual({
      model: 'Stable station-name rank by mode interchange, distinct routes, scheduled calls and graph degree, enriched by advertised topology',
      stationCount: 465,
    })
    expect(snapshot.stops.every((stop) => Number.isInteger(stop[5]))).toBe(true)
    expect(snapshot.stops.find((stop) => stop[2] === 'Whitechapel')?.[5]).toBe(0)
  })

  it('audits every advertised Overground and Elizabeth branch', async () => {
    const catalogue = JSON.parse(await readFile('fixtures/tfl/all-change-rail-led-catalogue.json', 'utf8'))
    const plan = planPdfCoverage(catalogue)
    const snapshot = JSON.parse(await readFile('fixtures/tfl/all-change-pdf-morning.json', 'utf8'))

    expect(plan).toHaveLength(43)
    expect(snapshot.metadata.coverage.advertisedBranchCount).toBe(43)
    expect(snapshot.metadata.coverage.compiledBranchCount).toBe(29)
    expect(snapshot.metadata.coverage.inactiveBranches).toHaveLength(14)
    expect(new Set(snapshot.trains.map(({ route }) => route))).toEqual(new Set([
      'Elizabeth line', 'Liberty', 'Lioness', 'Mildmay', 'Suffragette', 'Weaver', 'Windrush',
    ]))
    expect(snapshot.trains.every(({ stops: calls, pathSegments }) =>
      calls.length >= 2 && pathSegments.length === calls.length - 1)).toBe(true)
  })

  it('delivers unique, continuous Elizabeth journeys in every 24-hour chunk', async () => {
    const manifest = JSON.parse(await readFile('fixtures/tfl/all-change-day-manifest.json', 'utf8'))
    const chunks = await Promise.all(manifest.chunks.map(async chunk =>
      JSON.parse(await readFile(`fixtures/tfl/${chunk.path}`, 'utf8'))))
    const trains = [...new Map(chunks.flatMap(chunk => chunk.trains)
      .filter(train => train.mode === 'elizabeth-line').map(train => [train.id, train])).values()]
    expect(uniquePdfJourneys(trains)).toHaveLength(trains.length)
    const diagram = JSON.parse(await readFile('fixtures/tfl/all-change-diagram.json', 'utf8'))
    for (const train of trains) {
      train.pathSegments.forEach((index, i) => {
        const from = train.stops[i], to = train.stops[i + 1]
        expect(to[1] - from[2], train.id).toBeGreaterThanOrEqual(0)
        expect(to[1] - from[2], train.id).toBeLessThan(20 * 60)
        const path = diagram.paths[index]
        expect(path[0], train.id).toEqual(diagram.stops[from[0]].slice(1))
        expect(path.at(-1), train.id).toEqual(diagram.stops[to[0]].slice(1))
      })
    }
    // Published weekday page 40: Reading 12:29 passes Iver, then calls at
    // West Drayton 12:59 and Liverpool Street 13:37 before Abbey Wood 13:58.
    const reading = trains.find(train => train.id.startsWith('elizabeth:pdf:910GRDNGSTN:910GABWDXR:44940:'))
    expect(reading).toBeDefined()
    const calls = reading.stops.map(([i, arrival]) => [manifest.stops[i][4], arrival])
    expect(calls).not.toContainEqual(['910GIVER', 13 * 3600 + 37 * 60])
    expect(calls.some(([id]) => id === '910GIVER')).toBe(false)
    expect(calls).toContainEqual(['910GWDRYTON', 12 * 3600 + 59 * 60])
    expect(calls).toContainEqual(['910GLIVSTLL', 13 * 3600 + 37 * 60])
    expect(reading.end).toBe(13 * 3600 + 58 * 60)
  })
})
