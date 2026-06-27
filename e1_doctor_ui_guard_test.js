/**
 * e1_doctor_ui_guard_test.js — E1 Doctor Station client (app.js/api.js) static guard assertions.
 * No browser/DB. Run: node e1_doctor_ui_guard_test.js
 *
 * Verifies the additive client wiring:
 *  - the empty allergy/chronic interpolation bug is FIXED (value now escaped + rendered).
 *  - sendRx() uses the SERVER-BACKED checkAllergyBeforePrescribe + checkDrugInteractions (not the
 *    weak client-only checkDrugAllergy) and captures an override_reason on allergy hard-stop.
 *  - E1 tabs (Problem List / CPOE / SOAP) render functions exist and are mounted from loadPatientInfo.
 *  - CPOE submit handles the 422 hard-stop payload and re-submits with an override reason.
 *  - all new dynamic sinks use escapeHTML(); ids use safeId(). API gains a patch() method.
 */
const fs = require('fs');
const path = require('path');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  PASS', m); } else { fail++; console.log('  FAIL', m); } };

const app = fs.readFileSync(path.join(__dirname, 'public', 'js', 'app.js'), 'utf8');
const api = fs.readFileSync(path.join(__dirname, 'public', 'js', 'api.js'), 'utf8');

// ---------- allergy/chronic bug fix ----------
ok(/ALLERGIES', 'حساسية'\)\}:<\/strong> \$\{escapeHTML\(p\.allergies\)\}/.test(app), 'patient card: ALLERGIES value now escaped+rendered (bug fixed)');
ok(/Chronic Diseases'[^}]*\)\}:<\/strong> \$\{escapeHTML\(p\.chronic_diseases\)\}/.test(app), 'patient card: chronic diseases value now escaped+rendered (bug fixed)');

// ---------- sendRx hardening ----------
ok(/window\.sendRx = async/.test(app), 'sendRx present');
ok(/checkAllergyBeforePrescribe\(pid, \[drugName\]\)/.test(app), 'sendRx uses server-backed checkAllergyBeforePrescribe');
ok(/checkDrugInteractions\(\[drugName, \.\.\.mine\]\)/.test(app), 'sendRx runs server drug-interaction check against current meds');
ok(/__rxOverrideReason/.test(app) && /override_reason: window\.__rxOverrideReason/.test(app), 'sendRx captures + sends override_reason on allergy hard-stop');
// the weak client-only helper is no longer the gate inside sendRx
ok(!/const allergyMatch = await checkDrugAllergy\(pid, drugName\)/.test(app), 'sendRx no longer relies on weak client-only checkDrugAllergy');

// ---------- E1 tabs ----------
ok(/window\.renderE1Panel = async/.test(app), 'renderE1Panel defined');
ok(/window\.e1RenderProblems = async/.test(app) && /window\.e1AddProblem = async/.test(app) && /window\.e1ResolveProblem = async/.test(app), 'Problem List tab handlers defined');
ok(/window\.e1RenderCpoe = async/.test(app) && /window\.e1SubmitOrder = async/.test(app), 'CPOE tab handlers defined');
ok(/window\.e1RenderSoap = async/.test(app) && /window\.e1SaveSoap = async/.test(app) && /window\.e1SignNote = async/.test(app), 'SOAP tab handlers defined');
ok(/if \(typeof window\.renderE1Panel === 'function'\) \{ window\.renderE1Panel\(p\.id\); \}/.test(app), 'renderE1Panel mounted from loadPatientInfo');
ok(/<div id="drE1Panel">/.test(app), 'drE1Panel container added to patient card');

// ---------- CPOE submit endpoints + 422 handling ----------
ok(/API\.post\('\/api\/cpoe\/order'/.test(app), 'CPOE submit posts to /api/cpoe/order (E-X orders table)');
ok(/r\.blocked \|\| r\.requires_override_reason/.test(app), 'CPOE submit detects CDS hard-stop payload');
ok(/return window\.e1SubmitOrder\(pid, reason\.trim\(\)\)/.test(app), 'CPOE submit re-submits with captured override reason');
ok(/API\.post\('\/api\/problems'/.test(app) && /API\.patch\('\/api\/problems\/'/.test(app), 'problems handlers call /api/problems');
ok(/API\.post\('\/api\/clinical-notes'/.test(app) && /API\.post\('\/api\/clinical-notes\/' \+ id \+ '\/sign'/.test(app), 'SOAP handlers call /api/clinical-notes (+sign)');

// ---------- IMPORTANT-1: override reason cleared at TOP of sendRx and in finally ----------
(() => {
    const start = app.indexOf('window.sendRx = async');
    const end = app.indexOf('window.issueCertificate', start);
    const block = app.slice(start, end > start ? end : start + 4000);
    // first statement clears the global before any checks
    ok(/window\.sendRx = async \(\) => \{\s*[^]*?window\.__rxOverrideReason = null;/.test(block.slice(0, 400)),
       'IMPORTANT-1: sendRx clears __rxOverrideReason at the TOP (before checks)');
    ok(/finally \{[^]*window\.__rxOverrideReason = null;[^]*\}/.test(block),
       'IMPORTANT-1: sendRx clears __rxOverrideReason in a finally block (no stale carry-over on failure)');
})();

// ---------- IMPORTANT-2: client checks FAIL-CLOSED on error ----------
(() => {
    const start = app.indexOf('window.checkAllergyBeforePrescribe = async');
    const end = app.indexOf('// =====', start);
    const block = app.slice(start, end > start ? end : start + 2000);
    // the catch must NOT return true; it must return false (block)
    ok(/catch \(e\) \{[^]*return false;[^]*\}/.test(block) && !/catch \(e\) \{ return true; \}/.test(block),
       'IMPORTANT-2: checkAllergyBeforePrescribe FAILS CLOSED (catch returns false, never true)');
})();
(() => {
    const start = app.indexOf('window.checkDrugInteractions = async');
    const end = app.indexOf('window.checkAllergyBeforePrescribe', start);
    const block = app.slice(start, end > start ? end : start + 2000);
    ok(/catch \(e\) \{[^]*failed: true[^]*\}/.test(block),
       'IMPORTANT-2: checkDrugInteractions FAILS CLOSED (catch returns failed:true, never silent all-clear)');
    ok(/hasCritical/.test(block), 'IMPORTANT-3: checkDrugInteractions reports hasCritical to the caller');
})();

// ---------- IMPORTANT-3: sendRx hard-stops on critical interaction / fail-closed (override required) ----------
(() => {
    const start = app.indexOf('window.sendRx = async');
    const end = app.indexOf('window.issueCertificate', start);
    const block = app.slice(start, end > start ? end : start + 4000);
    ok(/ddResult\.hasCritical \|\| ddResult\.failed/.test(block),
       'IMPORTANT-3: sendRx treats a CRITICAL interaction OR a failed check as a hard-stop');
    ok(/CRITICAL drug-drug interaction/.test(block) && /window\.prompt/.test(block),
       'IMPORTANT-3: sendRx prompts for an explicit (audited) override reason on critical interaction');
})();

// ---------- API.patch ----------
ok(/patch: \(url, data\) => API\.request\(url, \{ method: 'PATCH'/.test(api), 'API.patch method added (additive)');

// ---------- XSS hygiene on new E1 sinks: every interpolated DB field escaped; ids via safeId ----------
(() => {
    // pull the E1 block (renderE1Panel .. e1SignNote) and assert no raw ${o.|p.|n.} without escapeHTML/safeId
    const start = app.indexOf('window.renderE1Panel');
    const end = app.indexOf('// ===== APPOINTMENT CHECK-IN', start);
    const block = app.slice(start, end > start ? end : start + 8000);
    // find ${ ... } expressions referencing record fields that are NOT wrapped in escapeHTML/safeId
    const exprs = block.match(/\$\{[^}]*\}/g) || [];
    const bad = exprs.filter(e => {
        if (/escapeHTML\(|safeId\(|tr\(|encodeURIComponent\(|isArabic|\.map\(|\.length|\?|:/.test(e)) return false;
        // direct record field interpolations like ${p.description} ${o.type} ${n.assessment}
        return /\$\{\s*[opn]\.[a-z_]+\s*\}/i.test(e);
    });
    ok(bad.length === 0, 'E1 block: no unescaped record-field interpolation (XSS hygiene): ' + (bad.join(' ') || 'clean'));
})();

console.log(`\n${fail === 0 ? 'ALL PASS' : 'FAIL'}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
