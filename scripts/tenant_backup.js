#!/usr/bin/env node
'use strict';
// tenant_backup.js — produces per-tenant .dump filename conventions and a
// manifest. Real shaper would invoke pg_dump, but this sandbox builds:
//
//   per-tenant target  = /var/backups/nama/<date>-<tenantSafe>.schema+data.dump
//   global target      = /var/backups/nama/<date>-global.schema+data.dump
//
// The script only PRINTS the plan — it does NOT touch PG.

const fs = require('fs');
const path = require('path');

function tenantSafe(name) {
  return String(name || 'unknown').toLowerCase().replace(/[^a-z0-9_-]/g, '_');
}

function buildPlan({ tenants, baseDir = '/var/backups/nama', date, mode = 'schema+data' }) {
  if (!tenants || !tenants.length) throw new Error('TENANTS_REQUIRED');
  const d = date || new Date().toISOString().slice(0, 10);
  const plan = { date: d, baseDir, mode, global: null, tenants: [] };
  plan.global = `${baseDir}/${d}-global.${mode}.dump`;
  for (const t of tenants) {
    const safe = tenantSafe(t.tenantId || t.id || t.name);
    plan.tenants.push({
      tenantId: t.tenantId || t.id || t.name,
      facilityType: t.facilityType || 'unknown',
      target: `${baseDir}/${d}-${safe}.${mode}.dump`,
      retentionDays: 7,
      auditHash: t.auditHash || null,
    });
  }
  return plan;
}

function writePlan(plan, targetPath) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, JSON.stringify(plan, null, 2), 'utf8');
  return targetPath;
}

// Sample call
if (require.main === module) {
  const plan = buildPlan({
    tenants: [
      { tenantId: 'T1', facilityType: 'medical_city', auditHash: 'sha:abc' },
      { tenantId: 'T2', facilityType: 'phc', auditHash: null },
      { tenantId: 'demo-kuwait', facilityType: 'specialty_center' },
    ],
    date: new Date().toISOString().slice(0, 10),
  });
  console.log(JSON.stringify(plan, null, 2));
  process.exit(0);
}

module.exports = { buildPlan, writePlan, tenantSafe };
