export const PASSENGER_METRICS = ['entries', 'exits', 'interchanges'] as const
export type PassengerMetric = typeof PASSENGER_METRICS[number]
export type PassengerStation = { name: string; nlc: number; asc: string; totals: Record<PassengerMetric, number> } & Record<PassengerMetric, number[]>
export interface PassengerDemand {
  version: 1
  start: 18000
  step: 900
  source: { url: string; year: 2025; dayType: 'Friday'; season: 'autumn'; sha256: string }
  stations: Record<'bank' | 'stratford', PassengerStation>
}

export function decodePassengerDemand(value: unknown): PassengerDemand {
  const data = value as PassengerDemand
  if (data?.version !== 1 || data.start !== 18000 || data.step !== 900 || data.source?.year !== 2025 || data.source.dayType !== 'Friday' || data.source.season !== 'autumn') throw new Error('Unsupported passenger demand source')
  for (const [id, nlc, asc, name] of [['bank', 513, 'BNKu', 'Bank and Monument'], ['stratford', 719, 'SFDu', 'Stratford']] as const) {
    const station = data.stations?.[id]
    if (!station || station.nlc !== nlc || station.asc !== asc || station.name !== name) throw new Error('Passenger station identity mismatch')
    for (const metric of PASSENGER_METRICS) {
      const values = station[metric], total = station.totals?.[metric]
      if (!Array.isArray(values) || values.length !== 96 || values.some(v => typeof v !== 'number' || !Number.isFinite(v) || v < 0) || !Number.isFinite(total) || Math.abs(values.reduce((a, b) => a + b, 0) - total) > 0.1) throw new Error('Incomplete passenger demand profile')
    }
  }
  return data
}

// Friday's post-midnight tail belongs to Saturday, not Friday before 05:00.
// This study clock ends at 24:00; do not wrap the next day onto its start.
export function passengerInterval(time: number): number | undefined {
  return Number.isFinite(time) && time >= 18000 && time < 86400 ? Math.floor((time - 18000) / 900) : undefined
}

let cached: Promise<PassengerDemand> | undefined
export function loadPassengerDemand(): Promise<PassengerDemand> {
  return cached ??= fetch(`${import.meta.env.BASE_URL}data/all-change-passenger-demand.json`)
    .then(response => { if (!response.ok) throw new Error('Passenger demand unavailable'); return response.json() })
    .then(decodePassengerDemand)
    .catch(error => { cached = undefined; throw error })
}
