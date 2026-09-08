export interface NightProfile { name: string; kind: 'tfl' | 'rail' | 'eurostar'; calls: readonly (readonly [number, number])[] }
export interface NightGroup { journeys: number; routes: readonly string[] }
export interface NightStudy {
  format: 'london-night-v1'; serviceDate: string; windowStart: number; windowEnd: number
  routes: readonly string[]; profiles: Readonly<Record<string, NightProfile>>
  checkpoints: readonly { time: number; tfl: NightGroup; rail: NightGroup; bus: NightGroup }[]
  comparisons: readonly { name: string; description: string; ids: readonly string[] }[]
}
export function validateNightStudy(value: NightStudy, date: string) {
  if (value.format !== 'london-night-v1' || value.serviceDate !== date || value.windowStart !== 0 || value.windowEnd !== 18000 || value.checkpoints?.length !== 10 || !value.routes?.length || !value.profiles || !value.comparisons?.length) throw new Error('Invalid night study')
  if (value.checkpoints.some((point, index) => point.time !== index * 1800 || [point.tfl, point.rail, point.bus].some(group => !Number.isInteger(group.journeys) || group.journeys < 0 || !Array.isArray(group.routes))) || Object.values(value.profiles).some(profile => !['tfl', 'rail', 'eurostar'].includes(profile.kind) || !Array.isArray(profile.calls) || profile.calls.some(([time, route], index) => !Number.isFinite(time) || time >= 86400 || !Number.isInteger(route) || !value.routes[route] || (index > 0 && time < profile.calls[index - 1][0]))) || value.comparisons.some(comparison => !comparison.ids.length || comparison.ids.some(id => !value.profiles[id]))) throw new Error('Invalid night coverage')
  return value
}
export function nightDepartures(data: NightStudy, ids: readonly string[], time: number) {
  const profiles = [...new Set(ids)].flatMap(id => data.profiles[id] ? [data.profiles[id]] : [])
  const calls = profiles.flatMap(profile => profile.calls).sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const inside = time >= data.windowStart && time < data.windowEnd
  return { available: profiles.length > 0, partial: profiles.some(profile => profile.kind === 'tfl'), inside,
    next: inside ? calls.find(call => call[0] >= time) : undefined,
    previous: inside ? calls.filter(call => call[0] < time).at(-1) : undefined,
    count: calls.filter(call => call[0] >= 0 && call[0] < 18000).length,
  }
}
