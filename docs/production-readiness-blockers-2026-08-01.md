# Production-readiness blockers — 2026-08-01

This record contains no credentials, personal data, measurement payloads, or signed URLs. No protected runtime, Supabase policy, production deployment, or data was changed while producing it.

## Approval gate

The production-readiness run is stopped because defects were reproduced in protected PWA/photo and Supabase RLS contracts. The proposed patches are review artifacts only and have not been applied.

## P0 — authenticated users can read foreign projects

The cloud project and self-hosted staging have identical relevant policy metadata. A transaction-scoped staging probe impersonated an active `zamer` with no owned measurements. RLS nevertheless exposed all 32 measurements, 42 clients, 21 photo rows, and 21 objects in the private `measurement-photos` bucket.

The cause is a group of `USING (true)` authenticated policies combined with an unrestricted authenticated Storage read policy. PostgreSQL combines permissive policies with OR, so these policies bypass the narrower ownership predicates.

`tests/rls-boundaries.sql` is the read-only regression probe. It currently fails. The exact fail-closed migration proposal is stored in `docs/proposed-fixes/2026-08-01-rls-boundary-hardening.patch`.

Risk requiring owner approval: removing the permissive delete policies leaves the already-existing admin-only delete rules in force. Removing the broad read policies also means that any future production role must be explicitly represented in `can_read_measurement`; current data contains only `zamer` profiles. The role matrix must be approved before applying this migration.

## P1 — required offline fallback is absent

`service-worker.js` declares both URL forms of `offline-fallback.html` as required app-shell entries, but the file is absent from Git, the immutable production image, and the public origin returns 404 for it. Service-worker installation catches that failure and continues, so registration can appear successful while the required-shell report is degraded.

`tests/pwa-shell-contract.test.js` fails on the missing file. The exact add-file proposal is stored in `docs/proposed-fixes/2026-08-01-pwa-offline-fallback.patch`.

Risk requiring owner approval: this changes a protected offline contract. It must be exercised in a clean browser profile and an upgrade profile before release.

## P2 — photo preview creates a second auth client

`photo-preview.js` fetches `app.js`, extracts the browser configuration from source text, and creates another GoTrue/Supabase client. Production browser smoke reproduced the SDK warning about multiple GoTrue clients sharing the same storage key. The main app already owns the authenticated client and creates signed photo URLs.

`tests/supabase-client-contract.test.js` fails on the duplicate client and source reparsing. The exact singleton proposal is stored in `docs/proposed-fixes/2026-08-01-single-supabase-client.patch`.

Risk requiring owner approval: client sharing touches the protected Auth/photo runtime. After approval it requires authenticated regression coverage for login persistence, photo reopen, signed URLs, logout, refresh, and offline recovery.

## Evidence already passing

- Canonical main commit, production checkout, immutable image contents, and served runtime files matched.
- Production container was healthy with zero restarts; public origin and required static endpoints responded correctly except the missing fallback.
- Existing test suite: 57 passed, 0 failed.
- JavaScript syntax, manifest parsing, HTML local references, icon dimensions, cache headers, TLS, and unknown-path 404 behavior passed.
- Cloud and self-hosted staging matched for relevant schema, constraints, policies, helper functions, row identities/links, Storage metadata, logical object names, and physical object checksums.
- Three backup sets passed their SHA-256 manifests; four custom-format PostgreSQL dumps passed `pg_restore --list`; the Storage JSON manifest parsed successfully.

## Work intentionally not continued

No RLS change, protected JavaScript/PWA change, production deployment, cutover, destructive E2E, staging restore, or rollback rehearsal was performed after reaching this gate. A restore runbook was not found and must be added before a recovery rehearsal can be accepted.
