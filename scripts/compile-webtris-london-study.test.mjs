import { describe, expect, it } from 'vitest'
import {
  buildLondonRoadTopology,
  compileLondonRoadStudy,
  motorwaySites,
  reportValue,
  sampledMotorwaySites,
  splitLondonRoadStudy,
} from './compile-webtris-london-study.mjs'

const roads = [{
  id: 'M1',
  label: 'M1',
  officialLabel: 'M1',
  description: 'London approach',
  focus: [-0.3, 51.65],
  cameraScale: 0.3,
  bounds: {
    minLongitude: -0.4,
    maxLongitude: -0.2,
    minLatitude: 51.5,
    maxLatitude: 51.75,
  },
  sampleSpacingChainage: 10,
  closed: false,
}]

const sites = [
  ['1', 'M1/2100A', -0.25, 51.58],
  ['2', 'M1/2105A', -0.26, 51.59],
  ['3', 'M1/2110A', -0.27, 51.6],
  ['4', 'M1/2100B', -0.251, 51.58],
  ['5', 'M1/2110B', -0.271, 51.6],
].map(([Id, Description, Longitude, Latitude]) => ({
  Id,
  Name: `${Description}; ${String(Description).endsWith('A') ? 'Northbound' : 'Southbound'}`,
  Description,
  Longitude,
  Latitude,
  Status: 'Active',
}))

function row(siteName, interval = 0) {
  return {
    'Site Name': siteName,
    'Time Interval': String(interval),
    '0 - 520 cm': '100',
    '521 - 660 cm': '20',
    '661 - 1160 cm': '10',
    '1160+ cm': '5',
    'Avg mph': '50',
    'Total Volume': '135',
  }
}

describe('London WebTRIS compiler', () => {
  it('keeps missing readings missing, while retaining genuine zero readings', () => {
    for (const missing of ['', '  ', null, undefined, -1, 'NaN']) {
      expect(reportValue({ ...row('M1/2100A'), 'Avg mph': missing })).toBeUndefined()
      expect(reportValue({ ...row('M1/2100A'), '0 - 520 cm': missing })).toBeUndefined()
    }
    expect(reportValue({ ...row('M1/2100A'), 'Avg mph': '0', '0 - 520 cm': '0', '521 - 660 cm': '0', '661 - 1160 cm': '0', '1160+ cm': '0' })?.value).toEqual([0, 0, 0, 0])
    expect(reportValue({ ...row('M1/2100A'), 'Time Interval': '96' })).toBeUndefined()
  })

  it('excludes blank sites and does not join sections across missing detectors', () => {
    const eligible = motorwaySites(sites, roads)
    const topology = buildLondonRoadTopology(eligible, eligible, roads, '2025-09-05')
    const rows = eligible.map(site => ({ ...row(site.Description), ...(site.Id === '2' ? { 'Avg mph': '' } : {}) }))
    const study = compileLondonRoadStudy(topology, rows, '2025-09-05')
    expect(study.siteIds).not.toContain('2')
    expect(study.sections.filter(section => section.direction === 'positive')).toEqual([])
    expect(study.metadata.candidateSites).toBe(5)
    expect(study.metadata.excludedRows).toBe(1)
    expect(() => compileLondonRoadStudy(topology, [...rows, rows[0]], '2025-09-05')).toThrow('Duplicate WebTRIS')
  })

  it('keeps active A/B sites and samples at configured chainage spacing', () => {
    const eligible = motorwaySites(sites, roads)
    expect(sampledMotorwaySites(eligible, roads).map(({ Id }) => Id)).toEqual([
      '1',
      '3',
      '4',
      '5',
    ])
  })

  it('builds directed topology and converts 15-minute counts to hourly flow', () => {
    const eligible = motorwaySites(sites, roads)
    const measured = sampledMotorwaySites(eligible, roads)
    const topology = buildLondonRoadTopology(
      eligible,
      measured,
      roads,
      '2025-09-05',
    )
    expect(topology.sections).toHaveLength(2)
    expect(topology.sections[0].fromSiteId).toBe('1')
    expect(topology.sections[1].fromSiteId).toBe('5')
    expect(reportValue(row('M1/2100A'))).toEqual({
      time: 900,
      value: [480, 80.5, 60, 80.5],
    })

    const study = compileLondonRoadStudy(
      topology,
      measured.flatMap((site) => [row(site.Description, 0), row(site.Description, 1)]),
      '2025-09-05',
    )
    expect(study.siteIds).toHaveLength(4)
    expect(study.minutes).toHaveLength(2)
    expect(study.sections).toHaveLength(2)
    expect(study.metadata.lastMeasurementTime).toBe(
      '2025-09-06T00:00:00+01:00',
    )
    expect(splitLondonRoadStudy(study).chunks).toHaveLength(4)
  })
})
