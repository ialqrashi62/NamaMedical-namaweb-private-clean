#!/bin/bash
# wave9a_verify.sh — runs on Hetzner to verify orderSets deployment
set -e
cd /var/www/namaweb

echo "=== server bundle count ==="
node -e "const o=require('./lib/careplans/orderSets'); console.log('server bundles:', o.listIds().length); console.log('ids:', o.listIds().join(', '))"

echo ""
echo "=== /api/v4/careplans/bundles (with tenant headers) ==="
curl -s -H "x-tenant-id: tnt-demo" -H "x-user-id: dr-test" -H "x-user-role: doctor" \
  http://127.0.0.1:3000/api/v4/careplans/bundles > /tmp/bundles.json

node -e "
const fs = require('fs');
const j = JSON.parse(fs.readFileSync('/tmp/bundles.json', 'utf8'));
console.log('API bundles:', j.count, '| items in stroke_alert:', (j.bundles.stroke_alert || {}).items ? j.bundles.stroke_alert.items.length : 0);
console.log('all bundle ids:', Object.keys(j.bundles).join(', '));
"
