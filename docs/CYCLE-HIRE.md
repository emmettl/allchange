# Four days of cycle hire

Choose **Cycles** in the study controls to compare **28–31 May 2026**, with Friday 29 May selected initially. The cycle view uses the shared time-of-day, playback speed and pause state, with its own 00:00–24:00 range. Morning and evening buttons pause at 08:30 and 17:30. Changing the day also pauses, preserving the time, selected dock, zoom and card dismissal state. Selection uses validated terminal identity rather than a day-specific array index. A dock without included records on the chosen date remains selected with unavailable counts; it is not silently replaced or presented as zero. Returning to rail preserves the clock and opens the full-day timetable if the time lies outside the morning window.

The map shows recorded Santander Cycles endpoints and times. Straight connections and interpolated positions are schematic, not actual street routes, speed, GPS tracks or evidence of a particular bridge crossing. Same-dock hires remain at their dock, drawn as rings. Same-minute hires count as departure/return events without an invented animated duration. Reduced motion removes moving journey dots while retaining connections, dock activity and numeric counts.

Select a dock on the map or through the keyboard-accessible station search. Its hero card shows departures, returns, net returns and a daily profile. Amber docks have more departures and green docks more returns in the current 15-minute interval; larger dots mean more endpoint events. Net returns mean returns minus departures. They exclude fleet rebalancing and do not establish bike availability or empty/full docks. The close button preserves selection, and a compact details button restores the card. Zoom centres on the selected dock; **All docks** clears selection and restores the overview.

Rail interchanges and the Thames provide geographic reference. Nearby-interchange distance is a straight-line estimate from existing rail coordinates, not a walking route or evidence that a hire connects to a train. Cycle observations on 28–31 May are not overlaid as if they occurred on the rail timetable's 4 September date. Santander hires represent part of London's cycling, not private or dockless cycle traffic.

## Source audit — 8 September 2026

TfL's [cycle-hire archive](https://cycling.data.tfl.gov.uk/) lists the latest journey extract through **31 May 2026**; the matching 4 September day was unavailable. The default date is the latest complete Friday in that extract; the comparison includes the preceding Thursday and following weekend. The [open-data catalogue](https://tfl.gov.uk/info-for/open-data-users/our-open-data) describes the recorded journey fields and the BikePoint station API.

- Journey file: [444JourneyDataExtract17May2026–31May2026.csv](https://cycling.data.tfl.gov.uk/usage-stats/444JourneyDataExtract17May2026-31May2026.csv), 72,764,192 bytes, published 9 June 2026.
- Journey SHA-256: `20ff75281aefebd034883b59d3535a081b9b20862d4e1fceb9c666e5d9b8c97a`.
- Station source: [TfL BikePoint](https://api.tfl.gov.uk/BikePoint), retrieved 8 September 2026, 800 records.
- Raw station-response SHA-256: `22c498c90d42425bcf955b30c7ddcfb687fed349225f858004545f44321cf9cf`.
- A frozen, minimal station snapshot is retained in `fixtures/cycle-hire/bikepoints-2026-09-08.json`, SHA-256 `2304345a1adfe5fec9499b906a0adbbc63f6af1c2c7834ec25a35f93127b9bc0`. It contains names, coordinates, BikePoint IDs and terminal numbers. Live availability fields are omitted.

The original Friday baseline is unchanged:

| Friday audit measure | Count |
| --- | ---: |
| Rows in the source extract | 436,202 |
| Source departures on 29 May | 31,317 |
| Source returns on 29 May | 31,204 |
| Records overlapping the day, before exclusions | 31,542 |
| Included journey records | 31,247 |
| Matched docking stations | 792 |
| Included departures on 29 May | 31,096 |
| Included returns on 29 May | 30,983 |
| Included hires in progress at midnight entering the day | 145 |
| Included hires continuing after the day | 248 |
| Included same-dock hires | 1,375 |
| Included same-minute hires | 145 |
| Excluded: duration over 24 hours | 90 |
| Excluded: unmapped terminal | 185 |
| Excluded: terminal name mismatch | 20 |

Exclusions are mutually exclusive by journey, with duration checked first. Their 295 records reconcile with the included records to the overlapping source total. Event totals count timestamps in `[00:00, 24:00)`; journeys crossing midnight contribute only the endpoint events that occur on this date. Six included journeys end exactly at 00:00 and count as returns, but are no longer in progress. The 24:00 control sentinel has no interval and does not wrap to another day.

### Weekday/weekend comparison

As checked on 8 September 2026, the archive includes historical files back to 2012 and extracts covering January–May 2026. The downloaded extract contains 17–31 May. Four dates are audited and compiled:

| Day | Source departures | Included departures | Included returns | Included records | Docks | Excluded records |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Thursday 28 May | 34,277 | 34,011 | 33,963 | 34,114 | 792 | 345 |
| Friday 29 May | 31,317 | 31,096 | 30,983 | 31,247 | 792 | 295 |
| Saturday 30 May | 29,045 | 28,820 | 28,782 | 28,984 | 791 | 399 |
| Sunday 31 May | 25,513 | 25,327 | 25,498 | 25,629 | 792 | 279 |

Thursday through Sunday have respectively 99/145, 145/248, 248/282 and 282/126 hires in progress at the opening/closing midnight boundaries. A hire can appear in adjacent day artifacts, so their record totals must not be summed as distinct hires. Endpoint counts stay on their recorded date. Per-day audits retain the exclusion breakdown and source rows.

The compiler validates dock identities across dates and writes shared comparison metadata. Map bounds use the union of all four days; projection, zoom and dot-size rules stay fixed. The city profile uses a common maximum of **1,227 hires per 15 minutes**. Each selected dock uses its own maximum across all four dates, printed beside the chart. Changing days never rescales that dock’s profile. These are individual observed days, not estimates of a typical weekday or weekend.

**Pindar Street, Liverpool Street** has included records on Thursday, Friday and Sunday, but none on Saturday. It remains searchable from the shared catalogue and explicitly unavailable on Saturday. A supported dock’s recorded zero intervals remain zero. Loading or failed date requests clear the previous day’s visible counts; late responses cannot replace the current selection. The manifest and successful day downloads are cached, and retries request only the failed resource.

### Guided dock comparisons

**Explore a pattern…** offers three starting points. Each selects a validated dock, sets its observed date and time, pauses playback, zooms to the dock and opens its four-day comparison. These are individual docking-station examples, not estimates of whole-neighbourhood movement.

| Example | Starting point | Evidence from included endpoint events |
| --- | --- | --- |
| Waterloo Station 3 | Thursday 28 May, 08:30 | 07:00–10:00: 205 departures / 2 returns. 16:00–19:00: 10 departures / 164 returns. |
| Queen Street 1, Bank | Thursday 28 May, 08:30 | 07:00–10:00: 12 departures / 137 returns. 16:00–19:00: 85 departures / 23 returns. |
| Hyde Park Corner | Sunday 31 May, 14:00 | Departures plus returns from 12:00–17:00: 110 Thursday, 193 Friday, 214 Saturday, 272 Sunday. |

The first two examples were selected for contrasting morning/evening balances across the included weekday data; Hyde Park Corner shows a larger midday event total on each weekend date than on either weekday. Windows are half-open, with their ending time excluded. Counts do not identify journey purpose, establish connections to trains, or prove travel between the Waterloo and Bank examples. A same-dock hire can contribute both a departure and a return, so combined endpoint counts are not unique hires or riders. **Why this example?** gives the dated evidence in the card.

Any selected dock offers **Compare four days**. Four compact profiles share that dock’s existing fixed maximum and the study clock; selecting a row changes the replay date and pauses, preserving time and zoom. The current date is marked, daily departure/return totals remain separate, and missing coverage remains unavailable. **Back to selected day** restores interval counts and the detailed day profile. Comparison mode gives the charts more space by compacting the header and, on mobile, hiding the search and peak shortcuts until the comparison closes. The hero close button retains the dock and comparison state while restoring the map controls.

The comparison component and `profiles/{terminalId}.json` load only when needed. Each profile contains four days of 96 departure and return bins, with `null` for an absent date. No other journey day is fetched merely to draw the comparison. Successful profiles are cached; failed requests retry independently, and late responses cannot replace the currently selected dock. All 792 generated profiles reconcile interval by interval with the audited journeys, and tests verify each authored count.

### Station identities and coverage

The CSV's station numbers match BikePoint **TerminalName**, not the suffix of the BikePoint ID. Leading zeros are normalized numerically. Both terminal identity and station name, normalized for punctuation/case, must agree. There is no proximity or fuzzy fallback.

Unmatched terminals include Marylebone Lane, Guildhouse Street, Camley Street, the Mechanical Workshop and Ladbroke Grove Central. Terminal 2639 is **King Edward Walk, Waterloo** in the journey extract but **Brockwell Lido, Brixton** in the current API. Its 20 affected Friday journeys are excluded rather than drawn across London using a reused identity. Both endpoints must match for a journey to contribute to this view. Source rows, original names and exclusion reasons remain in `audits/YYYY-MM-DD.json`.

The coordinate snapshot is later than the journey date. Matching identity/name validates the join, but does not independently prove that every dock retained its exact position between May and September. That limitation remains explicit. No current installation or availability flag is used to invent historical availability.

### Times, duration and completeness

CSV start/end timestamps have minute resolution and are interpreted as London local time. All four May dates are entirely in BST, without a clock change. The compiler checks the published millisecond duration agrees with the timestamp difference within 60 seconds, preserving the minute timestamps rather than synthesizing start seconds. Journey IDs must be unique. Non-finite or inconsistent durations fail compilation.

The source includes the preceding day, allowing carry-in hires without wrapping midnight. Hires longer than 24 hours are excluded from this bounded replay. Every hour of the selected day has included departure records. This establishes a full-day extract with documented exclusions, not proof that the source recorded every real-world hire. Journey and bike identifiers are not needed in the browser artifact; no bike number is retained.

## Reproduction and checks

Download the journey CSV outside the repository, then run:

```sh
python3 -B scripts/compile-cycle-hire.py /path/to/444JourneyDataExtract17May2026-31May2026.csv fixtures/cycle-hire/bikepoints-2026-09-08.json
python3 -B scripts/test_compile_cycle_hire.py
npm test
npm run build
npm run check:bundle
npm run check:boundary
npm exec playwright test e2e/cycle-hire.spec.ts -- --workers=1
```

The standard-library compiler works offline against pinned hashes. Updating either source requires a new audit. `days/YYYY-MM-DD.json` contains station metadata and compact `[start, end, fromIndex, toIndex]` tuples; `audits/YYYY-MM-DD.json` retains provenance and exclusions. `manifest.json` supplies dates, validated dock identities and shared comparison scales. The manifest, day files and per-dock comparison profiles are staged for the browser. Selecting a date loads its day file rather than the whole collection. Replay profiles and interval indexes are calculated once after download; comparison profiles are compiled offline. The optional view and data are cached, failed downloads retry, and the opening rail view fetches no cycle data.

Transfer budgets are 9 KiB compressed JavaScript, 3 KiB CSS, a 24 KiB comparison manifest and 300 KiB for the manifest plus the largest day. On Node 24, the manifest is approximately 21.2 KiB compressed and the largest day is 212.2 KiB, totalling approximately 233.4 KiB for a first selection. The existing opening JavaScript limit remains 345 KiB. Runtime checks validate identities, finite coordinates, sorted timestamps, endpoint indexes and duration bounds before rendering.

The nested dock comparison has a separate limit of 5 KiB JavaScript / 2 KiB CSS beyond its already loaded parent. Profile limits are 1 KiB per dock and 400 KiB for the complete collection, which is never fetched as a whole. Node 24 measurements are approximately 1.7 KiB additional JavaScript, 0.6 KiB for the largest profile and 316.7 KiB across all profiles. Run budget checks with Node 24 as CI does; gzip measurements can vary by Node release. Existing replay and opening limits are unchanged.

Validation covers source reconciliation, station identity reuse, carry-in/out, same-minute events, selected-dock filtering, interpolation bounds, missing downloads/retry, keyboard selection, reduced motion, hero dismissal and restoration, clock continuity, date-switch races, shared scale reconciliation, missing-dock selection and desktop Chromium/iPhone WebKit interaction. Physical-phone review remains outstanding. Automatic publication/hosted CI results are separate from local validation.

## Attribution and remaining work

Powered by TfL Open Data. [TfL transport-data terms](https://tfl.gov.uk/corporate/terms-and-conditions/transport-data-service) apply. Thames geometry uses the existing GLA/OGL study artifact. No TfL endorsement is implied.

Future work: recover historical coordinates for excluded public docks; audit a matching September date when published; extend dock examples to neighbourhood aggregates only after defining and auditing their coverage; add historical availability or rebalancing only if a suitable source becomes available. Street-route reconstruction would require its own source and clear labelling.
