# Live motorway observations

## Current state

The existing app displays recorded WebTRIS measurements from 5 September 2025. Its vehicles are a reconstruction of 15-minute detector totals. They are not individual tracked vehicles.

`london-road-worker/index.ts` prepares the **raw transport capture stage** of an NTIS integration. It does not yet decode NTIS traffic measurements, publish live traffic, or change the road animation. Capture is disabled by default. The subscriber schemas, test payloads and location tables must be obtained and validated before enabling it.

Registration has been submitted and is awaiting National Highways approval. Resume with the subscriber schemas and location tables once the account is approved.

## National Highways access

The current [NTIS subscriber portal](https://trafficengland.info/subscriberportal) offers free registration and data subscriptions. Its [delivery instructions](https://trafficengland.info/subscriberportal/howitworks) specify a pushed DATEX II XML service: subscribers supply an endpoint URL, username and password; National Highways sends a test payload and checks connectivity before moving the subscription from Pending to Active.

Request **MIDAS Loop Traffic Data** and **TMU Loop Traffic Data**, limited to the London motorway study area where subscription filters permit. Obtain **Asset Data** and **Network Model Data** for the location references. Do not substitute Predicted Traffic Data or assume access to Fused Traffic Data.

From the authenticated portal, obtain:

- The current WSDL/schema and sample/test envelopes for both loop feeds, including the required HTTP/SOAP acknowledgement and authentication requirements.
- The asset and network tables, including their version, direction, carriageway and lane references.
- Confirmation of the update frequency, measurement units, missing-value flags and aggregation periods.

The public portal currently lists the feeds but does not expose their downloadable schemas or location tables while signed out. Old trafficengland.com PDF links redirect and are not an adequate basis for implementing the current wire contract. The account is the remaining source-access dependency.

## Receiver configuration

The receiver has a separate Worker configuration, `wrangler.london-roads.jsonc`. It uses the existing private `gleislicht-observations` bucket under `london/ntis-raw/`. It does not change the TfL collector or create a scheduled polling job: NTIS initiates the deliveries.

The receiver was deployed on 7 September 2026 at `https://motionstudies-london-roads.louis-emmett.workers.dev`, with capture disabled. This is a provisioned callback host, not an active traffic service.

Callback paths on that origin:

- `/ntis/midas` for MIDAS Loop Traffic Data.
- `/ntis/tmu` for TMU Loop Traffic Data.

Create dedicated receiver credentials; these must **not** be the user's NTIS account password. Store them as Worker secrets and enter the same receiver credentials in the corresponding NTIS subscription. Never commit them or put them in the browser app.

```sh
npx wrangler secret put NTIS_USERNAME --config wrangler.london-roads.jsonc
npx wrangler secret put NTIS_PASSWORD --config wrangler.london-roads.jsonc
```

Configure `NTIS_ACK_XML` with the exact acknowledgement required by the current subscriber contract, and `NTIS_ACK_CONTENT_TYPE` as either `text/xml` or `application/soap+xml`. The body may be empty if that is what the contract requires. No guessed SOAP acknowledgement is included. If NTIS's current exchange requires request-dependent acknowledgements, SOAP faults, another authentication scheme or a different response media type, implement that contract before activation.

Only after validating the official test envelope and response, set `CAPTURE_ENABLED` to `true` and deploy:

```sh
npm run worker:roads:check
npx vitest run london-road-worker/index.test.ts
npm run worker:roads:build
npx wrangler deploy --config wrangler.london-roads.jsonc
```

The default deployment is intentionally in `setup-required` state. Do not ask National Highways to activate a subscription while the receiver still returns 503.

## Capture behavior

The receiver requires HTTP Basic authentication on every POST and accepts XML/SOAP with identity or gzip encoding. Wire and decompressed payloads are each limited to 8 MiB. Reassess the cap against the real area-filtered samples before activation.

It archives the unchanged decompressed envelope, compressed with gzip, under:

```text
london/ntis-raw/<UTC receipt date>/<midas|tmu>/<UTC receipt timestamp>-<SHA-256>.xml.gz
```

Each object records receipt time, hash, feed, byte count and `unvalidated-transport-capture`. Receipt time is not measurement time. XML is not parsed and external entities are never expanded. Credentials and request headers are not archived. Responses acknowledge only after the R2 write completes; storage failure returns 503 so the publisher can retry. Repeated deliveries remain archived; downstream ingestion must deduplicate using source identity and measurement time rather than adding their flows together.

Raw objects are never served by this Worker. `GET /health` reports configuration readiness and explicitly returns `liveTrafficAvailable: false`. It does not report successful observation delivery or freshness. There is no retention deletion job.

## Work after subscriber access

1. Validate the transport against the current schemas and an official test delivery, including acknowledgement and retry semantics.
2. Decode observation timestamps, interval lengths, units, lane and vehicle-class values, validity flags and reference-table versions. Keep invalid or absent measurements missing; preserve zero flow as a valid observation. Do not count overlapping lane totals, vehicle categories or retransmissions twice.
3. Audit the mapping from NTIS detector/location IDs to the existing road topology. WebTRIS IDs must not be assumed equivalent to NTIS IDs. Check carriageway direction and geometry, exclude ramps/unmapped sites, and retain an explicit coverage report.
4. Produce normalized latest observations and recorded-day chunks. Preserve the full UTC timestamp and derive London civil time with `Europe/London`, including midnight and daylight-saving transitions. A fresh receipt of an old measurement must remain stale.
5. Connect the road layer to these observations with measured age and coverage. Suppress stale/missing sections; never silently fill them with the historical fixture. Keep traffic reconstruction clearly labelled, and expose aggregate vehicles without inventing a light/heavy split when the source does not provide one. Keep live road time separate from historical rail playback.
6. Verify a real accepted delivery, mapped speeds and flows, archive/replay consistency, stale-feed behavior and visual playback before claiming that live roads are available.

The transport tests use explicit test-only envelopes. They do not constitute an NTIS schema or end-to-end live-feed test.
