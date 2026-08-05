# Sandbox Runbook — v13.0

This runbook documents the sandbox-safe execution paths and how to invoke them
without violating the 13 safety rails.

## Smoke (45 tests)
```bash
cd namaweb
node scripts/smoke.js     # → 45/45 PASS
```

## FHIR sandbox (loopback only)
```bash
node -e "
const { newFHIRServer } = require('./routes/fhir_server');
const app = newFHIRServer().expressify();
app.listen(3130, () => console.log('FHIR sandbox on :3130'));
"
# Headers: X-Tenant: <tenantId>
# content-type: application/fhir+json
```

## CredentialVault (AES-256-GCM, KEK rotation)
```bash
node -e "
const { CredentialVault } = require('./lib/CredentialVault');
const v = new CredentialVault({ path: '.ai-brain/99-state/vault.json' });
v.put('T1', 'nphies_secret', 'demo');
console.log(v.get('T1', 'nphies_secret'));
v.rotateKek('T1');
console.log('after rotation:', v.get('T1', 'nphies_secret'));
"
```

## Audit Replay
```bash
node scripts/migrate_audit.js
```

## Mirth / HL7 (sandbox-only)
- Source: `tools/mirth-sandbox/`
- Listens: `127.0.0.1:6661`
- Always forwards to the in-memory inbound channel; never writes to disk.

## RBAC guard
- `middleware/rbac_guard.js` → `rbacGuard({ role, scopes })`
- Sample call:
  ```js
  app.post('/api/notes', rbacGuard({ role: 'tenant:admin' }), handler);
  ```
- Failure modes: 401 if no tenant context, 403 if missing role, 403 if missing scope.

## CSP
- Default: report-only.
- Enforce mode is a separate approved deploy (see `docs/PHASE_B_D0_SECRETS_KEY_MANAGEMENT/`).
