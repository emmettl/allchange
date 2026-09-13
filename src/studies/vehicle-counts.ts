import { createActiveTimetableVehicleCounter as createSharedCounter } from '@motionstudies/core/domain/vehicle-counts'
import type { NetworkSnapshot, NetworkTrain } from '@motionstudies/core/domain/network'
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

export { countableVehicleTrains } from '@motionstudies/core/domain/vehicle-counts'

/** This edition reports only journeys with enough stops to be positioned. */
export const createActiveTimetableVehicleCounter = (trains: readonly NetworkTrain[]) => createSharedCounter(trains, { requirePositionable: true })

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
