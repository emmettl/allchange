# E2E migration — September 2026

The suite now has **30 browser cases instead of 70**, plus **309 Vitest tests instead of 269**. The migration adds 40 tests across six files, including five DOM test files. Application behavior is unchanged.

## Coverage ownership

| Original E2E coverage | Replacement / retained coverage |
| --- | --- |
| National Rail gateway and branch loops, CRS/UIC/service search, station-to-pulse callbacks, shared clock | `src/studies/app-state.test.tsx` mounts the real app and exercises 20 station selections, eight rail entry points and Eurostar lookup. Existing `london-rail-network.test.ts` still audits all advertised stations. Two rail browser journeys retain lazy renderer loading, mobile cards, movement and pulse handoff. |
| Combined-board gateway aliases and operator variants | Existing `combined-station-board.test.ts` audits source identities, ownership and time windows. `app-state.test.tsx` compares five gateways through both actual UI entry points. `board-state.test.tsx` covers northern-area selection, independent partial sources, both retries, filtering and movement callbacks for both source types. Two browser tests retain the TfL-to-rail and rail-to-TfL handoffs; Eurostar retains its separate board journey. |
| Corridor failures, independent retries, caching, cancellation | `src/data/feeds.dom.test.tsx` runs the actual `useNationalRail` hook for Paddington, Waterloo and King's Cross, including retained successful corridors and cancelled requests. A combined-board E2E still verifies a real routed failure and successful Retry button recovery. |
| Damaged bus chunks and progressive loader recovery | `feeds.dom.test.tsx` exercises the actual `useBusDay` hook, integrity rejection, reactivation and an evening chunk seek. A real browser bus activation/search/seek journey remains; the night study covers overnight loading. |
| Cycle date/dock races, failure recovery, cache reuse, unavailable dates, fixed profile scales and guided values | `cycle-state.test.tsx` mounts the actual study/comparison with controlled loader promises; `optional-loaders.test.ts` exercises real cache/validation/retry behavior. Existing cycle data tests continue to reconcile all dates and authored counts. Two browser journeys retain real canvas/keyboard/playback, rail-to-cycle handoff and guided comparison. |
| Passenger source aliases, unsupported metrics, preceding-day source selection and retry races | Existing `passenger-demand.test.ts` audits all sources and interval boundaries. `optional-studies.test.tsx` exercises real hooks/cards with deferred loader results, Retry buttons and source changes. `optional-loaders.test.ts` covers real fetch/cache behavior. `app-state.test.tsx` verifies host/metric/area preservation and rail-to-pulse handoff. One browser journey retains actual SVG animation, reduced motion and train/passenger scene switching. |
| Hero dismissal variants and late-loaded rail cards | `app-state.test.tsx` verifies real rail/airport host dismissal, metric persistence, selection retention and a dismissed card receiving a deferred successful retry. The station-board browser journey retains keyboard focus transfer, target dimensions, compact layout and reopen/selection preservation. |
| Station-board filtering, source clipping, retries, end-of-day rows and movement callbacks | Existing `station-board.test.ts` owns call semantics and boundary permutations. `board-state.test.tsx` owns actual rendered rows/buttons and callbacks. One browser journey retains flap CSS, responsive bounds, dismissal, selection through diagram switching and movement handoff. |
| Night failures, departure gaps, checkpoint callbacks and mode handoff | `optional-studies.test.tsx` covers Retry and departure buttons; existing `night-study.test.ts` owns gap/no-wrap rules; `app-state.test.tsx` verifies night-to-directional mode/clock transitions. One short night browser journey retains real map/card composition and viewport fit. |
| Morning-flow optional download and checkpoint/selection state | `optional-loaders.test.ts`, `optional-studies.test.tsx`, and `app-state.test.tsx`. One browser journey retains actual SVG/geographic/diagram layout, playback and return to the map. |
| Vehicle-count combinations and category/station selection | Existing `vehicle-counts.test.ts` retains all 64 layer combinations; `app-state.test.tsx` adds actual category/station/release UI wiring. A compact air/road browser check retains the real adapter outputs, labels, seeking and quiet state. |
| Initial/full-day aircraft hour loading | `feeds.dom.test.tsx` exercises the real `useProgressiveAirDay` hook: no startup request, activation, and a genuine seek from 07:00 to 18:00 chunks. Browser air/airport journeys retain production layer/board rendering. |
| General boot, lazy production assets, river/air/road/day scenes, diagram, controls and tooltips | Browser coverage remains. Redundant startup checks/search journeys and unconditional diagnostic screenshots were reduced. Screenshots/traces on failure remain enabled. |
| WebGL draw/buffer regressions, pointer-listener churn, frame cadence, touch map picking | Browser coverage remains. Unit tests cannot replace real renderer/input checks. Frame cadence still runs in isolation on iPhone WebKit. |

## Test harness

`src/test/dom.ts` provides a jsdom environment with media-query and observer shims and a non-running animation clock. It does not pretend to implement browser layout or GPU rendering. App tests replace only the two Three.js scene components and inspect the state passed to them. The real app controller, search handlers, cards, loaders and hooks run normally.

`src/test/fixture-fetch.ts` resolves public data names directly to committed fixture files, mirroring `stage-data.mjs`; the tests need no build or preview server. Responses preserve exact bytes so progressive bus/day integrity checks run normally. Individual tests override only selected responses. Loader-only tests reset module caches; component race tests control the loader promise boundary while keeping the mounted React effects real.

Real loading, clipping, filtering and retry behavior is asserted before the corresponding E2E replay is removed. The retained browser recovery asserts the recovered operator/rows, not merely that an already-visible board still exists. Reduced-motion diagram coverage now records layout transitions and rejects intermediate values as well as checking computed flap CSS.

## Checks and measurement

- Initial baseline: 70 source E2E cases; 136 applicable functional browser executions across Chromium and iPhone WebKit, excluding isolated cadence.
- Final suite: 30 source E2E cases; 57 applicable functional executions, plus the isolated WebKit cadence check. Two project-specific cases are skipped in a raw two-project run.
- Baseline functional run: **312.87 seconds**, 136 passed, no failures or retries.
- Reduced functional run: **148.51 seconds**, 57 passed, no failures or retries: **52.5% less wall time** locally.
- All **309 Vitests** pass with Node 24; typecheck, lint, import-boundary check, production build, bundle budgets, worker typechecks and worker dry-run builds pass.

Browser timings use the same local Mac, both projects, two workers and a prebuilt site. They measure the functional test command, not the complete hosted build/deployment pipeline. CI builds once and runs three jobs in parallel: two Chromium shards and one WebKit job, with one worker per runner. Individual tests are shardable in CI so large files do not bottleneck one Chromium runner. The isolated WebKit cadence check still runs once after its functional tests. The local cadence command targets WebKit explicitly to avoid booting a desktop case just to skip it. The local timings above do not include any additional improvement from CI sharding.

Run `npm test` for all data and DOM tests, `npm run test:e2e:ci` for browser checks, or `E2E_PREBUILT=1 npx playwright test --grep-invert @frame-cadence` to compare functional timings against an already-current build.
