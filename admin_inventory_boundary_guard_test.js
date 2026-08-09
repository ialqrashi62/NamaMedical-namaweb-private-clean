/**
 * Admin/Settings/Inventory/Messages Wave Boundary Guard
 * 19 routes: dept-requests, catalog, results, inventory, users, messages
 */
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.join(__dirname, '..', 'namaweb_waveA_subagent');
const serverSrc = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const schemasSrc = fs.readFileSync(path.join(ROOT, 'route_schemas.js'), 'utf8');

const checks = [
  { route: '/api/dept-requests',                verb: 'post', schema: 'deptRequestCreate' },
  { route: '/api/dept-requests/:id',            verb: 'put',  schema: 'deptRequestUpdate' },
  { route: '/api/catalog/lab/:id',              verb: 'put',  schema: 'catalogLabUpdate' },
  { route: '/api/catalog/radiology/:id',        verb: 'put',  schema: 'catalogRadiologyUpdate' },
  { route: '/api/results/:type/:id/acknowledge', verb: 'post', schema: 'resultAcknowledge' },
  { route: '/api/inventory/items',              verb: 'post', schema: 'inventoryItemCreate' },
  { route: '/api/inventory',                    verb: 'post', schema: 'inventoryLegacyCreate' },
  { route: '/api/inventory/:id',                verb: 'put',  schema: 'inventoryItemUpdate' },
  { route: '/api/inventory/:id',                verb: 'delete', schema: null },
  { route: '/api/inventory/purchase-orders',    verb: 'post', schema: 'inventoryPurchaseOrderCreate' },
  { route: '/api/inventory/purchase-orders/:id/status', verb: 'put',  schema: 'inventoryPurchaseOrderStatusUpdate' },
  { route: '/api/inventory/goods-receipts',     verb: 'post', schema: 'inventoryGoodsReceiptCreate' },
  { route: '/api/inventory/movements',          verb: 'post', schema: 'inventoryMovementCreate' },
  { route: '/api/inventory/stock-counts',       verb: 'post', schema: 'inventoryStockCountCreate' },
  { route: '/api/settings/users',               verb: 'post', schema: 'settingsUserCreate' },
  { route: '/api/settings/users/:id',           verb: 'put',  schema: 'settingsUserUpdate' },
  { route: '/api/settings/users/:id',           verb: 'delete', schema: null },
  { route: '/api/messages',                     verb: 'post', schema: 'messageCreate' },
  { route: '/api/messages/:id/read',            verb: 'put',  schema: null },
  { route: '/api/messages/:id',                 verb: 'delete', schema: null },
];

let pass = 0, fail = 0;

for (const c of checks) {
  const escaped = c.route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(
    `app\\.${c.verb}\\('${escaped}'[\\s\\S]{0,500}?idempotencyGuard\\s*,`
  );
  try {
    assert.ok(re.test(serverSrc), `idempotencyGuard missing for: ${c.verb.toUpperCase()} ${c.route}`);
    if (c.schema) {
      const defRe = new RegExp(`(?:const|let|var)\\s+${c.schema}\\s*=\\s*\\{`);
      assert.ok(defRe.test(schemasSrc), `schema ${c.schema} not defined`);
      const exportRe = new RegExp(`[,\\s]${c.schema}\\s*[,\\s}]`);
      assert.ok(exportRe.test(schemasSrc), `schema ${c.schema} not exported`);
    }
    console.log(`  PASS  ${c.verb.toUpperCase().padEnd(6)} ${c.route}${c.schema ? '  ->  ' + c.schema : '  (idempotencyGuard only)'}`);
    pass++;
  } catch (e) {
    console.error(`  FAIL  ${c.verb.toUpperCase().padEnd(6)} ${c.route}\n        ${e.message}`);
    fail++;
  }
}

console.log('');
console.log(`Admin/Settings/Inventory/Messages boundary guard: ${pass} passed, ${fail} failed.`);
if (fail > 0) process.exit(1);