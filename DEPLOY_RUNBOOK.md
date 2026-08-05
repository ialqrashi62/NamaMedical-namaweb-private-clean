# NamaMedical Deployment Runbook (Tier-1, sandbox-first)

> **Generated:** 2026-08-01
> **Owner:** DSL
> **Target:** Sandbox first, then production (gated)

---

## 1. Smoke (sandbox)

```bash
cd namaweb
npm ci --no-audit --no-fund
npm test                   # unit + integration + cross-tenant
node scripts/apply_all_tier1_migrations.js   # DEPLOY_TARGET=dry-run prints
DEPT_SMOKE_PORT=3210 node routes/dept_attach.js &   # in subshell
sleep 2
curl -s http://127.0.0.1:3210/health
curl -s http://127.0.0.1:3210/api/v4/dept/list | head -c 500
```

Expected:
- `ok=true`
- `depts >= 21`

---

## 2. Sandbox DB apply

```bash
export DATABASE_URL=postgres://nama_user:nama_pw@127.0.0.1:5432/nama_local
export DEPLOY_TARGET=sandbox
node scripts/apply_all_tier1_migrations.js
```

Expected:
- `Applied: 120/120 | Failed: 0`
- Total tenant policies ≥ 600

---

## 3. Cross-tenant smoke (sandbox)

```bash
psql $DATABASE_URL -f tests/cross_tenant/tenant_isolation.test.sql
```

If the script returns 0 rows for cross-tenant SELECT, isolation proven.

---

## 4. Production readiness checklist (owner sign-off)

- [ ] All sandbox tests PASS
- [ ] All migrations applied in sandbox
- [ ] RLS policy count ≥ 600 (1 per dept + base)
- [ ] Cross-tenant isolation proven (manual query)
- [ ] Backup taken (`pg_dump`)
- [ ] Owner has approved PR to integration/all-epics
- [ ] Production secrets (Vault) provisioned
- [ ] OpenAPI specs published at jumanasoft.com/api/docs
- [ ] Alarms configured (SLO p95 latency, error rate, AI cost)

When all boxes ticked → proceed to `ops/live_deploy/`.

---

## 5. Rollback

```bash
# Per dept — drop only dept-scoped tables (non-destructive to other depts).
psql $DATABASE_URL -f ".ai-brain/02_MODULES_NEW/<TIER>_<DEPT>/23_migration_down.sql"
```

Cluster-wide rollback (last resort): restore from backup.

---

## 6. Observability

```bash
curl http://127.0.0.1:3000/metrics   # Prometheus
# or our dept_attach smoke port:
curl http://127.0.0.1:3210/health | jq
```

---

*Owner: DSL — 2026-08-01*
