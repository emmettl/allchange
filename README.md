# All Change

**[Open All Change](https://emmettl.github.io/allchange/)** · [Motion Studies catalogue](https://emmettl.github.io/motionstudies/)

[Study brief](https://github.com/emmettl/motionstudies/blob/main/docs/LONDON.md) · [Project goals](https://github.com/emmettl/motionstudies/blob/main/docs/VISION.md) · [Roadmap](https://github.com/emmettl/motionstudies/blob/main/ROADMAP.md)

London, geographically and otherwise. Motion Studies 006.

This is the independent London edition. It owns the London application, styles, timetable and geography fixtures, source-specific ingestion commands, observation worker and browser/payload checks. Shared runtime and Node tooling come from [Motion Studies](https://github.com/emmettl/motionstudies).

## Run and check

Use Node 24 LTS (`nvm use`) and npm 11.19.0, then `npm ci` and `npm run dev`. The app is served at the root. `npm run build` stages only London artifacts and builds a single entry point.

Run `npm test`, `npm run typecheck`, `npm run lint`, `npm run check:boundary`, `npm run build` and `npm run check:bundle`. Install browser engines with `npx playwright install chromium webkit`, then run `npm run test:e2e:ci`. `npm run worker:check` and `npm run worker:build` validate the existing London observation adapter without deploying it.

To investigate desktop frame budgets, build and start `npm run preview -- --port 4177 --strictPort`, then run `npm run profile:frames -- --channel msedge --output edge-frames.local` in another terminal on the affected Windows machine. Edge must be installed. The diagnostic opens a separate browser session and measures the opening map, open search, a selected result, and the diagram. Keep its window in the foreground. Set `--width`, `--height`, and `--dpr` to match the CSS viewport and Windows scaling (defaults: 1920×1080 at 150%); `--fps` sets the target refresh rate (default: 60). The JSON includes the actual graphics renderer, canvas resolution, frame percentiles, missed-frame indicators, and main-thread timings. Frame intervals measure callback cadence, not GPU execution time; compare the same hardware and settings before and after a change. `--headless` is available for smoke checks, but a software renderer is not a Windows GPU benchmark.

Use `--buses` to measure the opening map, all London buses, and selected route 26. `--cpu-throttle 4` simulates a slower CPU; `--angle metal` enables hardware rendering for headless Chromium on macOS. Reports include script milliseconds per frame and the renderer actually used. The bus motion adapter uses binary timetable lookup, a bounded cache of exact motion between road vertices, reused label collation, and uploads only the populated part of vehicle/trail buffers. All buses, road vertices and trail samples are retained. Compatibility and interpolation tests cover package adapters, arrivals, dwell, reversed paths, scrubbing and projection changes.

## Package boundary

The four `@motionstudies` dependencies pin the coordinated npm release `0.1.0-alpha.2`. The committed lockfile records registry URLs and integrity hashes. There are no shared source directories, workspace links, vendored packages, or sibling-repository imports here. `check:boundary` verifies the installed release versions and registry lock entries, rejects source links, and checks that imports use declared public exports.

## Diagram layout

The diagram uses the authored station anchors and corridor sequences in `fixtures/tfl/all-change-diagram-overrides.json`. Run `npm run data:london:diagram` after editing them. Intermediate stations divide continuous horizontal, vertical and 45-degree runs; the compiler preserves source stop and path identities and rejects unplaced stations. Geometry checks cover path endpoints, unrelated station collisions and TfL-relative central orientation.

Elizabeth line corridors carry a route name so timetable links that skip stops follow the complete authored railway through intermediate stations and branch junctions. Both directions reuse the same track geometry instead of drawing shortcuts between calls.

`LondonDiagramStations` supplies perpendicular line-coloured ticks for ordinary stops and rings for interchanges and branches. Shared-track Tube stops retain ticks; changes between transport modes use rings. The pinned `@motionstudies/three` alpha.2 release has no marker extension point, so `scripts/london-diagram-renderer.ts` applies a narrow Vite transform for these markers, consistent parallel lanes, track width, double-sided track surfaces and visibility of fully faded layers. The diagram stops submitting invisible geographic boundaries, water, traffic and station geometry while keeping their resources mounted for the return transition. It leaves the installed package untouched and fails when expected renderer hooks change; review this adapter when upgrading the renderer, and replace it with a public extension point when available.

## Data and hosting

`fixtures/tfl/` retains the authored TfL timetable, transport catalogues and map layout; `public/data/` contains the committed air and road observations. Existing `data:london:*` commands retain their explicit source dates and provenance. Use them deliberately to refresh data; CI builds the reviewed fixtures. PDF timetable ingestion requires `pdftotext` on the host.

The Bus layer discovers the entire TfL bus catalogue, including numbered, local, school, night and Superloop routes. `npm run data:london:bus` fetches each advertised branch origin, writes an explicit per-route coverage audit in the bus manifest, and emits twelve compact two-hour chunks. The initial page does not request bus data. Repeated journeys share relative stop-time/path patterns on disk; the browser verifies each chunk's size and SHA-256, expands only the current chunk, and retains at most its neighbouring compact chunks.

The default study remains Friday 4 September 2026 to match the rail layers. It selects school-day timetables and includes the preceding Thursday's after-midnight tail; a route with only a non-school variant is flagged in the audit. Unavailable or inactive origins are recorded rather than filled with invented services. This is recurring timetable interpolation, not observed bus telemetry or a claim that every vehicle actually ran that day. The importer uses TfL route stop IDs and aligns occasional timetable platform aliases only when their TfL stop areas and the surrounding ordered branch agree.

A full refresh can take a while under TfL's public request limit. Raw responses are cached under `/tmp/allchange-tfl-bus-YYYY-MM-DD`; use `--cache <directory>` to resume a particular download or a new directory for a fresh source capture. Optional `TFL_API_KEY` stays on the compiler host. `--service-date`, `--retrieved-at` and `--non-school-days` make alternate studies explicit; keep the service date aligned with the other layers when replacing the app fixture. CI uses the checked-in manifest and chunks and makes no TfL requests.

Pull requests run the edition checks and upload a preview artifact. Every push to `main` runs `Deploy Pages`, which calls the same checks and publishes their build to https://emmettl.github.io/allchange/ only after they pass. Manual deployment remains available through `workflow_dispatch`. GitHub Pages uses Actions. The existing observation worker and R2 bucket are referenced for compatibility; no worker is deployed by this repository's workflows.

The [London Worker guide](docs/CLOUDFLARE.md) covers configuration, deployment and recorded-day export.

## National Rail corridor proof

The optional **National Rail** layer adds GWR services on the Paddington–Reading corridor, with a Paddington arrivals/departures board. It shares the morning and full-day playback clocks. Selecting a board entry highlights the service; **Show movement** seeks to its departure or approach. The board can be collapsed to leave the map clear, and starts collapsed on mobile. This geographic layer is unavailable in the diagram and switches off when entering observed operations.

The **Paddington pulse** includes GWR arrivals and departures alongside Tube and Elizabeth line calls, whether or not the map layer is enabled. Calls share the selected morning/full-day clock and radial/orbital lenses. Terminal arrivals end at the hub and departures begin there; the pulse does not invent a return movement. Entering Pulse from the enabled National Rail map layer opens Paddington. Other hubs retain their existing coverage.

`npm run data:london:national-rail` compiles GWR’s published May–December 2026 TS and T10 PDFs for Friday 4 September. It requires `pdftotext`; `node scripts/compile-national-rail.mjs --cache <directory>` reuses `TS.pdf` and `T10.pdf`. PDF word coordinates preserve the original columns. Source hashes, page/block/column references, weekday/date exceptions and exclusions are retained in `fixtures/national-rail/paddington.json`. T10’s intermediate calls take precedence over duplicate TS entries. The artifact loads when its map layer is enabled or a matching pulse is opened, and is staged by the normal build.

This is a bounded timetable proof, not complete National Rail coverage or recorded operation. Services without paired Paddington/Reading timings, connecting alternatives and services outside the calendar window are excluded explicitly. Engineering alterations are not applied. Arrivals are described as **via Reading**, since the source corridor table does not establish every train’s full origin. Published onward destinations are retained where available. Departure-only intermediate calls have no invented dwell.

Geometry reuses connected Elizabeth line railway corridors from the reviewed TfL fixture, including Paddington’s mainline stop, rather than resolving individual fast/slow tracks. Times interpolate along those paths. Trains, trails and the new track overlay remain visible inside the GLA polygon and smoothly fade through a four-kilometre outer fringe. Fade samples are prepared at intervals of at most 100 metres; playback does not scan the boundary polygon per frame. The optional overlay uses the existing map projection without extending the camera bounds. A guarded Vite scene-slot adapter leaves the installed shared renderer untouched.

## Provenance

Extracted from [Gleislicht bdb1f3a](https://github.com/emmettl/gleislicht/commit/bdb1f3a48db1cc6ec0bcf3858765004ee7e6d147), retaining Git history for the selected London paths via a path-filtered fast export/import. The extraction narrows the catalogue and uses a root HTML entry; the edition now consumes published npm packages. The previous Gleislicht-hosted London URL redirects to the independent site.

## Local validation

Unit and browser checks cover bus timetable/day selection, platform aliases, alternative route geometry, compact chunk round trips, exact route search, night services and recovery from damaged downloads. The bus catalogue is loaded separately; the opening transfer remains below the existing 650 KiB budget. The 670 active Friday bus routes use a 1,839.4 KiB manifest and at most 428.1 KiB per two-hour chunk (gzip), with an explicit audit of the two routes without Friday timetables and unavailable directional origins.
