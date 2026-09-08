# All Change

**[Open All Change](https://emmettl.github.io/allchange/)** · [Motion Studies catalogue](https://emmettl.github.io/motionstudies/)

[Study brief](https://github.com/emmettl/motionstudies/blob/main/docs/LONDON.md) · [Project goals](https://github.com/emmettl/motionstudies/blob/main/docs/VISION.md) · [Roadmap](https://github.com/emmettl/motionstudies/blob/main/ROADMAP.md)

London, geographically and otherwise. Motion Studies 006.

This is the independent London edition. It owns the London application, styles, timetable and geography fixtures, source-specific ingestion commands, observation worker and browser/payload checks. Shared runtime and Node tooling come from [Motion Studies](https://github.com/emmettl/motionstudies).

## Run and check

Use Node 24 LTS (`nvm use`) and npm 11.19.0, then `npm ci` and `npm run dev`. The app is served at the root. `npm run build` stages only London artifacts and builds a single entry point.

Run `npm test`, `npm run typecheck`, `npm run lint`, `npm run check:boundary`, `npm run build` and `npm run check:bundle`. Install browser engines with `npx playwright install chromium webkit`, then run `npm run test:e2e:ci`. `npm run worker:check` and `npm run worker:build` validate the existing London observation adapter without deploying it.

CI builds once and tests that artifact on separate Chromium and iPhone WebKit runners, each with one worker to avoid software WebGL contention. Frame cadence runs on the WebKit runner after its functional tests. Deployment waits for both browsers. Each runner uploads its own `e2e-report-…` artifact and lists wall time and the slowest tests in the Actions summary.

The exhaustive vehicle-count combinations run in Vitest (`src/studies/vehicle-counts.test.ts`): all 64 enabled-layer combinations at morning and evening times, category isolation, station/route filtering, missing data and time boundaries. Two browser tests in `e2e/london.spec.ts` retain coverage of layer controls, category and station selection, scrubbing, count labels and the quiet state. Run these alone with `npx playwright test --grep 'vehicles in motion follows|vehicle count follows' --workers=1`.

Set `E2E_PREBUILT=1` when running Playwright against an already-current `dist` to skip rebuilding; otherwise Playwright builds automatically.

See [the September performance pass](docs/PERFORMANCE.md) for the Gleislicht fixes, local before/after measurements, and remaining bus bottleneck. The profiler also supports `--air-roads`, `--rail`, `--buses`, and optional `--profile-dir /tmp` CPU captures.

To investigate desktop frame budgets, build and start `npm run preview -- --port 4177 --strictPort`, then run `npm run profile:frames -- --channel msedge --output edge-frames.local` in another terminal on the affected Windows machine. Edge must be installed. The diagnostic opens a separate browser session and measures the opening map, open search, a selected result, and the diagram. Keep its window in the foreground. Set `--width`, `--height`, and `--dpr` to match the CSS viewport and Windows scaling (defaults: 1920×1080 at 150%); `--fps` sets the target refresh rate (default: 60). The JSON includes the actual graphics renderer, canvas resolution, frame percentiles, missed-frame indicators, and main-thread timings. Frame intervals measure callback cadence, not GPU execution time; compare the same hardware and settings before and after a change. `--headless` is available for smoke checks, but a software renderer is not a Windows GPU benchmark.

Use `--buses` to measure the opening map, all London buses, and selected route 26. `--cpu-throttle 4` simulates a slower CPU; `--angle metal` enables hardware rendering for headless Chromium on macOS. Reports include script milliseconds per frame and the renderer actually used. The bus motion adapter uses binary timetable lookup, a bounded cache of exact motion between road vertices, reused label collation, and uploads only the populated part of vehicle/trail buffers. All buses, road vertices and trail samples are retained. Compatibility and interpolation tests cover package adapters, arrivals, dwell, reversed paths, scrubbing and projection changes.

## Package boundary

The four `@motionstudies` dependencies pin the coordinated npm release `0.1.0-alpha.4`. The committed lockfile records registry URLs and integrity hashes. There are no shared source directories, workspace links, vendored packages, or sibling-repository imports here. `check:boundary` verifies the installed release versions and registry lock entries, rejects source links, and checks that imports use declared public exports.

## Diagram layout

The diagram uses the authored station anchors and corridor sequences in `fixtures/tfl/all-change-diagram-overrides.json`. Run `npm run data:london:diagram` after editing them. Intermediate stations divide continuous horizontal, vertical and 45-degree runs; the compiler preserves source stop and path identities and rejects unplaced stations. Geometry checks cover path endpoints, unrelated station collisions and TfL-relative central orientation.

Elizabeth line corridors carry a route name so timetable links that skip stops follow the complete authored railway through intermediate stations and branch junctions. Both directions reuse the same track geometry instead of drawing shortcuts between calls.

`LondonDiagramStations` supplies perpendicular line-coloured ticks for ordinary stops and rings for interchanges and branches. Shared-track Tube stops retain ticks; changes between transport modes use rings. The pinned `@motionstudies/three` alpha.4 release has no marker extension point, so `scripts/london-diagram-renderer.ts` applies a narrow Vite transform for these markers, consistent parallel lanes, track width and London label density. The shared renderer stops submitting invisible geographic boundaries, water, traffic and station geometry while keeping their resources mounted for the return transition. It leaves the installed package untouched and fails when expected renderer hooks change; review this adapter when upgrading the renderer, and replace it with a public extension point when available.

## Data and hosting

`fixtures/tfl/` retains the authored TfL timetable, transport catalogues and map layout; `public/data/` contains the committed air and road observations. Existing `data:london:*` commands retain their explicit source dates and provenance. Use them deliberately to refresh data; CI builds the reviewed fixtures. PDF timetable ingestion requires `pdftotext` on the host.

The historical Road layer uses measured 15-minute WebTRIS intervals from 5 September 2025. Blank fields remain missing; genuine recorded zeroes remain valid. Vehicles appear only on original neighbouring sections with both endpoints reporting in the displayed interval, without interpolating through missing periods or joining across missing detectors. Speed colours indicate below 30, 30–50 and at least 50 mph; uncoloured stretches lack paired speed readings. Selecting a motorway shows its observation date, flow-weighted mean speed, mean hourly flow per reporting detector, and detector/section coverage. Detector flow is not a count of unique vehicles across the motorway. The corrected fixture contains 232 reporting sites from 304 candidates and excludes 7,470 incomplete rows. The detail card loads on demand; the existing progressive road chunks are retained.

The Bus layer discovers the entire TfL bus catalogue, including numbered, local, school, night and Superloop routes. `npm run data:london:bus` fetches each advertised branch origin, writes an explicit per-route coverage audit in the bus manifest, and emits twelve compact two-hour chunks. The initial page does not request bus data. Repeated journeys share relative stop-time/path patterns on disk; the browser verifies each chunk's size and SHA-256, expands only the current chunk, and retains at most its neighbouring compact chunks.

The default study remains Friday 4 September 2026 to match the rail layers. It selects school-day timetables and includes the preceding Thursday's after-midnight tail; a route with only a non-school variant is flagged in the audit. Unavailable or inactive origins are recorded rather than filled with invented services. This is recurring timetable interpolation, not observed bus telemetry or a claim that every vehicle actually ran that day. The importer uses TfL route stop IDs and aligns occasional timetable platform aliases only when their TfL stop areas and the surrounding ordered branch agree.

A full refresh can take a while under TfL's public request limit. Raw responses are cached under `/tmp/allchange-tfl-bus-YYYY-MM-DD`; use `--cache <directory>` to resume a particular download or a new directory for a fresh source capture. Optional `TFL_API_KEY` stays on the compiler host. `--service-date`, `--retrieved-at` and `--non-school-days` make alternate studies explicit; keep the service date aligned with the other layers when replacing the app fixture. CI uses the checked-in manifest and chunks and makes no TfL requests.

Pull requests run the edition checks and upload a preview artifact. Every push to `main` runs `Deploy Pages`, which calls the same checks and publishes their build to https://emmettl.github.io/allchange/ only after they pass. Manual deployment remains available through `workflow_dispatch`. GitHub Pages uses Actions. The existing observation worker and R2 bucket are referenced for compatibility; no worker is deployed by this repository's workflows.

The [London Worker guide](docs/CLOUDFLARE.md) covers configuration, deployment and recorded-day export.

## National Rail

The optional National Rail layer covers domestic passenger rail across London and a four-kilometre fading fringe for Friday 4 September 2026: **8,362 timetable journeys, 300 active stations and all 11 railway families**. Berrylands is searchable with its dated closure notice. TfL services remain in their existing layer, without duplication.

Every catalogue station has arrivals/departures boards and its own pulse, combining all relevant operators with TfL. Boards, pulses and the map share the morning/full-day clock. Search works by station name, CRS code, operator and service identifier; selecting a service reveals its board and movement. Loops retain repeated station visits; passing, staff and operating points do not become passenger calls. Pickup-only, set-down-only and terminal flows are respected.

The pipeline reconciles 31 Network Rail working-timetable spreadsheets by service UID and originating date, including midnight continuations. Public passenger timetables restore 1,051 omitted calls at Waterloo East, Brent Cross West and Lea Bridge. Connected OpenStreetMap geometry follows the timed route and fades beyond the GLA boundary. The catalogue, per-family data, board and renderer load on demand; failed families can retry independently.

Run `npm run data:london:national-rail` to rebuild from cached/public sources. Python 3 and Poppler’s `pdftotext` are required; `RAIL_CACHE` overrides `/tmp/allchange-rail-complete`. The build stages the resulting `network-*.json` files. The [rail completion record](docs/RAIL-COMPLETION.md) describes coverage, source audits, validation and the reproducible pipeline.

This is a published timetable study with interpolated movement. Live Darwin data, temporary alterations, freight, empty stock and international Eurostar are outside this phase. A later server-side Darwin adapter can use the retained CRS, UID and originating-date identities.

## Provenance

Extracted from [Gleislicht bdb1f3a](https://github.com/emmettl/gleislicht/commit/bdb1f3a48db1cc6ec0bcf3858765004ee7e6d147), retaining Git history for the selected London paths via a path-filtered fast export/import. The extraction narrows the catalogue and uses a root HTML entry; the edition now consumes published npm packages. The previous Gleislicht-hosted London URL redirects to the independent site.

## Local validation

Unit and browser checks cover bus timetable/day selection, platform aliases, alternative route geometry, compact chunk round trips, exact route search, night services and recovery from damaged downloads. The bus catalogue is loaded separately; the opening transfer remains below the existing 650 KiB budget. The 670 active Friday bus routes use a 1,839.4 KiB manifest and at most 428.1 KiB per two-hour chunk (gzip), with an explicit audit of the two routes without Friday timetables and unavailable directional origins.

## Standard selection labels

The shared `@motionstudies/three` alpha.4 renderer gives the selected station first label priority, then the selected route’s terminals (including branch endpoints), then intermediate stops. Selecting a service uses its own endpoints. Clearing selection restores normal station ranking. The rule applies to map clicks and search/picker selection in both geographic and diagram layouts. See the [Motion Studies edition contract](https://github.com/emmettl/motionstudies/blob/main/docs/EDITIONS.md#selection-and-station-labels).

### Airport movement boards

Airport selections use the shared `AirportHeroCard` from `@motionstudies/web` 0.1.0-alpha.5. Departures/arrivals follow the study clock, looking 10 minutes behind and 60 minutes ahead within the active study window. Loading and empty messages use the split-flap columns; new rows settle in 675 ms with staggered characters.

The 4 September 2026 air fixtures include optional origin/destination evidence from cached global ADSB.lol heatmaps and the public-domain [OurAirports reference](https://ourairports.com/data/). These are inferred observed movements, not schedules or confirmed flight plans. Unknown routes remain blank. Full-day manifest entries and playback chunks carry the same evidence; metadata records the input hashes, reference source, and local UTC offset (1 hours for this service date).

After ingesting the base air study, regenerate the enrichment with `npm run data:air:routes -- /path/to/cached-heatmaps /path/to/airports.csv`. Supply heatmaps covering the same local service day and a saved OurAirports `airports.csv`; the command performs no network calls. Raw source files remain outside the repository.

### Station departure boards

Selecting a TfL station in the planned study opens a lazy split-flap board in its status card. Departures and arrivals follow the study clock, show up to four calls over the next hour, and stop at the loaded timetable boundary. A line filter narrows busy interchanges; selecting a destination reveals the full name and a link to its movement. Supported interchanges also link to their pulse. The National Rail card uses the same widget, retaining its station picker, three-call list and movement controls.

The boards show published times, with source date and available window. They retain repeated station visits and respect origin/terminal, passing, pickup-only and set-down-only restrictions. Missing day data has a retry action; partial National Rail operator coverage is identified. TfL and National Rail remain separate board scopes in this first implementation. Combined operator boards, platforms and live prediction/status fields remain future work.

The board and its styles load on selection, with a separate dependency-inclusive transfer budget. Flap motion is suppressed during faster playback and respects reduced-motion preferences. Unit checks cover call semantics and bounded time filtering; browser checks cover station selection, filtering, movement, retry and phone layouts.

### Passenger rhythm

Bank/Monument and Stratford have a passenger-flow pulse with separate entering, leaving and changing streams. Choose **Explore passenger flow** from their cards or **People** in the pulse, compare 08:30 with 17:30, and switch stations without losing the clock. Dots encode typical 15-minute movements; they are schematic, not tracked paths or train occupancy. **Trains** returns to the scheduled-service pulse. Pause, scrubbing and reduced motion are supported.

Hero cards now expose 432 validated NUMBAT source areas matched to 440 station-name variants. A source-area selector separates places such as Canary Wharf and Paddington; unavailable interchange metrics are omitted. Tram placeholder rows are excluded. The catalogue and selected area's profile load on demand, with independent retry and transfer budgets.

Demand is a typical autumn Friday in 2025, distinct from the September 2026 timetable. The source day runs from Friday 05:00 to Saturday 05:00. Friday before 05:00 stays unavailable rather than borrowing Saturday's counts. See [the passenger-demand audit](docs/PASSENGER-DEMAND.md) for identities, aggregation, confidence, coverage and reproduction.

### Dismissing hero cards

The top-right × on station, pulse, National Rail and airport cards hides the card while preserving the selected place, map focus and playback. A compact details button restores it with its metric and board state intact. Selecting another place or selecting the same search result again opens its card. Close controls have a 44-pixel touch target; the existing Release, clear-search and Escape actions still clear selection.
