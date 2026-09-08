# A day of cycle hire

Choose **Cycles** in the study controls to explore Friday **29 May 2026**. The cycle view uses the shared time-of-day, playback speed and pause state, with its own 00:00–24:00 range. Morning and evening buttons pause at 08:30 and 17:30. Returning to rail preserves the clock and opens the full-day timetable if the time lies outside the morning window.

The map shows recorded Santander Cycles endpoints and times. Straight connections and interpolated positions are schematic, not actual street routes, speed, GPS tracks or evidence of a particular bridge crossing. Same-dock hires remain at their dock, drawn as rings. Same-minute hires count as departure/return events without an invented animated duration. Reduced motion removes moving journey dots while retaining connections, dock activity and numeric counts.

Select a dock on the map or through the keyboard-accessible station search. Its hero card shows departures, returns, net returns and a daily profile. Amber docks have more departures and green docks more returns in the current 15-minute interval; larger dots mean more endpoint events. Net returns mean returns minus departures. They exclude fleet rebalancing and do not establish bike availability or empty/full docks. The close button preserves selection, and a compact details button restores the card. Zoom centres on the selected dock; **All docks** clears selection and restores the overview.

Rail interchanges and the Thames provide geographic reference. Nearby-interchange distance is a straight-line estimate from existing rail coordinates, not a walking route or evidence that a hire connects to a train. Cycle observations on 29 May are not overlaid as if they occurred on the rail timetable's 4 September date. Santander hires represent part of London's cycling, not private or dockless cycle traffic.

## Source audit — 8 September 2026

TfL's [cycle-hire archive](https://cycling.data.tfl.gov.uk/) lists the latest journey extract through **31 May 2026**; the matching 4 September day was unavailable. The selected date is the latest complete Friday in that extract. The [open-data catalogue](https://tfl.gov.uk/info-for/open-data-users/our-open-data) describes the recorded journey fields and the BikePoint station API.

- Journey file: [444JourneyDataExtract17May2026–31May2026.csv](https://cycling.data.tfl.gov.uk/usage-stats/444JourneyDataExtract17May2026-31May2026.csv), 72,764,192 bytes, published 9 June 2026.
- Journey SHA-256: `20ff75281aefebd034883b59d3535a081b9b20862d4e1fceb9c666e5d9b8c97a`.
- Station source: [TfL BikePoint](https://api.tfl.gov.uk/BikePoint), retrieved 8 September 2026, 800 records.
- Raw station-response SHA-256: `22c498c90d42425bcf955b30c7ddcfb687fed349225f858004545f44321cf9cf`.
- A frozen, minimal station snapshot is retained in `fixtures/cycle-hire/bikepoints-2026-09-08.json`, SHA-256 `2304345a1adfe5fec9499b906a0adbbc63f6af1c2c7834ec25a35f93127b9bc0`. It contains names, coordinates, BikePoint IDs and terminal numbers. Live availability fields are omitted.

| Audit measure | Count |
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

### Other available days and planned comparison

As checked on 8 September 2026, the archive includes historical files back to 2012 and extracts covering January–May 2026. The downloaded extract contains 17–31 May. Only Friday 29 May is currently compiled into the app; the other dates require their own coverage and exclusion checks.

An initial weekday/weekend selector could compare these adjacent days without another journey-file download:

| Candidate day | Source departures, before exclusions |
| --- | ---: |
| Thursday 28 May 2026 | 34,277 |
| Friday 29 May 2026 | 31,317 |
| Saturday 30 May 2026 | 29,045 |
| Sunday 31 May 2026 | 25,513 |

The planned comparison should preserve time of day and validated dock selection, show each date explicitly, and use consistent map and profile scales. Audit station identities, exclusions and midnight carry-in/out for every date before compiling separately loaded day artifacts. These are individual observed days, not estimates of a typical weekday or weekend. The shared Motion Studies roadmap tracks this extension as future work.

### Station identities and coverage

The CSV's station numbers match BikePoint **TerminalName**, not the suffix of the BikePoint ID. Leading zeros are normalized numerically. Both terminal identity and station name, normalized for punctuation/case, must agree. There is no proximity or fuzzy fallback.

Unmatched terminals include Marylebone Lane, Guildhouse Street, Camley Street, the Mechanical Workshop and Ladbroke Grove Central. Terminal 2639 is **King Edward Walk, Waterloo** in the journey extract but **Brockwell Lido, Brixton** in the current API. Its 20 affected journeys are excluded rather than drawn across London using a reused identity. Both endpoints must match for a journey to contribute to this view. Source rows, original names and exclusion reasons remain in `audit.json`.

The coordinate snapshot is later than the journey date. Matching identity/name validates the join, but does not independently prove that every dock retained its exact position between May and September. That limitation remains explicit. No current installation or availability flag is used to invent historical availability.

### Times, duration and completeness

CSV start/end timestamps have minute resolution and are interpreted as London local time. This May day is entirely in BST, without a clock change. The compiler checks the published millisecond duration agrees with the timestamp difference within 60 seconds, preserving the minute timestamps rather than synthesizing start seconds. Journey IDs must be unique. Non-finite or inconsistent durations fail compilation.

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

The standard-library compiler works offline against pinned hashes. Updating either source requires a new audit. `day.json` contains station metadata and compact `[start, end, fromIndex, toIndex]` tuples; `audit.json` retains provenance and exclusions. Only `day.json` is staged for the browser. Station profiles and interval indexes are calculated once after download. The optional view and data are cached, failed downloads retry, and the opening rail view fetches no cycle data.

Transfer budgets are 9 KiB compressed JavaScript, 3 KiB CSS and 300 KiB data. The actual day artifact is approximately 197 KiB compressed. The existing opening JavaScript limit remains 344 KiB. Runtime checks validate identities, finite coordinates, sorted timestamps, endpoint indexes and duration bounds before rendering.

Validation covers source reconciliation, station identity reuse, carry-in/out, same-minute events, selected-dock filtering, interpolation bounds, missing downloads/retry, keyboard selection, reduced motion, hero dismissal and restoration, clock continuity and desktop Chromium/iPhone WebKit interaction. Physical-phone review remains outstanding. Automatic publication/hosted CI results are separate from local validation.

## Attribution and remaining work

Powered by TfL Open Data. [TfL transport-data terms](https://tfl.gov.uk/corporate/terms-and-conditions/transport-data-service) apply. Thames geometry uses the existing GLA/OGL study artifact. No TfL endorsement is implied.

Future work: recover historical coordinates for excluded public docks; audit a matching September date when published; add authored neighbourhood comparisons and historical availability or rebalancing only if a suitable source becomes available. Street-route reconstruction would require its own source and clear labelling.
