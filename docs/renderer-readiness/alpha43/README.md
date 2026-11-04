# Alpha.43 renderer adoption baseline

The build, budget, capture and validation JSON files identify the exact source,
lockfile and retained fixture tree before alpha.50 adoption. Captures use paused
production builds in desktop and phone layouts. These are headless diagnostics,
not physical-device, thermal, memory-leak or author visual acceptance.

All 14 focused Chromium/WebKit checks passed, including rail/airport picking,
listener stability, pause/seek/resume and stopped buffer uploads while paused.

The first mobile profiler attempt could not reach its hidden National Rail
button. Commit `ecb4000` opens the existing drawer before profiling, without
changing the app. The repeated profile uses that tool change and is recorded
separately from the original source/capture baseline.
