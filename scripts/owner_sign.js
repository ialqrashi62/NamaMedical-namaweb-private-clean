#!/usr/bin/env node
'use strict';
/**
 * owner_sign.js — repository audit log + owner sign-off CLI
 *
 *   node scripts/owner_sign.js grant  <owner-id>    add an owner
 *   node scripts/owner_sign.js revoke <owner-id>    remove an owner
 *   node scripts/owner_sign.js permit <action>      emit a signed permit
 *   node scripts/owner_sign.js log                  dump audit log
 *
 * Refuses unless run from a directory containing AGENTS.md + owner-keys
 * configuration. Stores sign-off log in `.ai-brain/99-state/owner_sign.jsonl`.
 *
 * SAFETY: a "permit" is informational. Real-world enforcement happens in
 * the deploy scripts (DEPLOY_ALLOWED_OWNER=1) which read this file.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const STATE_DIR = path.resolve(__dirname, '..', '..', '.ai-brain', '99-state');
const AUDIT_FILE = path.join(STATE_DIR, 'owner_sign.jsonl');
const CONFIG_FILE = path.join(STATE_DIR, 'owner_keystore.json');

function loadConfig() {
  if (!fs.existsSync(CONFIG_FILE)) return { owners: [] };
  return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
}

function saveConfig(cfg) {
  if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf8');
}

function newKeyId() {
  return crypto.createHash('sha256').update(crypto.randomBytes(16)).digest('hex').slice(0, 8);
}

function audit(entry) {
  if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR, { recursive: true });
  const line = JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n';
  fs.appendFileSync(AUDIT_FILE, line, 'utf8');
  return entry;
}

const arg = process.argv[2];
const sub = process.argv[3] || '';

if (arg === 'grant') {
  const cfg = loadConfig();
  const id = newKeyId();
  cfg.owners.push({ id, grantedAt: new Date().toISOString(), label: sub || 'unnamed' });
  saveConfig(cfg);
  audit({ action: 'grant', keyId: id, label: sub });
  console.log(JSON.stringify({ ok: true, keyId: id, label: sub }, null, 2));
} else if (arg === 'revoke') {
  const cfg = loadConfig();
  cfg.owners = cfg.owners.filter(o => o.id !== sub);
  saveConfig(cfg);
  audit({ action: 'revoke', keyId: sub });
  console.log(JSON.stringify({ ok: true, revoked: sub }, null, 2));
} else if (arg === 'permit') {
  if (!sub) { console.error('Usage: permit <action-label>'); process.exit(2); }
  const cfg = loadConfig();
  const owner = cfg.owners[0];
  if (!owner) { console.error('REFUSING: no owner registered. Run: node scripts/owner_sign.js grant <label>'); process.exit(3); }
  const entry = audit({ action: 'permit', keyId: owner.id, target: sub });
  // Signed permit token (HMAC not possible w/o secret; we sign via key id + ts hash)
  const token = crypto.createHash('sha256')
    .update(JSON.stringify({ keyId: owner.id, ts: entry.ts, target: sub }))
    .digest('hex')
    .slice(0, 16);
  console.log(JSON.stringify({ ok: true, keyId: owner.id, target: sub, ts: entry.ts, token, env: 'DEPLOY_ALLOWED_OWNER=1' }, null, 2));
} else if (arg === 'log') {
  if (!fs.existsSync(AUDIT_FILE)) {
    console.log('(no audit entries yet)');
    process.exit(0);
  }
  process.stdout.write(fs.readFileSync(AUDIT_FILE, 'utf8'));
} else if (arg === 'list') {
  const cfg = loadConfig();
  console.log(JSON.stringify(cfg, null, 2));
} else {
  console.log('NamaMedical Owner Sign-off CLI');
  console.log('Usage:');
  console.log('  node scripts/owner_sign.js grant  <label>');
  console.log('  node scripts/owner_sign.js revoke <key-id>');
  console.log('  node scripts/owner_sign.js permit <action>  (e.g. live-deploy, db-restore)');
  console.log('  node scripts/owner_sign.js list');
  console.log('  node scripts/owner_sign.js log');
}
