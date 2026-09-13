import { decodeNetworkPatterns, encodeNetworkPatterns, validateNetworkPatterns, type PatternNetworkChunk } from '@motionstudies/core/domain/network-patterns'
import type { NetworkDayChunk } from '@motionstudies/core/domain/network'

// Retain the published London wire format and explicit bus-only source policy.
const options = { format: 'tfl-bus-patterns-v1', categories: ['bus'] as const }
export type CompactBusChunk = PatternNetworkChunk
export const encodeBusChunk = (chunk: NetworkDayChunk): CompactBusChunk => encodeNetworkPatterns(chunk, options)
export const decodeBusChunk = (chunk: CompactBusChunk): NetworkDayChunk => decodeNetworkPatterns(chunk, options)
export function validateBusChunk(chunk: CompactBusChunk): void { validateNetworkPatterns(chunk, options) }
