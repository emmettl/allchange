# Shared transport cards · alpha.8

> Historical alpha.8 adoption record. Current exact package versions are in `package.json` and the lockfile; see the [README](../README.md) for current setup and scope. This record does not imply that every consumer uses an airport or rail board.

All consumed `@motionstudies/*` packages are pinned to `0.1.0-alpha.8` with npm registry integrity hashes.

Uses UK rail and bus matrix cards in the existing station widget. Arrivals, station areas, route filters, source-specific windows, retries and movement selection remain available. The station-only transfer budget is now 8 KiB JS / 5 KiB CSS (measured 7.5 / 4.4); combined/rail boards allow 10 / 5 KiB. These assets remain lazy and the opening-view budget is unchanged.
