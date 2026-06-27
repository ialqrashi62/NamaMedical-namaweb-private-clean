/**
 * onboarding_unit_test.js
 * E0 Facility Onboarding Wizard — UNIT tests (no DB / no HTTP / no PHI).
 * Covers: archetype -> module mapping, input validation, and the no-default-password rule.
 * Run: node onboarding_unit_test.js   (exit 0 = pass, 1 = fail)
 */
'use strict';
const ob = require('./onboarding');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  PASS', m); } else { fail++; console.log('  FAIL', m); } };
const eqSet = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

console.log('\n== Archetype -> module mapping ==');
const ALL = ob.ALL_MODULE_INDICES;
ok(ALL.length === 43 && ALL[0] === 0 && ALL[42] === 42, 'module index space is 0..42 (43 entries)');
ok(eqSet(ob.modulesForArchetype('medical_city'), ALL), 'medical_city = ALL 43');
ok(eqSet(ob.modulesForArchetype('large_hospital'), ALL), 'large_hospital = ALL 43');
ok(eqSet(ob.modulesForArchetype('polyclinic'), [...new Set(ob.POLYCLINIC_MODULES)].sort((a, b) => a - b)),
  'polyclinic matches existing FACILITY_ALLOWED clinic set');
ok(eqSet(ob.modulesForArchetype('health_center'), [...new Set(ob.HEALTH_CENTER_MODULES)].sort((a, b) => a - b)),
  'health_center matches existing FACILITY_ALLOWED set');
ok(ob.modulesForArchetype('general_hospital').includes(22) && ob.modulesForArchetype('general_hospital').includes(23),
  'general_hospital includes inpatient (22) + ICU (23)');
ok(!ob.modulesForArchetype('general_hospital').includes(39),
  'general_hospital excludes CME (39)');
ok(eqSet(ob.modulesForArchetype('unknown'), []), 'unknown archetype -> []');
// every archetype set must include Dashboard(0) and Settings(42)
ob.VALID_ARCHETYPES.forEach(a => {
  const m = ob.modulesForArchetype(a);
  ok(m.includes(0) && m.includes(42), `${a} includes Dashboard(0) + Settings(42)`);
  ok(m.every(i => i >= 0 && i <= 42), `${a} indices all in range 0..42`);
});

console.log('\n== Input validation ==');
const base = { archetype: 'general_hospital', tenant_name: 'Test Org', subdomain: 'test-org', facility_name: 'Main', admin_username: 'admin01' };
ok(ob.validateProvisionInput(base).ok, 'valid minimal payload passes');
ok(!ob.validateProvisionInput({ ...base, archetype: 'bogus' }).ok, 'invalid archetype rejected');
ok(!ob.validateProvisionInput({ ...base, subdomain: 'Bad_Sub!' }).ok, 'invalid subdomain rejected');
ok(!ob.validateProvisionInput({ ...base, subdomain: '' }).ok, 'empty subdomain rejected');
ok(!ob.validateProvisionInput({ ...base, subdomain: 'a' }).ok, '1-char subdomain rejected (I4: enforces 2..63)');
ok(ob.validateProvisionInput({ ...base, subdomain: 'ab' }).ok, '2-char subdomain accepted');
ok(!ob.validateProvisionInput({ ...base, subdomain: '-ab' }).ok, 'leading-hyphen subdomain rejected');
ok(!ob.validateProvisionInput({ ...base, subdomain: 'ab-' }).ok, 'trailing-hyphen subdomain rejected');
ok(!ob.validateProvisionInput({ ...base, subdomain: 'a'.repeat(64) }).ok, '64-char subdomain rejected (>63)');
ok(!ob.validateProvisionInput({ ...base, tenant_name: 'x' }).ok, 'too-short tenant name rejected');
ok(!ob.validateProvisionInput({ ...base, admin_username: 'ab' }).ok, 'too-short admin username rejected');
ok(!ob.validateProvisionInput({ ...base, admin_username: 'has space' }).ok, 'admin username with space rejected');
ok(!ob.validateProvisionInput({ ...base, currency: 'SARS' }).ok, 'bad currency rejected');
ok(ob.validateProvisionInput({ ...base, currency: 'usd' }).value.currency === 'USD', 'currency upper-cased');
// bed-less archetype must reject beds > 0
ok(!ob.validateProvisionInput({ ...base, archetype: 'polyclinic', beds: 5 }).ok, 'polyclinic rejects beds>0');
ok(ob.validateProvisionInput({ ...base, archetype: 'polyclinic', beds: 0 }).ok, 'polyclinic accepts beds=0');
ok(ob.validateProvisionInput({ ...base, beds: 120 }).value.beds === 120, 'general_hospital accepts beds=120');
// integrations allow-list
ok(!ob.validateProvisionInput({ ...base, integrations: [{ name: 'EVIL', enabled: true }] }).ok, 'disallowed integration rejected');
ok(ob.validateProvisionInput({ ...base, integrations: [{ name: 'nphies', enabled: true }] }).value.integrations[0].name === 'NPHIES',
  'allowed integration normalized, no secret fields retained');
const intVal = ob.validateProvisionInput({ ...base, integrations: [{ name: 'ZATCA', enabled: true, api_key: 'SECRET', api_secret: 'X' }] }).value.integrations[0];
ok(!('api_key' in intVal) && !('api_secret' in intVal), 'integration object carries NO secret fields');

console.log('\n== Regulatory identifiers (I3: moh_license / cr_no / vat_no) ==');
const regVal = ob.validateProvisionInput({ ...base, moh_license: ' MOH-123 ', cr_no: 'CR-9', vat_no: '3001' }).value;
ok(regVal.mohLicense === 'MOH-123', 'moh_license validated + trimmed into value');
ok(regVal.crNo === 'CR-9', 'cr_no validated into value');
ok(regVal.vatNo === '3001', 'vat_no validated into value');
ok(ob.validateProvisionInput(base).value.mohLicense === '', 'absent moh_license -> empty string');
ok(!ob.validateProvisionInput({ ...base, vat_no: 'x'.repeat(101) }).ok, 'over-long vat_no rejected (>100)');

console.log('\n== No-default-password rule ==');
ok(ob.validateProvisionInput(base).value.adminPassword === '', 'no password supplied -> empty (server generates strong one)');
ok(!ob.validateProvisionInput({ ...base, admin_password: 'short' }).ok, 'short supplied password rejected (<8)');
ok(ob.validateProvisionInput({ ...base, admin_password: 'longenough1' }).value.adminPassword === 'longenough1', 'valid supplied password kept');
const p1 = ob.generateStrongPassword(), p2 = ob.generateStrongPassword();
ok(typeof p1 === 'string' && p1.length >= 20, 'generated password is long (>=20)');
ok(p1 !== p2, 'generated passwords are random (two differ)');
ok(!/^(admin|password|123|changeme|default)/i.test(p1), 'generated password is not a guessable default');

console.log(`\n${fail === 0 ? 'ALL PASS' : 'FAILURES'}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
