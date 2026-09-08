export type FlowPoint = readonly [number, number]
export interface FlowStation { asc: string; label: string; name: string; stopId: string; geo: FlowPoint; diagram: FlowPoint; boarders: number[]; alighters: number[] }
export interface FlowLink { id: string; from: string; to: string; direction: 'EB' | 'WB'; values: number[]; total: number; geo: FlowPoint[]; diagram: FlowPoint[] }
export interface MorningFlow { version: 1; start: 18000; step: 900; source: { year: number; dayType: string; sha256: string; url: string }; stations: FlowStation[]; links: FlowLink[] }
const validProfile = (values: number[]) => Array.isArray(values) && values.length === 96 && values.every(value => typeof value === 'number' && Number.isFinite(value) && value >= 0)
const validPoint = (point: FlowPoint) => Array.isArray(point) && point.length === 2 && point.every(Number.isFinite)
export function decodeMorningFlow(value: unknown): MorningFlow {
  const data = value as MorningFlow
  if (data?.version !== 1 || data.start !== 18000 || data.step !== 900 || data.source?.year !== 2025 || data.source.dayType !== 'Friday' || data.source.sha256 !== '22eeb8fe2fd5ee2c974aaff81c7f3e114c53e39f46cd03c273c072974f5d9b5c' || data.stations?.length !== 7 || data.links?.length !== 12) throw new Error('Invalid morning flow source')
  const ids = new Set(data.stations.map(station => station.asc)), links = new Set(data.links.map(link => link.id))
  if (ids.size !== 7 || links.size !== 12 || data.stations.some(s => !validPoint(s.geo) || !validPoint(s.diagram) || !validProfile(s.boarders) || !validProfile(s.alighters)) || data.links.some(link => !ids.has(link.from) || !ids.has(link.to) || !['EB', 'WB'].includes(link.direction) || !validProfile(link.values) || !Number.isFinite(link.total) || Math.abs(link.values.reduce((a,b) => a+b,0)-link.total) > 0.1 || link.geo?.length !== 33 || link.diagram?.length !== 33 || !link.geo.every(validPoint) || !link.diagram.every(validPoint))) throw new Error('Invalid morning flow coverage')
  return data
}
export function flowInterval(time: number) { return Number.isFinite(time) && time >= 18000 && time < 86400 ? Math.floor((time - 18000) / 900) : undefined }
export function flowDots(value: number) {
  // Fixed scale in every link and interval; a final partial mark preserves volume.
  return Array.from({ length: Math.ceil(value / 250) }, (_, index) => Math.min(1, value / 250 - index))
}
export function flowPosition(points: FlowPoint[], phase: number): FlowPoint {
  const x = ((phase % 1 + 1) % 1) * (points.length - 1), index = Math.floor(x), fraction = x - index
  return [points[index][0] + (points[index + 1][0] - points[index][0]) * fraction, points[index][1] + (points[index + 1][1] - points[index][1]) * fraction]
}
let pending: Promise<MorningFlow> | undefined
export function loadMorningFlow() {
  return pending ??= fetch(`${import.meta.env.BASE_URL}data/all-change-morning-flow.json`).then(response => {
    if (!response.ok) throw new Error('Morning flow unavailable')
    return response.json()
  }).then(decodeMorningFlow).catch(error => { pending = undefined; throw error })
}
