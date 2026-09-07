import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { networkSnapshotForDayChunk } from '@motionstudies/core/domain/network-day'
import { londonInfrastructureSnapshot } from '../src/editions/london-infrastructure.ts'
import { londonDiagramMarkers } from '../src/editions/london-diagram-markers.ts'

const fixture = name => JSON.parse(readFileSync(`fixtures/tfl/${name}.json`, 'utf8'))
const morning = fixture('all-change-rail-led-morning')
const manifest = fixture('all-change-day-manifest')

describe('London infrastructure across timetable chunks', () => {
  it('keeps every route and station marker during an empty overnight chunk', () => {
    const night = networkSnapshotForDayChunk(manifest, fixture('all-change-day-chunks/02-04'))
    const reference = londonInfrastructureSnapshot(night, morning)
    expect(night.trains).toHaveLength(0)
    expect(new Set(reference.trains.map(train => train.route))).toEqual(new Set(morning.trains.map(train => train.route)))
    const stops = manifest.stops.map(([x, z]) => [x, 0, z])
    const paths = manifest.paths.map(path => ({ points: path.map(([x, z]) => [x, 0, z]) }))
    expect(londonDiagramMarkers(reference, stops, paths)).toEqual(londonDiagramMarkers(morning, stops, paths))
    expect(reference.stops).toBe(night.stops)
    expect(reference.paths).toBe(night.paths)
    expect(night.trains).toHaveLength(0)
  })

  it('remaps reference paths and stops to the displayed geometry', () => {
    const network = { ...morning, trains: [], stops: [...morning.stops].reverse(), paths: [...morning.paths].reverse() }
    const reference = londonInfrastructureSnapshot(network, morning)
    for (let i = 0; i < morning.trains.length; i++) {
      const source = morning.trains[i], remapped = reference.trains[i]
      expect(remapped.stops.map(([index]) => network.stops[index])).toEqual(source.stops.map(([index]) => morning.stops[index]))
      expect(remapped.pathSegments?.map(index => index === null ? null : network.paths[index])).toEqual(source.pathSegments?.map(index => index === null ? null : morning.paths[index]))
    }
  })
})
