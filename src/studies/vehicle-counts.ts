import type { NetworkSnapshot, NetworkTrain, ServiceCategory, StationIndexEntry } from '@motionstudies/core/domain/network'
import { mergeNetworkLayers } from '@motionstudies/core/domain/network-layers'

export interface VehicleLayers {
  tflEnabled: boolean
  airEnabled: boolean
  roadEnabled: boolean
  busEnabled: boolean
  surfaceEnabled: boolean
  nationalRailEnabled: boolean
}

/** Compose only ready, enabled timetable layers with the same study clock. */
export function assembleVehicleNetwork(base: NetworkSnapshot | undefined,
  layers: Pick<VehicleLayers, 'tflEnabled' | 'surfaceEnabled' | 'busEnabled'>,
  surface?: NetworkSnapshot, bus?: NetworkSnapshot): NetworkSnapshot | undefined {
  if (!base) return undefined
  // Retain bounds and time even when every layer is hidden.
  const networks = [layers.tflEnabled ? base : {
    ...base, stops: [], edges: [], paths: [], edgePaths: [], trains: [],
  }]
  for (const [enabled, network] of [[layers.surfaceEnabled, surface], [layers.busEnabled, bus]] as const) {
    if (enabled && network && base.metadata.windowStart === network.metadata.windowStart
      && base.metadata.windowEnd === network.metadata.windowEnd) networks.push(network)
  }
  return networks.length === 1 ? networks[0] : mergeNetworkLayers(networks)
}

export function countableVehicleTrains(network: NetworkSnapshot | undefined,
  stations: readonly StationIndexEntry[], selection: {
    category?: ServiceCategory
    station?: Pick<StationIndexEntry, 'name'>
    route?: { name: string; category: ServiceCategory }
  }): readonly NetworkTrain[] {
  const stationTrainIds = selection.station
    ? new Set(stations.find(station => station.name === selection.station?.name)?.trainIds ?? [])
    : undefined
  return network?.trains.filter(train =>
    (!selection.category || train.category === selection.category) &&
    (!stationTrainIds || stationTrainIds.has(train.id)) &&
    (!selection.route || (train.route === selection.route.name && train.category === selection.route.category)),
  ) ?? []
}

/** Build once per immutable selection; clock updates need only two binary searches. */
export function createActiveTimetableVehicleCounter(trains: readonly NetworkTrain[]): (time: number) => number {
  const starts: number[] = [], ends: number[] = []
  for (const train of trains) {
    if (train.realtime?.status === 'cancelled' || train.stops.length < 2 || !(train.start <= train.end)) continue
    starts.push(train.start)
    ends.push(train.end)
  }
  starts.sort((a, b) => a - b)
  ends.sort((a, b) => a - b)
  const before = (values: readonly number[], time: number, inclusive: boolean): number => {
    let low = 0, high = values.length
    while (low < high) {
      const middle = (low + high) >>> 1
      if (values[middle] < time || inclusive && values[middle] === time) low = middle + 1
      else high = middle
    }
    return low
  }
  // Include both departure and arrival instants, including zero-length trips.
  return time => before(starts, time, true) - before(ends, time, false)
}

/** Counts arrive from the enabled layer adapters; network counts are selection-filtered. */
export function vehicleCountStatus(layers: VehicleLayers,
  counts: { network: number; nationalRail: number; air: number; road: number },
  selection: { network: boolean; air: boolean; road: boolean }) {
  const networkEnabled = layers.tflEnabled || layers.surfaceEnabled || layers.busEnabled || layers.nationalRailEnabled
  const airStatus = selection.air || (layers.airEnabled && !layers.roadEnabled && !networkEnabled)
  const roadStatus = selection.road || (layers.roadEnabled && !layers.airEnabled && !networkEnabled)
  const total = selection.network ? counts.network : counts.network + counts.nationalRail + counts.air + counts.road
  return {
    quiet: !networkEnabled && !layers.airEnabled && !layers.roadEnabled,
    airStatus,
    roadStatus,
    count: roadStatus ? counts.road : airStatus ? counts.air : total,
    label: roadStatus ? 'vehicles reconstructed' : airStatus ? 'aircraft observed'
      : layers.surfaceEnabled || layers.busEnabled || (!selection.network && (layers.airEnabled || layers.roadEnabled))
        ? 'vehicles in motion' : 'trains in motion',
  }
}
