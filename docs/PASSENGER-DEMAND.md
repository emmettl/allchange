# NUMBAT passenger-demand pilot

Bank/Monument and Stratford now have 15-minute entry, exit and interchange profiles on their station hero cards and in the station pulse. The marker follows the planned study clock. The profiles describe typical passenger demand; the moving vehicles and departure boards continue to represent the September 2026 timetable. No train occupancy, congestion, capacity or unique-visitor count is inferred.

## Source audit — 8 September 2026

The latest folder in the [official TfL demand archive](https://crowding.data.tfl.gov.uk/) is NUMBAT 2025. Its [Friday workbook](https://crowding.data.tfl.gov.uk/NUMBAT/NUMBAT%202025/NBT25FRI_Outputs.xlsx) was published on 10 August 2026 (S3 LastModified), is 12,479,228 bytes, and was retrieved on 8 September 2026. The workbook cover is dated 1 July 2026. Its SHA-256 is `22eeb8fe2fd5ee2c974aaff81c7f3e114c53e39f46cd03c273c072974f5d9b5c`.

NUMBAT also supplies Monday, Tuesday–Thursday, Saturday and Sunday releases. Friday matches the study's day type, but the years differ: demand is a typical autumn Friday in 2025, while the timetable is Friday 4 September 2026. These are comparative layers, not measurements of one actual day. TfL describes the source and its coverage on the [open-data page](https://tfl.gov.uk/info-for/open-data-users/our-open-data); the workbook cover supplies the current methodology and confidence notes.

| App selection | NLC / ASC | Source station | Entries row | Exits row | Internal interchange links |
| --- | --- | --- | --- | --- | --- |
| Bank, Monument | 513 / BNKu | Bank and Monument | 25 | 25 | 49 |
| Stratford, Stratford (London) | 719 / SFDu | Stratford | 386 | 386 | 126 |

The source sheets are `Station_Entries`, `Station_Exits` and `Station_Flows`. Both entry/exit rows are unique by NLC, with ASC and name checked as additional controls. Stratford High Street and Stratford International are separate identities and receive no pilot profile.

### Aggregation and uncertainty

Entries and exits use the published station totals directly. Their 96 interval cells begin in column L and reconcile to column E (`Total`). They are based on gateline/ticketing information and TfL assigns them higher confidence than interchange estimates.

Interchanges sum only rows labelled `Alight-Interchange-Board` whose **from and to NLC/ASC both match the selected station**. The 96 interval cells start in column S and reconcile to column L (`Total`). Each directed link is included once. Repeated link IDs fail compilation. Entry/boarding, alighting/exit and out-of-station interchange rows are excluded from this measure.

Bank's `Complex NLC = 513` also groups Cannon Street LU, Cannon Street NR and Mansion House. Aggregating that field alone would overcount Bank. Restricting both station endpoints avoids this; Bank still includes Monument, as the source explicitly combines them. Stratford's model includes links to National Rail; TfL cautions that flows involving non-TfL services have lower confidence. “Changing” is a count of modelled interchange movements, not distinct people or simultaneous platform occupancy.

| Typical traffic-day movements | Bank and Monument | Stratford |
| --- | ---: | ---: |
| Entries | 49,893.338 | 84,316.663 |
| Exits | 51,329.585 | 86,358.112 |
| Internal interchanges | 101,135.801 | 154,881.998 |

These columns must not be added to claim unique passengers. The compiler preserves three decimal places in the compact artifact; the interface shows approximate whole people and labels the measure. The audit artifact retains the original totals and every selected interchange link, including worksheet row and endpoint descriptions.

### Traffic-day alignment

The workbook has 96 intervals, Friday 05:00 through Saturday 05:00, not midnight through midnight. The compiler checks every header in sequence and reconciles every selected row's interval sum to its published total before rounding. Blank, erroneous, non-finite and negative cells fail; a published zero remains zero.

The chart retains the full traffic day and shades its Saturday tail. Its current marker is only defined for study times from 05:00 inclusive to 24:00 exclusive. Friday 00:00–05:00 has no matching profile in this pilot; it would need the preceding Thursday traffic-day tail. The end-of-study 24:00 sentinel also has no marker. Neither case wraps onto another day. Selecting Entering, Leaving or Changing switches the chart; each has its own vertical scale and a numeric peak. Scrubbing the existing clock moves the marker without altering the demand data or weighting the train animation.

## Reproduction and checks

Download the linked workbook outside the repository, then run from the project root:

```sh
python3 -B scripts/compile-numbat.py /path/to/NBT25FRI_Outputs.xlsx
python3 -B scripts/test_compile_numbat.py
npm test -- src/data/passenger-demand.test.ts
npm run build
npm run check:bundle
npm exec playwright test e2e/passenger-demand.spec.ts -- --workers=1
```

Compilation uses Python's standard library and performs no network requests or spreadsheet recalculation. It pins the audited source hash; a changed workbook requires a fresh source/identity audit before changing that pin or metadata. Outputs are `fixtures/passenger-demand/numbat-2025-friday.json` and `audit.json`. Build staging copies only the small profile artifact into public data. The source workbook and audit link ledger are not shipped to browsers.

The component, CSS and data load on supported selection, with independent gzip limits of 4 KiB JavaScript, 2 KiB CSS and 4 KiB data. A failed download offers retry; valid data is reused across hero cards and pulses. Unsupported stations trigger no passenger request. Tests cover identities, source reconciliation, invalid/missing values, midnight boundaries, lazy loading, retry, clock changes and desktop/mobile hero-to-pulse navigation.

## Attribution and next steps

Powered by TfL Open Data. [TfL transport-data terms](https://tfl.gov.uk/corporate/terms-and-conditions/transport-data-service) apply. The terms also specify: Contains OS data © Crown copyright and database rights 2016; Geomni UK Map data © and database rights 2019. This pilot extracts passenger counts and uses no source geometry. No TfL endorsement is implied.

Before extending station coverage, audit station-versus-complex identities and interchange row types for every additional mapping. The next useful step is to add the preceding day profile for early Friday, then expand to other audited hubs. Link loads, train load visualisation, station capacity, measured crowding and combined-operator departure boards remain separate work.
