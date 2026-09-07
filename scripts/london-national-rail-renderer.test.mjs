import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { londonNationalRailRenderer } from './london-national-rail-renderer.ts'
import { londonDiagramRenderer } from './london-diagram-renderer.ts'

describe('National Rail renderer slot', () => {
  it('composes with the existing London adapter and preserves the original playback clock', () => {
    const id = '/node_modules/@motionstudies/three/NationalNetworkScene.js'
    const source = readFileSync(`.${id}`, 'utf8')
    const adapted = londonDiagramRenderer().transform(source, id).code
    const result = londonNationalRailRenderer().transform(adapted, id).code
    expect(result).toContain('LondonNationalRailLayer')
    expect(result).toContain('_jsx(TrainSwarm, { ...props,')
    expect(result).toContain('windowStart: props.snapshot.metadata.windowStart')
    expect(londonNationalRailRenderer().transform(adapted, `${id}?cache`).code).toBe(result)
    expect(() => londonNationalRailRenderer().transform('', id)).toThrow('needs review')
  })

  it('adapts pulse terminal phases and clock wrapping against the pinned renderer', () => {
    const id = '/node_modules/@motionstudies/three/HubPulseScene.js'
    const source = readFileSync(`.${id}`, 'utf8')
    const result = londonNationalRailRenderer().transform(source, id).code
    expect(result).toContain('pulseFlowAllowed(call, flow)')
    expect(result).toContain('pulseCycleOffset(call, localTime.current, cycle)')
    expect(result).toContain('nationalRailPulseVisible(call, localTime.current, pulseHorizon)')
    expect(() => londonNationalRailRenderer().transform('', id)).toThrow('need review')
  })
})
