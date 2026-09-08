import { lazy, Suspense, useMemo } from 'react'
import { formatServiceTime, type NetworkSnapshot } from '@motionstudies/core/domain/network'
import type { BoardInterchange } from '../editions/london-board-interchanges.ts'
import type { RailCorridorId } from '../editions/london-national-rail.ts'
import type { NationalRailSnapshot } from '../data/national-rail.ts'
import { combinedStationCalls } from './combined-station-board.ts'
import { LondonStationDepartures } from './LondonStationDepartures.tsx'
import type { StationBoardCall, StationBoardDirection } from './station-board.ts'

const LondonNightStudy = lazy(() => import('./LondonNightStudy.tsx'))

export default function LondonCombinedStationBoard({ night, station, areas, onArea, tfl, rail, snapshots, errors, time, windowStart, windowEnd, tflStart, tflEnd, tflLoading, tflError, onTflRetry, onRailRetry, onNightTime, selectedId, onSelect, onSeek, onPulse, animate }: {
  onNightTime?: (time: number) => void; night?: boolean; station: BoardInterchange; tfl: NetworkSnapshot; rail?: NationalRailSnapshot
  areas?: readonly BoardInterchange[]; onArea?: (id: string) => void
  snapshots: Partial<Record<RailCorridorId, NationalRailSnapshot>>; errors: Partial<Record<RailCorridorId, boolean>>
  time: number; windowStart: number; windowEnd: number; tflStart: number; tflEnd: number
  tflLoading: boolean; tflError: boolean; onTflRetry: () => void; onRailRetry: () => void
  selectedId?: string; onSelect: (call: StationBoardCall) => void
  onSeek: (call: StationBoardCall, direction: StationBoardDirection) => void; onPulse: () => void; animate: boolean
}) {
  const tflReady = !tflLoading && !tflError
  const railReady = station.corridors.some(id => snapshots[id]) && rail?.metadata.serviceDate === tfl.metadata.serviceDate
  const missing = station.corridors.filter(id => !snapshots[id])
  const railError = missing.some(id => errors[id])
  const tflPartial = tflStart > time || tflEnd < Math.min(windowEnd, time + 3600)
  const railLabel = station.railLabel ?? 'National Rail'
  const withBoard = station.corridors.map(id => snapshots[id]).find(snapshot => snapshot?.board)
  const railCalls = withBoard?.board ?? rail
  const calls = useMemo(() => combinedStationCalls(station, tfl.metadata.serviceDate,
    tflReady ? { snapshot: tfl, windowStart: tflStart, windowEnd: tflEnd } : undefined,
    railReady && railCalls ? { snapshot: railCalls, movements: withBoard, windowStart, windowEnd } : undefined),
  [station, tfl, tflReady, tflStart, tflEnd, railCalls, withBoard, railReady, windowStart, windowEnd])
  return <div className="london-combined-board">
    {areas && areas.length > 1 && onArea && <label className="london-board-area">Rail station area
      <select value={station.id} onChange={event => onArea(event.target.value)}>
        {areas.map(area => <option key={area.id} value={area.id}>{area.name}</option>)}
      </select>
    </label>}
    <p className="london-station-board-note">TfL + {railLabel} · {station.name}</p>
    {station.note && <p className="london-station-board-note">{station.note}</p>}
    <p className="london-station-board-message" role="status">{tflError ? <>TfL timetable unavailable. <button onClick={onTflRetry}>Retry TfL board</button></> : tflLoading ? 'TfL timetable loading…' : `TfL calls loaded: ${formatServiceTime(tflStart)}–${formatServiceTime(tflEnd)}.`}</p>
    <p className="london-station-board-message" role="status">{missing.length ? <>Partial board · {railError ? `some ${railLabel} services unavailable.` : `${railLabel} services loading…`}{railError && <> <button onClick={onRailRetry}>Retry {railLabel} board</button></>}</> : `${railLabel} calls loaded: ${formatServiceTime(windowStart)}–${formatServiceTime(windowEnd)}.`}</p>
    {tflReady && tflPartial && time < windowEnd && <p className="london-station-board-message">Partial board · TfL coverage does not span this whole window.</p>}
    {night && <Suspense fallback={null}><LondonNightStudy date={tfl.metadata.serviceDate} name={station.name} time={time} stopIds={[...station.tflStopIds, station.railStopId ?? `crs:${station.railCode}`]} onTime={next => onNightTime?.(next)} /></Suspense>}
    <LondonStationDepartures snapshot={tfl} stationName={station.name} providedCalls={calls} time={time}
      windowStart={windowStart} windowEnd={windowEnd} selectedId={selectedId} onSelect={onSelect} onSeek={onSeek} onPulse={withBoard ? undefined : onPulse}
      animate={animate} loading={!tflReady && !railReady && (tflLoading || (missing.length > 0 && !railError))}
      emptyMessage={missing.length || !tflReady || tflPartial ? 'No calls in available data · coverage incomplete.' : undefined}
      note="Separate station areas; allow time to transfer. Loaded calls only." />
    {station.id === 'eurostar' && <details className="london-eurostar-source"><summary>About Eurostar times and coverage</summary>
      <p className="london-station-board-note">Allow time for passport and luggage checks. <a href="https://www.eurostar.com/travel-info/your-trip/check-in" target="_blank" rel="noreferrer">Eurostar arrival guidance</a>. Source: <a href="https://transport.data.gouv.fr/datasets/eurostar-gtfs-plan-de-transport-et-temps-reel" target="_blank" rel="noreferrer">Eurostar International Ltd · Open Licence 2.0</a>.</p>
    {withBoard?.board && <p className="london-station-board-note">{withBoard.trains.length} of {withBoard.board.trains.length} Eurostar services have London movement; the others are timetable only. Movement is interpolated, not live.</p>}
    </details>}
  </div>
}
