# Zamery isolated staging restore runbook

This runbook is for recovery rehearsal only. Never use the active production or active staging
database/Storage volumes as a restore target.

## Required inputs

- a custom-format logical PostgreSQL dump;
- a schema-only SQL dump from the same pre-change snapshot;
- a Storage metadata manifest;
- a physical Storage checksum manifest;
- a policy/function baseline;
- `SHA256SUMS` covering every evidence artifact;
- the matching migration and rollback SQL.

## Safety gate

1. Record the source database identity and active Docker volume names.
2. Create a new temporary database with a unique `codex_restore_YYYYMMDD_HHMMSS` name.
3. Refuse to continue if the target name is `postgres`, `template0`, `template1`, or any active
   application database.
4. Use only synthetic mutations after restore.
5. Do not mount an active Storage volume. Compare Storage metadata and physical checksum manifests
   read-only instead.

## Restore and compare

1. Verify `SHA256SUMS` with `sha256sum --check`.
2. Verify dump readability with `pg_restore --list`.
3. Create the temporary database from `template0`.
4. Restore the custom dump with `pg_restore --exit-on-error --no-owner --no-privileges`.
5. Compare schema objects, table counts, constraints, functions, policies, Auth counts, Storage
   metadata counts, IDs, and foreign-key links with the captured baseline.
6. Compare the current read-only physical Storage checksum manifest with the pre-change manifest.
7. Apply the RLS migration to the temporary database and run `tests/rls-boundaries.sql`.
8. Apply the rollback SQL and compare relevant function/policy definitions with the baseline.
9. Drop only the exact temporary database after all sessions are disconnected.

## Acceptance

- restore exits successfully;
- schema/count/constraint/function/policy/Auth/Storage comparisons match;
- physical checksums match;
- IDs and links match;
- RLS contract passes after migration;
- rollback restores the pre-change policy/function baseline;
- the active database and active Storage volume names never appear as targets.
