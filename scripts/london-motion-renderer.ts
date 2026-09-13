/** The bus cache uses edition-specific observed geometry; general motion is shared. */
export function londonMotionRenderer() {
  return { name: 'london-bus-motion', enforce: 'pre' as const,
    transform(source: string, id: string) {
      if (!id.split('?')[0].endsWith('/@motionstudies/three/NationalNetworkScene.js')) return
      const before = 'const position = positionForTrain(train, time);'
      if (source.split(before).length !== 2) throw new Error('London bus motion hook needs review')
      return { code: 'import { cachedBusPosition } from "/src/data/bus-motion.ts";\n' + source.replace(before,
        `if (train.category === 'bus') {
        const cached = cachedBusPosition(train, time, projectedStops, projectedPaths);
        if (cached) return cached;
    }
    const position = positionForTrain(train, time);`), map: null }
    },
  }
}
