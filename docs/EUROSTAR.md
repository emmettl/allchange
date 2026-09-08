# Eurostar: published calls and London movement

For **Friday 4 September 2026**, St Pancras has **55 Eurostar calls: 27 departures and 28 arrivals**. The shared King’s Cross St. Pancras Tube hero offers **St Pancras Eurostar** as a fourth rail area. The station is also searchable directly by name or **UIC 7015400**. This UIC identifier is not a CRS code: `eurostar:7015400` stays separate from domestic `crs:STP`, Thameslink `crs:SPL` and King’s Cross `crs:KGX`.

The board shows public service numbers, destinations/origins and London times. All 55 calls are selectable. **40 services** have supported London movement; **15 are timetable only**, with no Show movement button. Selecting a supported movement pauses at its published London call, enables the rail layer, switches to geography and collapses the rail hero. Area changes and dismissal follow the existing combined-board behavior.

## Retained sources and reuse

The publisher is **Eurostar International Ltd**, through [France’s national transport data portal](https://transport.data.gouv.fr/datasets/eurostar-gtfs-plan-de-transport-et-temps-reel). The dataset declares [Licence Ouverte / Open Licence 2.0](https://www.data.gouv.fr/pages/legal/licences/etalab-2.0). Attribution, the archive timestamp, source URL and source hash are retained in the compiled metadata; the card links to the publisher’s dataset and identifies the licence.

The [pinned GTFS archive](https://transport-data-gouv-fr-resource-history-prod.cellar-c2.services.clever-cloud.com/82199/82199.20260904.001849.494114.zip) was archived at **2026-09-04 00:18:49 UTC** and covers 3 September–1 December 2026. It is retained as `fixtures/eurostar/source/2026-09-04.gtfs.zip`, SHA-256 `de0fd1d76c93793da61785a764d6a306635d5f7b75e3149cbbc590c5d140e827`. Rebuilding this study never substitutes today’s rolling feed or real-time data.

The matching London timings come from Network Rail’s [June–December 2026 working timetable](https://www.networkrail.co.uk/industry-and-commercial/the-timetable/working-timetable/), table **WA07 — St Pancras to Eurotunnel Boundary**. The retained XLSX and its SHA-256 are recorded beside the GTFS in the audit. Working-timetable passing points and depot trains are not passenger calls.

The GTFS has **no shape IDs on these 55 Channel services**. London geometry therefore reuses the existing connected HS1 corridor from St Pancras via Stratford International to Ebbsfleet West Junction. `source/hs1-geometry.json` retains the parent fixture hash and its complete OpenStreetMap provenance under **ODbL 1.0**. These are shared railway corridors with station-anchor connectors; individual Eurostar platform tracks are not resolved.

## Dates, clocks and identity

The compiler selects `EUROSTAR_CHANNEL` trips with an active `calendar_dates` entry on `20260904`, applying removal exceptions. All London platform children resolve through the feed’s parent station and UIC identity. Public train number, original trip/service/route IDs, original stop IDs, passenger restrictions and the full service date remain available in the artifact.

Under the [GTFS specification](https://gtfs.org/documentation/schedule/reference/), `stop_times` uses **agency timezone**, not the individual stop’s timezone. This feed uses **Europe/Brussels**, including at St Pancras. The compiler converts to **Europe/London** for the study clock. For example, train 9004’s source departure `08:04` is **07:04 BST**; 9007 arrives at **08:30 BST**. Overseas stop times in the board network use the same London clock. Times beyond 24:00 retain their service-day offset and never wrap into the morning.

## Movement reconciliation and limits

The compiler reads active Friday **ES** passenger columns from WA07, excluding depot services. A movement requires a **unique** match on public-number/headcode correspondence (`90xx` / `9Oxx`, `91xx` / `9Ixx`), direction, overseas terminal and **exact London terminal time**. This is an explicitly audited reconciliation between two sources, not a shared identifier supplied by GTFS. No WTT column may be assigned twice. Every candidate, source column, UID, calendar condition, London time and decision is retained in `fixtures/eurostar/audit.json`.

- **40 matches:** interpolate between the WTT’s St Pancras and Ebbsfleet West Junction timings on connected HS1 geometry. There is no invented Stratford passing time. Ebbsfleet is a passing point, never a Eurostar passenger call. Movement dissolves over the existing four-kilometre fringe beyond the London boundary. No overseas route is drawn.
- **4 time disagreements:** 9004, 9110, 9123 and 9153 retain the GTFS passenger times and have no movement. WTT times are not shifted to fit.
- **11 without a matching dated WTT column:** 9006, 9019, 9022, 9027, 9029, 9050, 9059, 9060, 9061, 9145 and 9148 also remain timetable only.

The complete passenger board is stored separately from the geometry-bearing movement snapshot. It is never sent to the renderer. Runtime validation rejects missing/wrong-date boards, invalid calls and movement/board time mismatches before caching. Domestic boards use their existing CRS identities and cannot absorb Eurostar calls when its corridor is cached. The same six Tube lines accompany all four station-area boards; they are one shared population, not four separate counts. The Eurostar board omits its pulse shortcut because the movement-backed pulse cannot show all 55 calls; a Eurostar pulse reached through the general picker contains only the 40 supported movements. Global service search likewise indexes the movement subset; all 55 public numbers are available in the station board.

**Published departure is not a boarding or check-in deadline.** The card points to [Eurostar’s arrival guidance](https://www.eurostar.com/travel-info/your-trip/check-in) for border and luggage checks. The feed’s custom `checkin_duration` and planned platform fields are not presented as live or universal passenger instructions. Live status, cancellations, platform allocation and check-in countdowns remain outside this increment.

## Rebuild and validation

```sh
npm run data:london:eurostar
python3 scripts/compile-eurostar.py --check
npm test
npm run build
npm run lint
npm run check:boundary
npm run check:bundle
npm exec playwright test e2e/eurostar.spec.ts e2e/combined-station-board.spec.ts -- --workers=1
```

Compilation requires Python 3 with IANA timezone data and uses only retained sources. Hash changes require a new audit. CI checks exact rebuild equivalence, timezone conversion and >24-hour semantics, all 55 calls, restrictions, all 40 unique movement matches, geometry endpoints, boundary fading and malformed-data rejection. Browser checks cover direct UIC entry, shared-hero selection, arrivals/departures, timetable-only rows, movement seeking, failure/retry, dismissal, reduced motion, narrow-card layout and the day boundary in desktop Chromium and emulated iPhone WebKit.

The optional combined board stays within **6 KiB JS / 3 KiB CSS** gzip; the opening limit remains **345 KiB JS / 650 KiB total**. Eurostar’s optional data is **18.3 KiB gzip**, checked against a separate **24 KiB** cap; its lazy validator has a **2 KiB** cap. The build appends the Eurostar station/corridor to the delivered rail catalogue without changing the domestic compiler’s 301-station artifact.

Remaining work: reconcile the 15 timetable-only services against an authoritative dated London timing source; physical-device review; source-supported platform/live status; other service dates. Any expanded movement coverage must preserve the passenger GTFS times and explicit provenance.
