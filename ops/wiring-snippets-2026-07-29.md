# WIRE-IN SNIPPETS — 2026-07-29

> Paste these into `/var/www/namaweb/server.js` **only after** the prior
> agent's three artifacts have been SCP'd to the prod server. Then
> restart PM2 and run `bash ops/wiring-verify.sh`.
>
> **Do NOT touch `server.js` directly under any other circumstance.**
> (Per `AGENTS.md` §2.4 — server.js edits are owner-authorized only.)

---

## Pre-flight (verify the artifacts exist on the server)

```bash
ls -la /var/www/namaweb/portal_api.js \
       /var/www/namaweb/plans.js \
       /var/www/namaweb/plans_assignment_test.js \
       /var/www/namaweb/portal_api_test.js \
       /var/www/namaweb/public/js/pwa-registration.js \
       /var/www/namaweb/public/manifest.json \
       /var/www/namaweb/public/sw.js \
       /var/www/namaweb/public/offline.html
```

All 8 files must exist. If any is missing, **stop** and re-apply the
prior session's deliverables before pasting the snippets below.

---

## Snippet #1 — Patient Portal API (the only new `server.js` line)

### Where it goes
**Insert immediately after line 18106** in `server.js` —
that line is the existing public router mount:

```js
app.use('/api/public', makePublicPlansRouter({ pool }));
```

### What to paste (3 lines)

```js
// ===== Patient Portal API — 2026-07-29 (9 endpoints, Patient role only) =====
// router is module.exports = router (plain Express Router). requireAuth +
// requireTenantScope applied at mount. The router enforces Patient role
// + portal_users linkage inside resolvePortalContext() (fail-closed on
// missing tenant/role — see portal_api.js header for safety-rail map).
const portalApi = require('./portal_api');
app.use('/api/portal', requireAuth, requireTenantScope, portalApi);
```

### What this changes
- Mounts 9 endpoints under `/api/portal/*`:
  `GET/POST /profile`, `GET/POST /appointments`,
  `GET /lab-results`, `GET /prescriptions`, `GET /invoices`,
  `POST /invoices/:id/pay`, `GET /notifications`.
- All money/claim routes (`/invoices/:id/pay`) already use
  `makeIdempotencyGuard` internally (rail 6 honored).
- No middleware changes; no schema changes; no env changes.

### Why this anchor (line 18106) is stable
- The `/api/public` mount is **never moved** — public plans router
  is the only router that intentionally bypasses auth.
- Adjacent context (lines 18102–18108) is a self-contained block with
  no `if`-gating or process.env conditionals — paste just after
  the close of that block.

---

## Snippet #2 — Plans API enhancements (NO new server.js lines needed)

The new routes from `plans.js` (entitlements, tenants, soft-delete,
PUT alias for tenant plan assignment) are **already inside the
existing `makePlansRouter` factory** which is mounted at line 18097:

```js
app.use('/api/super-admin', requireAuth, requireSuperAdmin(...), makePlansRouter({...}));
```

Because `makePlansRouter` is a factory that builds a Router from a
`{ pool, getActor, logAudit }` dependency bundle, **adding routes to
the router is automatic** — no re-wiring of `server.js` is required.

> **Do NOT paste anything for Snippet #2.** If you find yourself
> pasting a new `app.use('/api/super-admin', ...)` block, STOP — you
> are creating a duplicate mount. The previous agent already wired
> the new routes through the existing mount.

---

## Snippet #3 — PWA registration (already in `index.html`)

The PWA service-worker registration script was added at
`namaweb/public/index.html:205` by the prior session:

```html
<script src="/js/pwa-registration.js?v=20260729_1" defer></script>
```

**No new `server.js` lines needed.** Static files under
`/var/www/namaweb/public/` are served by the static-file middleware
already mounted higher in `server.js`.

### Verify the tag exists

```bash
grep -n 'pwa-registration' /var/www/namaweb/public/index.html
```

Expected output: line `205:    <script src="/js/pwa-registration.js?v=20260729_1" defer></script>`

---

## Diff-style preview (for visual confirmation before paste)

```diff
--- a/server.js
+++ b/server.js
@@ -18106,7 +18106,14 @@
 app.use('/api/public', makePublicPlansRouter({ pool }));
 
 // ===== CLINICAL CALCULATOR ROUTERS — Phase 2E2 (18 fns) + Phase 3 (48 fns across 26 engines) =====
 // Both routers are READ-ONLY clinical decision-support: no DB writes, no PHI, no PII.
 // requireAuth + requireTenantScope are applied INSIDE each router (router-level middleware).
 // Engine throws on validation error => translated to 400 with code='engine_error'.
 // Phase 2E2 lives at /api/calculators/*; Phase 3 (26 new engines) lives at /api/phase3/*.
+// ===== Patient Portal API — 2026-07-29 (9 endpoints, Patient role only) =====
+// router is module.exports = router (plain Express Router). requireAuth +
+// requireTenantScope applied at mount. The router enforces Patient role
+// + portal_users linkage inside resolvePortalContext() (fail-closed on
+// missing tenant/role — see portal_api.js header for safety-rail map).
+const portalApi = require('./portal_api');
+app.use('/api/portal', requireAuth, requireTenantScope, portalApi);
 const { makeCalculatorsRouter } = require('./clinical_calculators_router');
 app.use('/api/calculators', makeCalculatorsRouter({ requireAuth, requireTenantScope }));
```

The `@@` hunk header above (`-18106,7 +18106,14`) is identical to
the one in `wiring-snippets-2026-07-29.diff` so what you see here is
exactly what `git apply` will produce. The unique fingerprint is
the `app.use('/api/public', makePublicPlansRouter({ pool }));` line
on the very next line of context.

---

## Apply order (exact)

```bash
# 1. SSH in
ssh -i ~/.ssh/nama_medical_key root@204.168.144.74

# 2. Snapshot server.js (rollback insurance)
cp /var/www/namaweb/server.js /var/www/namaweb/server.js.pre-2026-07-29

# 3. Confirm pre-state (should be 401 on portal endpoints — unwired)
bash /var/www/namaweb/ops/wiring-verify.sh
# Expected: ❌ lines for /api/portal/* and ✅ for /api/public/plans + PWA

# 4. Apply patch (preferred) OR paste snippet #1 manually
cd /var/www/namaweb
git apply ops/wiring-snippets-2026-07-29.diff
# OR (manual paste):
#   - open server.js
#   - go to line 18106
#   - paste snippet #1 AFTER it (do not replace)

# 5. Smoke-test (no PM2 reload yet — node syntax check)
node --check /var/www/namaweb/server.js && echo "SYNTAX_OK"

# 6. Reload PM2 (owner-authorized)
pm2 reload nama-medical-erp
sleep 2
pm2 logs nama-medical-erp --lines 30 --nostream --raw | grep -iE 'error|portal|listening'

# 7. Re-verify (should now be ✅ on portal endpoints)
bash /var/www/namaweb/ops/wiring-verify.sh
```

---

## Rollback (if anything goes wrong)

### Option A — revert the patch
```bash
cd /var/www/namaweb
git checkout -- server.js
pm2 reload nama-medical-erp
```

### Option B — manual revert
Remove the **exact 7 lines** you added after line 18106:

```js
// ===== Patient Portal API — 2026-07-29 (9 endpoints, Patient role only) =====
// router is module.exports = router (plain Express Router). requireAuth +
// requireTenantScope applied at mount. The router enforces Patient role
// + portal_users linkage inside resolvePortalContext() (fail-closed on
// missing tenant/role — see portal_api.js header for safety-rail map).
const portalApi = require('./portal_api');
app.use('/api/portal', requireAuth, requireTenantScope, portalApi);
```

Then `pm2 reload nama-medical-erp`.

> Snippets #2 and #3 are **non-invasive** — no rollback needed; they
> only modify files outside `server.js`.

---

## Post-wiring test commands

```bash
# Plan routes (should 401 unauthenticated)
curl -sk -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/api/super-admin/plans
curl -sk -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/api/super-admin/tenants

# Portal routes (should 403 once wired — Patient role required)
curl -sk -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/api/portal/profile

# Public routes (should 200)
curl -sk -o /dev/null -w "%{http_code}\n" https://jumanasoft.com/api/public/plans

# PWA assets (should 200)
curl -sk -o /dev/null -w "%{http_code}\n" https://jumanasoft.com/manifest.json
curl -sk -o /dev/null -w "%{http_code}\n" https://jumanasoft.com/sw.js
curl -sk -o /dev/null -w "%{http_code}\n" https://jumanasoft.com/offline.html
curl -sk -o /dev/null -w "%{http_code}\n" https://jumanasoft.com/js/pwa-registration.js

# Full automated sweep
bash /var/www/namaweb/ops/wiring-verify.sh
```

---

## Safety rails check (per AGENTS.md §2.2)

| # | Rail | This wiring | Note |
|---|---|---|---|
| 1 | No hardcoded secrets | ✅ | No env or secrets added |
| 2 | No PHI in commits | ✅ | No fixtures added |
| 3 | No force-push | ✅ | Local edits + reload only |
| 4 | No DELETE FROM | ✅ | Soft-disable only (existing) |
| 5 | Tenant isolation | ✅ | `requireTenantScope` mounted |
| 6 | Money idempotent | ✅ | `/invoices/:id/pay` uses `makeIdempotencyGuard` |
| 7 | PHI encrypted | ✅ | No new PHI columns |
| 8 | CSP report-only | ✅ | No CSP changes |
| 9 | Money server-side | ✅ | `parseMoney` + `vatFromInclusive` only |
| 10 | Audit log | ✅ | Routes call existing `logAudit` |
| 11 | Fail-closed on missing tenant | ✅ | `resolvePortalContext` throws → router returns 403 |
| 12 | No secrets in logs | ✅ | All log lines scrubbed in portal_api.js |
| 13 | Golden Access Rule | ✅ | `/api/portal` is Patient-only |

---

## Files in this wiring helper

| File | Purpose |
|---|---|
| `ops/wiring-snippets-2026-07-29.md` | This document — paste instructions |
| `ops/wiring-snippets-2026-07-29.diff` | Unified diff for `git apply` |
| `ops/wiring-verify.sh` | Bash verification script (idempotent, exit 1 on fail) |