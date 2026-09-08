# Combined interchange boards

Stratford, Liverpool Street and Clapham Junction now show one **TfL + National Rail** timetable, whether entered through a TfL station hero or the National Rail station picker. The existing split-flap board retains arrivals/departures, line/service filtering, selection, the shared study clock, movement seeking, pulse links and hero dismissal. Selecting a TfL station suppresses the separate National Rail card while its combined board is visible.

## Audited identities

The join is explicit in `src/editions/london-board-interchanges.ts`. It uses retained source identifiers, not fuzzy names or proximity. Name aliases resolve the selected interchange; call extraction then uses these exact stop IDs.

| Interchange | TfL identities | National Rail | Required rail families |
| --- | --- | --- | --- |
| Stratford | `940GZZLUSTD`, `940GZZDLSTD`, `910GSTFD` | `crs:SRA` | Liverpool Street |
| Liverpool Street | `940GZZLULVT`, `910GLIVSTLL`, `910GLIVST` | `crs:LST` | Liverpool Street |
| Clapham Junction | `910GCLPHMJC`, `910GCLPHMJ1` | `crs:CLJ` | Waterloo, Southern |

Stratford’s `Stratford` and `Stratford (London)` names resolve to the same board. Stratford International and Stratford High Street remain separate. Liverpool Street includes both `Liverpool Street` and `London Liverpool Street`; it does not expand to adjacent stations. These boards combine station areas, not platforms: visitors must allow time to transfer, and the study does not promise a connection.

Both sources describe **4 September 2026**. TfL calls come from the existing recurring/public-PDF timetable composition; National Rail calls come from the retained passenger WTT/eNRT compilation. The [rail completion record](RAIL-COMPLETION.md) documents service identity, source reconciliation and exclusions. No new live feed or passenger observations are introduced.

Full-day permitted calls in `[00:00, 24:00)`, reconciled independently against the retained fixtures:

| Interchange | TfL arrivals | TfL departures | National Rail arrivals | National Rail departures |
| --- | ---: | ---: | ---: | ---: |
| Stratford | 1,280 | 1,795 | 379 | 336 |
| Liverpool Street | 1,794 | 1,831 | 338 | 336 |
| Clapham Junction | 80 | 79 | 1,690 | 1,805 |

These are scheduled passenger call events in the included sources, not people, unique journeys or observed movements. A train may supply both an arrival and a departure. Totals inherit source exclusions and the TfL timetable model; they are not a claim of complete real-world service.

## Duplicates and service selection

TfL owns Tube, DLR, Tram, Elizabeth line and Overground calls; the National Rail compiler already excludes TfL-operated services. The combined board enforces that split. It deduplicates exact source/service/visit identities, preserving the originating-date information in National Rail service IDs and the ordinal of each visit. Matching time, destination or station name is not sufficient to collapse two calls.

Passing points and visits that permit neither boarding nor alighting are excluded from both rows and line filters. Terminal, pickup-only and set-down-only restrictions still apply separately to departures and arrivals. Changing board direction cannot expose a forbidden movement through an old selected row.

Each call retains its source-local train and visit index. TfL selection resolves the service ID into the active map snapshot; National Rail selection uses its rail service ID. **Show movement** pauses at the selected arrival or departure time, enables the relevant layer and, for National Rail, switches to geography. The rail card collapses so the movement remains visible. The two sources are not geometrically merged merely to build the board.

## Loading and time coverage

The board is lazy. Selecting a supported TfL interchange requests its required National Rail families through the existing cache. Global service search and the National Rail layer retain their existing broader prefetch behavior. Opening the app does not load the combined board or its rail data.

Each source reports its loaded time range. The board covers the next hour, bounded by the study window; each call is additionally clipped to its own source range. In the full-day study at 07:45, for example, the current TfL chunk may stop at 08:00 while National Rail can supply calls through 08:45. The board explicitly marks that TfL coverage as partial. It never treats an unloaded interval as evidence of no service.

TfL download failures do not clear available National Rail calls. A failed National Rail family does not clear TfL or another loaded family. Retry controls recover each source independently; successful rail families stay cached. At 24:00, rows are empty and the board shows the study boundary. Calls belonging to other source dates are not combined, and times do not wrap to the next day.

## Validation and remaining work

Unit checks reconcile every permitted source call at all three interchanges, verify catalogue identities, preserve repeated visits and same-time services, reject the wrong source date, enforce source ownership, and test independent chunk boundaries. Browser checks cover both entry points, both movement renderers, reduced motion, independent failure/retry, partial operator coverage, the day boundary, existing station boards and passenger cards on desktop Chromium and iPhone WebKit.

The combined board has a 6 KiB JavaScript / 3 KiB CSS gzip limit including its optional widget dependencies. The opening limit remains 344 KiB. Validate with Node 24, as CI does:

```sh
npm test
npm run build
npm run check:bundle
npm exec playwright test e2e/combined-station-board.spec.ts e2e/station-board.spec.ts e2e/passenger-demand.spec.ts -- --workers=1
```

Other stations retain their existing separate timetable scopes until their source identities and coverage are verified. Physical-device and shared widget-lab review remain outstanding. Platforms, live predictions, cancellations and freshness require their own supported sources.
