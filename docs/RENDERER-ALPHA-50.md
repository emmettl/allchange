# Stable renderer API adoption

All four shared packages are exact published `0.1.0-alpha.50` registry installs.
Fiber stays at 9.8.2, React at 19.3.1 and Three at 0.186.1. The renderer remains
WebGL with the same authored material families, geometry and study clocks.

## Changes

- `LondonMapSelection` reads state through `three/webgl-study` and obtains the
  renderer using `frameRenderer`; canvas identity and gesture lifetime are retained.
- National Rail, road labels and the quiet-map layer use `useWebGLStudyFrame` and
  explicitly require WebGL. The diagram's JSX type import uses that same boundary.
- Rail trail throttling reads `frameElapsed(state)`, preserving the canvas clock
  origin. Timetable playback still advances by delta and playback rate; pause,
  backward seek, emphasis invalidation and trail-budget scheduling are unchanged.
  The quiet-map's own delta-driven animation clock is retained.

No v10 scheduler objects, legacy imports, backend switch or material port are
included. Existing Chromium and WebKit production-artifact CI coverage is retained,
including the native WebKit frame-cadence gate.

## Build and diagnostic tools

The first alpha.50 build slightly exceeded the existing 366 KiB JavaScript gate.
The [supported Rolldown grouping](https://rolldown.rs/in-depth/manual-code-splitting)
now compresses React, React DOM and Scheduler together. All are required at startup;
optional scenes/layers remain independently lazy. The budget script, counted
closure and every threshold are unchanged.

Final opening JavaScript is **374,417 / 374,784 bytes gzip**, versus 374,632 at
alpha.43: **215 bytes smaller**. CSS stays 8,701 bytes and total opening payload is
592,318 / 665,600 bytes. [Candidate](renderer-readiness/alpha50/budget.json) and
[baseline](renderer-readiness/alpha43/budget.json) retain exact measurements.

The existing phone profiler initially could not reach its collapsed layer controls.
A separate three-line tool change opens the drawer before profiling; it changes
no application behavior. Baseline and candidate profiles use that same tool and
scope. Short headless measurements are diagnostic, not physical-device acceptance.

## Baseline and validation

The [baseline](renderer-readiness/alpha43/README.md) identifies remote source
`9d0607b`, lockfile, retained fixture tree and four paused production compositions.
All 277 unit tests, static checks, both worker checks/dry-run builds, build and
bundle gates passed. All 14 focused Chromium/WebKit production checks passed for
picking, listener lifetime, rail pause/seek/resume and idle buffer uploads.

Alpha.50 passes all 277 unit tests, typechecking, lint, boundary checks, worker
checks/dry-run builds and the final build/budget gates. Focused production browser validation covers picks, diagram/camera changes,
listener lifetime, pause/seek/resume, inactive uploads, lazy road loading and the
strict local WebKit cadence gate. The initial run passed 20 cases with one
existing desktop-only skip and one airport readiness failure. Its first click
ran while AIR still displayed loading and no airport targets were rendered. The
test now waits for the ready button state and three label/camera frames, with
all coordinates, assertions and timeout limits retained. Six repeated airport
cases then pass across Chromium and WebKit; the other original cases and strict
phone cadence check passed unchanged. The [validation report](renderer-readiness/alpha50/validation.json)
preserves both outcomes. Hosted PR CI independently exercises the complete suite.

[Installation evidence](renderer-readiness/alpha50/install.json) verifies all four
registry versions/integrities, the unchanged fixture tree and all **1,742** staged
data hashes. No source acquisition, refresh, workers deployment or fixture change
is included. Existing package-internal test instrumentation remains a future
readiness coupling; production code uses public package exports.

Physical-phone memory/thermal, leak/recovery and author visual acceptance remain
open. This source branch does not claim a deployed revision or WebGPU support.

[Candidate captures](renderer-readiness/alpha50/captures.json) retain the same
paused 07:45 geography/diagram views at 1440×1000 and 390×844, DPR 1.
[Image diagnostics](renderer-readiness/comparison.json) record cross-session
differences (up to 3.47% of pixels, with a maximum channel difference of 20 in
the phone diagram). Inspection found the same composition and material language;
pixel identity or author approval is not claimed.

The [candidate frame diagnostic](renderer-readiness/alpha50/performance.json)
uses the same profiler/settings as its baseline, without an overlapping local
GPU run initiated here. Software-rendered National Rail samples are slow in both
reports. Single short runs do not establish a causal performance conclusion.
