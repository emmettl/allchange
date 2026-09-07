import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parse } from '@babel/parser'
import { londonDiagramRenderer } from './london-diagram-renderer.ts'
import { londonNationalRailRenderer } from './london-national-rail-renderer.ts'
import { londonMotionRenderer } from './london-motion-renderer.ts'

const id = '/node_modules/@motionstudies/three/NationalNetworkScene.js'
const source = readFileSync(`.${id}`, 'utf8')
describe('motion renderer integration', () => {
  it('composes with London scene adapters into valid JavaScript in both builds', () => {
    let code = source
    for (const plugin of [londonDiagramRenderer(), londonNationalRailRenderer(), londonMotionRenderer()]) {
      const output = plugin.transform(code, id)
      expect(plugin.transform(code, `${id}?v=dev-cache`)).toEqual(output)
      code = output.code
    }
    expect(() => parse(code, { sourceType: 'module' })).not.toThrow()
    expect(code).toContain('indexedPositionForTrain as positionForTrain')
    expect(code).toContain('attribute.addUpdateRange(0, activeCounts[kind] * 3)')
    expect(code).toContain('attribute.addUpdateRange(0, segmentCounts[index] * 6)')
  })
  it('fails closed when package hooks change', () => {
    expect(() => londonMotionRenderer().transform('export {}', id)).toThrow('needs review')
    expect(londonMotionRenderer().transform(source, '/src/unrelated.js')).toBeUndefined()
  })
})
