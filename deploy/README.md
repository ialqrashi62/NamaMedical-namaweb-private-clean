# Deploy artifacts — NamaMedical (namaweb/)

## Files

| File                  | Purpose                                                  |
|-----------------------|----------------------------------------------------------|
| `ecosystem.config.cjs`| PM2 cluster + dept-api + mynama workers                  |
| `nginx.conf`          | reverse proxy + TLS + CSP-report-only headers             |
| `nama-medical.service`| systemd unit (alternative to PM2)                        |
| `restore_db.sh`       | owner-gated DB restore + RLS re-enforce (rail 4/5)        |
| `smoke_live.sh`       | post-deploy health check across all sub-apps             |

## Owner Approval Gate (AGENTS.md §2.4)

Any live action must include:

```bash
DEPLOY_TARGET=live DEPLOY_ALLOWED_OWNER=1
```

Without these vars, the deploy refuses with a non-zero exit code.

## Quick Start (sandbox)

```bash
cd namaweb
pm2 start deploy/ecosystem.config.cjs --env sandbox
sleep 3
bash deploy/smoke_live.sh
pm2 stop all
```

## Promote to Live

1. Owner runs DEPLOY_ALLOWED_OWNER=1 (one-time session token).
2. `cp .env.example .env` and fill real `DATABASE_URL`, `NPHIES_CLIENT_SECRET`, `ZATCA_CERT_PATH`.
3. `sudo bash deploy/restore_db.sh /var/backups/nama/latest.dump`.
4. `pm2 startOrReload deploy/ecosystem.config.cjs --env production`.
5. `bash deploy/smoke_live.sh`.

## Safety Rails enforced here

- Rail 1 secrets — `.env` gitignored; `.env.example` has placeholders
- Rail 4 destructive — restore_db refuses without fresh dump
- Rail 5 RLS — post-restore FORCE RLS re-enabled
- Rail 8 CSP — report-only until owner flips to enforce
- Rail 10 audit — main ERP boots audit middleware; auditable from PM2

## Rollback

```bash
pm2 reload ecosystem.config.cjs --env <prev>
# OR
git checkout integration/all-epics && pm2 startOrReload deploy/ecosystem.config.cjs
```
