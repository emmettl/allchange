# Passenger flow and NUMBAT coverage

All Change now has a passenger-flow pulse at Bank/Monument and Stratford, plus demand profiles for 432 validated source areas matched to 440 app station-name variants. The passenger pulse and train-service pulse are separate views with a shared study clock. Entry, exit and interchange counts remain separate measures; neither view infers occupancy or unique visitors.

## Using the study

Select Bank or Stratford and choose **Explore passenger flow**, or use **People** in the interchange pulse. Three labelled streams show entering, leaving and changing movements. A full dot represents approximately 250 movements in the selected 15-minute interval; a fractional dot preserves the remainder. Numeric totals accompany each stream. Paths and travel speed are schematic: they do not depict tracked passengers, internal station geometry or travel times. No flows are drawn for unavailable intervals.

The study clock controls the marker, counts and visual phase. Pause stops positional motion; scrubbing is deterministic. Reduced motion keeps dot positions fixed while the interval counts still update. **08:30 morning** and **17:30 evening** select the full-day study and pause at that time. The station selector compares Bank and Stratford without changing the clock. **Trains** restores the scheduled-service pulse. Passenger mode automatically dismisses the hero card to uncover the scene; its details button restores it.

Other supported station cards show the available metrics, daily profile and current interval. Where a station name corresponds to multiple NUMBAT areas, a **Source area** selector keeps their profiles separate. For example, Canary Wharf has LU, DLR and Elizabeth line areas; Paddington has TfL and NR areas. No totals are combined across these areas. The source name remains visible, including mode qualifiers, so an LU profile in a National Rail hero is not presented as a total for every operator.

## Source audit — 8 September 2026

The input is the [official NUMBAT 2025 Friday workbook](https://crowding.data.tfl.gov.uk/NUMBAT/NUMBAT%202025/NBT25FRI_Outputs.xlsx), retrieved from [TfL's demand archive](https://crowding.data.tfl.gov.uk/). S3 records publication on 10 August 2026; the workbook cover is dated 1 July 2026. The 12,479,228-byte source is pinned by SHA-256:

`22eeb8fe2fd5ee2c974aaff81c7f3e114c53e39f46cd03c273c072974f5d9b5c`

Demand describes a typical autumn Friday in 2025, whereas the app's timetable is Friday 4 September 2026. These layers are comparative, not observations of the same actual day. The [TfL open-data catalogue](https://tfl.gov.uk/info-for/open-data-users/our-open-data) and workbook cover describe the source methodology and confidence.

| Audit result | Count |
| --- | ---: |
| Entry/exit station rows in the source | 471 |
| Excluded tram placeholder rows | 39 |
| Validated, shipped source areas | 432 |
| Matched app station-name variants | 440 |
| App names without a validated match | 255 |
| Areas with supported within-area interchange profiles | 136 |
| Areas with interchange totals withheld for duplicate links | 2 |

The 39 tram rows contain zero-filled profiles, but trams are outside the coverage stated by this workbook. They are excluded rather than displayed as measured zero demand. Published zero intervals within a supported rail profile remain zero. Unmatched names receive no passenger profile. These counts describe source areas and name variants, not 440 distinct physical stations.

### Identities and source areas

The compiler reads `Station_Entries`, `Station_Exits` and `Station_Flows`. Entry/exit identity is checked using NLC, ASC and the source station name. The app-name universe comes from the opening TfL network and National Rail catalogue; hashes of those inputs and every match/unmatched name are retained in `audit.json`.

Matching normalizes punctuation, case and `&`/`and`. Explicit aliases cover documented local spellings, branch qualifiers and combined names. Mode suffixes generate candidate *areas*, never combined totals. There is no runtime fuzzy or proximity matching. Branch-specific names such as Edgware Road (Bakerloo) and Edgware Road (Circle Line) retain different source identities. King's Cross mainline aliases expose the explicitly labelled King's Cross St. Pancras source area rather than imply a mainline total.

| Pulse | NLC / ASC | Source name | Entry and exit sheet row | Included interchange links |
| --- | --- | --- | ---: | ---: |
| Bank | 513 / BNKu | Bank and Monument | 25 | 49 |
| Stratford | 719 / SFDu | Stratford | 386 | 126 |

Bank's `Complex NLC = 513` also groups Cannon Street and Mansion House. The compiler restricts both endpoints to the selected station's NLC/ASC, avoiding that wider aggregation. Monument remains included because the source explicitly combines it with Bank. Stratford High Street and Stratford International DLR now have their own separate profiles, not aliases to Stratford's counts.

### Aggregation, missing metrics and confidence

Entries and exits use the published station rows directly. Their 96 interval cells start in column L and reconcile to column E (`Total`). These measures are based on gateline/ticketing information and have higher source confidence than estimated transfers.

Changing sums only `Alight-Interchange-Board` rows with both endpoint NLC/ASC identities equal to the selected area. Their 96 interval cells start in column S and reconcile to column L (`Total`). Entry/boarding, alighting/exit and out-of-station interchange rows are excluded. Cross-area internal links are also excluded and flagged in the card's notes; the result is explicitly an *area* profile.

Duplicate interchange IDs make the changing total ambiguous at **Clapham Junction** and **Norwood Junction**. Those complete interchange metrics are withheld; their entry and exit profiles remain available. The audit retains the excluded rows and reasons. An area without within-area interchange rows also omits Changing rather than displaying zero. Links involving non-TfL services have lower source confidence.

Every included row's interval sum is reconciled to its published total before rounding. Missing, erroneous, non-finite and negative cells fail compilation. The browser artifact preserves three decimal places; the interface shows approximate whole counts. The audit retains original totals and source rows/links. Entering, leaving and changing must not be summed to claim unique passengers.

| Typical traffic-day movements | Bank and Monument | Stratford |
| --- | ---: | ---: |
| Entries | 49,893.338 | 84,316.663 |
| Exits | 51,329.585 | 86,358.112 |
| Within-area interchanges | 101,135.801 | 154,881.998 |

### Time alignment

The source traffic day runs from Friday 05:00 to Saturday 05:00 in 96 intervals. Every time header is checked in sequence. The daily chart retains and shades the Saturday tail, but the app only matches Friday study times from 05:00 inclusive to 24:00 exclusive. Friday before 05:00 needs the preceding Thursday traffic-day tail and remains unavailable. The end-of-study 24:00 sentinel also has no interval. Neither case wraps onto another day.

## Reproduction and validation

Download the linked workbook outside the repository, then run from the project root:

```sh
python3 -B scripts/compile-numbat.py /path/to/NBT25FRI_Outputs.xlsx
python3 -B scripts/test_compile_numbat.py
npm test
npm run build
npm run check:boundary
npm run check:bundle
npm exec playwright test e2e/passenger-pulse.spec.ts e2e/passenger-demand.spec.ts e2e/hero-dismiss.spec.ts -- --workers=1
```

Compilation uses Python's standard library without network requests or workbook recalculation. A changed source hash requires a fresh audit. Outputs are `fixtures/passenger-demand/catalogue.json`, one JSON file per source area under `stations/`, and `audit.json`. Only the catalogue and individual profiles are staged for browsers. The raw workbook and audit ledger are not shipped.

The opening scene requests no passenger data. Station selection loads the small catalogue and the selected area only; later selections reuse valid downloads. Failed downloads retry, unsupported stations request no area file, and selection changes cannot display the previous station's counts. Both the card and pulse are lazy and share the validated data loader.

Gzip limits are 4 KiB each for card and pulse JavaScript (including their optional dependencies), 2 KiB CSS each, 12 KiB catalogue, 2 KiB per source area, and 650 KiB for all profiles plus the catalogue. The full dataset is never requested as one browser payload. The existing 344 KiB opening JavaScript limit is unchanged.

Validation includes all 432 area files, identity and total reconciliation, source-area separation, missing/invalid metrics, zero and midnight semantics, mark proportions, reduced motion, playback/seek, loading races, retry, unsupported coverage, hero dismissal, and desktop Chromium/iPhone WebKit interaction. Physical-phone review remains outstanding; browser emulation is recorded separately.

## Attribution and remaining work

Powered by TfL Open Data. [TfL transport-data terms](https://tfl.gov.uk/corporate/terms-and-conditions/transport-data-service) apply. The terms also specify: Contains OS data © Crown copyright and database rights 2016; Geomni UK Map data © and database rights 2019. This extraction uses counts, not source geometry. No TfL endorsement is implied.

Remaining work includes preceding-day demand for early Friday, directional link loads along tracks, boarders/alighters, an authored city-wide morning/evening sequence, and additional passenger pulse compositions. Measured crowding, capacity, individual-train loads, origin–destination journeys and combined-operator departure boards remain separate work.
