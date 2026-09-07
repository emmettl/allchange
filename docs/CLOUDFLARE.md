# London observation worker

The `motionstudies-london-operations` Worker samples TfL predictions for the Victoria, Jubilee and Elizabeth lines once per minute. It serves `/operations.json` and `/health`, and archives observations below `london/tfl-operations/<UTC date>/` in the existing private `gleislicht-observations` R2 bucket. GitHub Pages serves the static edition; repository workflows do not deploy this Worker.

These commands run from the All Change checkout. The series thesis and evidence model live in the [London brief](https://github.com/emmettl/motionstudies/blob/main/docs/LONDON.md).

## Configure and deploy

Authenticate with `npx wrangler login`. The existing Cloudflare account and private R2 bucket are shared with the Swiss collectors; retain that bucket binding in `wrangler.london.jsonc`.

```sh
npx wrangler secret put TFL_API_KEY --config wrangler.london.jsonc
npx wrangler deploy --config wrangler.london.jsonc
npx wrangler tail motionstudies-london-operations
```

The collector makes four TfL requests per minute. Anonymous access supports initial verification; the registered key provides quota and operational identity for sustained collection. Keep the key in the Worker secret. The public browser configuration is the Worker URL followed by `/operations.json`.

After deployment, verify one successful scheduled invocation and inspect `/health` and `/operations.json`. Cron changes can take several minutes to propagate. Confirm that dated objects appear in the private R2 bucket before attempting a full-day export.

## Export a recorded day

Use object-read credentials for the existing R2 bucket:

```sh
CLOUDFLARE_ACCOUNT_ID=... \
R2_ACCESS_KEY_ID=... \
R2_SECRET_ACCESS_KEY=... \
npm run data:london:operations:export -- --date=2026-09-07

npm run data:london:operations:compile -- --date=2026-09-07
```

The compiler selects the UTC partitions needed for the requested Europe/London day, requires 1,200 unique minutes by default and writes integrity-hashed two-hour chunks. Missing observations stay missing. Credentials belong only to the command process, never to browser configuration or committed files. Keep raw observations until export and compilation have been exercised and an explicit retention policy is chosen.

## Local checks

`npm run worker:check` and `npm run worker:build` require no credentials or deployment. For local scheduled-event testing, use ignored development secrets and Wrangler’s scheduled test route.

Adapted from the [original shared operating guide](https://github.com/emmettl/gleislicht/blob/d22f67ed76882a2765a0cffc9fc763ef90acea0d/docs/CLOUDFLARE.md).
