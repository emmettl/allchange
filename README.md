# All Change

**[Open All Change](https://emmettl.github.io/allchange/)** · [Motion Studies catalogue](https://emmettl.github.io/motionstudies/)

[Study brief](https://github.com/emmettl/motionstudies/blob/main/docs/LONDON.md) · [Project goals](https://github.com/emmettl/motionstudies/blob/main/docs/VISION.md) · [Roadmap](https://github.com/emmettl/motionstudies/blob/main/ROADMAP.md)

London, geographically and otherwise. Motion Studies 006.

This is the independent London edition. It owns the London application, styles, timetable and geography fixtures, source-specific ingestion commands, observation worker and browser/payload checks. Shared runtime and Node tooling come from [Motion Studies](https://github.com/emmettl/motionstudies).

## Run and check

Use Node 24 LTS (`nvm use`) and npm 11.19.0, then `npm ci` and `npm run dev`. The app is served at the root. `npm run build` stages only London artifacts and builds a single entry point.

Run `npm test`, `npm run typecheck`, `npm run lint`, `npm run check:boundary`, `npm run build` and `npm run check:bundle`. Install browser engines with `npx playwright install chromium webkit`, then run `npm run test:e2e:ci`. `npm run worker:check` and `npm run worker:build` validate the existing London observation adapter without deploying it.

To investigate desktop frame budgets, build and start `npm run preview -- --port 4177 --strictPort`, then run `npm run profile:frames -- --channel msedge --output edge-frames.local` in another terminal on the affected Windows machine. Edge must be installed. The diagnostic opens a separate browser session and measures the opening map, open search, a selected result, and the diagram. Keep its window in the foreground. Set `--width`, `--height`, and `--dpr` to match the CSS viewport and Windows scaling (defaults: 1920×1080 at 150%); `--fps` sets the target refresh rate (default: 60). The JSON includes the actual graphics renderer, canvas resolution, frame percentiles, missed-frame indicators, and main-thread timings. Frame intervals measure callback cadence, not GPU execution time; compare the same hardware and settings before and after a change. `--headless` is available for smoke checks, but a software renderer is not a Windows GPU benchmark.

## Package boundary

The four `@motionstudies` dependencies pin the coordinated npm release `0.1.0-alpha.2`. The committed lockfile records registry URLs and integrity hashes. There are no shared source directories, workspace links, vendored packages, or sibling-repository imports here. `check:boundary` verifies the installed release versions and registry lock entries, rejects source links, and checks that imports use declared public exports.

## Diagram layout

The diagram uses the authored station anchors and corridor sequences in `fixtures/tfl/all-change-diagram-overrides.json`. Run `npm run data:london:diagram` after editing them. Intermediate stations divide continuous horizontal, vertical and 45-degree runs; the compiler preserves source stop and path identities and rejects unplaced stations. Geometry checks cover path endpoints, unrelated station collisions and TfL-relative central orientation.

`LondonDiagramStations` supplies perpendicular line-coloured ticks for ordinary stops and rings for interchanges and branches. Shared-track Tube stops retain ticks; changes between transport modes use rings. The pinned `@motionstudies/three` alpha.2 release has no marker extension point, so `scripts/london-diagram-renderer.ts` applies a narrow Vite transform for these markers, consistent parallel lanes, track width and double-sided track surfaces. It leaves the installed package untouched and fails when expected renderer hooks change; review this adapter when upgrading the renderer, and replace it with a public extension point when available.

## Data and hosting

`fixtures/tfl/` retains the authored TfL timetable, transport catalogues and map layout; `public/data/` contains the committed air and road observations. Existing `data:london:*` commands retain their explicit source dates and provenance. Use them deliberately to refresh data; CI builds the reviewed fixtures. PDF timetable ingestion requires `pdftotext` on the host.

Pull requests run the edition checks and upload a preview artifact. Every push to `main` runs `Deploy Pages`, which calls the same checks and publishes their build to https://emmettl.github.io/allchange/ only after they pass. Manual deployment remains available through `workflow_dispatch`. GitHub Pages uses Actions. The existing observation worker and R2 bucket are referenced for compatibility; no worker is deployed by this repository's workflows.

The [London Worker guide](docs/CLOUDFLARE.md) covers configuration, deployment and recorded-day export.

## Provenance

Extracted from [Gleislicht bdb1f3a](https://github.com/emmettl/gleislicht/commit/bdb1f3a48db1cc6ec0bcf3858765004ee7e6d147), retaining Git history for the selected London paths via a path-filtered fast export/import. The extraction narrows the catalogue and uses a root HTML entry; the edition now consumes published npm packages. The previous Gleislicht-hosted London URL redirects to the independent site.

## Local validation

51 unit/script tests and 29 browser checks, with one expected platform skip. Installed-package boundary, typechecks, lint, production build, payload gates and worker typecheck/dry-run pass. Opening transfer is 532.8 KiB against a 650 KiB budget. These are local Chromium/WebKit results; GitHub-hosted CI is a separate check.
