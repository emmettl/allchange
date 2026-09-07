# All Change

London, geographically and otherwise. Motion Studies 006.

This is the independent edition extraction rehearsal. It owns the London application, styles, timetable and geography fixtures, source-specific ingestion commands, observation worker and browser/payload checks. Shared runtime and Node tooling come from [Motion Studies](https://github.com/emmettl/motionstudies).

## Run and check

Use Node 22.12 or newer, then `npm ci` and `npm run dev`. The app is served at the root. `npm run build` stages only London artifacts and builds a single entry point.

Run `npm test`, `npm run typecheck`, `npm run lint`, `npm run check:boundary`, `npm run build` and `npm run check:bundle`. Install browser engines with `npx playwright install chromium webkit`, then run `npm run test:e2e:ci`. `npm run worker:check` and `npm run worker:build` validate the existing London observation adapter without deploying it.

## Package boundary

The four `@motionstudies` dependencies are exact compiled candidate tarballs in `vendor/`, installed by the committed lockfile. There are no shared source directories, workspace links, or sibling-repository imports here. `vendor/manifest.json` records source provenance and SHA-256 hashes; `check:boundary` verifies them and rejects source leaks.

These private `0.0.0` candidates let the independent build be exercised before registry/licensing decisions. Replace the four file dependencies with exact npm prerelease versions once Motion Studies publication is configured. They are not npm releases.

## Data and hosting

`fixtures/tfl/` retains the authored TfL timetable, transport catalogues and map layout; `public/data/` contains the committed air and road observations. Existing `data:london:*` commands retain their explicit source dates and provenance. Use them deliberately to refresh data; CI builds the reviewed fixtures. PDF timetable ingestion requires `pdftotext` on the host.

CI checks and uploads a preview artifact. Pages deployment is manual (`Deploy Pages`) so creation of this repository does not cut over the existing edition. Configure GitHub Pages to use Actions before deploying. The existing observation worker and R2 bucket are referenced for compatibility; no worker is deployed by this repository's workflows. Update catalogue links only after the new site passes its publication check.

## Provenance

Extracted from [Gleislicht bdb1f3a](https://github.com/emmettl/gleislicht/commit/bdb1f3a48db1cc6ec0bcf3858765004ee7e6d147), retaining Git history for the selected London paths via a path-filtered fast export/import. Bootstrap changes narrow the catalogue, use a root HTML entry and replace shared source imports with packed dependencies. The existing Gleislicht-hosted edition remains available during the rehearsal.

## Local validation

51 unit/script tests and 29 browser checks, with one expected platform skip. Installed-package boundary, typechecks, lint, production build, payload gates and worker typecheck/dry-run pass. Opening transfer is 532.8 KiB against a 650 KiB budget. These are local Chromium/WebKit results; GitHub-hosted CI is a separate check.
