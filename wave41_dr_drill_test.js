// wave41_dr_drill_test.js — 13 tests
//
// Tests are split into:
//   1. Log parser behavior (5 tests)
//   2. Age calculation (2 tests)
//   3. Extension exclusion detection (2 tests)
//   4. Prometheus output format (2 tests)
//   5. Safety rails / source-file checks (2 tests)

'use strict';

const w41 = require('./wave41_dr_drill');
const fs = require('fs');
const path = require('path');
const os = require('os');

let passed = 0, failed = 0;
function ok(label, cond, extra) {
    if (cond) { passed += 1; console.log('[PASS]', label); }
    else { failed += 1; console.log('[FAIL]', label, extra || ''); }
}
function chk(label, fn) {
    try { fn(); } catch (e) { ok(label, false, e.message); }
}

// Helpers
function tmpFile(name, content) {
    const p = path.join(os.tmpdir(), 'wave41_' + Date.now() + '_' + Math.random().toString(36).slice(2) + '_' + name);
    fs.writeFileSync(p, content);
    return p;
}
function rm(p) { try { fs.unlinkSync(p); } catch (_) {} }

// ---------- 1. Log parser behavior ----------

chk('parseDrillLog parses a clean success log', () => {
    const log = tmpFile('log',
        '==== DR restore drill 2026-08-05T11:31:53Z ====\n' +
        '[DR] patients restored: 4\n' +
        '==== DR restore drill complete ====\n');
    const out = w41.parseDrillLog(log);
    rm(log);
    ok('  file_exists', out.file_exists === true);
    ok('  lastAt set', out.lastAt === '2026-08-05T11:31:53Z');
    ok('  patientsRestored = 4', out.patientsRestored === 4);
    ok('  restoreErrors = 0', out.restoreErrors === 0);
    ok('  success = true', out.success === true);
});

chk('parseDrillLog classifies pg_stat_statements as benign', () => {
    const log = tmpFile('log',
        '==== DR restore drill 2026-08-05T11:31:53Z ====\n' +
        'pg_restore: from TOC entry 3; 3079 38581 EXTENSION pg_stat_statements (no owner)\n' +
        'pg_restore: error: could not execute query: ERROR:  permission denied to create extension "pg_stat_statements"\n' +
        'pg_restore: warning: errors ignored on restore: 2\n' +
        '[DR] patients restored: 4\n' +
        '==== DR restore drill complete ====\n');
    const out = w41.parseDrillLog(log);
    rm(log);
    ok('  restoreErrors = 0 (all whitelisted)', out.restoreErrors === 0);
    ok('  benignErrors = 2', out.benignErrors === 2);
    ok('  success = true (whitelist worked)', out.success === true);
});

chk('parseDrillLog flags non-whitelisted real errors', () => {
    const log = tmpFile('log',
        '==== DR restore drill 2026-08-05T11:31:53Z ====\n' +
        'pg_restore: error: relation "patients" does not exist\n' +
        '[DR] patients restored: 4\n' +
        '==== DR restore drill complete ====\n');
    const out = w41.parseDrillLog(log);
    rm(log);
    ok('  restoreErrors = 1 (real error)', out.restoreErrors === 1);
    ok('  benignErrors = 0', out.benignErrors === 0);
    ok('  success = false (real error present)', out.success === false);
});

chk('parseDrillLog handles ERR patients count', () => {
    const log = tmpFile('log',
        '==== DR restore drill 2026-08-05T11:31:53Z ====\n' +
        '[DR] patients restored: ERR\n' +
        '==== DR restore drill complete ====\n');
    const out = w41.parseDrillLog(log);
    rm(log);
    ok('  patientsRestored is null', out.patientsRestored === null);
    ok('  success = false', out.success === false);
});

chk('parseDrillLog handles missing file gracefully', () => {
    const out = w41.parseDrillLog('/nonexistent/path/dr-restore.log');
    ok('  file_exists = false', out.file_exists === false);
    ok('  success = null', out.success === null);
    ok('  restoreErrors = 0', out.restoreErrors === 0);
});

chk('parseDrillLog handles malformed log gracefully', () => {
    const log = tmpFile('log', 'random garbage\n');
    const out = w41.parseDrillLog(log);
    rm(log);
    ok('  success = null (no lastAt)', out.success === null);
    ok('  patientsRestored = null', out.patientsRestored === null);
});

// ---------- 2. Age calculation ----------

chk('ageHours returns number for valid timestamp', () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const age = w41.ageHours(twoHoursAgo);
    ok('  age >= 1.9', age >= 1.9);
    ok('  age <= 2.1', age <= 2.1);
});

chk('ageHours returns null for null/invalid', () => {
    ok('  null input', w41.ageHours(null) === null);
    ok('  empty string', w41.ageHours('') === null);
    ok('  garbage', w41.ageHours('not a date') === null);
});

// ---------- 3. Extension exclusion detection ----------

chk('detectExtensionExclusion always returns false (PG14 has no flag)', () => {
    const script = tmpFile('sh',
        '#!/bin/bash\n' +
        'pg_dump --exclude-extension=pg_stat_statements -d mydb\n');
    const v = w41.detectExtensionExclusion(script);
    rm(script);
    ok('  returns false (PG14 limitation)', v === false);
});

chk('detectExtensionExclusion is fail-safe on missing script', () => {
    const v = w41.detectExtensionExclusion('/nonexistent/path');
    ok('  returns false', v === false);
});

// ---------- 4. Prometheus output format ----------

chk('toPrometheusMetrics emits 6 expected gauges', () => {
    const out = w41.toPrometheusMetrics({
        success: true,
        patientsRestored: 4,
        restoreErrors: 0,
        benignErrors: 2,
        age_hours: 2.5,
    });
    ok('  contains nama_dr_drill_last_success', out.indexOf('nama_dr_drill_last_success') >= 0);
    ok('  contains nama_dr_drill_patients_restored', out.indexOf('nama_dr_drill_patients_restored') >= 0);
    ok('  contains nama_dr_drill_restore_errors', out.indexOf('nama_dr_drill_restore_errors') >= 0);
    ok('  contains nama_dr_drill_benign_errors', out.indexOf('nama_dr_drill_benign_errors') >= 0);
    ok('  contains nama_dr_drill_age_hours', out.indexOf('nama_dr_drill_age_hours') >= 0);
});

chk('toPrometheusMetrics reflects values correctly', () => {
    const out = w41.toPrometheusMetrics({
        success: false,
        patientsRestored: 0,
        restoreErrors: 2,
        benignErrors: 5,
        age_hours: 168.5,
    });
    ok('  success=0', /^nama_dr_drill_last_success 0$/m.test(out));
    ok('  patients=0', /^nama_dr_drill_patients_restored 0$/m.test(out));
    ok('  errors=2', /^nama_dr_drill_restore_errors 2$/m.test(out));
    ok('  benignErrors=5', /^nama_dr_drill_benign_errors 5$/m.test(out));
    ok('  age has 168.5', /^nama_dr_drill_age_hours 168\.50$/m.test(out));
});

// ---------- 5. Safety rails / source-file checks ----------

const src = fs.readFileSync(path.join(__dirname, 'wave41_dr_drill.js'), 'utf8');

chk('source file never references DELETE or DROP on prod tables', () => {
    ok('  no DELETE', !/\bDELETE\b/.test(src));
    ok('  no DROP', !/\bDROP\b/.test(src));
});

chk('source file never prints secrets or PHI', () => {
    ok('  no console.log', !/console\.log\s*\(/.test(src));
    ok('  no console.error of req.body', !/console\.error\([^)]*req\.body/i.test(src));
    ok('  no console.error of headers', !/console\.error\([^)]*headers/i.test(src));
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
