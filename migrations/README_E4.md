# E4 — Radiology (RIS + PACS metadata) candidate migrations

These migrations are **candidates** for the E4 epic. They are **NOT executed automatically**
and must NOT be run against production without an explicit owner gate + backup.

Every migration file exports `{ up, validate, down }` and runs against a `pg` client/pool
passed in by the caller. They are **idempotent** (safe to re-run) and follow the canonical
RLS posture already enforced on the 150 FORCE-RLS tables in this codebase:

- new tenant-scoped tables carry `tenant_id INTEGER NOT NULL`
- `ALTER TABLE ... ENABLE ROW LEVEL SECURITY; ... FORCE ROW LEVEL SECURITY;`
- a single canonical FOR ALL policy:
  `USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)`
  `WITH CHECK (...)` — identical predicate (matches `rls_local_dry_run_3_tables.js`)
- a `(tenant_id, ...)` composite index

`down` drops the policy, disables RLS, drops the table's own indexes, then the table.

## Files

| Order | File | Adds |
|-------|------|------|
| 1 | `e4_01_rad_worklist_up_validate_down.js`  | `rad_exams` (RIS worklist state machine) |
| 2 | `e4_02_dicom_studies_up_validate_down.js`  | `dicom_studies` (DICOM study METADATA only — no bytes) |
| 3 | `e4_03_rad_reports_up_validate_down.js`    | `rad_reports` (structured report + critical + signing) |

## Manual run convention (LOCAL ONLY, gated)

```
NODE_ENV=development node -e "const {Pool}=require('pg');const p=new Pool();(async()=>{ \
  const m=require('./migrations/e4_01_rad_worklist_up_validate_down.js'); \
  await m.up(p); console.log(await m.validate(p)); await p.end(); })()"
```

`up` runtime needs `app.tenant_id` set per-session by the app's monkey-patched `pool.query`
(see `db_postgres.js`); when running raw migrations as a superuser this is irrelevant for DDL.

## DEPLOY STEPS — NOT DEPLOYED
See the final report / commit message. Nothing here has been executed or pushed.
