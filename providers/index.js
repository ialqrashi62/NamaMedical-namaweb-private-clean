# Providers — KSA integrations + clinical adapters

This folder contains interfaces to external systems used by NamaMedical:

| File         | Purpose                                       |
|--------------|-----------------------------------------------|
| `nphies.js`  | Saudi national insurance claim submission, eligibility, prior auth, claim status (FHIR R4) |
| `zatca.js`   | ZATCA Phase-2 UBL + XAdES-BES invoice signing (GATE 9 blocked on real CSID) |
| `fhir.js`    | FHIR R4 client (Patient/Observation/Encounter/MedicationRequest) |
| `mirth.js`   | HL7 v2 ADT/ORU/RDE parser + translator to FHIR Bundle via Mirth Connect simulation |
| `index.js`   | Re-exports                                   |

## Sandbox behavior

All adapters run in **sandbox** mode by default — they never hit external
servers and return deterministic stubs. To promote to live:

1. Owner sets the appropriate `.env` variables (see each file's `.env` hint).
2. Owner signs off via `scripts/owner_sign.js permit <action>`.
3. Adapter reads `LIVE_ALLOWED` and switches to real transport.

## What this never does

- Never logs raw PHI (PHI_KEYS list in `lib/StructuredLogger.js`).
- Never blocks the workflow on provider timeout.
- Never retries without owner-gated idempotency key.
- Never writes secrets — only `pem`-style strings via `.env`.

## Testing each adapter

```bash
node scripts/smoke.js                           # includes provider adapter smoke
node scripts/providers_smoke.js                 # standalone (if generated)
```
