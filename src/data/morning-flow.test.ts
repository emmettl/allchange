import { describe, expect, it } from 'vitest'
import fixture from '../../fixtures/morning-flow/study.json'
import audit from '../../fixtures/morning-flow/audit.json'
import { decodeMorningFlow, flowDots, flowInterval, flowPosition } from './morning-flow.ts'

describe('directional Central line demand', () => {
  it('reconciles both directions and source totals, retaining the evidenced peak reversal', () => {
    const data = decodeMorningFlow(fixture)
    expect(audit.rows).toHaveLength(40)
    for (const link of data.links) {
      expect(data.links.filter(other => other.from===link.to && other.to===link.from)).toHaveLength(1)
      expect(audit.rows.find(row=>row.id===link.id)?.total).toBeCloseTo(link.total,2)
    }
    const west = data.links.find(l=>l.from==='SFDu' && l.to==='MLEu')!
    const east = data.links.find(l=>l.from==='MLEu' && l.to==='SFDu')!
    expect(west.values[14]).toBeCloseTo(2168.976,3)
    expect(east.values[14]).toBeCloseTo(693.734,3)
    expect(east.values[50]).toBeGreaterThan(west.values[50])
  })
  it('keeps the dot scale and fractional volume fixed and excludes a different traffic day', () => {
    expect(flowDots(625)).toEqual([1,1,0.5])
    expect(flowDots(0)).toEqual([])
    expect(flowInterval(30600)).toBe(14)
    for (const time of [0,17999,86400,NaN]) expect(flowInterval(time)).toBeUndefined()
    expect(flowPosition([[0,0],[10,0]],0.25)).toEqual([2.5,0])
    expect(flowPosition([[10,0],[0,0]],0.25)).toEqual([7.5,0])
  })
  it('rejects incomplete profiles, incorrect totals and unjoined endpoints', () => {
    for (const mutation of [
      (data: typeof fixture)=>data.links[0].values.pop(),
      (data: typeof fixture)=>{ data.links[0].total=0 },
      (data: typeof fixture)=>{ data.links[0].from='missing' },
      (data: typeof fixture)=>{ data.source.dayType='Thursday' },
    ]) { const data=structuredClone(fixture); mutation(data); expect(()=>decodeMorningFlow(data)).toThrow() }
  })
})
