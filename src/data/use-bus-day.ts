import { usePatternNetworkDay } from '@motionstudies/web/use-pattern-network-day'
const options = { format: 'tfl-bus-patterns-v1', categories: ['bus'] as const }

export function useBusDay(manifestFile: string, active: boolean, time: number, resolveAssetUrl: (file: string) => string) {
  return usePatternNetworkDay(manifestFile, active, time, resolveAssetUrl, options)
}
