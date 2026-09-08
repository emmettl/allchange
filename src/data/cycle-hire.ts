export type CycleTrip = [start: number, end: number, from: number, to: number]
export interface CycleDock { id: string; name: string; bikePointId: string; lon: number; lat: number }
export const CYCLE_DATES = ['2026-05-28', '2026-05-29', '2026-05-30', '2026-05-31'] as const
export type CycleDate = typeof CYCLE_DATES[number]
export interface CycleManifest {
  version: 1; dates: CycleDate[]; sourceSha256: string; stations: CycleDock[]
  bounds: [west: number, east: number, south: number, north: number]
  profileMax: Record<string, number>; totalProfileMax: number
}
export interface CycleDay {
  version: 1; date: string; timezone: 'Europe/London'
  source: { url: string; sha256: string; stationsRetrieved: string }
  stations: CycleDock[]; trips: CycleTrip[]; excludedJourneys: number
}
export function decodeCycleManifest(value: unknown): CycleManifest {
  const data = value as CycleManifest
  if (data?.version !== 1 || data.dates?.join() !== CYCLE_DATES.join() || !/^[a-f0-9]{64}$/.test(data.sourceSha256) || !Array.isArray(data.stations) || !data.stations.length || !Number.isInteger(data.totalProfileMax) || data.totalProfileMax < 1 || !Array.isArray(data.bounds) || data.bounds.length !== 4 || data.bounds.some(v => !Number.isFinite(v))) throw new Error('Unsupported cycle comparison')
  const [west, east, south, north] = data.bounds
  if (!(west < east && south < north && west >= -.6 && east <= .3 && south >= 51.3 && north <= 51.7)) throw new Error('Invalid cycle extent')
  const ids = new Set<string>()
  for (const dock of data.stations) {
    const max = data.profileMax?.[dock.id]
    if (!dock || typeof dock.id !== 'string' || typeof dock.name !== 'string' || ids.has(dock.id) || !Number.isFinite(dock.lon) || !Number.isFinite(dock.lat) || dock.lon < west || dock.lon > east || dock.lat < south || dock.lat > north || !Number.isInteger(max) || max < 1) throw new Error('Invalid comparison dock')
    ids.add(dock.id)
  }
  return data
}
export function decodeCycleDay(value: unknown, expectedDate: CycleDate = '2026-05-29', manifest?: CycleManifest): CycleDay {
  const day = value as CycleDay
  if (day?.version !== 1 || day.date !== expectedDate || day.timezone !== 'Europe/London' || !/^[a-f0-9]{64}$/.test(day.source?.sha256) || (manifest && day.source.sha256 !== manifest.sourceSha256) || !Array.isArray(day.stations) || !day.stations.length || !Array.isArray(day.trips)) throw new Error('Unsupported cycle study')
  const identities = new Map(manifest?.stations.map(dock => [dock.id, dock]))
  const ids = new Set<string>()
  for (const dock of day.stations) {
    if (!dock || typeof dock.id !== 'string' || typeof dock.name !== 'string' || ids.has(dock.id) || !Number.isFinite(dock.lon) || !Number.isFinite(dock.lat) || dock.lon < -0.6 || dock.lon > 0.3 || dock.lat < 51.3 || dock.lat > 51.7) throw new Error('Invalid cycle dock')
    ids.add(dock.id)
    const expected = identities.get(dock.id)
    if (manifest && (!expected || dock.name !== expected.name || dock.lat !== expected.lat || dock.lon !== expected.lon || dock.bikePointId !== expected.bikePointId)) throw new Error('Cycle dock changed identity across days')
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

async function cycleJson(path: string): Promise<unknown> {
  return fetch(`${import.meta.env.BASE_URL}data/all-change-cycle/${path}`).then(response => {
    if (!response.ok) throw new Error('Cycle study unavailable')
    return response.json()
  })
}
let manifestCache: Promise<CycleManifest> | undefined
const days = new Map<CycleDate, Promise<CycleDay>>()
export async function loadCycleDay(date: CycleDate = '2026-05-29') {
  if (!CYCLE_DATES.includes(date)) throw new Error('Unavailable cycle date')
  const manifest = await (manifestCache ??= cycleJson('manifest.json').then(decodeCycleManifest).catch(error => { manifestCache = undefined; throw error }))
  if (!days.has(date)) days.set(date, cycleJson(`days/${date}.json`).then(value => decodeCycleDay(value, date, manifest)).catch(error => { days.delete(date); throw error }))
  return { manifest, day: await days.get(date)! }
}
