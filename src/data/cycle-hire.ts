export type CycleTrip = [start: number, end: number, from: number, to: number]
export interface CycleDock { id: string; name: string; bikePointId: string; lon: number; lat: number }
export interface CycleDay {
  version: 1; date: string; timezone: 'Europe/London'
  source: { url: string; sha256: string; stationsRetrieved: string }
  stations: CycleDock[]; trips: CycleTrip[]; excludedJourneys: number
}
export function decodeCycleDay(value: unknown): CycleDay {
  const day = value as CycleDay
  if (day?.version !== 1 || day.date !== '2026-05-29' || day.timezone !== 'Europe/London' || !/^[a-f0-9]{64}$/.test(day.source?.sha256) || !Array.isArray(day.stations) || !day.stations.length || !Array.isArray(day.trips)) throw new Error('Unsupported cycle study')
  const ids = new Set<string>()
  for (const dock of day.stations) {
    if (!dock || typeof dock.id !== 'string' || typeof dock.name !== 'string' || ids.has(dock.id) || !Number.isFinite(dock.lon) || !Number.isFinite(dock.lat) || dock.lon < -0.6 || dock.lon > 0.3 || dock.lat < 51.3 || dock.lat > 51.7) throw new Error('Invalid cycle dock')
    ids.add(dock.id)
  }
  let previous = -Infinity
  for (const trip of day.trips) {
    if (!Array.isArray(trip) || trip.length !== 4 || trip.some(v => !Number.isInteger(v))) throw new Error('Invalid cycle journey')
    const [s, e, a, b] = trip
    if (s < previous || s >= 86400 || e < 0 || e < s || e - s > 86400 || a < 0 || b < 0 || a >= day.stations.length || b >= day.stations.length) throw new Error('Invalid cycle journey bounds')
    previous = s
  }
  return day
}

export function cycleInterval(time: number) { return Number.isFinite(time) && time >= 0 && time < 86400 ? Math.floor(time / 900) : undefined }
export function cycleProfiles(day: CycleDay) {
  const profiles = day.stations.map(() => ({ departures: Array<number>(96).fill(0), returns: Array<number>(96).fill(0) }))
  const active = Array.from({ length: 96 }, () => [] as CycleTrip[])
  for (const trip of day.trips) {
    const [start, end, from, to] = trip
    const s = cycleInterval(start), e = cycleInterval(end)
    if (s !== undefined) profiles[from].departures[s]++
    if (e !== undefined) profiles[to].returns[e]++
    if (end <= start) continue
    for (let bin = Math.max(0, Math.floor(start / 900)); bin < Math.min(96, Math.ceil(end / 900)); bin++) active[bin].push(trip)
  }
  const total = { departures: Array<number>(96).fill(0), returns: Array<number>(96).fill(0) }
  for (const profile of profiles) for (let i = 0; i < 96; i++) { total.departures[i] += profile.departures[i]; total.returns[i] += profile.returns[i] }
  return { profiles, active, total }
}
export function activeCycleTrips(trips: CycleTrip[], time: number, station?: number) {
  if (cycleInterval(time) === undefined) return []
  return trips.filter(([s, e, a, b]) => s <= time && time < e && (station === undefined || station === a || station === b))
}
export function cycleProgress([start, end]: CycleTrip, time: number) { return end > start ? Math.max(0, Math.min(1, (time - start) / (end - start))) : 0 }

let cached: Promise<CycleDay> | undefined
export function loadCycleDay() {
  return cached ??= fetch(`${import.meta.env.BASE_URL}data/all-change-cycle-day.json`).then(response => {
    if (!response.ok) throw new Error('Cycle study unavailable')
    return response.json()
  }).then(decodeCycleDay).catch(error => { cached = undefined; throw error })
}
