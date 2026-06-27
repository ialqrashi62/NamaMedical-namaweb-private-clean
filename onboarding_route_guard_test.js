/**
 * onboarding_route_guard_test.js
 * E0 Facility Onboarding Wizard — STATIC structural assertions (no DB / no HTTP / no PHI).
 * Asserts the provisioning route is super-admin guarded, runs in a single transaction, audits,
 * uses no default password, and keeps integrations gated (no secrets). Mirrors the
 * settings_user_create_admin_guard_test.js style.
 * Run: node onboarding_route_guard_test.js   (exit 0 = pass, 1 = fail)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const ob = fs.readFileSync(path.join(__dirname, 'onboarding.js'), 'utf8');
// comment-stripped executable code (// line + /* block */) for order/secret assertions
const obCode = ob
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  PASS', m); } else { fail++; console.log('  FAIL', m); } };

console.log('\n== server.js wiring ==');
ok(/require\(['"]\.\/onboarding['"]\)/.test(server), 'server.js requires ./onboarding');
ok(/mountOnboardingRoutes\(\s*app\s*,\s*\{[^}]*pool[^}]*requireAuth[^}]*requireRole[^}]*logAudit/.test(server.replace(/\s+/g, ' ')),
  'server.js mounts onboarding with {pool, requireAuth, requireRole, logAudit}');

console.log('\n== Route definition & guard order (onboarding.js) ==');
ok(/app\.post\(\s*['"]\/api\/admin\/facilities\/provision['"]\s*,\s*requireAuth\s*,\s*requireRole\(['"]settings['"]\)/.test(ob),
  "route mounted: POST /api/admin/facilities/provision with requireAuth + requireRole('settings')");
ok(/req\.session\.user\.role\s*!==\s*'Admin'/.test(ob), "inline super-admin guard: role !== 'Admin'");
ok(/BLOCKED_FACILITY_PROVISION/.test(ob), 'audit BLOCKED_FACILITY_PROVISION on non-admin');
ok(/return res\.status\(403\)/.test(ob), 'returns 403 for non-admin');

// guard must precede any INSERT
const guardIdx = ob.indexOf("!== 'Admin'");
const firstInsert = ob.indexOf('INSERT INTO tenants');
ok(guardIdx > -1 && firstInsert > -1 && guardIdx < firstInsert, 'admin guard precedes INSERT INTO tenants');

console.log('\n== Single transaction ==');
ok(/await client\.query\(['"]BEGIN['"]\)/.test(ob), 'BEGIN present');
ok(/await client\.query\(['"]COMMIT['"]\)/.test(ob), 'COMMIT present');
ok(/ROLLBACK/.test(ob), 'ROLLBACK on error');
ok(/pool\.connect\(\)/.test(ob), 'uses raw pooled client (pool.connect)');
ok(/set_config\(['"]app\.tenant_id['"],\s*\$1,\s*true\)/.test(ob), 'sets app.tenant_id (tx-local) to NEW tenant before RLS inserts');

console.log('\n== Audit on success ==');
ok(/FACILITY_PROVISIONED/.test(ob), 'audit FACILITY_PROVISIONED on success');
const commitIdx = obCode.indexOf("client.query('COMMIT')");
// position of the success audit action literal itself (comments stripped), not the logAudit start
const auditCallIdx = obCode.indexOf("'FACILITY_PROVISIONED'");
ok(commitIdx > -1 && auditCallIdx > commitIdx, 'success audit logged after COMMIT');

console.log('\n== No default password ==');
ok(/generateStrongPassword\(\)/.test(ob), 'generates strong password when none supplied');
ok(/bcrypt\.hash\(/.test(ob), 'admin password is bcrypt-hashed');
ok(!/password\s*[:=]\s*['"](admin|password|123456|changeme|default)['"]/i.test(ob), 'no hard-coded default password literal');
ok(/role:[^]*Admin[^]*permissions/.test(ob.replace(/\n/g, ' ')) || /'Admin','\*'/.test(ob),
  'provisioned system_user is Admin with full permissions');

console.log('\n== Integrations gated / no secrets ==');
// obCode (comment-stripped, defined above) => inspect executable code only: assert no secret column is
// ever written (api_key/api_secret/client_secret/certificate/private_key as code identifiers).
ok(!/api_key|api_secret|client_secret|certificate|private_key/i.test(obCode),
  'no secret column writes in provisioning code (api_key/api_secret/cert/private_key absent)');
ok(/gated:\s*true/.test(ob), 'integration config marked gated:true (no live secrets)');

console.log('\n== Tenant-scoping of provisioning writes (C1/I2/I3) ==');
// C1: integration_settings INSERT must include tenant_id as the first column + param.
ok(/INSERT INTO integration_settings\s*\(\s*tenant_id\s*,/.test(obCode),
  'C1: integration_settings INSERT includes tenant_id (first column)');
ok(/INSERT INTO integration_settings[\s\S]*?VALUES\s*\(\s*\$1\s*,/.test(obCode) &&
   /integration_settings[\s\S]*?\[\s*tenantId\s*,/.test(obCode),
  'C1: integration_settings VALUES binds tenantId first');
// I3: tenants INSERT persists moh_license / cr_no / vat_no.
ok(/INSERT INTO tenants[\s\S]*?moh_license[\s\S]*?cr_no[\s\S]*?vat_no/.test(obCode),
  'I3: INSERT INTO tenants persists moh_license/cr_no/vat_no');
ok(/v\.mohLicense/.test(obCode) && /v\.crNo/.test(obCode) && /v\.vatNo/.test(obCode),
  'I3: validated reg-id values bound into tenants INSERT');
// I2: facility_type persisted to company_settings = archetype string (drives app.js facilityType).
ok(/INSERT INTO company_settings[\s\S]*?'facility_type'[\s\S]*?v\.archetype/.test(obCode),
  'I2: facility_type written to company_settings as archetype string');

console.log('\n== integration_settings RLS migration present (C1) ==');
ok(/FORCE ROW LEVEL SECURITY/.test(fs.readFileSync(path.join(__dirname, 'migrations', 'e0_04_integration_settings_rls_up.sql'), 'utf8')),
  'C1: e0_04 integration_settings migration FORCE-RLS present');
ok(/rls_integration_settings_tenant_isolation/.test(fs.readFileSync(path.join(__dirname, 'migrations', 'e0_04_integration_settings_rls_up.sql'), 'utf8')),
  'C1: e0_04 isolation policy present (matching template)');

console.log('\n== Response shape ==');
ok(/res\.status\(201\)\.json\(/.test(ob), 'returns 201');
ok(/tenant_id:\s*tenantId/.test(ob), '201 body includes tenant_id');

console.log('\n== Security regressions NOT weakened ==');
ok(/FORCE ROW LEVEL SECURITY/.test(fs.readFileSync(path.join(__dirname, 'migrations', 'e0_03_facility_modules_up.sql'), 'utf8')),
  'facility_modules migration FORCE-RLS present');
ok(/FORCE ROW LEVEL SECURITY/.test(fs.readFileSync(path.join(__dirname, 'migrations', 'e0_02_facilities_extend_up.sql'), 'utf8')),
  'facilities migration FORCE-RLS present');

console.log(`\n${fail === 0 ? 'ALL PASS' : 'FAILURES'}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
