/**
 * ex_migrations_guard_test.js — E-X migrations: static RLS / FK / index / idempotency assertions.
 * No DB execution. Reads the candidate .sql files as text. Run: node ex_migrations_guard_test.js
 */
const fs = require('fs');
const path = require('path');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  PASS', m); } else { fail++; console.log('  FAIL', m); } };
const M = (f) => fs.readFileSync(path.join(__dirname, 'migrations', f), 'utf8');

// canonical RLS policy template (must match the 150 FORCE policies exactly)
const rlsPolicy = (t) => new RegExp(
    `ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY;[\\s\\S]*?` +
    `ALTER TABLE ${t} FORCE ROW LEVEL SECURITY;[\\s\\S]*?` +
    `DROP POLICY IF EXISTS rls_${t}_tenant_isolation ON ${t};[\\s\\S]*?` +
    `CREATE POLICY rls_${t}_tenant_isolation ON ${t}[\\s\\S]*?` +
    `USING \\(tenant_id = NULLIF\\(current_setting\\('app\\.tenant_id', true\\), ''\\)::integer\\)[\\s\\S]*?` +
    `WITH CHECK \\(tenant_id = NULLIF\\(current_setting\\('app\\.tenant_id', true\\), ''\\)::integer\\)`
);

// ===== ex_01 orders =====
{
    const up = M('ex_01_orders_up.sql');
    ok(up.includes('CREATE TABLE IF NOT EXISTS orders'), 'ex_01: orders created (IF NOT EXISTS)');
    ok(up.includes('CREATE TABLE IF NOT EXISTS order_items'), 'ex_01: order_items created (IF NOT EXISTS)');
    ok(up.includes('CREATE TABLE IF NOT EXISTS order_sets'), 'ex_01: order_sets created (IF NOT EXISTS)');
    ok(/tenant_id INTEGER NOT NULL REFERENCES tenants\(id\) ON DELETE CASCADE/.test(up), 'ex_01: tenant_id NOT NULL REFERENCES tenants(id)');
    ok(up.includes("type IN ('lab', 'rad', 'med', 'consult')"), 'ex_01: orders.type CHECK in (lab,rad,med,consult)');
    // I2: orders.status CHECK present + idempotent (DROP IF EXISTS then ADD)
    ok(up.includes("status IN ('pending', 'active', 'completed', 'cancelled')"), 'ex_01: orders.status CHECK in (pending,active,completed,cancelled)');
    ok(/ALTER TABLE orders DROP CONSTRAINT IF EXISTS chk_orders_status;[\s\S]*?ALTER TABLE orders ADD CONSTRAINT chk_orders_status CHECK/.test(up),
       'ex_01: status CHECK idempotent (DROP CONSTRAINT IF EXISTS then ADD)');
    ok(/encounter_id INTEGER,/.test(up) && !/encounter_id INTEGER NOT NULL/.test(up), 'ex_01: encounter_id nullable (no encounters parent yet)');
    ok(rlsPolicy('orders').test(up), 'ex_01: orders ENABLE+FORCE RLS + canonical isolation policy');
    ok(rlsPolicy('order_items').test(up), 'ex_01: order_items ENABLE+FORCE RLS + canonical isolation policy');
    ok(rlsPolicy('order_sets').test(up), 'ex_01: order_sets ENABLE+FORCE RLS + canonical isolation policy');
    ok(up.includes('idx_orders_tenant_id') && up.includes('idx_order_items_tenant_id') && up.includes('idx_order_sets_tenant_id'),
       'ex_01: tenant_id indexes for all three tables');
    ok(up.includes('CREATE INDEX IF NOT EXISTS'), 'ex_01: indexes idempotent (IF NOT EXISTS)');
    ok(up.trim().startsWith('-- ') && up.includes('BEGIN;') && up.trim().endsWith('COMMIT;'), 'ex_01: BEGIN/COMMIT wrapped');

    const down = M('ex_01_orders_down.sql');
    ok(down.includes('DROP TABLE IF EXISTS order_items') && down.includes('DROP TABLE IF EXISTS orders') && down.includes('DROP TABLE IF EXISTS order_sets'),
       'ex_01 down: drops all three (IF EXISTS, FK-safe order)');
    // order_items dropped before orders (FK child first)
    ok(down.indexOf('DROP TABLE IF EXISTS order_items') < down.indexOf('DROP TABLE IF EXISTS orders'), 'ex_01 down: child order_items dropped before orders');

    const val = M('ex_01_orders_validate.sql');
    ok(/orders_exists/.test(val) && /chk_orders_type/.test(val) && /fk_to_tenants/.test(val), 'ex_01 validate: asserts existence + type check + FK to tenants');
    ok(!/INSERT|UPDATE|DELETE|CREATE TABLE|DROP/.test(val), 'ex_01 validate: read-only (no DDL/DML)');
}

// ===== ex_02 rbac =====
{
    const up = M('ex_02_rbac_up.sql');
    ok(up.includes('CREATE TABLE IF NOT EXISTS permissions'), 'ex_02: permissions created (IF NOT EXISTS)');
    ok(up.includes('CREATE TABLE IF NOT EXISTS role_permissions'), 'ex_02: role_permissions created (IF NOT EXISTS)');
    ok(/CONSTRAINT uq_permissions_key UNIQUE \(key\)/.test(up), 'ex_02: permissions.key UNIQUE');
    ok(/CONSTRAINT uq_role_permission UNIQUE \(tenant_id, role, permission_key\)/.test(up), 'ex_02: role_permissions UNIQUE(tenant_id,role,permission_key)');
    ok(/role_permissions \([\s\S]*?tenant_id INTEGER NOT NULL REFERENCES tenants\(id\)/.test(up), 'ex_02: role_permissions.tenant_id NOT NULL REFERENCES tenants(id)');
    ok(rlsPolicy('role_permissions').test(up), 'ex_02: role_permissions ENABLE+FORCE RLS + canonical isolation policy');
    // permissions is a GLOBAL catalog -> intentionally NO tenant_id / NO RLS
    ok(!/ALTER TABLE permissions ENABLE ROW LEVEL SECURITY/.test(up), 'ex_02: permissions is global catalog (no RLS) — documented');
    ok(up.includes('idx_role_permissions_tenant_id'), 'ex_02: role_permissions tenant_id index');

    const down = M('ex_02_rbac_down.sql');
    ok(down.includes('DROP TABLE IF EXISTS role_permissions') && down.includes('DROP TABLE IF EXISTS permissions'), 'ex_02 down: drops both (IF EXISTS)');

    const val = M('ex_02_rbac_validate.sql');
    ok(/rp_force_rls/.test(val) && /rp_policy/.test(val) && /rp_fk_to_tenants/.test(val), 'ex_02 validate: asserts FORCE RLS + policy + FK');
    ok(!/INSERT|UPDATE|DELETE|CREATE TABLE|DROP/.test(val), 'ex_02 validate: read-only');

    // seed
    const seed = M(path.join('seeds', 'ex_02_rbac_seed.sql'));
    ok(/INSERT INTO permissions/.test(seed) && /ON CONFLICT \(key\) DO NOTHING/.test(seed), 'ex_02 seed: permissions seeded idempotently');
    ok(/INSERT INTO role_permissions/.test(seed) && /ON CONFLICT \(tenant_id, role, permission_key\) DO NOTHING/.test(seed), 'ex_02 seed: role_permissions seeded idempotently per tenant');
    ok(/FOR t IN SELECT id FROM tenants/.test(seed), 'ex_02 seed: fans out across all tenants');
    // I1: seed binds app.tenant_id per tenant so FORCE-RLS WITH CHECK accepts rows as a non-superuser app role
    ok(/PERFORM set_config\('app\.tenant_id', t\.id::text, false\)/.test(seed), 'ex_02 seed: I1 — sets app.tenant_id per tenant (FORCE-RLS WITH CHECK passes)');
    // set_config must come BEFORE the INSERT inside the per-tenant loop
    ok(seed.indexOf("set_config('app.tenant_id'") < seed.indexOf('INSERT INTO role_permissions'), 'ex_02 seed: set_config precedes role_permissions INSERT');
    ok(seed.includes("'orders:create'") && seed.includes("'orders:view'"), 'ex_02 seed: includes orders:create / orders:view keys');
}

// ===== ex_03 tenant_id indexes =====
{
    const up = M('ex_03_tenant_id_indexes_up.sql');
    ok(!/\bBEGIN;|\bCOMMIT;/.test(up), 'ex_03: NOT wrapped in a transaction (CONCURRENTLY requires no txn)');
    ok(/CREATE INDEX CONCURRENTLY IF NOT EXISTS/.test(up), 'ex_03: CONCURRENTLY IF NOT EXISTS (idempotent, no long lock)');
    const count = (up.match(/CREATE INDEX CONCURRENTLY IF NOT EXISTS/g) || []).length;
    ok(count === 92, `ex_03: 92 indexes (88 prepared + 4 E-X), got ${count}`);
    ok(up.includes('idx_orders_tenant_id') && up.includes('idx_role_permissions_tenant_id'), 'ex_03: covers new E-X tables');
    ok(up.includes('idx_patients_tenant_id') && up.includes('idx_visit_lifecycle_tenant_id'), 'ex_03: covers prepared FORCE-RLS tables');

    const down = M('ex_03_tenant_id_indexes_down.sql');
    ok(/DROP INDEX CONCURRENTLY IF EXISTS/.test(down) && !/\bBEGIN;|\bCOMMIT;/.test(down), 'ex_03 down: DROP INDEX CONCURRENTLY IF EXISTS, no txn');
    const dropCount = (down.match(/DROP INDEX CONCURRENTLY IF EXISTS/g) || []).length;
    ok(dropCount === 92, `ex_03 down: drops all 92, got ${dropCount}`);

    const val = M('ex_03_tenant_id_indexes_validate.sql');
    ok(/invalid_tenant_id_indexes/.test(val) && /indisvalid/.test(val), 'ex_03 validate: checks for INVALID (failed CONCURRENTLY) indexes');
    ok(!/INSERT|UPDATE|DELETE|CREATE INDEX|DROP/.test(val), 'ex_03 validate: read-only');
}

console.log(`\n${fail === 0 ? 'ALL PASS' : 'FAILURES'}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
