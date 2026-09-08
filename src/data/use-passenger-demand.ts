import { useEffect, useState } from 'react'
import { loadPassengerSelection } from './passenger-demand.ts'

export function usePassengerDemand(name: string, preceding = false) {
  const [area, setArea] = useState<{ name: string; asc: string }>()
  const [attempt, setAttempt] = useState(0)
  const areaId = area?.name === name ? area.asc : undefined
  const requestKey = `${name}:${areaId ?? ''}:${preceding}:${attempt}`
  const [result, setResult] = useState<{ key: string; value?: Awaited<ReturnType<typeof loadPassengerSelection>>; failed?: boolean }>()
  useEffect(() => {
    let active = true
    loadPassengerSelection(name, areaId, preceding).then(value => { if (active) setResult({ key: requestKey, value }) }).catch(() => { if (active) setResult({ key: requestKey, failed: true }) })
    return () => { active = false }
  }, [name, areaId, preceding, requestKey])
  const current = result?.key === requestKey ? result : undefined
  return { selection: current?.value, loading: !current, failed: current?.failed ?? false,
    retry: () => setAttempt(value => value + 1), selectArea: (asc: string) => setArea({ name, asc }) }
}
