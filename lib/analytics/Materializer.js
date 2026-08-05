'use strict';
// Materializer — runs nightly. RLS-aware: filters rows by tenantId from
// the source. Pure deterministic; safe to call from cron.

function newMaterializer(cube) {
  function run({ tenantId, rows }) {
    if (!tenantId) throw new Error('TENANT_REQUIRED');
    const safe = rows.filter(r => r.tenantId === tenantId);
    cube.ingest(safe);
    return { materialized: safe.length, tenantId };
  }
  return { run };
}

module.exports = { newMaterializer };
