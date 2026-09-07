import type { NetworkDayChunk, NetworkTrain, TrainStop } from '@motionstudies/core/domain/network'

type BusPattern = Omit<NetworkTrain, 'id' | 'start'>
export interface CompactBusChunk {
  readonly format: 'tfl-bus-patterns-v1'
  readonly windowStart: number
  readonly windowEnd: number
  readonly patterns: readonly BusPattern[]
  readonly journeys: readonly (readonly [id: string, start: number, pattern: number])[]
}

// Repeated journeys share their relative stop times and paths on disk. Expand
// only the selected time chunk into the shared renderer's network contract.
export function encodeBusChunk(chunk: NetworkDayChunk): CompactBusChunk {
  const patterns: BusPattern[] = []
  const indexes = new Map<string, number>()
  const journeys = chunk.trains.map(({ id, start, ...train }) => {
    const pattern: BusPattern = { ...train, end: train.end - start,
      stops: train.stops.map(([stop, arrival, departure]) => [stop, arrival - start, departure - start]),
    }
    const key = JSON.stringify(pattern)
    let index = indexes.get(key)
    if (index === undefined) { index = patterns.length; indexes.set(key, index); patterns.push(pattern) }
    return [id, start, index] as const
  })
  return { format: 'tfl-bus-patterns-v1', windowStart: chunk.windowStart, windowEnd: chunk.windowEnd, patterns, journeys }
}

export function validateBusChunk(chunk: CompactBusChunk): void {
  if (chunk.format !== 'tfl-bus-patterns-v1' || !Array.isArray(chunk.patterns) || !Array.isArray(chunk.journeys)) {
    throw new Error('Unsupported bus chunk format')
  }
  for (const pattern of chunk.patterns) {
    if (pattern.category !== 'bus' || !Number.isFinite(pattern.end) || !Array.isArray(pattern.stops) || pattern.stops.length < 2 ||
      pattern.stops.some(([stop, arrival, departure]: TrainStop) => !Number.isSafeInteger(stop) || stop < 0 || !Number.isFinite(arrival) || !Number.isFinite(departure))) {
      throw new Error('Invalid bus stop pattern')
    }
  }
  for (const [id, start, index] of chunk.journeys) {
    if (typeof id !== 'string' || !Number.isFinite(start) || !Number.isSafeInteger(index) || !chunk.patterns[index]) {
      throw new Error('Invalid bus journey pattern')
    }
  }
}

export function decodeBusChunk(chunk: CompactBusChunk): NetworkDayChunk {
  validateBusChunk(chunk)
  return { windowStart: chunk.windowStart, windowEnd: chunk.windowEnd,
    trains: chunk.journeys.map(([id, start, index]) => {
      const pattern = chunk.patterns[index]
      return { ...pattern, id, start, end: start + pattern.end,
        stops: pattern.stops.map(([stop, arrival, departure]) => [stop, start + arrival, start + departure]),
      }
    }),
  }
}
