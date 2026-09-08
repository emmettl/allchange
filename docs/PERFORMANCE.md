# September 2026 renderer performance

For the subsequent adaptive-rendering changes, CPU stress tests and next priorities,
see [the weak-hardware follow-up](WEAK-HARDWARE-PERFORMANCE.md).

This pass ports the applicable optimizations from Gleislicht commit `e9fc934`
and its local Edge follow-up to All Change's pinned `@motionstudies/three`
`0.1.0-alpha.5` adapters. All Change already used indexed timetable lookup,
numeric train-ID collators, bus motion spans and partial train/trail uploads;
those existing optimizations remain in place.

Changes:

- Reuse collators for aircraft sorting and train route/service identity comparisons.
- Index road observations once per time bracket and reuse each site's conditions.
  London's quarter-hour observation snapshots still prevent interpolation across
  missing readings. Recompute the road counter only when its measured interval
  or road selection changes; memoize its study date.
- Batch hub clock ticks and corridor spokes by identical material. Clock tick
  submissions fall from 60 to 3, with the same coordinates, colours and emphasis.
- Detach hidden motorway badges from the scene graph while keeping their pooled
  sprites and geographic anchors. Reuse the view-comparison matrix.
- Keep aircraft hit meshes available to raycasting, but skip their invisible draw
  calls and GPU matrix uploads. Reuse aircraft transforms and remove unused
  aircraft calculations from React renders.
- Skip trips completely outside the trail sample window, and write trail colours
  without allocating temporary arrays per segment. Sample count and refresh
  frequency remain unchanged.
- Upload only the populated National Rail marker/trail buffers and realtime marker
  buffers, including empty traffic and subsequent repopulation.
- Keep map pointer listeners and in-progress gestures intact across playback
  callback changes. Retain the original timetable behavior for nonfinite times.

The new performance adapter composes after the existing London adapters and fails
on changed package hooks. These shared fixes should eventually move into a new
Motion Studies release, at which point the matching adapters can be removed.

## Measurement

Baseline is All Change `7884e13`, with a clean working tree. Production Chromium
151, ANGLE Metal on Apple M4 Max, 1280 × 720, DPR 1, 4× CPU throttling. Each
scenario loads and settles for 2.5 seconds, then records five seconds. These are
single-run local comparisons, not Windows Edge or physical iPhone measurements.

| Scenario | Before scripting ms/frame | After scripting ms/frame | Before FPS | After FPS |
| --- | ---: | ---: | ---: | ---: |
| TfL + air + roads | 5.73 | 4.40 | 60.0 | 60.0 |
| Air + roads | 4.19 | 3.41 | 60.0 | 60.0 |
| TfL + National Rail | 3.61 | 3.30 | 60.0 | 60.0 |
| London Bridge pulse | 1.50 | 1.15 | 60.0 | 60.0 |
| TfL + all buses | 19.28 | 17.62 | 48.8 | 52.2 |
| Selected bus route | 12.52 | 12.12 | 60.0 | 60.0 |

The [raw timing reports](performance/2026-09-08.json) retain settings and timestamps.

Air/road and pulse scripting fell approximately 19–23%. Rail's smaller difference
is less conclusive. These views were already display-limited at 60 FPS.

All-bus scripting fell about 9%, with missed-refresh intervals (over 25 ms)
falling from 22% to 15%. The all-bus CPU profile still spends substantial time in `cachedBusPosition`,
called from both marker and trail callbacks. The bus view continues to miss
frames under throttling. That remaining motion-sampling cost needs a separate
measured change; this pass preserves exact trajectories and visual detail.

## Reproduce

```sh
npm run build
npm run preview -- --host 127.0.0.1 --port 4177 --strictPort
# In another terminal (omit --angle metal outside macOS):
node scripts/profile-london-frames.mjs --headless --angle metal --width 1280 --height 720 --dpr 1 --cpu-throttle 4 --air-roads --output /tmp/allchange-air-roads.json
node scripts/profile-london-frames.mjs --headless --angle metal --width 1280 --height 720 --dpr 1 --cpu-throttle 4 --rail --output /tmp/allchange-rail.json
node scripts/profile-london-frames.mjs --headless --angle metal --width 1280 --height 720 --dpr 1 --cpu-throttle 4 --buses --output /tmp/allchange-buses.json
```

Add `--profile-dir /tmp` to save per-scenario DevTools CPU profiles. Profile
collection adds overhead; use matching unprofiled runs for timing comparisons.

Regression coverage compares label ordering, recorded road conditions/counts and
hub geometry against the installed renderer; validates active buffer growth,
shrinkage and empty frames; and checks every adapter's composed JavaScript and
upgrade guards. Browser checks cover playback, scrubbing, observed operations,
layout changes, National Rail pulses, aircraft/road selection, invisible WebGL
submissions and stable pointer listeners.

Validation: 176 unit tests and 25 applicable browser checks passed across Chromium
and WebKit (the iPhone-only cadence check is skipped on Chromium). Typecheck,
lint, architecture boundaries, production build and bundle budgets passed.
