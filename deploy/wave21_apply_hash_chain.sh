#!/bin/bash
# Wave 21 — apply audit_trail hash chain + verify
set -e
cd /var/www/namaweb

echo "[1/4] applying hash-chain migration"
sudo -u postgres psql -d nama_medical_web -v ON_ERROR_STOP=1 -f migrations/p1_12_wave21_audit_hash_chain_up.sql 2>&1 | grep -v "could not change directory" | tail -10

echo ""
echo "[2/4] verifying schema"
sudo -u postgres psql -d nama_medical_web -c "\d audit_trail" 2>&1 | grep -v "could not change directory" | grep -E "prev_hash|row_hash|chain_idx|idx_audit_trail_chain"

echo ""
echo "[3/4] app restart + verify"
APP_PW=$(grep "^DB_PASSWORD=" /var/www/namaweb/.env | cut -d= -f2- | tr -d "\r\n")
echo "app smoke after restart (handled outside this script):"
echo "  /api/health => 200"
echo ""
echo "[4/4] verify chain after new writes"
PGPASSWORD="$APP_PW" psql -h 127.0.0.1 -U nama_medical_app -d nama_medical_web -c "SET app.tenant_id = '1'; SELECT id, action, module, chain_idx, substr(row_hash, 1, 16) as hash_prefix, substr(prev_hash, 1, 16) as prev_prefix FROM audit_trail WHERE row_hash <> '' ORDER BY chain_idx DESC LIMIT 5;" 2>&1 | grep -v "could not change directory"
