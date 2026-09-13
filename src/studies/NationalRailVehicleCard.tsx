import { VehicleHeroCard } from '@motionstudies/web/components/VehicleHeroCard'
import { formatServiceTime } from '@motionstudies/core/domain/network'
import type { NationalRailSnapshot, NationalRailTrain } from '../data/national-rail.ts'
import '@motionstudies/web/vehicle-hero-card.css'

export default function NationalRailVehicleCard({snapshot, train, time}: {snapshot:NationalRailSnapshot;train:NationalRailTrain;time:number}) {
  const calls = train.stops.flatMap(([index,arrival,departure],ordinal) => {
    const stop = snapshot.stops[index]
    if (!stop || train.passIndexes?.includes(ordinal) || departure < time) return []
    return [{id:`${train.id}:${ordinal}`,name:stop[2],atStop:arrival<=time,
      time:formatServiceTime(arrival<=time?departure:arrival).slice(0,5),platform:stop[3],
      detail:train.pickupOnlyIndexes?.includes(ordinal)?'Pick up only':train.setDownOnlyIndexes?.includes(ordinal)?'Set down only':undefined,
      isDestination:ordinal===train.stops.length-1&&stop[2]===train.headsign}]
  })
  return <VehicleHeroCard presentation="uk-rail" vehicle={{service:train.route||train.shortName,destination:train.headsign||undefined}}
    stops={calls} labels={calls[0]?.atStop?{nextStop:'At stop'}:undefined}
    note="Published timetable · mapped passenger calls only; passing times omitted. Trains continue beyond the mapped area." />
}
