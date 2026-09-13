import type { Plugin } from 'vite'

/** Observed-road sampling remains edition-owned; renderer optimizations ship in the package. */
export function londonPerformanceRenderer(): Plugin {
  return { name: 'london-road-sampling', enforce: 'pre', transform(source, id) {
    if (!id.split('?')[0].replaceAll('\\', '/').endsWith('/@motionstudies/three/RoadTrafficLayer.js')) return
    const before = "import { nationalRoadConditionsAtTime, } from '@motionstudies/core/domain/road-day';"
    if (source.split(before).length !== 2) throw new Error('London road sampling hook needs review')
    return { code: source.replace(before, 'import { nationalRoadConditionsAtTime } from "/src/studies/road-conditions.ts";'), map: null }
  } }
}
