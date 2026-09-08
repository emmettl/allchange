import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ComponentType,
  type KeyboardEvent,
} from 'react'
import {
  airTrackSearchValue,
  searchAirTracks,
  type AirSearchTrack,
} from '@motionstudies/core/air-search'
import {
  activeAirTracks,
  positionForAirTrack,
  type AirSnapshot,
  type AirTrack,
} from '@motionstudies/core/domain/air'
import {
  airportAirTrackIds,
  searchAirports,
  type StudyAirport,
} from '@motionstudies/core/domain/airport'
import {
  buildRouteIndex,
  buildStationIndex,
  formatServiceTime,
  type NetworkRouteIndexEntry,
  type NetworkDayChunk,
  type NetworkDayManifest,
  type NetworkSnapshot,
  type NetworkTrain,
  type ServiceCategory,
  type StationIndexEntry,
} from '@motionstudies/core/domain/network'
import {
  callsForHubFlowLens,
  hubFlowSummary,
  hubNightSignalMix,
  nextHubCall,
  type HubFlowLens,
} from '@motionstudies/core/domain/hub'
import {
  adjacentDayChunks,
  dayChunkForTime,
  networkSnapshotForDayChunk,
} from '@motionstudies/core/domain/network-day'
import { mergeNetworkLayers } from '@motionstudies/core/domain/network-layers'
import {
  operationsAgeSeconds,
  operationsServiceTime,
  projectOperationsOntoNetwork,
} from '@motionstudies/core/domain/operations'
import { reconstructedNationalVehicleCount } from '@motionstudies/core/domain/road-day'
import { observedRoadSnapshot } from '../data/road-observations.ts'
import { cachedRailPath, railPosition } from '../data/national-rail-geometry.ts'
import type { RoadTopologySnapshot } from '@motionstudies/core/domain/road'
import {
  spatialLayoutCoverage,
  type SpatialLayoutSnapshot,
} from '@motionstudies/core/domain/spatial-layout'
import { editionDataUrl } from '../editions/data-url.ts'
import type { SpatialLayoutId } from '@motionstudies/core/edition'
import {
  londonBoundary,
  londonWater,
  type LondonGeographySnapshot,
} from '../editions/london-geography.ts'
import {
  ALL_CHANGE_ROUTE_COLORS,
  type LondonEdition,
} from '../editions/london.ts'
import { isNationalRailCall, londonPulseCalls, londonPulseCallsNearTime } from '../editions/london-pulse.ts'
import { LONDON_AIRPORTS } from '../editions/london-airports.ts'
import { londonInfrastructureSnapshot } from '../editions/london-infrastructure.ts'
import { londonStationLabels } from '../editions/london-station-labels.ts'
import {
  railPulseHubs,
  LONDON_PULSE_CENTRE,
  type LondonHubId,
} from '../editions/london-hubs.ts'
import {
  LONDON_MOTORWAYS,
  type LondonMotorway,
} from '../editions/london-motorways.ts'
import { motionStudyMark } from '../editions/catalogue.ts'
import { foldSearchText } from '@motionstudies/core/search-text'
import {
  roadCorridorSearchValue,
  searchRoadCorridors,
} from '@motionstudies/core/road-search'
import type {
  NationalNetworkSceneProps,
  MapCameraAction,
  MapCameraCommand,
} from '@motionstudies/three/NationalNetworkScene'
import type { TrainLabelMode } from '@motionstudies/three/train-labels'
import { SERVICE_COLORS } from '@motionstudies/core/theme'
import { useProgressiveAirDay } from '@motionstudies/web/use-progressive-air-day'
import {
  verifiedNetworkDayChunk,
} from '@motionstudies/web/use-progressive-network-day'
import { useBusDay } from '../data/use-bus-day.ts'
import { useProgressiveRoadStudy } from '@motionstudies/web/use-progressive-road-study'
import { useObservedOperations } from '@motionstudies/web/use-observed-operations'
import { useNationalRail, useRailCatalogue } from '../data/use-national-rail.ts'
import { LONDON_RAIL_CORRIDORS, type RailBoardStation, type RailBoardStationId } from '../editions/london-national-rail.ts'
const AirportHeroCard = lazy(() => import('./AirportCard.tsx'))

const LondonRoadObservations = lazy(() => import('./LondonRoadObservations.tsx').then(module => ({ default: module.LondonRoadObservations })))
import type { NationalRailSceneExtension } from './LondonNationalRailLayer.tsx'
const LondonNationalRailBoard = lazy(() => import('./LondonNationalRailBoard.tsx').then(module => ({ default: module.LondonNationalRailBoard })))
import type { QuietMapSceneExtension } from './LondonQuietMap.tsx'
import type { MapSelectionSceneExtension } from './LondonMapSelection.tsx'
import '../styles/london-quiet-map.css'

const NationalNetworkScene = lazy(() =>
  import('@motionstudies/three/NationalNetworkScene').then(
    ({ NationalNetworkScene: Scene }) => ({ default: Scene as ComponentType<NationalNetworkSceneProps & NationalRailSceneExtension & QuietMapSceneExtension & MapSelectionSceneExtension> }),
  ),
)

const HubPulseScene = lazy(() =>
  import('@motionstudies/three/HubPulseScene').then(({ HubPulseScene: Scene }) => ({
    default: Scene,
  })),
)

const PLAYBACK_RATES = [
  { label: '1×', value: 30 },
  { label: '4×', value: 120 },
  { label: '16×', value: 480 },
  { label: '64×', value: 1920 },
] as const

const LABEL_MODES: Readonly<Record<TrainLabelMode, TrainLabelMode>> = {
  auto: 'on',
  on: 'off',
  off: 'auto',
}

const LAYOUT_TRANSITION_DURATION_MS = 1_300
const LAYOUT_TRANSITION_STEPS = 24

type StudyWindow = 'morning' | 'day'
type OperationsMode = 'plan' | 'observed'

const LONDON_CATEGORIES: readonly {
  id: ServiceCategory
  label: string
  detail: string
}[] = [
  { id: 'metro', label: 'Tube · DLR', detail: 'Underground and light metro' },
  {
    id: 'regional',
    label: 'Elizabeth · Overground',
    detail: 'Cross-city and orbital rail',
  },
  { id: 'intercity', label: 'National Rail', detail: 'London passenger mainline services' },
  { id: 'tram', label: 'Tramlink', detail: 'South London tram services' },
  { id: 'bus', label: 'Buses', detail: 'London bus routes and night services' },
  { id: 'ferry', label: 'River', detail: 'Scheduled Thames river services' },
  { id: 'cableway', label: 'Cable', detail: 'London Cable Car cabins' },
]

type SearchChoice =
  | { readonly kind: 'rail-station'; readonly value: RailBoardStation }
  | { readonly kind: 'rail-train'; readonly value: NetworkTrain }
  | { readonly kind: 'airport'; readonly value: StudyAirport }
  | { readonly kind: 'road'; readonly value: LondonMotorway }
  | { readonly kind: 'station'; readonly value: StationIndexEntry }
  | { readonly kind: 'route'; readonly value: NetworkRouteIndexEntry }
  | { readonly kind: 'train'; readonly value: NetworkTrain }
  | { readonly kind: 'air'; readonly value: AirSearchTrack }

function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'))
  } catch {
    return false
  }
}

function trainSearchText(train: NetworkTrain, snapshot: NetworkSnapshot): string {
  return foldSearchText(
    [
      train.route,
      train.shortName,
      train.headsign,
      ...train.stops.map(([index]) => snapshot.stops[index]?.[2] ?? ''),
    ].join(' '),
  )
}

function stationCentre(
  station: StationIndexEntry,
  snapshot: NetworkSnapshot,
): readonly [number, number] {
  const coordinates = station.stopIndexes
    .map((index) => snapshot.stops[index])
    .filter((stop) => stop !== undefined)
  const divisor = Math.max(1, coordinates.length)
  return [
    coordinates.reduce((sum, stop) => sum + stop[0], 0) / divisor,
    coordinates.reduce((sum, stop) => sum + stop[1], 0) / divisor,
  ]
}

function formatStudyDate(serviceDate?: string): string {
  if (!serviceDate) return 'historical Friday'
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${serviceDate}T12:00:00Z`))
}

function searchNetworkChoices(
  query: string,
  snapshot: NetworkSnapshot,
  stations: readonly StationIndexEntry[],
  routes: readonly NetworkRouteIndexEntry[],
  airports: readonly StudyAirport[],
  roads: readonly LondonMotorway[],
): { readonly places: readonly SearchChoice[]; readonly services: readonly SearchChoice[] } {
  const folded = foldSearchText(query.trim())
  if (!folded) return { places: [], services: [] }
  const serviceQuery = folded.replace(/^(?:route|line|bus)\s+/, '')

  const airportMatches = searchAirports(airports, query, 4).map(
    (value): SearchChoice => ({ kind: 'airport', value }),
  )
  const roadMatches = searchRoadCorridors(roads, query, 4).map(
    (value): SearchChoice => ({ kind: 'road', value }),
  )
  const stationMatches = stations
    .filter((station) => foldSearchText(station.name).includes(folded))
    .slice(0, 5)
    .map((value): SearchChoice => ({ kind: 'station', value }))
  const routeMatches = routes
    .filter((route) =>
      foldSearchText(`${route.name} ${route.headsigns.join(' ')}`).includes(
        serviceQuery,
      ),
    )
    .sort((first, second) => {
      const rank = (name: string) => {
        const foldedName = foldSearchText(name)
        return foldedName === serviceQuery ? 0 : foldedName.startsWith(serviceQuery) ? 1 : 2
      }
      return rank(first.name) - rank(second.name) || first.name.localeCompare(second.name, 'en', { numeric: true })
    })
    .slice(0, 5)
    .map((value): SearchChoice => ({ kind: 'route', value }))
  const trainMatches = snapshot.trains
    // Tube, DLR, Elizabeth line and bus journeys have no useful public service
    // identifier; route results provide the meaningful way to explore them.
    // Overground services are also best explored through their line results.
    .filter((train) =>
      train.category !== 'metro' &&
      train.category !== 'bus' &&
      train.mode !== 'elizabeth-line' &&
      train.mode !== 'overground' &&
      trainSearchText(train, snapshot).includes(serviceQuery),
    )
    .slice(0, 5)
    .map((value): SearchChoice => ({ kind: 'train', value }))
  return {
    places: [...airportMatches, ...roadMatches],
    services: [...stationMatches, ...routeMatches, ...trainMatches],
  }
}

export function LondonStudyApp({ edition }: { readonly edition: LondonEdition }) {
  const [morningNetwork, setMorningNetwork] = useState<NetworkSnapshot>()
  const [studyWindow, setStudyWindow] = useState<StudyWindow>('morning')
  const [dayManifest, setDayManifest] = useState<NetworkDayManifest>()
  const [dayChunks, setDayChunks] = useState<
    Readonly<Record<string, NetworkDayChunk>>
  >({})
  const [dayError, setDayError] = useState(false)
  const [geography, setGeography] = useState<LondonGeographySnapshot>()
  const [loadError, setLoadError] = useState(false)
  const [time, setTime] = useState(edition.defaultNetworkTime)
  const [isPlaying, setIsPlaying] = useState(true)
  const [playbackRate, setPlaybackRate] = useState(120)
  const [operationsMode, setOperationsMode] = useState<OperationsMode>('plan')
  const [operationsRequested, setOperationsRequested] = useState(false)
  const [operationsTransitionNetwork, setOperationsTransitionNetwork] =
    useState<NetworkSnapshot>()
  const [selectedCategory, setSelectedCategory] = useState<ServiceCategory>()
  const [selectedStation, setSelectedStation] = useState<StationIndexEntry>()
  const [selectedRoute, setSelectedRoute] = useState<NetworkRouteIndexEntry>()
  const [selectedTrain, setSelectedTrain] = useState<NetworkTrain>()
  const [tflEnabled, setTflEnabled] = useState(true)
  const [airEnabled, setAirEnabled] = useState(false)
  const [airCategorySelected, setAirCategorySelected] = useState(false)
  const [morningAir, setMorningAir] = useState<AirSnapshot>()
  const [airLoadError, setAirLoadError] = useState(false)
  const [selectedAirTrackId, setSelectedAirTrackId] = useState<string>()
  const [selectedAirport, setSelectedAirport] = useState<StudyAirport>()
  const [roadEnabled, setRoadEnabled] = useState(false)
  const [roadCategorySelected, setRoadCategorySelected] = useState(false)
  const [selectedRoad, setSelectedRoad] = useState<LondonMotorway>()
  const [roadTopology, setRoadTopology] = useState<RoadTopologySnapshot>()
  const [roadLoadError, setRoadLoadError] = useState(false)
  const [surfaceEnabled, setSurfaceEnabled] = useState(false)
  const [surfaceNetwork, setSurfaceNetwork] = useState<NetworkSnapshot>()
  const [surfaceLoadError, setSurfaceLoadError] = useState(false)
  const [busEnabled, setBusEnabled] = useState(false)
  const [nationalRailEnabled, setNationalRailEnabled] = useState(false)
  const [nationalRailStationId, setNationalRailStationId] = useState<RailBoardStationId>('paddington')
  const [nationalRailSelectedId, setNationalRailSelectedId] = useState<string>()
  const [trainLabelMode, setTrainLabelMode] = useState<TrainLabelMode>('auto')
  const [limitedChrome, setLimitedChrome] = useState(false)
  const [mobileControlsOpen, setMobileControlsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [pulseHubId, setPulseHubId] = useState<LondonHubId>()
  const railCatalogue = useRailCatalogue(nationalRailEnabled || Boolean(pulseHubId) || searchOpen, morningNetwork?.metadata.serviceDate)
  const railStations = railCatalogue.stations
  const pulseHubs = useMemo(() => railPulseHubs(railStations), [railStations])
  const pulseHub = pulseHubs.find(hub => hub.id === pulseHubId)
  const railFeed = useNationalRail(edition.data.nationalRail,
    nationalRailEnabled || (searchOpen && query.trim().length >= 2) ? LONDON_RAIL_CORRIDORS.map(corridor => corridor.id) : pulseHub?.nationalRail ?? [],
    morningNetwork?.metadata.serviceDate,
  )
  const nationalRail = railFeed.snapshot
  const nationalRailError = railFeed.error
  const railStation = railStations.find(station => station.id === nationalRailStationId) ?? railStations[0]
  const railBoardSnapshot = railStation.corridors.some(id => railFeed.snapshots[id]) ? nationalRail : undefined
  const pulseRailSnapshot = pulseHub?.nationalRail?.some(id => railFeed.snapshots[id]) ? nationalRail : undefined
  const pulseRailOperator = pulseHub?.nationalRail?.filter(id => railFeed.snapshots[id]).map(id => LONDON_RAIL_CORRIDORS.find(corridor => corridor.id === id)!.operator).join(' · ')
  const [pulseLens, setPulseLens] = useState<HubFlowLens>('all')
  const [activeSearchIndex, setActiveSearchIndex] = useState(0)
  const [layout, setLayout] = useState<SpatialLayoutId>('geographic')
  const [spatialLayout, setSpatialLayout] = useState<SpatialLayoutSnapshot>()
  const [layoutLoading, setLayoutLoading] = useState(false)
  const [layoutError, setLayoutError] = useState(false)
  const [layoutMix, setLayoutMix] = useState(0)
  const [layoutTransitioning, setLayoutTransitioning] = useState(false)
  const [cameraCommand, setCameraCommand] = useState<MapCameraCommand>()
  const cameraCommandId = useRef(0)
  const layoutMixRef = useRef(0)
  const layoutFrameRef = useRef(0)
  const desiredLayoutRef = useRef<SpatialLayoutId>('geographic')
  const webglAvailable = useMemo(() => supportsWebGL(), [])
  const airDay = useProgressiveAirDay(
    edition.data.air.dayManifest,
    airEnabled && studyWindow === 'day',
    time,
    editionDataUrl,
  )
  const roadDay = useProgressiveRoadStudy(
    edition.data.road.dayManifest,
    roadEnabled,
    time,
    editionDataUrl,
  )
  const busDay = useBusDay(
    edition.data.bus.dayManifest,
    busEnabled,
    time,
    editionDataUrl,
  )
  const observedOperations = useObservedOperations(
    edition.data.operations.latest,
    operationsMode === 'observed' || operationsRequested,
  )
  const observedServiceTime = useMemo(
    () => observedOperations.snapshot
      ? operationsServiceTime(observedOperations.snapshot, edition.timezone)
      : undefined,
    [observedOperations.snapshot, edition.timezone],
  )
  const sceneTime =
    operationsMode === 'observed' && observedServiceTime !== undefined
      ? observedServiceTime
      : time

  useEffect(() => {
    const controller = new AbortController()
    Promise.all([
      fetch(editionDataUrl(edition.data.opening.network), {
        signal: controller.signal,
      }).then((response) => {
        if (!response.ok) throw new Error(`Network returned ${response.status}`)
        return response.json() as Promise<NetworkSnapshot>
      }),
      fetch(editionDataUrl(edition.data.opening.geography), {
        signal: controller.signal,
      }).then((response) => {
        if (!response.ok) throw new Error(`Geography returned ${response.status}`)
        return response.json() as Promise<LondonGeographySnapshot>
      }),
    ])
      .then(([nextNetwork, nextGeography]) => {
        setMorningNetwork(nextNetwork)
        setGeography(nextGeography)
        setTime(nextNetwork.metadata.focusTime)
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        console.error('Unable to load the All Change opening study', error)
        setLoadError(true)
      })
    return () => controller.abort()
  }, [edition.data.opening.geography, edition.data.opening.network])

  const dayChunkDescriptor = useMemo(
    () => (dayManifest ? dayChunkForTime(dayManifest, sceneTime) : undefined),
    [dayManifest, sceneTime],
  )
  const activeDayChunk = dayChunkDescriptor
    ? dayChunks[dayChunkDescriptor.id]
    : undefined
  const dayLoading = studyWindow === 'day' && !dayError && !activeDayChunk
  const baseNetwork = useMemo(
    () =>
      studyWindow === 'day' && dayManifest
        ? networkSnapshotForDayChunk(dayManifest, activeDayChunk)
        : morningNetwork,
    [activeDayChunk, dayManifest, morningNetwork, studyWindow],
  )
  const assembledNetwork = useMemo(() => {
    if (!baseNetwork) return undefined
    // Keep the study bounds and clock when TfL is hidden, including when no
    // other layers are enabled. Each added layer supplies its own geometry.
    const layers: NetworkSnapshot[] = [tflEnabled ? baseNetwork : {
      ...baseNetwork,
      stops: [],
      edges: [],
      paths: [],
      edgePaths: [],
      trains: [],
    }]
    if (
      surfaceEnabled &&
      surfaceNetwork &&
      baseNetwork.metadata.windowStart === surfaceNetwork.metadata.windowStart &&
      baseNetwork.metadata.windowEnd === surfaceNetwork.metadata.windowEnd
    ) {
      layers.push(surfaceNetwork)
    }
    if (
      busEnabled &&
      busDay.chunkReady &&
      busDay.network &&
      baseNetwork.metadata.windowStart === busDay.network.metadata.windowStart &&
      baseNetwork.metadata.windowEnd === busDay.network.metadata.windowEnd
    ) {
      layers.push(busDay.network)
    }
    return layers.length === 1 ? layers[0] : mergeNetworkLayers(layers)
  }, [
    baseNetwork,
    tflEnabled,
    busDay.chunkReady,
    busDay.network,
    busEnabled,
    surfaceEnabled,
    surfaceNetwork,
  ])
  const network =
    operationsRequested && operationsTransitionNetwork
      ? operationsTransitionNetwork
      : assembledNetwork
  const operationsAge = observedOperations.snapshot
    ? operationsAgeSeconds(observedOperations.snapshot)
    : Number.POSITIVE_INFINITY
  const operationsFresh = operationsAge <= 180
  const operationsProjection = useMemo(
    () =>
      operationsMode === 'observed' &&
      network &&
      observedOperations.snapshot &&
      operationsFresh
        ? projectOperationsOntoNetwork(
            network,
            observedOperations.snapshot,
            sceneTime,
          )
        : undefined,
    [
      network,
      observedOperations.snapshot,
      operationsFresh,
      operationsMode,
      sceneTime,
    ],
  )
  const sceneNetwork =
    operationsMode === 'observed'
      ? (operationsProjection?.snapshot ?? network)
      : network
  const infrastructureNetwork = useMemo(
    () => tflEnabled && sceneNetwork && morningNetwork
      ? londonInfrastructureSnapshot(sceneNetwork, morningNetwork)
      : sceneNetwork,
    [tflEnabled, sceneNetwork, morningNetwork],
  )

  const allPulseCalls = useMemo(
    () => (network && pulseHub ? londonPulseCalls(network, pulseHub, nationalRail) : []),
    [network, pulseHub, nationalRail],
  )
  const pulseSummary = useMemo(
    () => hubFlowSummary(allPulseCalls, LONDON_PULSE_CENTRE),
    [allPulseCalls],
  )
  const pulseCalls = useMemo(
    () => callsForHubFlowLens(allPulseCalls, pulseLens, LONDON_PULSE_CENTRE),
    [allPulseCalls, pulseLens],
  )
  const nationalRailPulseCount = pulseCalls.filter(isNationalRailCall).length
  const pulseNightMix = hubNightSignalMix(time)
  const nearbyPulseCalls = useMemo(
    () => londonPulseCallsNearTime(pulseCalls, time),
    [pulseCalls, time],
  )
  const upcomingPulseCall = useMemo(
    () => nextHubCall(pulseCalls, time),
    [pulseCalls, time],
  )

  useEffect(() => {
    if (studyWindow !== 'day' || dayManifest) return
    const controller = new AbortController()
    fetch(editionDataUrl(edition.data.opening.dayManifest), {
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error(`Day manifest returned ${response.status}`)
        return response.json() as Promise<NetworkDayManifest>
      })
      .then(setDayManifest)
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        console.error('Unable to load the All Change day manifest', error)
        setDayError(true)
      })
    return () => controller.abort()
  }, [dayManifest, edition.data.opening.dayManifest, studyWindow])

  useEffect(() => {
    if (
      studyWindow !== 'day' ||
      !dayManifest ||
      !dayChunkDescriptor
    ) {
      return
    }
    const currentMissing = !dayChunks[dayChunkDescriptor.id]
    const targets = currentMissing
      ? [dayChunkDescriptor]
      : adjacentDayChunks(dayManifest, dayChunkDescriptor).filter(
          (descriptor) => !dayChunks[descriptor.id],
        )
    if (!targets.length) return
    const controller = new AbortController()
    Promise.all(
      targets.map(async (descriptor) => {
        const response = await fetch(editionDataUrl(descriptor.path), {
          signal: controller.signal,
        })
        if (!response.ok) throw new Error(`Day chunk returned ${response.status}`)
        return [
          descriptor.id,
          await verifiedNetworkDayChunk(response, descriptor),
        ] as const
      }),
    )
      .then((entries) => {
        setDayChunks((current) => ({
          ...current,
          ...Object.fromEntries(entries),
        }))
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        console.error('Unable to load an All Change day chunk', error)
        if (currentMissing) setDayError(true)
      })
    return () => controller.abort()
  }, [dayChunkDescriptor, dayChunks, dayManifest, studyWindow])

  useEffect(() => {
    if (!airEnabled || studyWindow === 'day' || morningAir) return
    const controller = new AbortController()
    fetch(editionDataUrl(edition.data.air.morning), {
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error(`Air study returned ${response.status}`)
        return response.json() as Promise<AirSnapshot>
      })
      .then(setMorningAir)
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        console.error('Unable to load the All Change air study', error)
        setAirLoadError(true)
      })
    return () => controller.abort()
  }, [airEnabled, edition.data.air.morning, morningAir, studyWindow])

  useEffect(() => {
    if (!roadEnabled || roadTopology) return
    const controller = new AbortController()
    fetch(editionDataUrl(edition.data.road.topology), {
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error(`Road topology returned ${response.status}`)
        return response.json() as Promise<RoadTopologySnapshot>
      })
      .then(setRoadTopology)
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        console.error('Unable to load the All Change road topology', error)
        setRoadLoadError(true)
      })
    return () => controller.abort()
  }, [edition.data.road.topology, roadEnabled, roadTopology])

  useEffect(() => {
    if (!surfaceEnabled || surfaceNetwork) return
    const controller = new AbortController()
    fetch(editionDataUrl(edition.data.surface.day), {
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error(`River study returned ${response.status}`)
        return response.json() as Promise<NetworkSnapshot>
      })
      .then(setSurfaceNetwork)
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        console.error('Unable to load the All Change river study', error)
        setSurfaceLoadError(true)
      })
    return () => controller.abort()
  }, [edition.data.surface.day, surfaceEnabled, surfaceNetwork])

  const animateLayout = useCallback((target: number) => {
    cancelAnimationFrame(layoutFrameRef.current)
    const startMix = layoutMixRef.current
    if (target === startMix) {
      setLayoutTransitioning(false)
      return
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      layoutMixRef.current = target
      setLayoutMix(target)
      setLayoutTransitioning(false)
      if (selectedStation) {
        cameraCommandId.current += 1
        setCameraCommand({
          id: cameraCommandId.current,
          action: 'reveal-station',
        })
      }
      return
    }

    const startedAt = performance.now()
    setLayoutTransitioning(true)
    const animate = (now: number) => {
      const linear = Math.min(1, (now - startedAt) / LAYOUT_TRANSITION_DURATION_MS)
      const eased = linear * linear * (3 - 2 * linear)
      const stepped =
        Math.round(eased * LAYOUT_TRANSITION_STEPS) / LAYOUT_TRANSITION_STEPS
      const next = startMix + (target - startMix) * stepped
      if (next !== layoutMixRef.current) {
        layoutMixRef.current = next
        setLayoutMix(next)
      }
      if (linear < 1) {
        layoutFrameRef.current = requestAnimationFrame(animate)
      } else {
        layoutMixRef.current = target
        setLayoutMix(target)
        setLayoutTransitioning(false)
        if (selectedStation) {
          cameraCommandId.current += 1
          setCameraCommand({
            id: cameraCommandId.current,
            action: 'reveal-station',
          })
        }
      }
    }
    layoutFrameRef.current = requestAnimationFrame(animate)
  }, [selectedStation])

  useEffect(
    () => () => cancelAnimationFrame(layoutFrameRef.current),
    [],
  )

  const stations = useMemo(
    () => (infrastructureNetwork ? londonStationLabels(buildStationIndex(infrastructureNetwork)) : []),
    [infrastructureNetwork],
  )
  const routes = useMemo(
    () => (sceneNetwork ? buildRouteIndex(sceneNetwork) : []),
    [sceneNetwork],
  )
  const displayedSelectedRoute = useMemo(
    () =>
      selectedRoute
        ? (routes.find(
            (route) =>
              route.name === selectedRoute.name &&
              route.category === selectedRoute.category,
          ) ?? selectedRoute)
        : undefined,
    [routes, selectedRoute],
  )
  const countableTrains = useMemo(() => {
    const stationTrainIds = selectedStation
      ? new Set(stations.find((station) => station.name === selectedStation.name)?.trainIds ?? [])
      : undefined
    return sceneNetwork?.trains.filter((train) =>
      (!selectedCategory || train.category === selectedCategory) &&
      (!stationTrainIds || stationTrainIds.has(train.id)) &&
      (!selectedRoute || (train.route === selectedRoute.name && train.category === selectedRoute.category)),
    ) ?? []
  }, [sceneNetwork, selectedCategory, selectedRoute, selectedStation, stations])
  const activeTrainCount = useMemo(
    () =>
      countableTrains.reduce(
        (count, train) =>
          count + Number(train.realtime?.status !== 'cancelled' && train.stops.length >= 2
            && sceneTime >= train.start && sceneTime <= train.end),
        0,
      ),
    [countableTrains, sceneTime],
  )
  const boundary = useMemo(
    () => (geography ? londonBoundary(geography) : undefined),
    [geography],
  )
  const water = useMemo(
    () => (geography ? londonWater(geography) : undefined),
    [geography],
  )
  const nationalRailPaths = useMemo(
    () => nationalRailEnabled && nationalRail && boundary
      ? nationalRail.paths?.map(path => cachedRailPath(path, boundary, nationalRail.fadeKilometres)) ?? []
      : [],
    [nationalRailEnabled, nationalRail, boundary],
  )
  const activeNationalRailCount = useMemo(
    () => nationalRailEnabled && nationalRail
      ? nationalRail.trains.reduce((count, train) =>
          count + Number((railPosition(train, sceneTime, nationalRail, nationalRailPaths)?.[2] ?? 0) > 0.001), 0)
      : 0,
    [nationalRailEnabled, nationalRail, nationalRailPaths, sceneTime],
  )
  const availableCategories = useMemo(
    () =>
      LONDON_CATEGORIES.filter((category) =>
        pulseHub
          ? allPulseCalls.some(call => call.train.category === category.id)
          : (category.id === 'bus' && busEnabled) ||
            sceneNetwork?.trains.some((train) => train.category === category.id),
      ),
    [busEnabled, sceneNetwork, pulseHub, allPulseCalls],
  )
  const activeAirSnapshot = studyWindow === 'day' ? airDay.snapshot : morningAir
  const searchableAircraft = useMemo<readonly AirSearchTrack[]>(
    () =>
      studyWindow === 'day'
        ? (airDay.manifest?.aircraft ?? [])
        : (activeAirSnapshot?.tracks ?? []),
    [activeAirSnapshot, airDay.manifest, studyWindow],
  )
  // Timetable search does not depend on the scene clock. Keep its string work
  // out of playback updates, including after a result closes the search panel.
  const networkChoices = useMemo(
    () =>
      searchOpen && sceneNetwork
        ? searchNetworkChoices(
            query,
            sceneNetwork,
            stations,
            routes,
            LONDON_AIRPORTS,
            LONDON_MOTORWAYS,
          )
        : { places: [], services: [] },
    [searchOpen, query, routes, sceneNetwork, stations],
  )
  const railChoices = useMemo<readonly SearchChoice[]>(() => {
    const folded = foldSearchText(query.trim())
    if (!searchOpen || !folded) return []
    const matches: SearchChoice[] = railStations.filter(station => foldSearchText(`${station.name} ${station.code}`).includes(folded)).slice(0, 4).map(value => ({ kind: 'rail-station', value }))
    const trains = nationalRail?.trains.filter(train => foldSearchText(`${train.route} ${train.shortName} ${train.origin} ${train.headsign}`).includes(folded)).slice(0, 4).map((value): SearchChoice => ({ kind: 'rail-train', value })) ?? []
    return [...matches, ...trains]
  }, [query, searchOpen, railStations, nationalRail])
  const choices = useMemo(() => {
    const airMatches = searchOpen && airEnabled && query.trim()
      ? searchAirTracks(searchableAircraft, query, sceneTime, 5).map(
          (value): SearchChoice => ({ kind: 'air', value }),
        )
      : []
    // An exact route code (for example N26) should precede a partial match
    // in a National Rail service number (for example GWR 2N26).
    const serviceQuery = foldSearchText(query.trim()).replace(/^(?:route|line|bus)\s+/, '')
    const exactRoutes = networkChoices.services.filter(
      choice => choice.kind === 'route' && foldSearchText(choice.value.name) === serviceQuery,
    )
    return [
      ...networkChoices.places,
      ...airMatches,
      ...exactRoutes,
      ...railChoices,
      ...networkChoices.services.filter(choice => !exactRoutes.includes(choice)),
    ].slice(0, 9)
  }, [networkChoices, railChoices, searchOpen, airEnabled, query, searchableAircraft, sceneTime])
  const selectedAirTrack = useMemo<AirTrack | undefined>(
    () =>
      activeAirSnapshot?.tracks.find(
        (track) => track.id === selectedAirTrackId,
      ),
    [activeAirSnapshot, selectedAirTrackId],
  )
  const selectedAirIndexEntry = useMemo<AirSearchTrack | undefined>(
    () =>
      searchableAircraft.find((track) => track.id === selectedAirTrackId),
    [searchableAircraft, selectedAirTrackId],
  )
  const selectedAirPosition = useMemo(
    () =>
      selectedAirTrack
        ? positionForAirTrack(selectedAirTrack, time)
        : undefined,
    [selectedAirTrack, time],
  )
  const selectedAirTelemetry = useMemo(
    () =>
      selectedAirTrack
        ? selectedAirPosition ??
          positionForAirTrack(
            selectedAirTrack,
            Math.max(selectedAirTrack.start, Math.min(selectedAirTrack.end, time)),
          )
        : undefined,
    [selectedAirPosition, selectedAirTrack, time],
  )
  const activeAircraftCount = useMemo(
    () =>
      airEnabled && activeAirSnapshot
        ? activeAirTracks(activeAirSnapshot, time).length
        : 0,
    [activeAirSnapshot, airEnabled, time],
  )
  const selectedAirportTrackIds = useMemo(
    () =>
      selectedAirport && activeAirSnapshot
        ? airportAirTrackIds(activeAirSnapshot.tracks, selectedAirport)
        : undefined,
    [activeAirSnapshot, selectedAirport],
  )
  const activeAirportAircraftCount = useMemo(
    () =>
      selectedAirportTrackIds && activeAirSnapshot
        ? activeAirTracks(activeAirSnapshot, time).reduce(
            (count, track) =>
              count + Number(selectedAirportTrackIds.has(track.id)),
            0,
          )
        : 0,
    [activeAirSnapshot, selectedAirportTrackIds, time],
  )
  const airLoading =
    airEnabled &&
    !airLoadError &&
    !airDay.error &&
    (studyWindow === 'day' ? airDay.loading : !morningAir)
  const roadIntervalTime = Math.floor(time / 900) * 900
  const activeRoadSnapshot = useMemo(
    () => observedRoadSnapshot(roadDay.snapshot, roadIntervalTime),
    [roadDay.snapshot, roadIntervalTime],
  )
  const reconstructedRoadVehicleCount = useMemo(
    () =>
      roadEnabled && activeRoadSnapshot
        ? reconstructedNationalVehicleCount(
            activeRoadSnapshot,
            time,
            selectedRoad?.id,
          )
        : 0,
    [activeRoadSnapshot, roadEnabled, selectedRoad?.id, time],
  )
  const roadLoading =
    roadEnabled &&
    !roadLoadError &&
    !roadDay.error &&
    !roadDay.unavailable &&
    (!roadTopology || roadDay.loading)
  const surfaceLoading =
    surfaceEnabled &&
    !surfaceLoadError &&
    (!surfaceNetwork || studyWindow !== 'day' || !dayManifest || !activeDayChunk)
  const busLoading = busEnabled && busDay.loading
  const roadObservationDate = formatStudyDate(
    roadDay.manifest?.metadata.serviceDate,
  )

  const moveCamera = useCallback(
    (
      action: MapCameraAction,
      focus?: readonly [longitude: number, latitude: number],
      distanceScale?: number,
    ) => {
      cameraCommandId.current += 1
      setCameraCommand({
        id: cameraCommandId.current,
        action,
        focus,
        distanceScale,
      })
    },
    [],
  )

  const busCameraFocused = useRef(false)
  useEffect(() => {
    if (!busEnabled) {
      busCameraFocused.current = false
      return
    }
    if (!busDay.chunkReady || !activeDayChunk || busCameraFocused.current) return
    // The bus topology changes the projection bounds. Focus only once the
    // composed network is mounted, so the camera uses those new coordinates.
    busCameraFocused.current = true
    moveCamera('focus-location', edition.data.bus.focus, edition.data.bus.cameraScale)
  }, [activeDayChunk, busDay.chunkReady, busEnabled, edition.data.bus.cameraScale, edition.data.bus.focus, moveCamera])

  const loadLayout = useCallback(async (artifact: string) => {
    setLayoutLoading(true)
    setLayoutError(false)
    try {
      const response = await fetch(editionDataUrl(artifact))
      if (!response.ok) throw new Error(`Layout returned ${response.status}`)
      const nextLayout = (await response.json()) as SpatialLayoutSnapshot
      if (!network) throw new Error('Opening network is not ready')
      const coverage = spatialLayoutCoverage(network, nextLayout)
      if (
        coverage.matchedStops !== coverage.totalStops ||
        coverage.matchedPaths !== coverage.totalPaths
      ) {
        throw new Error(
          `Diagram coverage ${coverage.matchedStops}/${coverage.totalStops} stops, ${coverage.matchedPaths}/${coverage.totalPaths} paths`,
        )
      }
      setSpatialLayout(nextLayout)
      if (desiredLayoutRef.current === 'diagram') animateLayout(1)
    } catch (error: unknown) {
      console.error('Unable to load the All Change diagram', error)
      setLayoutError(true)
      desiredLayoutRef.current = 'geographic'
      setLayout('geographic')
      animateLayout(0)
    } finally {
      setLayoutLoading(false)
    }
  }, [animateLayout, network])

  const hideGeographicOnlyLayers = useCallback(() => {
    setNationalRailEnabled(false)
    setNationalRailSelectedId(undefined)
    const hadGeographicSelection = Boolean(
      selectedAirTrackId || selectedAirport || selectedRoad,
    )
    setAirEnabled(false)
    setAirCategorySelected(false)
    setSelectedAirTrackId(undefined)
    setSelectedAirport(undefined)
    setRoadEnabled(false)
    setRoadCategorySelected(false)
    setSelectedRoad(undefined)
    if (hadGeographicSelection) {
      setQuery('')
      setSearchOpen(false)
    }
  }, [selectedAirTrackId, selectedAirport, selectedRoad])

  const activateLayout = useCallback((
    nextLayout: SpatialLayoutId,
    artifact?: string,
  ) => {
    setPulseHubId(undefined)
    if (nextLayout === 'diagram') hideGeographicOnlyLayers()
    desiredLayoutRef.current = nextLayout
    setLayout(nextLayout)
    if (nextLayout === 'geographic') {
      animateLayout(0)
    } else if (spatialLayout) {
      animateLayout(1)
    } else if (artifact && !layoutLoading) {
      void loadLayout(artifact)
    }
  }, [
    animateLayout,
    hideGeographicOnlyLayers,
    layoutLoading,
    loadLayout,
    spatialLayout,
  ])

  const clearSelection = useCallback(() => {
    setNationalRailSelectedId(undefined)
    setSelectedCategory(undefined)
    setSelectedStation(undefined)
    setSelectedRoute(undefined)
    setSelectedTrain(undefined)
    setSelectedAirTrackId(undefined)
    setSelectedAirport(undefined)
    setSelectedRoad(undefined)
    setAirCategorySelected(false)
    setRoadCategorySelected(false)
    setPulseHubId(undefined)
    setQuery('')
    setSearchOpen(false)
  }, [])

  const activateStudyWindow = useCallback(
    (nextWindow: StudyWindow) => {
      if (
        nextWindow === studyWindow &&
        operationsMode === 'plan' &&
        !operationsRequested
      ) {
        return
      }
      clearSelection()
      setOperationsRequested(false)
      setOperationsTransitionNetwork(undefined)
      setOperationsMode('plan')
      setIsPlaying(true)
      if (nextWindow === studyWindow) return
      setDayError(false)
      setStudyWindow(nextWindow)
      if (nextWindow === 'morning') {
        setSurfaceEnabled(false)
        setBusEnabled(false)
        setTime(edition.defaultNetworkTime)
      }
    },
    [
      clearSelection,
      edition.defaultNetworkTime,
      operationsMode,
      operationsRequested,
      studyWindow,
    ],
  )

  const activateOperationsMode = useCallback(
    (nextMode: OperationsMode) => {
      if (
        nextMode === operationsMode &&
        !(nextMode === 'plan' && operationsRequested)
      ) {
        return
      }
      clearSelection()
      if (nextMode === 'observed') {
        setTflEnabled(true)
        setNationalRailEnabled(false)
        setOperationsTransitionNetwork(baseNetwork)
        setOperationsRequested(true)
        setDayError(false)
        setAirEnabled(false)
        setRoadEnabled(false)
        setSurfaceEnabled(false)
        setBusEnabled(false)
        setIsPlaying(false)
      } else {
        setOperationsRequested(false)
        setOperationsTransitionNetwork(undefined)
        setOperationsMode('plan')
        if (baseNetwork) {
          setTime((current) =>
            Math.max(
              baseNetwork.metadata.windowStart,
              Math.min(baseNetwork.metadata.windowEnd, current),
            ),
          )
        }
        setIsPlaying(true)
      }
    },
    [
      baseNetwork,
      clearSelection,
      operationsMode,
      operationsRequested,
    ],
  )

  useEffect(() => {
    if (
      !operationsRequested ||
      !observedOperations.snapshot ||
      operationsAge > 180
    ) {
      return
    }

    const observedTime = operationsServiceTime(
      observedOperations.snapshot,
      edition.timezone,
    )
    const timer = window.setTimeout(() => {
      setTime(observedTime)
      setOperationsMode('observed')
      setOperationsRequested(false)
      setOperationsTransitionNetwork(undefined)
    }, 0)
    return () => window.clearTimeout(timer)
  }, [
    edition.timezone,
    observedOperations.snapshot,
    operationsAge,
    operationsRequested,
  ])

  const selectStation = useCallback(
    (station: StationIndexEntry) => {
      setNationalRailSelectedId(undefined)
      setSelectedStation(station)
      setSelectedRoute(undefined)
      setSelectedTrain(undefined)
      setSelectedAirTrackId(undefined)
      setSelectedAirport(undefined)
      setSelectedRoad(undefined)
      setAirCategorySelected(false)
      setRoadCategorySelected(false)
      setSelectedCategory(undefined)
      setQuery(station.name)
      setSearchOpen(false)
      if (sceneNetwork) {
        moveCamera('reveal-station', stationCentre(station, sceneNetwork))
      }
    },
    [moveCamera, sceneNetwork],
  )

  const selectTrain = useCallback((train: NetworkTrain) => {
    clearSelection()
    setSelectedTrain(train)
    setQuery(`${train.route} ${train.shortName}`.trim())
    setSearchOpen(false)
  }, [clearSelection])

  const selectNationalRail = useCallback((id: string) => {
    clearSelection()
    setNationalRailSelectedId(id)
    setSearchOpen(false)
  }, [clearSelection])

  const activateChoice = useCallback(
    (choice: SearchChoice) => {
      setPulseHubId(undefined)
      if (choice.kind === 'rail-station' || choice.kind === 'rail-train') {
        clearSelection()
        setOperationsRequested(false)
        setOperationsTransitionNetwork(undefined)
        setOperationsMode('plan')
        setNationalRailEnabled(true)
        activateLayout('geographic')
        const train = choice.kind === 'rail-train' ? choice.value : undefined
        const station = choice.kind === 'rail-station' ? choice.value : railStations.find(station => train?.stops.some(([index]) => nationalRail?.stops[index][4] === `crs:${station.code}`))
        if (station) { setNationalRailStationId(station.id); moveCamera('focus-location', station.focus, 0.25) }
        if (train) { setNationalRailSelectedId(train.id); setStudyWindow('day'); setTime(Math.max(0, Math.min(86399, train.start + 60))); setIsPlaying(false) }
        setQuery(train ? `${train.route} ${train.shortName}` : station?.name ?? '')
        setSearchOpen(false)
      } else if (choice.kind === 'airport') {
        const airport = choice.value
        setSelectedAirport(airport)
        setAirEnabled(true)
        setAirLoadError(false)
        setAirCategorySelected(true)
        setSelectedAirTrackId(undefined)
        setSelectedTrain(undefined)
        setSelectedRoute(undefined)
        setSelectedStation(undefined)
        setSelectedCategory(undefined)
        setSelectedRoad(undefined)
        setRoadCategorySelected(false)
        setQuery(`${airport.name} · ${airport.iata}`)
        setSearchOpen(false)
        activateLayout('geographic')
        moveCamera(
          'focus-location',
          [airport.longitude, airport.latitude],
          0.3,
        )
      } else if (choice.kind === 'station') {
        selectStation(choice.value)
      } else if (choice.kind === 'road') {
        const road = choice.value
        setRoadEnabled(true)
        setRoadLoadError(false)
        setRoadCategorySelected(true)
        setSelectedRoad(road)
        setAirCategorySelected(false)
        setSelectedAirport(undefined)
        setSelectedAirTrackId(undefined)
        setSelectedTrain(undefined)
        setSelectedRoute(undefined)
        setSelectedStation(undefined)
        setSelectedCategory(undefined)
        setQuery(roadCorridorSearchValue(road))
        setSearchOpen(false)
        activateLayout('geographic')
        moveCamera('focus-location', road.focus, road.cameraScale)
      } else if (choice.kind === 'route') {
        setSelectedRoute(choice.value)
        setSelectedStation(undefined)
        setSelectedTrain(undefined)
        setSelectedCategory(undefined)
        setSelectedAirTrackId(undefined)
        setSelectedAirport(undefined)
        setSelectedRoad(undefined)
        setAirCategorySelected(false)
        setRoadCategorySelected(false)
        setQuery(choice.value.name)
        setSearchOpen(false)
      } else if (choice.kind === 'train') {
        setSelectedTrain(choice.value)
        setSelectedRoute(undefined)
        setSelectedStation(undefined)
        setSelectedCategory(undefined)
        setSelectedAirTrackId(undefined)
        setSelectedAirport(undefined)
        setSelectedRoad(undefined)
        setAirCategorySelected(false)
        setRoadCategorySelected(false)
        setQuery(`${choice.value.route} ${choice.value.shortName}`.trim())
        setSearchOpen(false)
      } else {
        const track = choice.value
        setTime((current) =>
          current >= track.start && current <= track.end
            ? current
            : Math.min(track.end, track.start + 10),
        )
        setSelectedAirTrackId(track.id)
        setSelectedAirport(undefined)
        setSelectedRoad(undefined)
        setSelectedTrain(undefined)
        setSelectedRoute(undefined)
        setSelectedStation(undefined)
        setSelectedCategory(undefined)
        setAirCategorySelected(false)
        setRoadCategorySelected(false)
        setQuery(airTrackSearchValue(track))
        setSearchOpen(false)
        setIsPlaying(true)
      }
    },
    [activateLayout, clearSelection, moveCamera, selectStation, railStations, nationalRail],
  )

  const toggleTflLayer = useCallback(() => {
    clearSelection()
    setOperationsRequested(false)
    setOperationsTransitionNetwork(undefined)
    setOperationsMode('plan')
    setTflEnabled(value => !value)
  }, [clearSelection])

  const toggleAirLayer = useCallback(() => {
    if (airEnabled) {
      setAirEnabled(false)
      setAirCategorySelected(false)
      setSelectedAirTrackId(undefined)
      setSelectedAirport(undefined)
      return
    }
    clearSelection()
    setOperationsRequested(false)
    setOperationsTransitionNetwork(undefined)
    setOperationsMode('plan')
    setAirLoadError(false)
    setAirEnabled(true)
    activateLayout('geographic')
  }, [activateLayout, airEnabled, clearSelection])

  const selectAirTrack = useCallback(
    (trackId: string) => {
      const track =
        activeAirSnapshot?.tracks.find((candidate) => candidate.id === trackId) ??
        searchableAircraft.find((candidate) => candidate.id === trackId)
      if (!track) return
      setTime((current) =>
        current >= track.start && current <= track.end
          ? current
          : Math.min(track.end, track.start + 10),
      )
      setSelectedAirTrackId(track.id)
      setSelectedAirport(undefined)
      setSelectedRoad(undefined)
      setSelectedTrain(undefined)
      setSelectedRoute(undefined)
      setSelectedStation(undefined)
      setSelectedCategory(undefined)
      setAirCategorySelected(false)
      setRoadCategorySelected(false)
      setQuery(airTrackSearchValue(track))
      setSearchOpen(false)
      setIsPlaying(true)
    },
    [activeAirSnapshot, searchableAircraft],
  )

  const toggleRoadLayer = useCallback(() => {
    if (roadEnabled) {
      setRoadEnabled(false)
      setRoadCategorySelected(false)
      setSelectedRoad(undefined)
      return
    }
    clearSelection()
    setOperationsRequested(false)
    setOperationsTransitionNetwork(undefined)
    setOperationsMode('plan')
    setRoadLoadError(false)
    setRoadEnabled(true)
    activateLayout('geographic')
  }, [activateLayout, clearSelection, roadEnabled])

  const toggleSurfaceLayer = useCallback(() => {
    clearSelection()
    setOperationsRequested(false)
    setOperationsTransitionNetwork(undefined)
    setOperationsMode('plan')
    if (surfaceEnabled) {
      setSurfaceEnabled(false)
      return
    }
    setSurfaceLoadError(false)
    setDayError(false)
    setStudyWindow('day')
    setSurfaceEnabled(true)
    activateLayout('geographic')
  }, [activateLayout, clearSelection, surfaceEnabled])

  const toggleBusLayer = useCallback(() => {
    clearSelection()
    setOperationsRequested(false)
    setOperationsTransitionNetwork(undefined)
    setOperationsMode('plan')
    if (busEnabled) {
      setBusEnabled(false)
      return
    }
    setDayError(false)
    setStudyWindow('day')
    setBusEnabled(true)
    activateLayout('geographic')
  }, [activateLayout, busEnabled, clearSelection])

  const toggleNationalRailLayer = useCallback(() => {
    clearSelection()
    setOperationsRequested(false)
    setOperationsTransitionNetwork(undefined)
    setOperationsMode('plan')
    railFeed.retry()
    setNationalRailEnabled(value => !value)
    if (!nationalRailEnabled) {
      activateLayout('geographic')
      moveCamera('reset')
    }
  }, [activateLayout, clearSelection, moveCamera, nationalRailEnabled, railFeed])

  const togglePulse = useCallback(() => {
    clearSelection()
    if (pulseHubId) return
    setOperationsRequested(false)
    setOperationsTransitionNetwork(undefined)
    setOperationsMode('plan')
    setPulseLens('all')
    setPulseHubId(nationalRailEnabled ? nationalRailStationId : 'kings-cross')
  }, [clearSelection, pulseHubId, nationalRailEnabled, nationalRailStationId])

  const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    event.stopPropagation()
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveSearchIndex((index) => Math.min(choices.length - 1, index + 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveSearchIndex((index) => Math.max(0, index - 1))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const choice = choices[activeSearchIndex]
      if (choice) activateChoice(choice)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      setSearchOpen(false)
    }
  }

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return
      if (event.key === ' ') {
        event.preventDefault()
        setIsPlaying((value) => !value)
      } else if (event.key.toLowerCase() === 'l') {
        setTrainLabelMode((value) => LABEL_MODES[value])
      } else if (event.key.toLowerCase() === 'd') {
        if (surfaceEnabled || busEnabled || nationalRailEnabled) return
        const diagram = edition.data.opening.layouts.find(
          (option) => option.id === 'diagram',
        )
        activateLayout(
          'diagram',
          diagram && 'artifact' in diagram ? diagram.artifact : undefined,
        )
      } else if (event.key.toLowerCase() === 'g') {
        activateLayout('geographic')
      } else if (event.key.toLowerCase() === 'p') {
        togglePulse()
      } else if (event.key.toLowerCase() === 'f') {
        setLimitedChrome((value) => !value)
      } else if (event.key === 'Escape') {
        if (limitedChrome) setLimitedChrome(false)
        else if (mobileControlsOpen) {
          setMobileControlsOpen(false)
          document.getElementById('london-controls-toggle')?.focus()
        } else clearSelection()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    activateLayout,
    clearSelection,
    edition.data.opening.layouts,
    limitedChrome,
    mobileControlsOpen,
    togglePulse,
    nationalRailEnabled,
    busEnabled,
    surfaceEnabled,
  ])

  const selectedDescription = selectedStation
    ? `${selectedStation.routes.length} lines · ${selectedStation.trainIds.length} calls`
    : displayedSelectedRoute
      ? `${displayedSelectedRoute.trainIds.length} journeys · ${displayedSelectedRoute.stopIndexes.length} stops`
      : selectedTrain
        ? `${formatServiceTime(selectedTrain.start)}–${formatServiceTime(selectedTrain.end)} · ${selectedTrain.headsign}`
        : selectedAirIndexEntry
          ? `${formatServiceTime(selectedAirIndexEntry.start)}–${formatServiceTime(selectedAirIndexEntry.end)} · ${(selectedAirIndexEntry.icaoAddress ?? selectedAirIndexEntry.id).toUpperCase()}`
          : selectedAirport
            ? `${activeAirportAircraftCount.toLocaleString('en-GB')} observed approaches + departures at ${formatServiceTime(time)}`
            : selectedRoad
              ? `${reconstructedRoadVehicleCount.toLocaleString('en-GB')} vehicles reconstructed at ${formatServiceTime(time)} · observed ${roadObservationDate}`
              : undefined
  const observedLineStatus = observedOperations.snapshot?.lineStatuses
    .slice()
    .sort((left, right) => left.severity - right.severity)[0]
  const observedOperationsSummary = operationsProjection
    ? `${operationsProjection.matchedVehicleCount.toLocaleString('en-GB')} matched · ${operationsProjection.unmatchedVehicleCount.toLocaleString('en-GB')} unmatched · ${Math.round(operationsAge)}s old`
    : observedOperations.loading
      ? 'Synchronising with TfL predictions'
      : 'Planned timetable fallback'
  const operationsEngaged =
    operationsMode === 'observed' || operationsRequested
  const quietMap = Boolean(webglAvailable && sceneNetwork && !loadError && !pulseHub &&
    !tflEnabled && !airEnabled && !roadEnabled && !busEnabled && !surfaceEnabled && !nationalRailEnabled)
  const scheduledJourneyCount =
    studyWindow === 'day' && dayManifest
      ? (tflEnabled ? dayManifest.tripCount : 0) +
        (surfaceEnabled ? (surfaceNetwork?.trains.length ?? 0) : 0) +
        (busEnabled ? (busDay.manifest?.tripCount ?? 0) : 0)
      : network?.trains.length
  const networkSelection = Boolean(selectedCategory || selectedStation || selectedRoute || selectedTrain)
  const networkLayersEnabled = tflEnabled || surfaceEnabled || busEnabled || nationalRailEnabled
  const airStatus = airCategorySelected || (airEnabled && !roadEnabled && !networkLayersEnabled)
  const roadStatus = roadCategorySelected || (roadEnabled && !airEnabled && !networkLayersEnabled)
  const activeVehicleCount = networkSelection
    ? activeTrainCount
    : activeTrainCount + activeNationalRailCount + activeAircraftCount + reconstructedRoadVehicleCount
  const vehicleCountLabel = surfaceEnabled || busEnabled || (!networkSelection && (airEnabled || roadEnabled))
    ? 'vehicles in motion'
    : 'trains in motion'
  const journeySummary = [
    ...(tflEnabled || surfaceEnabled || busEnabled ? [`${scheduledJourneyCount?.toLocaleString('en-GB')} scheduled journeys`] : []),
    ...(!networkSelection && nationalRailEnabled ? [`${activeNationalRailCount.toLocaleString('en-GB')} National Rail trains`] : []),
    ...(!networkSelection && airEnabled ? [`${activeAircraftCount.toLocaleString('en-GB')} aircraft observed`] : []),
    ...(!networkSelection && roadEnabled ? [`${reconstructedRoadVehicleCount.toLocaleString('en-GB')} vehicles reconstructed`] : []),
  ].join(' · ')

  return (
    <main
      className={`experience view-${pulseHub ? 'hub' : 'network'} london-experience${pulseHub ? ' is-pulse-study' : ''}${pulseHub && pulseNightMix > 0.5 ? ' is-pulse-night' : ''}${limitedChrome ? ' is-limited-chrome' : ''}${airEnabled ? ' has-air-layer' : ''}${airCategorySelected ? ' has-air-category' : ''}${selectedAirport ? ' has-airport-selection' : ''}${roadEnabled ? ' has-road-layer' : ''}${roadCategorySelected ? ' has-road-category' : ''}${surfaceEnabled ? ' has-surface-layer' : ''}${busEnabled ? ' has-bus-layer' : ''}${selectedStation || selectedRoute || selectedTrain || selectedAirTrackId || selectedAirport || selectedRoad || selectedCategory || airCategorySelected || roadCategorySelected ? ' has-selection' : ''}`}
      data-limited-chrome={limitedChrome}
      data-spatial-layout={layout}
      data-study-window={studyWindow}
      data-day-loading={dayLoading}
      data-layout-mix={layoutMix.toFixed(3)}
      data-layout-transitioning={layoutTransitioning}
      data-selected-airport={selectedAirport?.id}
      data-selected-road={selectedRoad?.id}
      data-surface-enabled={surfaceEnabled}
      data-tfl-enabled={tflEnabled}
      data-quiet-map={quietMap}
      data-quiet-playing={quietMap ? isPlaying : undefined}
      data-bus-enabled={busEnabled}
      data-bus-loading={busLoading}
      data-operations-mode={operationsRequested ? 'preparing' : operationsMode}
      data-operations-ready={Boolean(operationsProjection)}
      data-pulse-national-rail-calls={pulseHub ? nationalRailPulseCount : undefined}
      data-pulse-lens={pulseHub ? pulseLens : undefined}
      data-pulse-night={pulseHub ? pulseNightMix.toFixed(2) : undefined}
    >
      <div className="scene" aria-hidden={webglAvailable ? true : undefined}>
        <Suspense fallback={null}>
          {!webglAvailable ? (
            <section className="no-webgl" role="status">
              <span aria-hidden="true">◎</span>
              <h2>This study needs WebGL</h2>
              <p>Open All Change in a browser with hardware-accelerated graphics.</p>
            </section>
          ) : network && pulseHub ? (
            <HubPulseScene
              timeline={network.metadata}
              hub={pulseHub}
              calls={pulseCalls}
              isPlaying={isPlaying}
              time={time}
              onTime={setTime}
              playbackRate={playbackRate}
              selectedCategory={selectedCategory}
              showTaktOverlay
              nightMix={pulseNightMix}
            />
          ) : sceneNetwork && network ? (
            <NationalNetworkScene
              quietMap={quietMap}
              quietDiagramSnapshot={quietMap ? morningNetwork : undefined}
              nationalRailSnapshot={nationalRailEnabled ? nationalRail : undefined}
              nationalRailSelectedId={nationalRailSelectedId}
              boundary={boundary}
              lakes={water}
              snapshot={sceneNetwork}
              referenceSnapshot={infrastructureNetwork ?? network}
              stations={stations}
              stationLabelSettleSeconds={0.04}
              trainLabelMode={trainLabelMode}
              isPlaying={isPlaying}
              time={sceneTime}
              selectedTrain={selectedTrain}
              onTime={setTime}
              cameraCommand={cameraCommand}
              playbackRate={playbackRate}
              selectedCategory={nationalRailSelectedId ? 'intercity' : selectedCategory}
              selectedRoute={displayedSelectedRoute}
              selectedStation={selectedStation}
              onSelectStation={selectStation}
              onSelectTrain={selectTrain}
              onSelectNationalRail={selectNationalRail}
              airSnapshot={airEnabled ? activeAirSnapshot : undefined}
              airCategorySelected={airCategorySelected}
              airports={airEnabled ? LONDON_AIRPORTS : undefined}
              selectedAirTrack={selectedAirTrack}
              selectedAirport={selectedAirport}
              onSelectAirTrack={selectAirTrack}
              roadTopology={roadEnabled ? roadTopology : undefined}
              nationalRoadSnapshot={
                roadEnabled ? activeRoadSnapshot : undefined
              }
              roadCategorySelected={roadCategorySelected}
              selectedRoadId={selectedRoad?.id}
              cameraFraming={edition.mapFraming}
              spatialLayout={spatialLayout}
              spatialLayoutMix={layoutMix}
              layoutTransitioning={layoutTransitioning}
              routeColors={ALL_CHANGE_ROUTE_COLORS}
              topologicalStyle="line-map"
            />
          ) : null}
        </Suspense>
      </div>
      <div className="atmosphere" />
      <div className="scanlines" />

      <header className="london-masthead">
        <div>
          <p className="eyebrow">{motionStudyMark(edition.identity)}</p>
          <h1>{edition.identity.title}</h1>
          <p className="london-tagline">London, geographically and otherwise.</p>
        </div>
        <div className="london-study-mark">
          <span>{edition.identity.descriptor}</span>
          <small>
            {operationsEngaged
              ? 'Observed rail · prediction-derived'
              : `${surfaceEnabled && busEnabled ? 'Rail + river + bus' : surfaceEnabled ? 'Rail + river' : busEnabled ? 'Rail + bus' : 'Rail'} study · ${studyWindow === 'day' ? '24-hour Friday' : '06:45–08:45'}`}
          </small>
        </div>
      </header>

      <button
        className={`london-spatial-cta${mobileControlsOpen ? ' is-obscured' : ''}`}
        type="button"
        aria-label={layout === 'diagram' ? 'Geography layout' : 'Diagram layout'}
        aria-busy={layoutLoading}
        disabled={!network || layoutLoading || (layout !== 'diagram' && (surfaceEnabled || busEnabled || nationalRailEnabled))}
        onClick={() => {
          const nextLayout = layout === 'diagram' ? 'geographic' : 'diagram'
          const option = edition.data.opening.layouts.find((value) => value.id === nextLayout)
          activateLayout(nextLayout, option && 'artifact' in option ? option.artifact : undefined)
        }}
      >
        <span aria-hidden="true">↔</span>
        {layoutLoading ? 'Drawing diagram…' : layout === 'diagram' ? 'Back to geography' : 'Try diagram'}
      </button>

      <button
        id="london-controls-toggle"
        className="london-controls-toggle"
        type="button"
        aria-expanded={mobileControlsOpen}
        aria-controls="london-controls-panel"
        onClick={() => {
          setMobileControlsOpen((value) => !value)
          setSearchOpen(false)
        }}
      >
        {mobileControlsOpen ? 'Close' : 'Controls'}
        <span aria-hidden="true">{mobileControlsOpen ? '×' : '+'}</span>
      </button>
      <div
        id="london-controls-panel"
        className={`london-controls-panel${mobileControlsOpen ? ' is-open' : ''}`}
      >
      <section className="london-layout-switch" aria-label="Spatial layout">
        {edition.data.opening.layouts.map((option) => {
          const artifact = 'artifact' in option ? option.artifact : undefined
          const available =
            option.id === 'geographic' ||
            (Boolean(artifact) && !surfaceEnabled && !busEnabled && !nationalRailEnabled)
          const loading = option.id === 'diagram' && layoutLoading
          return (
            <button
              key={option.id}
              className={option.id === 'diagram' ? 'london-diagram-toggle' : undefined}
              type="button"
              aria-label={`${option.label} layout`}
              aria-pressed={!pulseHub && layout === option.id}
              aria-keyshortcuts={option.id === 'diagram' ? 'D' : 'G'}
              aria-busy={loading}
              disabled={!available || loading || !network}
              data-tooltip={!available ? 'The diagram is unavailable while Bus, River or National Rail is enabled' : option.id === 'geographic' ? 'Place services at their geographic locations (G)' : 'Arrange the same services on a simplified network diagram (D)'}
              onClick={() => available && activateLayout(option.id, artifact)}
            >
              <span className="london-wide-label">{option.label}</span>
              {option.id === 'diagram' && <span className="london-transition-symbol" aria-hidden="true">↔</span>}
              <span className="london-mobile-label">
                {option.id === 'geographic' ? 'Geo' : 'Map'}
              </span>
              {loading && <small>Loading</small>}
            </button>
          )
        })}
        <button
          className="london-pulse-toggle"
          type="button"
          data-tooltip={pulseHub ? 'Return to the network map (P)' : 'Explore arrivals and departures around an interchange (P)'} aria-label={pulseHub ? 'Exit interchange pulse' : 'Interchange pulse'}
          aria-pressed={Boolean(pulseHub)}
          aria-keyshortcuts="P"
          disabled={!network}
          onClick={togglePulse}
        >
          <span className="london-wide-label">Pulse</span>
          <span className="london-mobile-label">◎</span>
        </button>
        <span className="london-switch-divider" aria-hidden="true" />
        <button
          type="button"
          data-tooltip="Replay the morning timetable from 06:45 to 08:45" aria-label="Morning study"
          aria-pressed={studyWindow === 'morning'}
          onClick={() => activateStudyWindow('morning')}
        >
          <span className="london-wide-label">Morning</span>
          <span className="london-mobile-label">2H</span>
        </button>
        <button
          type="button"
          data-tooltip="Load the full Friday timetable and explore all 24 hours" aria-label="24-hour study"
          aria-pressed={studyWindow === 'day'}
          aria-busy={studyWindow === 'day' && dayLoading}
          onClick={() => activateStudyWindow('day')}
        >
          <span className="london-wide-label">24 hours</span>
          <span className="london-mobile-label">24H</span>
          {studyWindow === 'day' && dayLoading && <small>Loading</small>}
        </button>
        <button
          className="london-operations-toggle"
          type="button"
          aria-label={operationsEngaged ? 'Return to planned timetable' : 'Show observed TfL operations'}
          aria-pressed={operationsEngaged}
          aria-busy={operationsRequested}
          onClick={() =>
            activateOperationsMode(
              operationsEngaged ? 'plan' : 'observed',
            )
          }
        >
          <span className="london-wide-label">
            {operationsEngaged ? 'Observed' : 'Plan'}
          </span>
          <span className="london-mobile-label">
            {operationsRequested
              ? 'SYNC'
              : operationsMode === 'observed'
                ? 'OBS'
                : 'PLAN'}
          </span>
          {operationsRequested && (
            <small>Sync</small>
          )}
        </button>
        <span className="london-switch-divider" aria-hidden="true" />
        <button
          className="london-tfl-toggle"
          type="button"
          aria-label={tflEnabled ? 'Hide TfL rail' : 'Show TfL rail'}
          aria-pressed={tflEnabled}
          data-tooltip="Tube, DLR, Overground, Elizabeth line and trams"
          onClick={toggleTflLayer}
        >
          TfL
        </button>
        <button
          className="london-air-toggle"
          type="button"
          aria-label={airEnabled ? 'Hide observed aircraft' : 'Show observed aircraft'}
          aria-pressed={airEnabled}
          aria-busy={airLoading}
          onClick={toggleAirLayer}
        >
          <span className="london-wide-label">Air</span>
          <span className="london-mobile-label">✦</span>
          {airLoading && <small>Loading</small>}
        </button>
        <button
          className="london-road-toggle"
          type="button"
          aria-label={roadEnabled ? 'Hide reconstructed motorway traffic' : 'Show reconstructed motorway traffic'}
          aria-pressed={roadEnabled}
          aria-busy={roadLoading}
          onClick={toggleRoadLayer}
        >
          <span className="london-wide-label">Road</span>
          <span className="london-mobile-label">≋</span>
          {roadLoading && <small>Loading</small>}
        </button>
        <button
          className="london-bus-toggle"
          type="button"
          aria-label={busEnabled ? 'Hide London buses' : 'Show London buses'}
          aria-pressed={busEnabled}
          aria-busy={busLoading}
          onClick={toggleBusLayer}
        >
          <span className="london-wide-label">Bus</span>
          <span className="london-mobile-label">Bus</span>
          {busLoading && <small>Loading</small>}
        </button>
        <button
          className="london-surface-toggle"
          type="button"
          aria-label={surfaceEnabled ? 'Hide River Bus and cable car' : 'Show River Bus and cable car'}
          aria-pressed={surfaceEnabled}
          aria-busy={surfaceLoading}
          onClick={toggleSurfaceLayer}
        >
          <span className="london-wide-label">River</span>
          <span className="london-mobile-label">≈</span>
          {surfaceLoading && <small>Loading</small>}
        </button>
        <button
          className="london-national-rail-toggle"
          type="button"
          aria-label={nationalRailEnabled ? 'Hide National Rail' : 'Show National Rail'}
          aria-pressed={nationalRailEnabled}
          aria-busy={nationalRailEnabled && railFeed.loading}
          data-tooltip="Passenger arrivals and departures · London rail network"
          onClick={toggleNationalRailLayer}
        >
          <span className="london-wide-label">National Rail</span>
          <span className="london-mobile-label">NR</span>
        </button>
        {nationalRailEnabled && nationalRailError && <span className="london-layout-status" role="status">National Rail unavailable · toggle to retry</span>}
        {nationalRailEnabled && railFeed.loading && <span className="london-layout-status" role="status">Loading National Rail…</span>}
        {layoutError && (
          <span className="london-layout-status" role="status">
            Diagram unavailable
          </span>
        )}
        {dayError && (
          <span className="london-day-status" role="status">
            Full day unavailable
          </span>
        )}
        {(airLoadError || airDay.error) && (
          <span className="london-air-status" role="status">
            Air study unavailable
          </span>
        )}
        {(roadLoadError || roadDay.error || roadDay.unavailable) && (
          <span className="london-road-status" role="status">
            Road study unavailable
          </span>
        )}
        {surfaceLoadError && (
          <span className="london-surface-status" role="status">
            River study unavailable
          </span>
        )}
        {busEnabled && busDay.error && (
          <span className="london-bus-status" role="status">
            Bus study unavailable
          </span>
        )}
        {operationsEngaged &&
          (observedOperations.error || operationsAge > 180) && (
            <span className="london-operations-status" role="status">
              Observed operations unavailable · plan held
            </span>
          )}
      </section>

      {sceneNetwork && (
        <section
          className={`london-service-legend service-legend${selectedCategory || airCategorySelected || roadCategorySelected ? ' has-filter' : ''}`}
          aria-label="Transport layers"
        >
          {availableCategories.map((category) => (
            <button
              key={category.id}
              type="button"
              aria-pressed={selectedCategory === category.id}
              data-tooltip={`${selectedCategory === category.id ? 'Restore all services' : 'Focus on this service group'} · ${category.detail}`}
              style={
                {
                  '--service-accent': SERVICE_COLORS[category.id],
                } as CSSProperties
              }
              onClick={() => {
                setSelectedCategory((value) =>
                  value === category.id ? undefined : category.id,
                )
                setSelectedStation(undefined)
                setSelectedRoute(undefined)
                setSelectedTrain(undefined)
                setSelectedAirTrackId(undefined)
                setSelectedAirport(undefined)
                setSelectedRoad(undefined)
                setAirCategorySelected(false)
                setRoadCategorySelected(false)
              }}
            >
              <i style={{ backgroundColor: SERVICE_COLORS[category.id] }} />
              {category.label}
            </button>
          ))}
          {airEnabled && (
            <button
              className="london-air-category"
              type="button"
              aria-pressed={airCategorySelected}
              data-tooltip={airCategorySelected ? 'Restore the other transport layers' : 'Isolate observed aircraft and attenuate the other transport layers'}
              style={{ '--service-accent': edition.theme.air } as CSSProperties}
              onClick={() => {
                setAirCategorySelected((value) => !value)
                setSelectedCategory(undefined)
                setSelectedStation(undefined)
                setSelectedRoute(undefined)
                setSelectedTrain(undefined)
                setSelectedAirTrackId(undefined)
                setSelectedAirport(undefined)
                setSelectedRoad(undefined)
                setRoadCategorySelected(false)
              }}
            >
              <i style={{ backgroundColor: edition.theme.air }} />
              AIR
            </button>
          )}
          {roadEnabled && (
            <button
              className="london-road-category"
              type="button"
              aria-pressed={roadCategorySelected}
              data-tooltip={roadCategorySelected ? 'Restore the other transport layers' : 'Isolate reconstructed motorway traffic and attenuate the other layers'}
              style={{ '--service-accent': edition.theme.roadHeavy } as CSSProperties}
              onClick={() => {
                setRoadCategorySelected((value) => !value)
                setSelectedCategory(undefined)
                setSelectedStation(undefined)
                setSelectedRoute(undefined)
                setSelectedTrain(undefined)
                setSelectedAirTrackId(undefined)
                setSelectedAirport(undefined)
                setSelectedRoad(undefined)
                setAirCategorySelected(false)
              }}
            >
              <i style={{ backgroundColor: edition.theme.roadHeavy }} />
              ROAD
            </button>
          )}
        </section>
      )}

      {!pulseHub && <aside className="london-map-tools" aria-label="Map controls">
        <button type="button" aria-label="Zoom in" onClick={() => moveCamera('zoom-in')}>+</button>
        <button type="button" aria-label="Zoom out" onClick={() => moveCamera('zoom-out')}>−</button>
        <button type="button" aria-label="Reset map" onClick={() => moveCamera('reset')}>↺</button>
        <button
          type="button"
              data-tooltip={trainLabelMode === 'auto' ? 'Show vehicle labels (Tube and DLR at close zoom) (L)' : trainLabelMode === 'on' ? 'Hide vehicle labels (L)' : 'Show vehicle labels automatically at useful zoom levels (L)'} aria-label={`Vehicle labels ${trainLabelMode}`}
          onClick={() => setTrainLabelMode((value) => LABEL_MODES[value])}
        >
          L·{trainLabelMode.slice(0, 1).toUpperCase()}
        </button>
      </aside>}

      </div>

      <section className="london-search train-search">
        <form
          role="search"
          onSubmit={(event) => {
            event.preventDefault()
            const choice = choices[activeSearchIndex]
            if (choice) activateChoice(choice)
          }}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <span className="search-mark" aria-hidden="true" />
          <label>
            <span className="sr-only">Find a London station, line, service, airport, flight or motorway</span>
            <input
              type="search"
              value={query}
              placeholder={busEnabled ? 'Find a bus route, night bus, or stop' : surfaceEnabled ? 'Find RB6, Canary Wharf, or cable car' : airEnabled ? "Find Heathrow, M25, DLR, or flight" : "Find King's Cross, Heathrow, M25, or DLR"}
              autoComplete="off"
              aria-controls="london-search-results"
              aria-expanded={searchOpen && choices.length > 0}
              onFocus={() => {
                setSearchOpen(true)
                setMobileControlsOpen(false)
              }}
              onChange={(event) => {
                setQuery(event.target.value)
                setActiveSearchIndex(0)
                setSearchOpen(true)
              }}
              onKeyDown={onSearchKeyDown}
            />
          </label>
          {query && (
            <button
              className="clear-search"
              type="button"
              aria-label="Clear search and selection"
              onClick={clearSelection}
            >
              ×
            </button>
          )}
        </form>
        {searchOpen && query.trim() && (
          <div
            id="london-search-results"
            className="search-results"
            role="listbox"
            aria-label="Matching stations, lines, services, airports, flights and motorways"
          >
            {choices.map((choice, index) => {
              const label =
                choice.kind === 'airport'
                  ? choice.value.name
                  : choice.kind === 'road'
                    ? roadCorridorSearchValue(choice.value)
                  : choice.kind === 'air'
                  ? choice.value.callsign
                  : (choice.kind === 'station' || choice.kind === 'rail-station')
                  ? choice.value.name
                  : choice.kind === 'route'
                    ? choice.value.name
                    : `${choice.value.route} ${choice.value.shortName}`.trim()
              const detail =
                choice.kind === 'airport'
                  ? `AIRPORT · ${choice.value.iata} / ${choice.value.icao}`
                  : choice.kind === 'road'
                    ? 'MOTORWAY · OBSERVED FLOW'
                  : choice.kind === 'air'
                  ? `AIR · ${(choice.value.icaoAddress ?? choice.value.id).toUpperCase()}`
                  : choice.kind === 'rail-station'
                  ? `NATIONAL RAIL · ${choice.value.code} · board & pulse`
                  : choice.kind === 'rail-train'
                  ? `NATIONAL RAIL · ${choice.value.headsign}`
                  : choice.kind === 'station'
                  ? `${choice.value.routes.length} lines`
                  : choice.kind === 'route'
                    ? `${choice.value.trainIds.length} journeys`
                    : choice.value.headsign
              return (
                <button
                  key={`${choice.kind}:${choice.kind === 'station' ? choice.value.name : choice.value.id}`}
                  type="button"
                  role="option"
                  aria-selected={index === activeSearchIndex}
                  className={index === activeSearchIndex ? 'is-active' : undefined}
                  onMouseEnter={() => setActiveSearchIndex(index)}
                  onClick={() => activateChoice(choice)}
                >
                  <span aria-hidden="true">
                    {choice.kind === 'airport' ? '✦' : choice.kind === 'road' ? '≋' : choice.kind === 'air' ? '◆' : choice.kind === 'station' ? '◎' : choice.kind === 'route' ? '━' : '●'}
                  </span>
                  <strong>{label}</strong>
                  <small>{detail}</small>
                </button>
              )
            })}
            {choices.length === 0 && <p>No matching movement in this study.</p>}
          </div>
        )}
      </section>

      {selectedAirport ? (
        <Suspense fallback={null}><AirportHeroCard key={selectedAirport.id} className="edition-airport-card"
          airport={selectedAirport} aircraft={searchableAircraft}
          study={{ time: sceneTime, windowStart: Math.max(sceneNetwork?.metadata.windowStart ?? 0, activeAirSnapshot?.metadata.windowStart ?? 0), windowEnd: Math.min(sceneNetwork?.metadata.windowEnd ?? 86400, activeAirSnapshot?.metadata.windowEnd ?? 86400) }}
          maxRows={4} dateLabel="04.09.2026"
          loading={studyWindow === 'day' ? !airDay.manifest : !morningAir} error={airLoadError || airDay.error ? 'Air study unavailable' : undefined}
          onSelectFlight={selectAirTrack}
        /></Suspense>
      ) : (
      <section
        className={`london-status-card${quietMap ? ' is-quiet' : ''}${operationsMode === 'observed' ? ' is-observed-operations' : ''}${pulseHub ? ' is-pulse-selection' : ''}${selectedAirIndexEntry || selectedAirport || airStatus ? ' is-air-selection' : ''}${selectedRoad || roadStatus ? ' is-road-selection' : ''}`}
        aria-live="polite"
      >
        {pulseHub && (
          <>
            <label className="london-pulse-picker">
              <span>{pulseNightMix > 0.5 ? 'Night signal' : 'Interchange'}</span>
              <select
                aria-label="Pulse interchange"
                value={pulseHub.id}
                onChange={(event) => {
                  setPulseLens('all')
                  setSelectedCategory(undefined)
                  setPulseHubId(event.target.value as LondonHubId)
                }}
              >
                {pulseHubs.map((hub) => (
                  <option key={hub.id} value={hub.id}>
                    {hub.displayName}
                  </option>
                ))}
              </select>
            </label>
            <div className="london-pulse-lenses" role="group" aria-label="Pulse flow lens">
              {(['all', 'radial', 'orbital'] as const).map((lens) => (
                <button
                  key={lens}
                  type="button"
                  data-tooltip={lens === 'all' ? 'Show all interchange movements' : lens === 'radial' ? 'Show movements towards or away from central London' : 'Show movements around central London'} aria-label={`${lens} movements`}
                  aria-pressed={pulseLens === lens}
                  disabled={pulseSummary[lens] === 0}
                  onClick={() => setPulseLens(lens)}
                >
                  <span>{lens}</span>
                  <small>{pulseSummary[lens].toLocaleString('en-GB')}</small>
                </button>
              ))}
            </div>
          </>
        )}
        {loadError ? (
          <p>Opening study unavailable.</p>
        ) : quietMap ? (
          <>
            <div><strong>All quiet.</strong></div>
            <p>For once, nothing is running late.</p>
            <small>Switch on a layer to wake the city.</small>
          </>
        ) : sceneNetwork ? (
          <>
            <div>
              <strong>
                {pulseHub
                  ? nearbyPulseCalls.length.toLocaleString('en-GB')
                  : operationsMode === 'observed'
                    ? activeTrainCount.toLocaleString('en-GB')
                  : selectedRoad
                  ? selectedRoad.label
                  : roadStatus
                    ? reconstructedRoadVehicleCount.toLocaleString('en-GB')
                  : selectedAirIndexEntry
                  ? selectedAirIndexEntry.callsign
                  : airStatus
                    ? activeAircraftCount.toLocaleString('en-GB')
                    : activeVehicleCount.toLocaleString('en-GB')}
              </strong>
              <span>{pulseHub ? pulseLens === 'all' ? 'movements in orbit' : `${pulseLens} movements` : operationsMode === 'observed' ? 'vehicles observed' : selectedRoad ? 'motorway selected' : roadStatus ? 'vehicles reconstructed' : selectedAirport ? 'airport movements' : selectedAirIndexEntry || airStatus ? 'aircraft observed' : vehicleCountLabel}</span>
            </div>
            <p>
              {pulseHub
                ? pulseHub.displayName
                : operationsMode === 'observed' && !selectedDescription
                  ? observedLineStatus
                    ? `${observedLineStatus.lineName} · ${observedLineStatus.severityDescription}`
                    : 'Victoria · Jubilee · Elizabeth'
                : selectedRoad
                ? selectedRoad.description
                : roadStatus
                  ? 'London motorway flow'
                : selectedAirTelemetry
                ? `Heading ${Math.round(selectedAirTelemetry.headingDegrees).toString().padStart(3, '0')}°`
                : selectedStation?.name ?? displayedSelectedRoute?.name ?? (selectedTrain ? `${selectedTrain.route} ${selectedTrain.shortName}` : airStatus ? 'Observed London airspace' : !networkSelection && (airEnabled || roadEnabled || nationalRailEnabled) ? 'Enabled transport layers' : studyWindow === 'day' ? '24-hour lattice' : 'Morning lattice')}
            </p>
            <small>
              {pulseHub
                ? `${pulseHub.character} · ${pulseCalls.length.toLocaleString('en-GB')} ${pulseLens === 'all' ? '' : `${pulseLens} `}calls in the loaded study`
                : operationsMode === 'observed' && !selectedDescription
                  ? observedOperationsSummary
                : selectedRoad || roadStatus
                ? selectedDescription ?? `${reconstructedRoadVehicleCount.toLocaleString('en-GB')} reconstructed at ${formatServiceTime(time)} · observed ${roadObservationDate}`
                : selectedAirTelemetry
                ? `${Math.round(selectedAirTelemetry.altitudeFeet / 100) * 100} ft · ${Math.round(selectedAirTelemetry.groundSpeedKnots)} kt · ${selectedDescription}`
                : selectedDescription ?? (airStatus ? `${activeAircraftCount.toLocaleString('en-GB')} active at ${formatServiceTime(time)}` : journeySummary)}
            </small>
            {!pulseHub && (selectedRoad || roadStatus) && <Suspense fallback={null}><LondonRoadObservations snapshot={roadDay.snapshot} topology={roadTopology} time={roadIntervalTime} road={selectedRoad?.id} date={roadObservationDate} /></Suspense>}
            {pulseHub?.nationalRail && (
              <small className="london-pulse-rail" role="status">
                {pulseRailSnapshot && `${pulseRailOperator} · ${nationalRailPulseCount} National Rail calls · published times`}
                {nationalRailError ? <>
                  National Rail unavailable · <button type="button" onClick={() => {
                    railFeed.retry()
                  }}>Retry National Rail</button>
                </> : railFeed.loading ? ' · Loading National Rail…' : null}
              </small>
            )}
            {pulseHub && upcomingPulseCall && (
              <small className="london-pulse-next">
                Next {formatServiceTime(upcomingPulseCall.arrival)} ·{' '}
                {upcomingPulseCall.train.route} → {upcomingPulseCall.train.headsign}
              </small>
            )}
          </>
        ) : (
          <p>Drawing London…</p>
        )}
      </section>
      )}

      {sceneNetwork && (
        <section className="london-transport" aria-label="Playback controls">
          <div className="london-time-copy">
            <span>{formatServiceTime(sceneNetwork.metadata.windowStart)}</span>
            <strong>{formatServiceTime(sceneTime)}</strong>
            <span>
              {sceneNetwork.metadata.windowEnd === 86_400
                ? '24:00'
                : formatServiceTime(sceneNetwork.metadata.windowEnd)}
            </span>
          </div>
          <label>
            <span className="sr-only">Time of day</span>
            <input
              type="range"
              min={sceneNetwork.metadata.windowStart}
              max={sceneNetwork.metadata.windowEnd}
              step="10"
              value={sceneTime}
              disabled={operationsEngaged}
              onChange={(event) => setTime(Number(event.target.value))}
            />
          </label>
          <div className="london-playback-actions">
            <button
              type="button"
              aria-label={isPlaying ? 'Pause motion' : 'Resume motion'}
              disabled={operationsEngaged}
              onClick={() => setIsPlaying((value) => !value)}
            >
              {isPlaying ? 'Ⅱ' : '▶'}
            </button>
            <select
              aria-label="Playback speed"
              disabled={operationsEngaged}
              value={playbackRate}
              onChange={(event) => setPlaybackRate(Number(event.target.value))}
            >
              {PLAYBACK_RATES.map((rate) => (
                <option key={rate.value} value={rate.value}>{rate.label}</option>
              ))}
            </select>
            <button
              className="london-cinema-toggle"
              type="button"
              aria-label={limitedChrome ? 'Exit limited chrome' : 'Enter limited chrome'}
              aria-pressed={limitedChrome}
              aria-keyshortcuts="F"
              data-tooltip={limitedChrome ? 'Restore the panels and controls (F)' : 'Hide the panels to focus on the map (F)'}
              onClick={() => setLimitedChrome((value) => !value)}
            >
              <span className="london-wide-label">
                {limitedChrome ? 'Exit' : 'Focus'}
              </span>
              <span className="london-mobile-label">
                {limitedChrome ? '×' : '⛶'}
              </span>
            </button>
            {(nationalRailSelectedId || selectedStation || selectedRoute || selectedTrain || selectedAirTrackId || selectedAirport || selectedRoad || selectedCategory || airCategorySelected || roadCategorySelected) && (
              <button type="button" data-tooltip="Clear the selection and stop following it to explore the map freely" onClick={clearSelection}>Release</button>
            )}
          </div>
        </section>
      )}

      {(nationalRailEnabled || pulseHub || searchOpen) && railCatalogue.error && <p className="london-layout-status" role="status">Rail station list unavailable · <button type="button" onClick={railCatalogue.retry}>Retry station list</button></p>}
      {nationalRailEnabled && !railBoardSnapshot && !pulseHub && (
        <section className="london-national-rail-board" aria-label="National Rail loading">
          <label className="london-rail-station-picker">Station
            <select aria-label="National Rail station" value={nationalRailStationId} onChange={event => setNationalRailStationId(event.target.value as RailBoardStationId)}>
              {railStations.map(station => <option key={station.id} value={station.id}>{station.name}</option>)}
            </select>
          </label>
          <p>{railStation.corridors.some(id => railFeed.errors[id]) ? 'Corridor unavailable' : 'Loading corridor…'}</p>
          {railStation.corridors.some(id => railFeed.errors[id]) && <button type="button" onClick={railFeed.retry}>Retry National Rail</button>}
        </section>
      )}
      {nationalRailEnabled && railBoardSnapshot && !pulseHub && network && (
        <Suspense fallback={<span className="london-layout-status" role="status">Loading rail board…</span>}><LondonNationalRailBoard
          snapshot={railBoardSnapshot} stations={railStations} stationId={nationalRailStationId} time={time} windowEnd={network.metadata.windowEnd}
          onStation={id => {
            clearSelection()
            setNationalRailStationId(id)
            const station = railStations.find(value => value.id === id)!
            moveCamera('focus-location', station.focus, 0.25)
          }}
          onPulse={() => {
            clearSelection()
            setPulseLens('all')
            setPulseHubId(nationalRailStationId)
          }}
          selectedId={nationalRailSelectedId}
          onSelect={id => { clearSelection(); setNationalRailSelectedId(id) }}
          onSeek={nextTime => {
            setTime(Math.max(network.metadata.windowStart, Math.min(network.metadata.windowEnd - 1, nextTime)))
            setIsPlaying(false)
            moveCamera('focus-location', railStation.focus, 0.25)
          }}
        /></Suspense>
      )}
      <footer className="london-footer">
        <span>
          {operationsMode === 'observed'
            ? 'TfL arrival predictions · route interpolation · not GPS'
            : 'TfL timetable · ADS-B + WebTRIS observation · not realtime'}
        </span>
        <span>GLA boundary + Thames · OGL v3.0{nationalRailEnabled && <> · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">Rail © OpenStreetMap</a></>}</span>
      </footer>
    </main>
  )
}
