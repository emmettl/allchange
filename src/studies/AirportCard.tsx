import { useMemo, type ReactNode } from 'react'
import { AirportHeroCard, type AirportHeroCardProps } from '@motionstudies/web/components/AirportHeroCard'
import { airportBoardMovements, type StudyAirport } from '@motionstudies/core/domain/airport'
import type { AirSearchTrack } from '@motionstudies/core/air-search'
import '@motionstudies/web/airport-hero-card.css'
import './airport-card.css'
import { AIRPORT_NOTES } from './airport-copy.ts'

type Props = Omit<AirportHeroCardProps, 'departures' | 'arrivals' | 'note' | 'airport'> & {
  airport: StudyAirport
  aircraft: readonly AirSearchTrack[]
  dismissed?: boolean
  dismissControl?: ReactNode
}

export default function AirportCard({ aircraft, airport, className, dismissed, dismissControl, ...props }: Props) {
  const movements = useMemo(() => airportBoardMovements(aircraft, airport), [aircraft, airport])
  return <section className={className} data-hero-dismissed={dismissed}>
    {dismissControl}
    <AirportHeroCard {...props} airport={airport} {...movements}
    note={<><a href="https://www.adsb.lol/docs/open-data/historical/">ADSB.lol</a> · ODbL · <a href="https://ourairports.com/data/">OurAirports</a> · {AIRPORT_NOTES.en}</>} />
  </section>
}
