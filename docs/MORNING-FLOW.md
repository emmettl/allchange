# Where does the morning go?

The first authored directional passenger study follows the **Central line between St Paul’s and Leyton**, including Bank, Liverpool Street, Bethnal Green, Mile End and Stratford. Choose **People** in the study controls. The three chapters set and pause the shared clock at 07:30, 08:30 and 17:30; the normal timeline supports other times and playback. Geography and diagram use the existing matched tracks and preserve the selected source station and clock. Closing the study restores the transport map and its selected place.

## Evidence and interpretation

The pinned [official NUMBAT 2025 Friday workbook](https://crowding.data.tfl.gov.uk/NUMBAT/NUMBAT%202025/NBT25FRI_Outputs.xlsx) has SHA-256 `22eeb8fe2fd5ee2c974aaff81c7f3e114c53e39f46cd03c273c072974f5d9b5c`. It describes typical autumn 2025 demand, distinct from the September 2026 timetable. TfL estimates route choice from ticketing information. These are aggregate link loads; dots are neither tracked passengers nor individual train loads.

The compiler selects 12 `Link_Loads` rows, one in each direction on six adjacent station pairs. NLC, ASC and source station names must match the audited demand catalogue. All 96 quarter-hours reconcile to the published total before rounding to three decimal places. Every selected pair must have exactly one reverse link. No consecutive link totals are added as unique passengers or presented as complete origin–destination journeys.

At Stratford ↔ Mile End, the 08:30 interval contains approximately **2,169 westbound / 694 eastbound** movements; at 17:30 it contains **1,379 westbound / 2,591 eastbound**. These two independently published directional profiles support the morning/evening comparison.

The compiler also selects 28 `Station_Boarders` / `Station_Alighters` rows: two Central line (`CEN`) directional platform rows per metric at each of seven stations. IDs are unique within each sheet, identities match, and the full-day totals reconcile. Both directions are added only within the same metric, line and station. Boarding is not station entry; alighting is not station exit. Interchange estimates have lower source confidence.

One full mark represents approximately 250 movements per 15 minutes, with a fractional final mark preserving the remainder. The scale stays fixed across links, time and layout. Dot speed is schematic. Reduced motion fixes mark positions while allowing the clock and counts to update. Friday 00:00–05:00 remains outside this **directional Friday** artifact; the independently supported Thursday **station** profiles do not imply available Thursday directional loads.

## Geometry and delivery

Explicit NaPTAN stop IDs join the seven source areas to the existing Central line. Each directed adjacent pair must occur in a Central line timetable journey. The compiler records the selected path index and candidate path indices, verifies geographic and diagram endpoints, and verifies the diagram’s source-network hash. Each path is resampled at 33 positions for a continuous blend between the two layouts. Those shapes describe tracks; the movement marks remain illustrative demand marks.

`fixtures/morning-flow/audit.json` retains all 40 source row identities and totals, and the opening-network/diagram hashes. `study.json` is the only browser data artifact. The module and data load on demand, with retry after a failed download. The opening page requests neither. Limits: 8 KiB gzip JavaScript including optional static dependencies, 2 KiB CSS and 24 KiB data. Measured delivery is approximately 5.2 KiB JavaScript and 14.6 KiB data on Node 24; the original opening and night budgets remain enforced.

## Reproduction and validation

With the pinned workbook outside the repository:

```sh
npm run data:london:morning-flow -- /path/to/NBT25FRI_Outputs.xlsx
python3 -B scripts/test_compile_numbat.py
npm test
npm run build
npm run lint
npm run check:boundary
npm run check:bundle
npm exec playwright test e2e/morning-flow.spec.ts e2e/night-study.spec.ts e2e/passenger-demand.spec.ts e2e/passenger-pulse.spec.ts -- --workers=1
```

Unit checks cover all link totals, reverse directions, the measured peak reversal, invalid identities/profiles, traffic-day boundaries and fractional marks. Browser checks cover lazy loading, retry, chapter selection, the shared clock, pause/playback, reduced motion, station selection, geography/diagram continuity and mobile overflow. Physical-phone review and publication remain separate from local browser verification. Additional corridors remain future work.

Powered by TfL Open Data, under [TfL’s transport-data terms](https://tfl.gov.uk/corporate/terms-and-conditions/transport-data-service). No TfL endorsement is implied.
