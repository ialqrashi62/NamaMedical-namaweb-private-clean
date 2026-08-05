# NamaMedical Operator Runbook (P3-E v6.0)

> For the on-call ops engineer / DevOps / DBA.
> Read first: `AGENTS.md` §2 (safety rails), §2.4 (owner-approved actions).

---

## 0. Single-source-of-truth pointers

| Need | File |
|---|---|
| Live deploy plan | `namaweb/deploy/README.md` |
| Server mount patch (adds dept_api + mynama) | `namaweb/scripts/apply_server_mount_patch.js` |
| DB restore (guarded) | `namaweb/deploy/restore_db.sh` |
| All 113 dept engines | `namaweb/engines/` |
| Audit log table | `audit_events` (rail 10, hash-chained) |
| PHI redaction | `namaweb/lib/Redactor.js` |
| Governance audit | `namaweb/scripts/governance_audit.js` |
| Smoke (17 tests) | `namaweb/scripts/smoke.js` |
| Live smoke (4 checks) | `namaweb/deploy/smoke_live.sh` |

---

## 1. Daily ops

```bash
# 1) confirm app is up
pm2 ls
pm2 logs nama-medical-erp --lines 100 --nostream

# 2) health checks
curl -fsS https://jumanasoft.com/health
curl -fsS http://127.0.0.1:3210/health
curl -fsS http://127.0.0.1:3220/health

# 3) governance scan (should show 0 secrets)
node namaweb/scripts/governance_audit.js

# 4) smoke (17/17 expected)
cd namaweb && node scripts/smoke.js
```

---

## 2. Weekly safety audit (rail 4/5/10)

```bash
# RLS + FORCE RLS still on (rail 5)
PGPASSWORD=$DB_PASS psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "
  SELECT tablename, rowsecurity, forcerowsecurity
  FROM pg_tables
  WHERE schemaname='public'
  ORDER BY tablename;"

# audit chain integrity (rail 10)
PGPASSWORD=$DB_PASS psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "
  SELECT hash, prev_hash, ts FROM audit_events
  ORDER BY id DESC LIMIT 10;"
```

Both checks are automated by `safety_audit.sh` (referenced in `ops/`).

---

## 3. Emergency rollback

| Problem | Action |
|---|---|
| Bad deploy | `pm2 reload nama-medical-erp --update-env` (zero-down) |
| Bad code in server.js | `cp namaweb/server.js.bak_<ts> namaweb/server.js && pm2 reload nama-medical-erp` |
| DB corruption | `sudo DEPLOY_ALLOWED_OWNER=1 bash namaweb/deploy/restore_db.sh /var/backups/nama/<DATE>.dump` |
| Tenant leak | STOP app: `pm2 stop nama-medical-erp`, investigate `audit_events` |
| ZATCA reject storm | Set `ZATCA_PAUSED=1` in `.env`, reload |

---

## 4. Adding a new dept engine

```bash
# 1. pick a folder name not already taken
ls namaweb/engines

# 2. create folder
mkdir namaweb/engines/<yourdept>

# 3. write a class extending Engine (see any Tier-3 for example)
#    require('../../lib') — base class
#    register RED_FLAGS, DRUG_BLOCKS in ctor

# 4. add dept to smoke threshold (or just rely on auto-discovery)

# 5. add migration under namaweb/migrations/
#    <eN>_<dept>_tables_up.sql + _down.sql  (non-destructive)

# 6. run smoke
cd namaweb && node scripts/smoke.js
```

---

## 5. Owner-gated actions (always one-shot, never in cron)

| Action | Required |
|---|---|
| Restart server.js | `OWNER_APPROVED=1` + deploy target |
| Restore DB | `DEPLOY_ALLOWED_OWNER=1` + <=7-day dump |
| CSP switch to enforce | owner decision only |
| PHI destruction | owner decision only + written audit doc |
| Force-push to main/integration | NEVER (rail 3) |

---

## 6. KPIs to watch

- p95 `/api/*` latency < 500 ms
- Audit hash chain growing by ~N events/sec (N from background queue)
- Redactor yielding < 1% PHI hits in log buffer
- DrugCheckService yielding < 0.5% hard-blocks (otherwise doctors complain)
- Health probes: < 1% non-200 in 24 h

---

## 7. Contacts

- Primary on-call: GitHub Copilot + owner PR review
- Escalation: email to owner (in `.ai_rules`)
- Compliance officer: PDPL contact + ZATCA CSID renewal

(Replace placeholders before live.)
