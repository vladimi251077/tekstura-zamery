# Stale-sync isolated acceptance — 2026-07-27

## Result

PASS. The stale-sync recovery and reconciliation delivered by PR #91 were accepted against the documented loopback-only self-hosted Supabase staging environment.

Only synthetic staging data was used. Cloud Supabase, customer data, production configuration, and SVG runtime sources were not changed.

## Isolation and baseline

- Application revision: `3063ddb` (`main`, merged PR #91).
- Staging gateway: `127.0.0.1:18000` only.
- Synthetic resources:
  - one temporary Auth user;
  - one synchronized client;
  - one synchronized measurement;
  - one local-only independent TEMP measurement;
  - one private test bucket, `zamery-measurement-photos-test`;
  - one synthetic 8×8 PNG.
- Pre-test counts: clients `0`, measurements `0`, photo rows `0`, test-bucket objects `0`.
- Original staging baseline: eight website tables, zero Zamery tables, zero Auth users, and the existing `project-photos-staging` bucket.
- The temporary app copy pointed only to the loopback staging URL. A temporary, uncommitted acceptance harness injected the synthetic file into the normal photo input and rejected selected responses only after the staging server returned success.

## State and retry evidence

The synchronized local operation was `local_f11e374d-b0fd-4a55-bbb7-47365cf62dbd` (`TEMP-001`).

### Stale recovery

- Measurement state before restart:
  - `sync_status=syncing`;
  - `sync_attempt_started_at=2026-07-26T21:10:38.844Z`, more than six minutes old;
  - `sync_attempt_count=3`;
  - error context `synthetic prior timeout context`.
- Measurement state after restart:
  - `sync_status=sync_error`;
  - attempt count remained `3`;
  - start timestamp and error context were preserved.
- Photo state before restart:
  - `sync_status=syncing`;
  - `sync_attempt_started_at=2026-07-26T21:12:15.340Z`, more than six minutes old;
  - `sync_attempt_count=2`;
  - error context `synthetic prior photo timeout context`.
- Photo state after restart:
  - `sync_status=sync_error`;
  - attempt count remained `2`;
  - start timestamp and error context were preserved.
- `TEMP-002` was created with a current `syncing` timestamp and remained `syncing` after restart. Recovery did not reset the non-stale operation.

### Lost response and reconciliation

| Accepted remote write whose response was discarded | Count immediately after the lost response | Reconciliation result |
| --- | ---: | --- |
| Client create | clients `1`, measurements `0`, rows `0`, objects `0` | Existing client reused |
| Measurement create | clients `1`, measurements `1`, rows `0`, objects `0` | Existing measurement reused |
| Storage upload | clients `1`, measurements `1`, rows `0`, objects `1` | Exact object path reused |
| `measurement_photos` insert | clients `1`, measurements `1`, rows `1`, objects `1` | Existing owned row reused |

Identifiers:

- Client: `16026f05-c5bc-436c-abbd-79a27620dc56`.
- TEMP measurement: `TEMP-001`.
- Planned and final number: `KZN-ZM-2026-377489`.
- Real measurement: `a8829cce-6f9a-4bc3-b667-74af4a833824`.
- Photo row: `2ffe83eb-ffb8-4dca-bb4c-ae2e2257c370`.
- Storage path: `measurements/a8829cce-6f9a-4bc3-b667-74af4a833824/photo_local_c7393620-fff4-41d8-849c-9e2428c32a6c.png`.

The planned server number survived the lost measurement response and became the final server number. The real measurement ID found during reconciliation was saved back to the same TEMP draft.

The initial 76-byte synthetic PNG had a valid PNG signature but was not browser-decodable. Before reopen validation, its bytes were replaced at the same synthetic object path with the prepared valid 194-byte 8×8 PNG. This did not create another Storage object or database row.

### Concurrency and independence

Two simultaneous `syncOfflineDraft()` calls for `TEMP-001` both fulfilled. The per-measurement coordinator allowed only one conflicting pipeline, and final local states were:

- measurement `synced`;
- photo `synced`;
- no operation stuck in `syncing`.

Post-retry counts remained clients `1`, measurements `1`, photo rows `1`, Storage objects `1`. The photo row measurement ID and the measurement segment in its path both matched the real measurement. Cross-measurement associations: `0`.

`TEMP-001` progressed to `synced` while the separate, non-stale `TEMP-002` remained active and unchanged, confirming that serialization is scoped per measurement.

## Reopen evidence

After a full editor reload:

- gallery cards `1`;
- gallery images `1`;
- decoded image size `8×8`;
- fallback/error media `0`;
- signed URL HTTP `200`, `Content-Type: image/png`;
- SVG count `1`;
- SVG `viewBox="0 0 1100 760"`;
- SVG paths `3`, lines `98`, text nodes `7`;
- rendered SVG box approximately `758×650`;
- labels included the drawing title, direction, `L 2500`, `W 1000`, `H 2800`, and `T 200`.

In the production view for the same measurement:

- signed photo links `1`;
- decoded image size `8×8`;
- signed URL HTTP `200`, 194 bytes;
- SVG count `1`;
- SVG `viewBox="0 0 1100 760"`;
- SVG paths `3`, lines `98`, text nodes `7`;
- rendered SVG box approximately `822×568`;
- dimension cards showed `L 2500`, `W 1000`, `H 2800`, and `T 200`.

## Cleanup and restoration

Cleanup followed the documented order:

1. signed out the synthetic user;
2. deleted the exact synthetic Storage object;
3. ran the guarded Zamery cleanup SQL;
4. deleted the empty test bucket;
5. deleted the synthetic Auth user;
6. restored the staging environment file from the pre-test backup;
7. force-recreated only the Auth service;
8. stopped the local HTTP server and SSH tunnel.

Post-cleanup verification:

- environment SHA-256 restored to `1d58b5954d1cf86da0b39d6d56566689ad9cc3b2967a1b524e16125301d3a078`;
- public tables `8`, matching the pre-test list;
- Zamery tables `0`;
- Zamery policies `0`;
- Auth users `0`;
- test bucket `0`;
- test-bucket objects `0`;
- original `project-photos-staging` bucket `1`;
- all ten staging services healthy with restart count `0`;
- gateway still bound only to `127.0.0.1:18000`;
- `https://tekstura.shop/` HTTP `200`;
- `https://tekstura.shop/calculator` HTTP `200`.

No staging SQL or infrastructure procedure change was required, so no `tekstura-platform` PR was created.
