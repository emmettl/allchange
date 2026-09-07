import type { NetworkSnapshot, NetworkStop, NetworkTrain } from '@motionstudies/core/domain/network'

const stopIdentity = (stop: NetworkStop) => stop[4] ?? `${stop[0]}:${stop[1]}:${stop[2]}`

/** Reference geometry only: never use these journeys for vehicle playback. */
export function londonInfrastructureSnapshot(
  network: NetworkSnapshot,
  reference: NetworkSnapshot,
): NetworkSnapshot {
  const stopIndexes = new Map(network.stops.map((stop, index) => [stopIdentity(stop), index]))
  const pathIndexes = new Map(network.paths?.map((path, index) => [JSON.stringify(path), index]))
  const stopRemap = reference.stops.map(stop => stopIndexes.get(stopIdentity(stop)))
  const pathRemap = reference.paths?.map(path => pathIndexes.get(JSON.stringify(path)))
  const trainIds = new Set(network.trains.map(train => train.id))
  const trains: NetworkTrain[] = [...network.trains]
  for (const train of reference.trains) {
    if (trainIds.has(train.id) || train.stops.some(([index]) => stopRemap[index] === undefined)) continue
    trains.push({
      ...train,
      stops: train.stops.map(([index, arrival, departure]) => [stopRemap[index]!, arrival, departure]),
      pathSegments: train.pathSegments?.map(index => index === null ? null : pathRemap?.[index] ?? null),
    })
  }
  return { ...network, trains }
}
