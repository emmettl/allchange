export const PASSENGER_METRICS = ['entries', 'exits', 'interchanges'] as const
export type PassengerMetric = typeof PASSENGER_METRICS[number]
export interface PassengerArea { name: string; nlc: number; asc: string }
export type PassengerStation = PassengerArea & Partial<Record<PassengerMetric, number[]>> & {
  totals: Partial<Record<PassengerMetric, number>>
  unavailable?: Partial<Record<PassengerMetric, string>>
  crossAreaLinksExcluded: number
}
interface PassengerSource { url: string; year: 2025; dayType: 'Friday'; season: 'autumn'; sha256: string }
export interface PassengerCatalogue { version: 2; source: PassengerSource; matches: Record<string, string[]>; areas: Record<string, PassengerArea> }
export interface PassengerDemand { version: 2; start: 18000; step: 900; source: PassengerSource; station: PassengerStation }
function validSource(source: PassengerSource) {
  return source?.year === 2025 && source.dayType === 'Friday' && source.season === 'autumn' && /^[a-f0-9]{64}$/.test(source.sha256)
}
export function decodePassengerCatalogue(value: unknown): PassengerCatalogue {
  const data = value as PassengerCatalogue
  if (data?.version !== 2 || !validSource(data.source) || !data.matches || !data.areas) throw new Error('Unsupported passenger catalogue')
  for (const [asc, area] of Object.entries(data.areas)) {
    if (!/^[A-Za-z0-9]+$/.test(asc) || area.asc !== asc || !Number.isInteger(area.nlc) || typeof area.name !== 'string') throw new Error('Invalid passenger area')
  }
  for (const areas of Object.values(data.matches)) {
    if (!Array.isArray(areas) || !areas.length || new Set(areas).size !== areas.length || areas.some(id => !Object.hasOwn(data.areas, id))) throw new Error('Invalid passenger mapping')
  }
  return data
}
export function decodePassengerDemand(value: unknown, area: PassengerArea, sourceHash: string): PassengerDemand {
  const data = value as PassengerDemand
  if (data?.version !== 2 || data.start !== 18000 || data.step !== 900 || !validSource(data.source) || data.source.sha256 !== sourceHash) throw new Error('Unsupported passenger demand source')
  const station = data.station
  if (!station || station.nlc !== area.nlc || station.asc !== area.asc || station.name !== area.name) throw new Error('Passenger station identity mismatch')
  let count = 0
  for (const metric of PASSENGER_METRICS) {
    const values = station[metric], total = station.totals?.[metric]
    if (values === undefined && total === undefined) continue
    if (!Array.isArray(values) || values.length !== 96 || values.some(v => typeof v !== 'number' || !Number.isFinite(v) || v < 0) || typeof total !== 'number' || !Number.isFinite(total) || Math.abs(values.reduce((a, b) => a + b, 0) - total) > 0.1) throw new Error('Incomplete passenger demand profile')
    count += 1
  }
  if (!count) throw new Error('Empty passenger profile')
  return data
}
export function passengerAreaIds(catalogue: PassengerCatalogue, name: string): string[] {
  const key = name.toLowerCase().replaceAll('&', 'and').replace(/[^a-z0-9]/g, '')
  return Object.hasOwn(catalogue.matches, key) ? catalogue.matches[key] : []
}
// Friday's post-midnight tail belongs to Saturday, not Friday before 05:00.
export function passengerInterval(time: number): number | undefined {
  return Number.isFinite(time) && time >= 18000 && time < 86400 ? Math.floor((time - 18000) / 900) : undefined
}
async function json(path: string): Promise<unknown> {
  const response = await fetch(`${import.meta.env.BASE_URL}data/all-change-passenger-demand/${path}`)
  if (!response.ok) throw new Error('Passenger demand unavailable')
  return response.json()
}
let catalogueCache: Promise<PassengerCatalogue> | undefined
const stationCache = new Map<string, Promise<PassengerDemand>>()
export function loadPassengerCatalogue(): Promise<PassengerCatalogue> {
  return catalogueCache ??= json('catalogue.json').then(decodePassengerCatalogue).catch(error => { catalogueCache = undefined; throw error })
}
export async function loadPassengerSelection(name: string, preferredArea?: string) {
  const catalogue = await loadPassengerCatalogue()
  const ids = passengerAreaIds(catalogue, name)
  if (!ids.length) return undefined
  const id = preferredArea && ids.includes(preferredArea) ? preferredArea : ids[0]
  if (!stationCache.has(id)) stationCache.set(id, json(`stations/${id}.json`).then(value => decodePassengerDemand(value, catalogue.areas[id], catalogue.source.sha256)).catch(error => { stationCache.delete(id); throw error }))
  return { data: await stationCache.get(id)!, areas: ids.map(asc => catalogue.areas[asc]) }
}
