# Gleislicht performance review — 8 September 2026

Reviewed Gleislicht's remote `main` at `78039291e254efae65b14b9fe63ad6f386c50a91`
against All Change `b5fdf86`.

| Gleislicht change | All Change applicability |
| --- | --- |
| [Indexed vehicle counts and cached search ordering, c2135a9](https://github.com/emmettl/gleislicht/commit/c2135a9187aec51318551d9709bae942e99ac7d2) | Ported the count index. London timetable search is already independent of playback time and does not re-sort active trains on clock ticks, so that search change is unnecessary. |
| [Label cadence and paused geometry, 0cbe149](https://github.com/emmettl/gleislicht/commit/0cbe149a608fbe73dc578d1327968d5d9baf2913) | Ported train-label scheduling. Paused marker/trail geometry and stationary station-label caching are already covered by All Change's previous pass. |
| [Trail worker, dd0fdd1](https://github.com/emmettl/gleislicht/commit/dd0fdd12b0c1f003b4beb4e96ec179ce0744e638) | Applicable, but not ported in this change. Requires the London adaptations and measurements below. |
| Basel geography at `7803929` | Swiss data correction; does not apply to London. |

## Changes applied

The selected timetable population now builds sorted start/end arrays only when
its immutable data or selection changes. Clock updates count started journeys
minus journeys that have already ended using two binary searches, rather than
scanning every journey. The index preserves inclusive departure/arrival
boundaries, excludes cancelled and fewer-than-two-stop journeys, handles invalid
intervals, and supports arbitrary forward/backward seeks. It does not alter the
separate aircraft, road or native National Rail count adapters.

Train labels search the full time bucket at roughly 10 Hz while playing with a
stationary camera. The labels actually displayed still receive per-frame
position, fade, scale and overlap updates. Paused labels reuse their sprites.
Camera/projection/viewport changes, selections, new geometry, palette changes,
layout transitions and seeks refresh the search immediately. Newly eligible
labels can wait until the next 100 ms refresh (or the next animation frame on a
slower device). Tube/DLR close-zoom suppression and line colours are preserved.

This complements the existing stationary **station** label cache: train labels
are a separate component with moving anchors. Vehicle marker cadence, trail
length and timetable coverage are unchanged.

## Trail worker follow-up

Gleislicht's worker moves trail interpolation and buffer construction off the
main thread. That is relevant to London's bus-heavy views, but copying its
renderer patch wholesale would lose London-specific behavior:

- Preserve London's projected vehicle height (0.085), bus path sampling and
  straight/path/detour interpolation in geographic and diagram layouts.
- Retain immediate paused seeks and selection/visibility invalidation. Consume
  worker results even when paused, reject stale results after reprojection,
  and recover synchronously if a worker fails.
- Batch initialization for London's larger bus geometry, bound the request queue,
  and measure startup copying, memory duplication and buffer transfer costs.
- Adapt the separate native National Rail renderer independently if warranted.

Before shipping that port, compare production bus and rail playback under CPU
throttling, including selection and diagram transitions, plus worker failure and
teardown tests. Gleislicht's reported FPS gains are not London measurements.

## Validation

The isolated performance source passed 246 unit tests, typechecking, production
build, lint and architecture checks. Regression tests exercise the actual
installed train-label callback after the London transforms with real Three.js
sprites, projection and collisions. They compare visible output against the
original callback, verify that labels keep moving, and check that stationary
paused labels stop work. At a synthetic 60 FPS the candidate performs at most
11 full searches across 61 frames, compared with 61 previously.

The working checkout also passes all 252 unit tests, lint, architecture checks,
the production build and unchanged bundle limits, including the concurrent
night-study work: initial JavaScript is
342.3 KiB gzip against a 344 KiB limit.

All 12 selected browser regressions passed across desktop Chromium and iPhone
WebKit: bus loading/search/scrubbing, category/station and enabled-layer counts,
diagram selection preservation, and paused TfL/bus and native National Rail
buffer updates through seeks and resumes.

These checks establish reduced repeated work, not a measured overall FPS gain
or an Edge result on the laptop.
