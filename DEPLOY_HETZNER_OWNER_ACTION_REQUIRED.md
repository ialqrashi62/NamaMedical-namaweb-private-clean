# 🚨 OWNER ACTION REQUIRED — GitHub Secrets for Auto-Deploy

The `deploy-hetzner-sftp.yml` workflow on
`ialqrashi62/NamaMedical-namaweb-private-clean` (branch
`audit/phase-1a-critical-remediation`) is **wired and ready** but fails on
`Install SSH key for Hetzner` because the GitHub repository has **no secrets
configured**.

## How to add the secrets

1. Open <https://github.com/ialqrashi62/NamaMedical-namaweb-private-clean/settings/secrets/actions>
2. Click **"New repository secret"** for each of the four rows below.
3. After saving all four, **re-run the failed workflow**:
   <https://github.com/ialqrashi62/NamaMedical-namaweb-private-clean/actions/workflows/deploy-hetzner-sftp.yml>

## Secrets to add

| Name | Value (commands to run on Windows PowerShell) |
|---|---|
| `HETZNER_HOST` | `204.168.144.74` (literal) |
| `HETZNER_USER` | `ubuntu` (literal) |
| `HETZNER_SSH_KEY` | `Get-Content C:\Users\ice\.ssh\id_ed25519 \| Set-Clipboard` (then Ctrl+V in the GitHub textarea) |
| `HETZNER_KNOWN_HOSTS` | Run this in PowerShell and paste output: <br>`ssh-keyscan -H 204.168.144.74 \| Tee-Object -FilePath hosts.txt; Get-Content hosts.txt \| Set-Clipboard` |

> The matching public key (`IA8zNgW23wn5FDJodpma0emPO01MxmCv8omY3g6a6TrU NamaMedical`)
> is already in `ubuntu@204.168.144.74:~/.ssh/authorized_keys`, so the SSH
> handshake will succeed as soon as GitHub has the matching private key.

## What will happen after secrets are added

1. GitHub Actions re-runs the workflow on `audit/phase-1a-critical-remediation` (HEAD = `ca4f5481`)
2. `actions/checkout` pulls the full repo + submodules
3. `appleboy/scp-action` uploads `namaweb/*` to `/var/www/namaweb/` on Hetzner (≈1.7 MB / 809 routes)
4. `appleboy/ssh-action` runs `pm2 reload nama-medical-erp` on the server
5. Workflow smoke-tests 14 endpoints (`/api/cardiology/score/grace`, etc.)
6. On success, `https://jumanasoft.com` will return 200 on every score endpoint

## If you prefer to bypass this and deploy manually

```bash
# 1. From your dev box, run the local helper script we already pushed:
cd c:\Users\ice\Desktop\NMEDCALVSCODE
powershell -ExecutionPolicy Bypass -File deploy_v5_full.ps1

# 2. Or, in a Hetzner cloud-console web shell:
sudo -i
cd /var/www/namaweb
git pull --ff-only origin audit/phase-1a-critical-remediation
git submodule update --init --recursive
pm2 reload nama-medical-erp
```

## What's in this commit (`cea7daf3` → `ca4f5481`)

- All 14 new department engines (cardiology / endo / emergency / pediatrics / surgery / pharmacy / oncology / nephrology / obgyn / pulmonology / gi / rheumatology / orthopedics / neurology) wired into `server.js` line 18466–18502.
- 5 forward + reverse migrations (e47 → e51).
- 15 Stitch frontend pages (AR/EN) under `public/departments/`.
- 76+ pure-function unit tests passing locally.
- This very workflow + this README.

— recorded by Copilot on 2026-08-10.
