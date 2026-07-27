# Safe deletion isolated acceptance — PR #95

Date: 2026-07-27

## Result

PASS. PR #95 (`agent/safe-deletion-protection`) was accepted while it remained
Draft and unmerged.

The acceptance used only synthetic data and loopback/private staging surfaces.
No customer data, managed/cloud Supabase, production configuration, public
ingress, deployment, or SVG runtime source was changed.

## Regression and browser acceptance

- `node --test`: 57 passed, 0 failed, both before browser acceptance and after
  final local cleanup verification.
- Desktop Chromium and phone viewport `390 × 844` passed.
- Clean synchronized deletion required confirmation and completed without
  removing unrelated data.
- TEMP, pending, active syncing, retryable-error, and unsynced-photo records
  entered the protected export plus deliberate-confirmation flow.
- A synchronized photo reopened correctly and did not create a false unsynced
  warning.
- Cross-measurement and ambiguous Storage ownership were rejected.
- Dirty navigation/logout was protected; clean saved state produced no warning.
- Backup JSON was secret-free, excluded photo binaries, and preserved drawing
  and SVG inputs.
- Replacement, IndexedDB upgrade behavior, service-worker update behavior,
  photo reopen, stale-sync recovery, and SVG regression checks passed.
- `drawing-bridge.js` matched `origin/main` byte-for-byte.

## Isolated staging safety

The full browser acceptance used the previously approved self-hosted staging
stack through its loopback-only gateway. Cleanup removed only recorded synthetic
resources after exact ownership checks.

Final staging assertions:

- Auth users created for acceptance: `0`;
- Zamery acceptance tables: `0`;
- Zamery acceptance policies: `0`;
- test bucket and objects: `0`;
- original `project-photos-staging` bucket: present;
- environment SHA-256 restored to
  `1d58b5954d1cf86da0b39d6d56566689ad9cc3b2967a1b524e16125301d3a078`;
- ten services healthy with zero restarts;
- gateway still bound only to `127.0.0.1:18000`;
- `https://tekstura.shop/`: HTTP `200`;
- `https://tekstura.shop/calculator`: HTTP `200`.

## Local browser cleanup continuation

The cleanup continuation used a fresh origin,
`http://127.0.0.1:5179`, served only on `127.0.0.1`.
The harness was temporary and is not part of this commit.

### Baseline

| Storage | Exact baseline |
| --- | ---: |
| IndexedDB databases | `[]` |
| PR95 drafts | `0` |
| measurement records | `0` |
| photo metadata | `0` |
| photo blobs | `0` |
| queue entries | `0` |
| Cache Storage keys | `[]` |
| service-worker registrations | `[]` |

### Synthetic seeded state

The only IndexedDB database created was
`tekstura-offline-shell`, version `3`, on the port-5179 loopback
origin.

| Storage | Seeded value |
| --- | ---: |
| PR95 drafts / measurement records | `4` |
| photo metadata / blobs | `1 / 1` |
| queue entries | `1` |
| Cache Storage keys | `pr95-cleanup-cache`, `tekstura-offline-shell-v37-app-shell` |
| service-worker registrations | `1`, scope `http://127.0.0.1:5179/` |

All four synthetic drafts were classified
`BLOCKED_UNTIL_SYNC_OR_EXPORT`. Immediate confirmed deletion was rejected;
the protected flow succeeded only with backup evidence and the exact deliberate
confirmation phrase. The unsynced-photo count was `1`; backup secrets and photo
binary payloads were absent; SVG input round-trip passed.

### Explicit cleanup and final proof

The application storage APIs safely deleted the queued photo and all four
drafts. The continuation then deleted the application IndexedDB database,
removed both cache entries, unregistered the service worker, waited for all
operations, and verified the same active origin before closing the page.

| Storage | Exact final state |
| --- | ---: |
| IndexedDB databases | `[]` |
| relevant IndexedDB databases | `0` |
| PR95 drafts | `0` |
| measurement records | `0` |
| photo metadata | `0` |
| photo blobs | `0` |
| queue entries | `0` |
| Cache Storage keys | `[]` |
| service-worker registrations | `[]` |

The previously ambiguous display of `[1]` was not the saved structured final
report. The saved report records the seeded database by exact name and version,
records its explicit deletion, and records an empty final database list. No
unidentified IndexedDB database remained.

The restricted verification report was saved before browser teardown with
SHA-256:

`36a2bd0c95ebfdd6b63b1eeccb19bb0b9193a2ec799ac6e5ece62503884a478f`

It contained no credentials, customer identifiers, signed URLs, Storage paths,
or photo binary payloads.

## Decision

Safe deletion acceptance is complete. PR #95 remains Draft and unmerged. The
next safe task is merge review; no additional runtime change is required.
