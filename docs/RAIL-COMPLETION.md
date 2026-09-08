# London passenger rail completion

The timetable layer is complete for the study’s defined scope: domestic passenger National Rail across Greater London and its four-kilometre fading fringe, on Friday 4 September 2026. TfL services remain in the existing TfL layer. This is a published timetable study, with interpolated movement; it does not represent live running, temporary alterations, freight, empty stock or international Eurostar within the domestic scope. The separate [Eurostar increment](EUROSTAR.md) adds 55 published calls and 40 reconciled London movements, with explicit limits.

## Coverage

- 8,362 timetable journeys across 11 independently loaded families.
- 300 active stations, plus a searchable Berrylands closure entry. Network Rail’s passenger table 161 explicitly closes Berrylands until 20 September for improvement works.
- Great Western and Heathrow Express; South Western branches; Great Northern and East Coast; Thameslink; Southern and Gatwick Express; Southeastern suburban and high speed; Greater Anglia; West Coast; Chiltern; c2c; East Midlands.
- Shared station boards and pulses combine every relevant family, including London Bridge, Victoria and Clapham Junction. Every catalogue station has a pulse. Names, CRS station codes, operators and train identifiers are searchable.
- Loop journeys retain both visits. Passenger, passing, staff, operating, pickup-only and set-down-only activities are distinguished. Terminus pulses show only their real arrival or departure side. The morning and full-day views share the clock without repeating bounded rail calls.

## Evidence and safeguards

`fixtures/national-rail/coverage.json` records family counts, source hashes, station coverage, duplicate schedule identities, public-call reconciliation and exceptions. The independent station audit accounts for every London station in the geometry inventory through this layer, its dated closure, or the existing TfL service family. All 144 unmatched WTT passenger-location names are outside the mapped study extent.

31 Network Rail WTT spreadsheets are reconciled by UID and originating date, retaining Thursday-to-Friday and Friday-to-Saturday continuations. Four identical published movements under alternative UIDs are consolidated; distinct published service identities remain distinct. The WTT export omits some passenger station rows: 1,051 calls at Waterloo East, Brent Cross West and Lea Bridge are recovered from public eNRT tables, matched against surrounding timed calls. The 11 unmatched public-table columns are explicitly audited as Monday-only or Wednesday/Thursday-only services. No ambiguous public-call match remains.

Connected OpenStreetMap railway geometry follows the published sequence of timing points. Short station-anchor connectors join platform locations to the graph; individual operational tracks are not resolved. Every journey has continuous geometry, monotonic timing and a mapped terminus or continuation beyond the fading fringe. The final audit has no unresolved station, geometry or timing failures. No mapped segment requires an interpolated speed above 310 km/h.

## Rebuilding

Run `npm run data:london:national-rail`. It downloads public sources into `/tmp/allchange-rail-complete`, reuses cached inputs, extracts weekday/Saturday XLSX grids with standard-library Python, extracts the public PDFs with Poppler’s `pdftotext`, reconciles the timetable, routes the journeys and writes the fixtures. Set `RAIL_CACHE` to use another cache directory. Node, Python 3 and `pdftotext` are required; no credentials are needed.

`scripts/london-rail-sources.json` contains the exact archive members, public PDF URLs and Overpass queries. Source failures stop compilation. Rebuilding from the same cached inputs produces identical output hashes. `npm run data:london:national-rail:compile` reruns compilation with prepared inputs. `npm run build` stages the optional catalogue and family files into `public/data`.

The original Paddington, Waterloo and King’s Cross proof fixtures and their focused tests remain as regression references. The application serves the complete `network-*.json` family artifacts.

## Validation

- Full unit suite, plus `python3 scripts/rail_pipeline_test.py` for calendar, half-minute, terminal-header and overlapping-dwell reconciliation.
- Desktop Chromium and iPhone WebKit rail tests: independent loading/retries, shared clocks, all gateway families, branch boards/pulses and hidden-layer search.
- Production build, lint and package-boundary checks.
- Opening transfer budget remains 340 KiB gzip JavaScript and 650 KiB total. The rail board and renderer are lazy; the catalogue and all family data are optional downloads with independent limits.
- `node scripts/profile-london-frames.mjs --rail --url http://127.0.0.1:4179 --headless` measures the opening scene, complete rail overlay and London Bridge pulse. At 1440 × 1000 and DPR 1, the software-rendered SwiftShader run measured 25.6 fps before rail and 25.1 fps with the complete overlay; scripting increased from 1.01 to 1.84 ms per frame. The London Bridge pulse measured 56.1 fps. These are comparative software-renderer measurements, not a hardware frame-rate guarantee.

## Later: Darwin

The next phase is live data, using the user’s Rail Data Marketplace account. The existing CRS identities, source UID and originating date provide the matching keys for a server-side adapter. Preserve the timetable separately from estimates, actuals, cancellation/platform information and freshness status; apply live changes to both map movements and station pulses. Credentials belong on the server. Product access, API entitlement and the chosen Darwin feed can be handled when that phase starts.
