# Migrations Apply Runbook — Tier-1

> **Generated:** 2026-08-01
> **Owner:** DSL
> **Status:** Sandbox-only

---

## 0. Pre-flight

```bash
# required: DATABASE_URL must point to NON-PRODUCTION DB
export DATABASE_URL=postgres://nama_user:nama_pw@127.0.0.1:5432/nama_local
export DEPLOY_TARGET=sandbox    # or 'dry-run' to validate
```

NEVER set `DEPLOY_TARGET=live` without explicit owner approval (AGENTS.md §2.4).

---

## 1. Apply all Tier-1 migrations

```bash
cd namaweb
node scripts/apply_all_tier1_migrations.js
```

The script:
1. Reads every `22_migration_up.sql` from `.ai-brain/02_MODULES_NEW/TIER*_*/`
2. Applies each in its own transaction
3. Counts tenant RLS policies at the end
4. Reports pass/fail per dept

Expected output:

```
== NamaMedical Migration Apply (sandbox) ==
Found 120 dept migrations.

✅ CARD-001 applied.
✅ PULM-001 applied.
...
Total tenant policies: 600+
Applied: 120/120 | Failed: 0
```

---

## 2. Verify

```bash
psql $DATABASE_URL -c "
  SELECT tablename, rowsecurity, forcerowsecurity
  FROM pg_tables t
  JOIN pg_class c ON c.relname = t.tablename
  JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname='public'
  WHERE schemaname='public' AND tablename ~ '_visits$|_orders$|_ai_assessments$|_tasks_v2$'
  GROUP BY tablename, rowsecurity, forcerowsecurity
  ORDER BY 1;"
```

Expected: every row has `rowsecurity = t` AND `forcerowsecurity = t`.

---

## 3. Rollback (per dept)

```bash
psql $DATABASE_URL -f 23_migration_down.sql   # one dept at a time
```

Each `*_down.sql` drops ONLY the tables it created (cascade). No data outside that dept's scope.

---

## 4. Cross-tenant smoke

```sql
SET app.tenant_id = 'tenant_a_uuid';
INSERT INTO tenants (id, name_ar) VALUES ('tenant_a_uuid','A'); -- once
INSERT INTO patients (tenant_id, mrn, national_id_hash) VALUES ('tenant_a_uuid','X', '\x00');
SET app.tenant_id = 'tenant_b_uuid';
INSERT INTO patients (tenant_id, mrn, national_id_hash) VALUES ('tenant_b_uuid','X', '\x00');

-- Now log in as tenant_b and try to read tenant_a patient.
SET app.tenant_id = 'tenant_b_uuid';
SELECT * FROM patients WHERE mrn = 'X';   -- should return only tenant_b patient
```

If `tenant_a` row is visible → RLS misconfigured → critical bug.

---

## 5. Owner sign-off checklist (production)

- [ ] All sandbox migrations applied
- [ ] Total RLS policy count >= ~600
- [ ] Cross-tenant smoke passes
- [ ] Backup before applying (`pg_dump`)
- [ ] Owner approves via PR to integration/all-epics
- [ ] Production `DEPLOY_TARGET=live` only via ops/live_deploy/

---

*Owner: DSL — 2026-08-01*
