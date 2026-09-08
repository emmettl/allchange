# Weak-hardware performance follow-up

The subsequent [stationary and paused rendering pass](IDLE-RENDERING-PERFORMANCE.md)
avoids unchanged station layout and paused TfL/bus buffer work.
The [latest Gleislicht review](GLEISLICHT-PERFORMANCE-REVIEW.md) adds indexed
vehicle counts and bounded train-label searches, and assesses the trail worker.

The laptop photograph shows an Intel i7-1185G7, 73% total CPU utilization,
1.58 GHz reported speed, Intel Iris Xe at 53%, and 41% memory utilization. This
is a system snapshot, not an Edge CPU profile or a measurement of one core.
It supports testing with much less CPU headroom; it cannot by itself establish
whether the limiting factor is JavaScript, GPU work, power limits or other apps.

## First changes

This follows Gleislicht's `cd2c4f4` and `49dfaad` work, adapted to All Change:

- Under sustained slow frames, reduce overview clock reports from 10 to 5 Hz.
  Selected TfL trains retain their existing reporting cadence. Marker positions
  still advance from the local animation clock every frame.
- Reduce decorative train/bus trails from at most 30 to at most 15 updates per
  second. Under load, also leave a frame between rebuilds: a wall-clock cap alone
  would still run every frame on a machine producing fewer than 15 FPS.
- Apply the policy to All Change's separate National Rail trail loop. Preserve
  its original per-frame cadence on capable hardware. Paused National Rail
  retains its buffers; seeking, changed data, projection or selection redraws.
- Use the already-tested indexed timetable lookup for National Rail too.
- Reuse road conditions throughout each immutable measured quarter-hour instead
  of interpolating identical values on every animation frame.

The budget tracks a smoothed frame interval, reduces work below roughly 40 FPS,
and restores normal cadence after three seconds above roughly 52 FPS. One long
loading/background gap is ignored. Two consecutive frames of 250 ms or more
count as sustained overload; otherwise the weakest machines could never enter
reduced mode. Explicit National Rail invalidation bypasses the cadence gate.

This changes trail smoothness and overview readout frequency on slow devices.
It does not reduce vehicle count, timetable coverage, route detail, trail length,
or the frequency of moving-marker updates. It is a mitigation, not an assurance
that a full London bus view will become smooth on every laptop.

## Measurement method

The source snapshot is `343f5e6` plus the station-board edits already present when
this work began. An isolated directory holds that snapshot and installed package
versions; only the performance changes are overlaid for the after build. This
avoids mixing ongoing station-board work into the comparison.

Production Chromium 151, Apple M4 Max, ANGLE Metal, 1280 × 720, DPR 1. Strong
24× CPU throttling is a stress test, not a calibration of the photographed laptop.
No CPU profiler or concurrent test suite runs during timing samples. The study
is reset to 07:45 and the 30-service-seconds-per-real-second playback option,
then allowed to settle; each measured sample lasts five seconds. Actual study
start times and browser errors are included in the report. Initial free-running
samples were discarded because slow layer loading moved them into different
traffic windows and introduced large startup stalls.

```sh
npm run build
npm run preview -- --host 127.0.0.1 --port 4177 --strictPort
# Separate terminal; omit --angle metal outside macOS.
node scripts/profile-london-frames.mjs --headless --angle metal --width 1280 --height 720 --dpr 1 --cpu-throttle 24 --study-time 27900 --playback-rate 30 --settle 4000 --buses --output /tmp/buses.json
# Substitute --rail or --air-roads to sample those layer combinations.
```

## Results

| Scenario | FPS before → after | Scripting ms/frame before → after | p95 frame ms before → after |
| --- | ---: | ---: | ---: |
| 8× · TfL + all buses | 18.3 → 24.0 | 53.9 → 40.6 | 66.7 → 66.8 |
| 24× · TfL + all buses | 4.0 → 7.2 | 263.0 → 136.0 | 283.3 → 216.6 |
| 24× · TfL + National Rail | 16.4 → 18.9 | 45.9 → 33.5 | 150.0 → 133.4 |
| 24× · TfL + air + roads | 18.8 → 33.2 | 48.2 → 27.6 | 66.7 → 50.0 |
| 24× · Air + roads | 24.0 → 36.9 | 35.8 → 23.5 | 66.6 → 50.0 |

The [raw reports](performance/2026-09-08-weak-hardware.json) preserve settings,
actual study times and errors. These are single local comparisons. The 8× full-bus case uses about 25% less
scripting per frame, but its p95 interval stays around 67 ms. National Rail still
has long outliers (p99 increased from 167 to 283 ms in this pair), and the 24×
full-bus view remains slow. Frame-rate gains do not establish responsive input
on the actual Windows laptop. All recorded runs reported no page errors.

The 24× selected-route five-second sample was worse initially (9.4 → 7.9 FPS).
A separate 15-second repeat reversed that result (7.3 → 8.6 FPS; 130 → 110 ms
scripting per frame). This does not establish a reliable selected-route gain;
it illustrates the variability of the stressed case. The 8× selected-route pair
measured 32.6 → 34.5 FPS. Neither result supports a claim that selecting a route
eliminates the remaining full-network marker workload.

For targeted repeats, add `--scenarios selected-bus-route --duration 15000`.
Keep the same scene flag (for example `--buses`) so navigation still loads it.

## Next priorities

1. **Reduce the work required for every moving vehicle.** The existing bus profile
   identifies `cachedBusPosition` from marker and trail callbacks as a major
   cost. Precompute path orientation and motion intervals, then consider feeding
   interpolation endpoints to the GPU. Keep CPU picking and arbitrary seeks in
   sync. This requires differential trajectory tests and another before/after
   profile; previous Gleislicht cache experiments did not consistently help.
2. **Avoid offscreen and unchanged work.** Build coarse spatial bounds for active
   routes before sampling their markers/trails. Cache label layout while the
   camera and relevant candidates are unchanged, with invalidation for camera
   movement, selections, new chunks and playback boundaries. Simple post-position
   clipping alone would leave much of the path-sampling cost intact.
3. **Move expensive preparation off the main thread.** A worker can prepare
   timetable indexes, paths and geometry data, transferring typed arrays back.
   This targets loading/selection stalls. Moving only preparation will not solve
   the continuous per-frame sampling cost; per-frame worker handoffs also need
   measuring, since serialization and synchronization can erase the gain.
4. **Offer an explicit low-power mode if automatic adaptation is insufficient.**
   A 30 FPS render target, reduced glow/trails and lower pixel density could cut
   sustained load. Pixel density primarily targets GPU work; it is not the first
   remedy for a JavaScript-dominated frame. Make such visual tradeoffs visible
   and optional instead of applying them based on browser or CPU model strings.

On the laptop, compare the same timetable time, layer combination, viewport and
power state in Edge. Record main-thread work, long frames and interaction delays
alongside FPS. A short DevTools Performance recording after loading is more
useful for choosing the next change than aggregate Task Manager percentages.

## Validation

The isolated source passed 231 unit tests and 17 browser checks across Chromium
and WebKit; the desktop run intentionally skips the iPhone-only cadence test.
The new browser regression confirms that paused National Rail makes no repeated
buffer uploads, redraws after seeking, and resumes uploads with playback.

The working checkout also passed typechecking, lint, the production build,
architecture checks and bundle budgets. Existing station-board changes were
preserved throughout. CPU-stress results describe the isolated snapshot above,
not the independently changing station-board work.
