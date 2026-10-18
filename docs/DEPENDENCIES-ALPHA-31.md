# Alpha.31 dependency refresh

30 September 2026. Exact published Motion Studies alpha.31 packages, React 19.3.0, React Three Fiber 9.8.1 and Three.js 0.186.1; Vite 8.3.1, Vitest 5.0.3, Oxlint 1.86.0 and npm 11.21.0.

Opening JavaScript rises from 346.9 to 362.6 KiB gzip. The JavaScript ceiling moves from 348 to 366 KiB; the 650 KiB total ceiling and all data, CSS and optional-feature budgets remain unchanged. The current total is 575.0 KiB.

Before and after builds used identical committed fixtures and application source (apart from the documented renderer-adapter compatibility change), on Node 24.21.0 / npm 11.21.0. The approximately 15.7 KiB increase is the shared/rendering dependency refresh, not additional downloaded data. These measured baselines retain explicit transfer limits.
