import { describe, expect, it } from 'vitest'
import type { NetworkSnapshot, NetworkTrain, ServiceCategory } from '@motionstudies/core/domain/network'
import { activeTimetableVehicleCount, assembleVehicleNetwork, countableVehicleTrains, vehicleCountStatus, type VehicleLayers } from './vehicle-counts.ts'

const times = [27900, 66600] as const
const categories = [
  { id: 'metro', layer: 1, morning: 2 },
  { id: 's-bahn', layer: 1, morning: 3 },
  { id: 'tram', layer: 1, morning: 1 },
  { id: 'bus', layer: 8, morning: 4 },
  { id: 'ferry', layer: 16, morning: 2 },
  { id: 'cableway', layer: 16, morning: 1 },
] as const

function timetable(layer: number): NetworkSnapshot {
  return {
    metadata: { publisher: 'Test', feedVersion: 'test', serviceDate: '2026-09-04', windowStart: 0, windowEnd: 86400, focusTime: 27900, sourceUrl: '', model: 'test', note: '' },
    bounds: { minLongitude: 0, maxLongitude: 1, minLatitude: 0, maxLatitude: 1 },
    stops: [[0, 0, 'Origin'], [1, 1, 'Terminus']], edges: [[0, 1]],
    trains: categories.filter(category => category.layer === layer).flatMap(category => times.flatMap((time, period) =>
      Array.from({ length: category.morning + period }, (_, index): NetworkTrain => ({
        id: `${category.id}-${time}-${index}`, route: 'Shared name', shortName: String(index), headsign: 'Terminus',
        category: category.id, start: time - 60, end: time + 60,
        stops: [[0, time - 60, time - 60], [1, time + 60, time + 60]],
      })),
    )),
  }
}
const tfl = timetable(1), bus = timetable(8), surface = timetable(16)
function layersFor(mask: number): VehicleLayers {
  return { tflEnabled: Boolean(mask & 1), airEnabled: Boolean(mask & 2), roadEnabled: Boolean(mask & 4),
    busEnabled: Boolean(mask & 8), surfaceEnabled: Boolean(mask & 16), nationalRailEnabled: Boolean(mask & 32) }
}
const noSelection = { network: false, air: false, road: false }

function study(mask: number, time: number, category?: ServiceCategory) {
  const layers = layersFor(mask)
  const network = assembleVehicleNetwork(tfl, layers, surface, bus)
  const period = time === times[0] ? 0 : 1
  // Distinct adapter outputs make accidental omissions/double counts visible.
  const counts = {
    network: activeTimetableVehicleCount(countableVehicleTrains(network, [], { category }), time),
    air: mask & 2 ? 11 + period : 0,
    road: mask & 4 ? 23 + period : 0,
    nationalRail: mask & 32 ? 7 + period : 0,
  }
  return { layers, network, counts, status: vehicleCountStatus(layers, counts, { ...noSelection, network: Boolean(category) }) }
}

describe('vehicle count combinations', () => {
  it.each(times)('counts and labels all 64 enabled-layer combinations at %i', time => {
    const period = time === times[0] ? 0 : 1
    // Known fixture populations: TfL, air, road, buses, river/cable, National Rail.
    const populations = period === 0 ? [6, 11, 23, 4, 3, 7] : [9, 12, 24, 5, 5, 8]
    for (let mask = 0; mask < 64; mask++) {
      const { status, network } = study(mask, time)
      const expected = populations.reduce((sum, count, index) => sum + (mask & (1 << index) ? count : 0), 0)
      expect(status.count, `mask ${mask}`).toBe(expected)
      expect(status.quiet, `mask ${mask}`).toBe(mask === 0)
      const label = mask === 2 ? 'aircraft observed' : mask === 4 ? 'vehicles reconstructed'
        : mask & 30 ? 'vehicles in motion' : 'trains in motion'
      expect(status.label, `mask ${mask}`).toBe(label)
      expect(network?.metadata.windowStart).toBe(0)
      expect(network?.metadata.windowEnd).toBe(86400)
    }
  })

  it.each(times)('isolates every category from other enabled layers at %i', time => {
    const period = time === times[0] ? 0 : 1
    for (let mask = 0; mask < 64; mask++) {
      for (const category of categories) {
        const { status } = study(mask, time, category.id)
        // Network selection is reachable when its category's layer is enabled.
        if (!(mask & category.layer)) continue
        expect(status.count, `mask ${mask}, ${category.id}`).toBe(category.morning + period)
      }
      const { layers, counts } = study(mask, time)
      if (layers.airEnabled) {
        expect(vehicleCountStatus(layers, counts, { ...noSelection, air: true })).toMatchObject({ count: 11 + period, label: 'aircraft observed' })
      }
      if (layers.roadEnabled) {
        expect(vehicleCountStatus(layers, counts, { ...noSelection, road: true })).toMatchObject({ count: 23 + period, label: 'vehicles reconstructed' })
      }
    }
  })

  it('preserves an empty study clock and waits for optional data with matching bounds', () => {
    const layers = layersFor(63)
    expect(assembleVehicleNetwork(undefined, layers, surface, bus)).toBeUndefined()
    expect(assembleVehicleNetwork(tfl, layers)?.trains).toEqual(tfl.trains)
    const wrongWindow = { ...bus, metadata: { ...bus.metadata, windowEnd: 31500 } }
    expect(assembleVehicleNetwork(tfl, layers, undefined, wrongWindow)?.trains).toEqual(tfl.trains)
    expect(assembleVehicleNetwork(tfl, layers, wrongWindow)?.trains).toEqual(tfl.trains)
    const empty = assembleVehicleNetwork(tfl, layersFor(0), surface, bus)!
    expect(empty.trains).toEqual([])
    expect(empty.stops).toEqual([])
    expect(empty.bounds).toEqual(tfl.bounds)
    expect(empty.metadata).toEqual(tfl.metadata)
    expect(activeTimetableVehicleCount(empty.trains, times[0])).toBe(0)
  })

  it('filters station calls and same-named routes by category before counting', () => {
    const network = assembleVehicleNetwork(tfl, layersFor(63), surface, bus)!
    const stations = [{ name: 'Interchange', stopIndexes: [0], routes: [], trainIds: ['metro-27900-0', 'ferry-27900-0', 'metro-66600-0'] }]
    const station = countableVehicleTrains(network, stations, { station: { name: 'Interchange' } })
    expect(activeTimetableVehicleCount(station, times[0])).toBe(2)
    expect(activeTimetableVehicleCount(station, times[1])).toBe(1)
    const route = { name: 'Shared name', category: 'metro' as const }
    expect(activeTimetableVehicleCount(countableVehicleTrains(network, stations, { route }), times[0])).toBe(2)
    expect(activeTimetableVehicleCount(countableVehicleTrains(network, stations, { route, station: stations[0] }), times[0])).toBe(1)
    expect(countableVehicleTrains(network, stations, { route, category: 'bus' })).toEqual([])
    expect(countableVehicleTrains(network, stations, { station: { name: 'Missing' } })).toEqual([])
    expect(countableVehicleTrains(undefined, stations, {})).toEqual([])
  })

  it('counts exact time boundaries, ignores cancelled/incomplete trains, and supports backward scrubbing', () => {
    const train = tfl.trains[0]
    const trains = [train,
      { ...train, id: 'cancelled', realtime: { status: 'cancelled' as const, delaySeconds: 0, skippedStops: 0, generatedAt: '' } },
      { ...train, id: 'incomplete', stops: train.stops.slice(0, 1) },
    ]
    const samples = [[train.start - 1, 0], [train.start, 1], [times[0], 1], [train.end, 1], [train.end + 1, 0], [NaN, 0]]
    for (const [time, count] of [...samples, ...[...samples].reverse()]) {
      expect(activeTimetableVehicleCount(trains, time)).toBe(count)
    }
    const selected = vehicleCountStatus(layersFor(63), { network: 0, nationalRail: 7, air: 11, road: 23 }, { ...noSelection, network: true })
    expect(selected.count).toBe(0) // No fallback to other layers for an empty selection.
    expect(selected.quiet).toBe(false)
  })
})
