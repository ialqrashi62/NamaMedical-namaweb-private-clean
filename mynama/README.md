# MyNama — Patient Portal

> **Status:** AUTOPILOT scaffold (Phase P3-D v4)
> **Date:** 2026-08-01
> **Owner:** PM + DSL

---

## Stack

- Backend: Node.js + Express (`mynama/server.js`)
- Auth: SMART-on-FHIR patient/* scope + OTP (mock in sandbox)
- Frontend: Web (responsive) + Mobile (RN — Expo)
- Reuses `lib/` (Redactor, AuditService, ExecutionContext)
- i18n: ar + en (RTL/LTR)

## Endpoints

| Method | Path | Notes |
|--------|------|-------|
| POST | `/api/v1/mynama/login` | phone + OTP; returns patient JWT |
| GET  | `/api/v1/mynama/me` | profile (PHI masked) |
| GET  | `/api/v1/mynama/appointments` | list |
| GET  | `/api/v1/mynama/results` | recent labs/imaging |
| POST | `/api/v1/mynama/export` | PDPL portability (audit-logged) |
| GET  | `/health` | status |

## Frontend (web)

`mynama/public/` — generated from Stitch v2 tokens.

## Mobile (RN)

`mynama/mobile/` — Expo Router + Zustand + TanStack Query + SQLite offline sync.

## Sandbox run

```bash
cd namaweb
MYNAMA_PORT=3220 node mynama/server.js
curl -s http://127.0.0.1:3220/health
```

---

*Owner: PM+DSL — 2026-08-01*
