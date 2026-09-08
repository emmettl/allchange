import { expect, it } from 'vitest'
import { pdfWeekdayCarryIn } from './compile-tfl-calendar-day.mjs'

it('carries shared-weekday PDF trains across midnight without duplicating 00xx origins', () => {
  const snapshot = { metadata:{serviceDate:'2026-09-04'}, trains:[
    {id:'late',start:85800,end:87000,stops:[[0,85800,85800],[1,87000,87000]]},
    {id:'early',start:600,end:1200,stops:[[0,600,600],[1,1200,1200]]},
  ] }
  const data=pdfWeekdayCarryIn(snapshot)
  expect(data.trains).toHaveLength(3)
  expect(data.trains[0]).toMatchObject({id:'2026-09-03:late',start:-600,end:600,stops:[[0,-600,-600],[1,600,600]]})
  expect(snapshot.trains).toHaveLength(2)
  expect(()=>pdfWeekdayCarryIn({...snapshot,metadata:{serviceDate:'2026-09-05'}})).toThrow('Re-audit')
})
