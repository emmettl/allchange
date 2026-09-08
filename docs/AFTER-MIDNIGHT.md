# After midnight

The **After midnight** preset explores **Friday 4 September 2026, 00:00–05:00**: Thursday night into Friday morning. It does not represent Friday night into Saturday, and does not roll Saturday services back onto Friday.

The preset opens geography, enables TfL rail, National Rail and buses, pauses at 00:30 and bounds the shared clock to 05:00. Checkpoints at **00:30, 02:30 and 04:30** reveal the changing service mix. The night card includes a fixed checkpoint comparison, the published bus routes at each half-hour checkpoint, and guided selections at **Waterloo, Bank and Upminster**. Counts describe retained scheduled movements, not passengers or live operations. They describe all retained sources independently of subsequent map layer/selection filters. The existing map data loads progressively.

Station heroes add a rail departure summary: next retained departure, time until that call, previous retained departure when available, and the interval between retained calls. This small index can find a call beyond the currently downloaded two-hour map chunk. **Go to next departure** pauses the shared clock at a call inside the night view; calls after 05:00 are displayed as beyond the view, without an out-of-bounds seek. At 05:00 the night context stops. Morning and 24-hour controls leave the preset; selecting a rail service through global search returns to the full-day study. Cycle and observed-operation studies also leave night mode. Dismissal and station selection retain the night clock.

The night preset shows the separate National Rail card after an explicit rail selection, avoiding an unrelated default station card over the overview or selected TfL station on mobile. An explicitly selected rail card can still be dismissed and restored.

## Service-day audit

This increment audits the existing committed delivery artifacts; it does not claim newly complete overnight coverage or fetch a fresh timetable.

| Source | What is established | Limitation |
| --- | --- | --- |
| TfL buses | The compiler selects preceding Thursday schedules at a −86,400-second offset and Friday schedules at zero offset. Thursday Night 25:30 maps to Friday 01:30; Friday Night 25:30 remains Saturday 01:30, outside this view. | Recurring school-day timetable model, not actual operations. The bus manifest's existing branch exclusions still apply. |
| National Rail | WTT UIDs retain originating dates; the calendar-day layer includes 136 journeys already in progress at midnight. | Published timetable; live running and temporary alterations are not applied. |
| TfL rail | Existing recurring/PDF Friday timetable calls remain visible. The retained full-day chunks contain zero trains crossing in from negative time. | The preceding Thursday tail is **not fully established** by this compilation. Empty intervals and long gaps must not be presented as closed lines or proven absence of service. |
| Eurostar | The separate dated passenger board supplies published calls; movement coverage remains the audited subset. | Its first departures are beyond this 00:00–05:00 view. |
| Passenger demand | The retained NUMBAT Friday traffic day begins at Friday 05:00. | Thursday's tail is unavailable. Passenger charts are omitted in the night view; Saturday's tail is never wrapped into Friday morning. |

The initial audit finds **3,256 buses and 136 National Rail trains** crossing midnight from negative start times in the retained snapshots. These are modelled journeys, not observed vehicles. At 02:30, the retained data contains **567 moving buses on 123 routes**, **4 National Rail trains**, and **0 TfL rail services**. The TfL zero is always labelled partial coverage. The source audit and every input SHA-256 live in `fixtures/night/study.json`.

## Station scope and gap semantics

The compiler reads permitted passenger **departures** only: no passing points, final terminals or set-down-only calls. It preserves simultaneous calls and each retained visit. Profiles keep the last available call before midnight, calls within 00:00–05:00, and the first retained later call for each source stop. Runtime aggregation deduplicates repeated stop IDs, not unrelated services sharing a time.

Existing combined boards retain their explicit TfL and National Rail source IDs; Eurostar retains its separate UIC identity. Other TfL station cards use their source stop IDs; National Rail cards use the selected station's CRS or explicit stop ID. Three authored comparisons additionally aggregate these audited areas:

| Comparison | Source stop identities | Retained rail departures, 00:00–05:00 |
| --- | --- | --- |
| Waterloo | `940GZZLUWLO`, `crs:WAT` | 5 |
| Bank | `940GZZLUBNK`, `940GZZDLBNK` | 0 — partial TfL coverage |
| Upminster | `940GZZLUUPM`, `910GUPMNSTR`, `crs:UPM` | 8 |

Upminster's night context therefore includes District, Liberty and c2c sources even when its existing departure widget is scoped to TfL. This is an explicit night-summary aggregation, not a new combined-board join. Buses are separate from these rail station counts; nearby bus stops are not silently treated as interchange connections.

At 02:30, Bank's next retained call is 05:30 and Waterloo's is 05:05. These are the next calls in the retained source model, **not guaranteed waiting times**. TfL profiles carry the incomplete-tail caveat; no earlier retained call means the earlier endpoint of a gap is unknown. No later call in the calendar-day data means unavailable evidence, not a permanent closure. The preset makes no door-to-door reachability or connection guarantee.

## Delivery and checks

`npm run data:london:night` rebuilds the optional artifact from committed TfL rail/day chunks, compact bus chunks, domestic rail families and the Eurostar passenger board. Chunk sizes and hashes are verified; source dates must agree. `node scripts/compile-london-night.mjs --check` verifies exact reproduction. The build stages `all-change-night-study.json`; the opening page does not request it. Runtime validation rejects a wrong date, broken profiles or malformed checkpoints. Consumers share the download and its successful cache, with independent retry on failure.

The optional view is bounded by **4 KiB JS / 1 KiB CSS / 28 KiB data** gzip. Its data currently uses **21.8 KiB**. Existing opening, station-board and combined-board caps remain unchanged. Run checks with Node 24:

```sh
npm test
npm run build
npm run lint
npm run check:boundary
npm run check:bundle
npm exec playwright test e2e/night-study.spec.ts e2e/combined-station-board.spec.ts e2e/eurostar.spec.ts -- --workers=1
```

Unit checks cover exact source reproduction, Thursday/Friday Night semantics, carry-in, passenger-call restrictions, authored comparison totals, simultaneous departures, chunk-independent next calls, unavailable coverage and time boundaries. Browser checks cover the preset, clock bounds, layer activation, checkpoints, guided comparisons, seeking, dismissal, source failure/retry, leaving night mode and narrow-card behavior on desktop Chromium and emulated iPhone WebKit.

Remaining work: establish the preceding Thursday TfL rail tail from retained or freshly audited sources before claiming complete overnight rail gaps; acquire Thursday NUMBAT demand for early Friday; separately audit Friday-night/Saturday coverage; physical-phone review. Those coverage gaps remain open roadmap items.
