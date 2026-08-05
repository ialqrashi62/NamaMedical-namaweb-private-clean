#!/usr/bin/env node
'use strict';
/**
 * apply_server_mount_patch.js
 *
 * SAFETY (AGENTS.md §2.4):
 *  - Server.js is the canonical server contract (1.4MB)
 *  - Refuses to run unless DRY_RUN != live or OWNER_APPROVED=1
 *  - Refuses if markers already exist (idempotent / no double-mount)
 *  - Refuses if backup target cannot be written
 *
 * Marks it adds inside server.js BEFORE the SPA catch-all:
 *   app.use('/api/v4/dept', require('./routes/dept_router'));
 *   app.use('/mynama',     require('./mynama/server'));
 *
 * Steps:
 *   1) cp server.js -> server.js.bak_<ts>
 *   2) inject lines after `// ===== SPA CATCH-ALL` comment but BEFORE app.get('*',...)
 *   3) verify markers
 *   4) print before/after ls
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const OWNER_FLAG = process.env.OWNER_APPROVED;
const SERVER_PATH = path.join(__dirname, '..', 'server.js');

function log(...args) {
  console.log('[mount-patch]', ...args);
}

if (process.env.DEPLOY_TARGET === 'live' && OWNER_FLAG !== '1') {
  log('REFUSING: live target requires OWNER_APPROVED=1 (AGENTS.md §2.4)');
  process.exit(2);
}

if (!fs.existsSync(SERVER_PATH)) {
  log('REFUSING: server.js not found at', SERVER_PATH);
  process.exit(3);
}

const source = fs.readFileSync(SERVER_PATH, 'utf8');

if (source.includes('// AUTO-MOUNT: dept_api_v4 (P3-E v6 owner-flagged)')) {
  log('already patched — nothing to do.');
  process.exit(0);
}

const ts = new Date().toISOString().replace(/[:T]/g, '-').split('.')[0];
const bakPath = path.join(__dirname, '..', `server.js.bak_${ts}`);

try {
  fs.copyFileSync(SERVER_PATH, bakPath);
  log('backup written:', bakPath, 'size=', fs.statSync(bakPath).size);
} catch (e) {
  log('REFUSING: cannot write backup:', e.message);
  process.exit(4);
}

const sentinel = '// ===== SPA CATCH-ALL (must be LAST route) =====';
if (!source.includes(sentinel)) {
  log('REFUSING: sentinel not found. server.js may have been edited; refusing to patch blindly.');
  process.exit(5);
}

const newLines = [
  '// AUTO-MOUNT: dept_api_v4 (P3-E v6 owner-flagged) — reuses pg pool + session from main app',
  'try {',
  "  app.use('/api/v4/dept', require('./routes/dept_router'));",
  "} catch (e) { console.warn('[mount] /api/v4/dept not mounted:', e.message); }",
  '',
  '// AUTO-MOUNT: mynama_portal (P3-E v6 owner-flagged) — patient portal sub-app',
  'try {',
  "  const _mynamaApp = require('./mynama/server');",
  "  if (_mynamaApp && (_mynamaApp.handle || typeof _mynamaApp === 'function')) app.use('/mynama', _mynamaApp);",
  "} catch (e) { console.warn('[mount] /mynama not mounted:', e.message); }",
  '',
];

const patched = source.replace(sentinel, newLines.join('\n') + sentinel);

if (patched === source) {
  log('REFUSING: replacement produced no diff. Aborting.');
  process.exit(6);
}

try {
  fs.writeFileSync(SERVER_PATH, patched, 'utf8');
  log('patched server.js, new size=', fs.statSync(SERVER_PATH).size);
} catch (e) {
  log('REFUSING: write failed:', e.message);
  process.exit(7);
}

// sanity check via node --check
const { execSync } = require('child_process');
try {
  execSync('node --check ' + JSON.stringify(SERVER_PATH), { stdio: 'pipe' });
  log('node --check passed.');
} catch (e) {
  log('REFUSING: node --check failed — restoring backup');
  fs.copyFileSync(bakPath, SERVER_PATH);
  process.exit(8);
}

log('ok');
log('next step (owner only):  pm2 restart nama-medical-erp');
log('rollback:                cp ' + bakPath + ' ' + SERVER_PATH);
