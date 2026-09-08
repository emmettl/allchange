import { CYCLE_DATES, type CycleManifest } from './cycle-hire.ts'

export interface CycleProfile { departures: number[]; returns: number[] }
export interface CycleComparison {
  version: 1; dockId: string; sourceSha256: string; dates: string[]; maximum: number
  profiles: (CycleProfile | null)[]
}
export function decodeCycleComparison(value: unknown, dockId: string, manifest: CycleManifest): CycleComparison {
  const data = value as CycleComparison
  if (data?.version !== 1 || data.dockId !== dockId || !manifest.stations.some(dock => dock.id === dockId) || data.sourceSha256 !== manifest.sourceSha256 || !Array.isArray(data.dates) || data.dates.join() !== CYCLE_DATES.join() || data.maximum !== manifest.profileMax[dockId] || !Array.isArray(data.profiles) || data.profiles.length !== 4) throw new Error('Invalid dock comparison')
  let maximum = 1
  for (const profile of data.profiles) {
    if (profile === null) continue
    for (const metric of ['departures', 'returns'] as const) {
      const values = profile?.[metric]
      if (!Array.isArray(values) || values.length !== 96 || values.some(value => !Number.isInteger(value) || value < 0 || value > data.maximum)) throw new Error('Invalid dock profile')
      maximum = Math.max(maximum, ...values)
    }
  }
  if (maximum !== data.maximum || data.profiles.every(profile => profile === null)) throw new Error('Invalid comparison scale')
  return data
}
const cache = new Map<string, Promise<CycleComparison>>()
export function loadCycleComparison(dockId: string, manifest: CycleManifest) {
  if (!/^\d+$/.test(dockId) || !manifest.stations.some(dock => dock.id === dockId)) return Promise.reject(new Error('Unknown dock'))
  const key = `${manifest.sourceSha256}:${dockId}`
  if (!cache.has(key)) cache.set(key, fetch(`${import.meta.env.BASE_URL}data/all-change-cycle/profiles/${dockId}.json`).then(response => {
    if (!response.ok) throw new Error('Dock comparison unavailable')
    return response.json()
  }).then(value => decodeCycleComparison(value, dockId, manifest)).catch(error => { cache.delete(key); throw error }))
  return cache.get(key)!
}
