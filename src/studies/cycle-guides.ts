import type { CycleDate } from '../data/cycle-hire.ts'

/** Authored examples of recorded dock events, not inferred journey purposes. */
export const CYCLE_GUIDES: readonly { dockId: string; label: string; date: CycleDate; time: number; text: string }[] = [
  { dockId: '1072', label: 'Waterloo · morning departures', date: '2026-05-28', time: 30600,
    text: 'Thursday 28 May, 07:00–10:00: 205 departures and 2 returns at Waterloo Station 3. By 16:00–19:00 the balance reverses: 10 departures and 164 returns. These counts do not establish a connection to a train.' },
  { dockId: '999', label: 'Bank · morning returns', date: '2026-05-28', time: 30600,
    text: 'Thursday 28 May, 07:00–10:00: 137 returns and 12 departures at Queen Street 1. By 16:00–19:00 there are 85 departures and 23 returns. This is the opposite balance to the Waterloo example, not evidence of journeys between the two docks.' },
  { dockId: '1075', label: 'Hyde Park · weekend midday', date: '2026-05-31', time: 50400,
    text: 'At Hyde Park Corner, departures plus returns between 12:00 and 17:00 total 110 on Thursday, 193 on Friday, 214 on Saturday and 272 on Sunday. These are dock events, not unique riders or evidence of leisure trips.' },
]
