// Audited NUMBAT identities; no fuzzy matching to nearby stations.
export function passengerStationId(name: string | undefined): 'bank' | 'stratford' | undefined {
  if (name === 'Bank' || name === 'Monument' || name === 'Bank and Monument') return 'bank'
  if (name === 'Stratford' || name === 'Stratford (London)') return 'stratford'
  return undefined
}
