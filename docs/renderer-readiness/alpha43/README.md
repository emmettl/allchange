# Alpha.43 renderer adoption baseline

The build, budget, capture and validation JSON files identify the exact source,
lockfile and retained fixture tree before alpha.50 adoption. Captures use paused
production builds in desktop and phone layouts. These are headless diagnostics,
not physical-device, thermal, memory-leak or author visual acceptance.

All 14 focused Chromium/WebKit checks passed, including rail/airport picking,
listener stability, pause/seek/resume and stopped buffer uploads while paused.
