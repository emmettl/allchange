# Stationary and paused rendering

This follows the [adaptive frame budget](WEAK-HARDWARE-PERFORMANCE.md), reducing
repeated work while viewing a stationary map or inspecting paused traffic.

## Changes

- Reuse station label layout while camera, viewport, label inputs and retention
  priorities are unchanged. Camera/projection changes, new station data,
  selection, visibility, diagram transitions and repopulation invalidate it.
  Retention gets its settling pass before the layout is reused.
- Keep the TfL and bus marker/trail buffers while paused. Seeking, changed data,
  projection, palette, selection or zoom visibility rebuilds them. Ordinary
  camera movement uses the existing GPU transforms; only crossing the bus/tram
  visibility thresholds changes which vehicles belong in the buffers.
- A paused seek bypasses the decorative trail cadence. The tracker records
  submitted buffers, so a skipped playing frame cannot consume a pending seek.

Playing markers keep their per-frame updates. The renderer still draws the map,
and other animated layers retain their own behavior; this does not turn the
whole canvas into an on-demand renderer or guarantee zero CPU use when paused.

## Validation

A differential test runs the installed station layout with and without the
guard, comparing visible sprite names, positions, scale, anchors and opacity
through clock renders, pan, zoom, resize, selection and diagram changes. It
verifies that settled clock renders stop rebuilding the labels.

The browser regression instruments real WebGL buffer uploads with TfL and buses
enabled. It checks that playing uploads buffers, idle paused frames stop doing
so, seeking and route selection redraw, and resuming restores updates. The
existing National Rail pause regression covers that separate layer too.

The isolated source passed 237 unit tests and 18 browser checks across
Chromium and WebKit. The working checkout also passed typechecking, lint,
the production build, architecture checks and bundle budgets.

## Bus sampling experiment

A separate experiment replaced the existing shared bus spans with per-leg
cursors. Early runs and a focused sampler benchmark looked promising, but
repeated browser comparisons did not justify keeping it. The bus sampler was
restored before finishing this change.

The [raw rejected-experiment reports](performance/2026-09-08-rejected-bus-cursors.json)
preserve the post-reboot comparisons: all-bus playback at 8× CPU throttling
measured 26.2 → 18.6 FPS, and the selected route measured 35.5 → 31.5 FPS. At
24×, all buses stayed near 5 FPS and tail intervals worsened. These measurements
describe the rejected cursor version, not the final paused-buffer change.

Both builds used source `17197e0`, excluding concurrent Eurostar work. The
candidate also had stationary label caching, so these runs do not isolate the
cost of each change. Chromium 151, M4 Max, ANGLE Metal, 1280 × 720, DPR 1;
15-second samples reset to 07:45 at playback rate 30, settling for four seconds
at 8× and ten at 24×. No CPU profiler or test suite ran during these pairs.
Earlier exploratory and pre-reboot samples are not pooled with them.

No general FPS gain is claimed for the final change. Its verified reductions
are unchanged label-layout work and paused vehicle-buffer uploads. Continuous
full-bus playback still needs work, particularly coarse offscreen rejection
and marker preparation/GPU interpolation. Actual Edge measurements on the
laptop remain necessary; CPU throttling is not a hardware calibration.
