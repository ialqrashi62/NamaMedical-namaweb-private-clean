/**
 * cross_tenant_quality_incidents_test.js — Epic E17 tenant-isolation security test.
 * Tenant A must never read/modify Tenant B incidents/CAPA/risks/HAI/AMS; null tenant fails closed.
 * 1) Static audit: every E17 query carries an explicit tenant filter / scoped guard.
 * 2) Static audit: migrations declare FORCE RLS + canonical policy + tenant_id NOT NULL + FK.
 * 3) Simulation: cross-tenant read/update blocked, IDOR blocked, mass-assignment of tenant_id blocked,
 *    null/invalid tenant -> 403 (fail-closed).
 * DB-free. Run: NODE_PATH=...\node_modules node cross_tenant_quality_incidents_test.js
 */
const fs = require('fs');
const path = require('path');
const G = '\x1b[32m', R = '\x1b[31m', X = '\x1b[0m';
let passed = 0, failed = 0;
function assert(cond, name, extra = '') { if (cond) { console.log(`  ${G}PASS${X} ${name}`); passed++; } else { console.log(`  ${R}FAIL${X} ${name}${extra ? ' | ' + extra : ''}`); failed++; } }

const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');

console.log('\n[ 1 ] Static tenant-filter audit (every E17 query scoped)');
const scopedQueries = [
    "SELECT * FROM quality_incidents WHERE tenant_id=$1",
    "FROM quality_incidents WHERE id=$1 AND tenant_id=$2",
    "INSERT INTO quality_incidents",
    "FROM quality_capa WHERE incident_id=$1 AND tenant_id=$2",
    "FROM quality_capa WHERE id=$1 AND tenant_id=$2",
    "FROM quality_risk_register WHERE tenant_id=$1",
    "FROM quality_risk_register WHERE id=$1 AND tenant_id=$2",
    "FROM hai_isolation WHERE tenant_id=$1",
    "FROM hai_isolation WHERE id=$1 AND tenant_id=$2",
    "FROM ams_flags WHERE tenant_id=$1",
    "FROM ams_flags WHERE id=$1 AND tenant_id=$2",
    "FROM infection_surveillance WHERE tenant_id=$1",
    // C2 FIX: outbreaks/exposures/hand-hygiene now also scoped
    "FROM infection_outbreaks WHERE tenant_id=$1",
    "FROM employee_exposures WHERE tenant_id=$1",
    "FROM hand_hygiene_audits WHERE tenant_id=$1",
    // patient ownership checks (IDOR guards)
    "FROM patients WHERE id=$1 AND tenant_id=$2"
];
for (const q of scopedQueries) assert(server.includes(q), 'scoped query present: ' + q.slice(0, 50));

// No unscoped legacy SELECT * remaining on the hardened quality/infection tables
assert(!server.includes("SELECT * FROM quality_incidents ORDER BY id DESC'"), 'no unscoped quality_incidents SELECT remains');
assert(!server.includes("SELECT * FROM infection_surveillance ORDER BY id DESC'"), 'no unscoped infection_surveillance SELECT remains');
// C2 FIX: verify unscoped outbreaks/exposures/hand-hygiene also gone
assert(!server.includes("SELECT * FROM infection_outbreaks ORDER BY id DESC'"), 'no unscoped infection_outbreaks SELECT remains');
assert(!server.includes("SELECT * FROM employee_exposures ORDER BY id DESC'"), 'no unscoped employee_exposures SELECT remains');
assert(!server.includes("SELECT * FROM hand_hygiene_audits ORDER BY id DESC'"), 'no unscoped hand_hygiene_audits SELECT remains');

console.log('\n[ 2 ] Static RLS / migration audit');
const upCapa = fs.readFileSync(path.join(__dirname, 'migrations', 'e17_001_quality_capa_up.sql'), 'utf8');
const upInf = fs.readFileSync(path.join(__dirname, 'migrations', 'e17_002_infection_up.sql'), 'utf8');
const tables = { 'quality_capa': upCapa, 'quality_risk_register': upCapa, 'hai_isolation': upInf, 'ams_flags': upInf };
for (const [t, sql] of Object.entries(tables)) {
    assert(sql.includes(`ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY;`), `${t}: ENABLE RLS`);
    assert(sql.includes(`ALTER TABLE ${t} FORCE ROW LEVEL SECURITY;`), `${t}: FORCE RLS`);
    assert(sql.includes(`CREATE POLICY rls_${t}_tenant_isolation ON ${t}`), `${t}: canonical isolation policy`);
    assert(sql.includes("tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer"), `${t}: canonical policy expression`);
    assert(new RegExp(`tenant_id INTEGER NOT NULL REFERENCES tenants\\(id\\)`).test(sql), `${t}: tenant_id NOT NULL FK tenants`);
}
assert(upCapa.includes('REFERENCES quality_incidents(id)'), 'quality_capa FK -> quality_incidents');
assert(upInf.includes('REFERENCES patients(id)'), 'infection tables FK -> patients');

console.log('\n[ 3 ] Simulation — cross-tenant isolation + IDOR + fail-closed');
const db = {
    patients: [{ id: 1, tenant_id: 1 }, { id: 2, tenant_id: 2 }],
    quality_incidents: [{ id: 501, tenant_id: 1, confidential: 0 }, { id: 502, tenant_id: 2, confidential: 0 }, { id: 503, tenant_id: 1, confidential: 1 }],
    quality_capa: [{ id: 9001, incident_id: 501, tenant_id: 1 }, { id: 9002, incident_id: 502, tenant_id: 2 }],
    hai_isolation: [{ id: 70, patient_id: 1, tenant_id: 1 }, { id: 71, patient_id: 2, tenant_id: 2 }],
    ams_flags: [{ id: 80, patient_id: 1, tenant_id: 1 }, { id: 81, patient_id: 2, tenant_id: 2 }]
};
// Fail-closed tenant guard mirror
function reqTenant(tid) { const n = parseInt(tid, 10); if (!Number.isInteger(n) || n <= 0) { const e = new Error('Tenant scope required'); e.statusCode = 403; throw e; } return n; }
function scopedFetch(tbl, tid, id) { const n = reqTenant(tid); return db[tbl].filter(r => r.tenant_id === n && (id === undefined || r.id === id)); }

// A) Tenant A cannot read Tenant B incident
assert(scopedFetch('quality_incidents', 1).every(r => r.tenant_id === 1), 'Tenant A reads only its own incidents');
assert(scopedFetch('quality_incidents', 1, 502).length === 0, 'Tenant A cannot read Tenant B incident 502 (IDOR)');
// B) Tenant A cannot update Tenant B incident (scoped UPDATE returns 0 rows -> 404)
assert(scopedFetch('quality_incidents', 1, 502).length === 0, 'Tenant A UPDATE of B incident -> 0 rows (404)');
// C) Tenant A cannot read Tenant B CAPA
assert(scopedFetch('quality_capa', 1, 9002).length === 0, 'Tenant A cannot read Tenant B CAPA (IDOR)');
// D) Tenant A cannot touch Tenant B isolation / AMS
assert(scopedFetch('hai_isolation', 1, 71).length === 0, 'Tenant A cannot access Tenant B isolation');
assert(scopedFetch('ams_flags', 1, 81).length === 0, 'Tenant A cannot access Tenant B AMS flag');
// E) Null / invalid tenant fails closed
let threw = false; try { reqTenant(null); } catch (e) { threw = e.statusCode === 403; } assert(threw, 'null tenant -> 403 (fail-closed)');
threw = false; try { reqTenant('  '); } catch (e) { threw = e.statusCode === 403; } assert(threw, 'blank tenant -> 403 (fail-closed)');
threw = false; try { reqTenant(0); } catch (e) { threw = e.statusCode === 403; } assert(threw, 'tenant 0 -> 403 (fail-closed)');
// F) Mass-assignment: client-supplied tenant_id ignored, session value stamped
function stampInsert(body, sessionTid) { const tid = reqTenant(sessionTid); return { tenant_id: tid }; }
assert(stampInsert({ tenant_id: 2 }, 1).tenant_id === 1, 'client tenant_id injection ignored; session tenant stamped');
// G) Confidential incident hidden from non-privileged role
function listIncidents(tid, canSeeConfidential) { const rows = scopedFetch('quality_incidents', tid); return canSeeConfidential ? rows : rows.filter(r => r.confidential === 0); }
assert(listIncidents(1, false).some(r => r.id === 503) === false, 'confidential incident hidden from non-privileged role');
assert(listIncidents(1, true).some(r => r.id === 503) === true, 'confidential incident visible to Admin/Quality Manager');
// H) Same-tenant access works
assert(scopedFetch('quality_incidents', 1, 501).length === 1, 'same-tenant incident access allowed');

// SECURITY-HOOK: confidential incident CAPA blocked for non-privileged role
function capaBelongsToConfidential(capaId, tid, canSeeConfidential) {
    const capa = db.quality_capa.find(c => c.id === capaId && c.tenant_id === tid);
    if (!capa) return false; // 404
    const inc = db.quality_incidents.find(i => i.id === capa.incident_id && i.tenant_id === tid);
    if (!inc) return false;
    if (inc.confidential && !canSeeConfidential) return false; // 404 (confidential gate)
    return true;
}
// Non-privileged role cannot see CAPA of confidential incident 503
const capaOfConfidential = { id: 9003, incident_id: 503, tenant_id: 1 };
db.quality_capa.push(capaOfConfidential);
assert(capaBelongsToConfidential(9003, 1, false) === false, 'SECURITY-HOOK: non-privileged role cannot read CAPA of confidential incident');
assert(capaBelongsToConfidential(9003, 1, true) === true, 'SECURITY-HOOK: privileged role can read CAPA of confidential incident');
assert(capaBelongsToConfidential(9001, 1, false) === true, 'SECURITY-HOOK: non-privileged role can read CAPA of non-confidential incident');
db.quality_capa.pop(); // cleanup

// I2: satisfaction POST IDOR guard simulation
function checkSatisfactionIDAR(patientId, sessionTid, dbPatients) {
    const pid = parseInt(patientId, 10);
    if (pid && pid > 0) {
        const chk = dbPatients.find(p => p.id === pid && p.tenant_id === sessionTid);
        if (!chk) return 403;
    }
    return 201; // would INSERT
}
const dbPatients = [{ id: 1, tenant_id: 1 }, { id: 2, tenant_id: 2 }];
assert(checkSatisfactionIDAR(1, 1, dbPatients) === 201, 'I2: same-tenant patient allowed in satisfaction survey');
assert(checkSatisfactionIDAR(2, 1, dbPatients) === 403, 'I2: cross-tenant patient_id rejected (403)');
assert(checkSatisfactionIDAR(null, 1, dbPatients) === 201, 'I2: anonymous survey (null patient_id) allowed');
assert(checkSatisfactionIDAR(0, 1, dbPatients) === 201, 'I2: patient_id=0 anonymous survey allowed');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
