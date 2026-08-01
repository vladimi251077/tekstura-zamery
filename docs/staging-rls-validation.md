# Staging RLS validation — 2026-08-01

Scope: the dedicated self-hosted `tekstura-supabase-zamery-staging` stack only. The cloud project and production stack were not changed.

## Backup and restore rehearsal

- Captured logical database dumps with and without ACLs, schema-only exports, Storage metadata, and SHA-256 manifests for all 21 physical Storage files before the migration.
- Restored the full ACL dump into an isolated PostgreSQL container and volume with no published host port.
- Compared normalized columns, indexes, constraints, functions, effective function grants, policies, Auth/Storage table counts, IDs, and links with the source staging database: exact match.
- Applied the migration in the isolated restore, ran `tests/rls-boundaries.sql`, applied the rollback, and compared the rolled-back schema with the pre-migration baseline: all passed.

## Active staging verification

- Applied `20260801185557_harden_zamery_rls_boundaries.sql` after confirming no schema drift from the rehearsed source.
- SQL boundary suite passed for admin, owner-zamer, foreign zamer, and constructor roles.
- Browser E2E passed through the public staging anon client for login, reload, token refresh, client/measurement creation, photo upload, metadata insertion, signed URL reopening, offline edit and reconnect sync, and idempotent retry.
- A foreign zamer saw zero rows and could not obtain signed URLs; a constructor could read both test measurements and photos.
- Zamer photo-row and Storage delete attempts removed zero records; admin deletion removed the exact two synthetic photo rows and two Storage objects.
- Synthetic records and users were removed. Counts returned to 5 profiles, 42 clients, 32 measurements, 21 photo rows, and 21 Storage objects.
- Both orphan directions were zero, and the post-cleanup SHA-256 set for all 21 physical Storage files matched the pre-migration baseline.

The isolated restore container and volume and all temporary E2E credentials were removed after verification. The retained backup directory is documented in `docs/staging-restore-runbook.md`.
