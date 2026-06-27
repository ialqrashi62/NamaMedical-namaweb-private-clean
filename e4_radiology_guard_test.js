/**
 * e4_radiology_guard_test.js
 * ============================================================================
 * E4 — Radiology (RIS + PACS metadata) STATIC code-guard test.
 * DB-free. Reads server.js + migrations as text and asserts the security
 * invariants: explicit tenant predicate on every E4 query, FAIL-CLOSED null
 * tenant, critical-sign fail-closed, prior-compare signed-only, MWL gated,
 * images only via guarded phi-files (no public webroot), FORCE RLS canonical
 * on new tables, idempotent migrations.
 *
 * Usage:  node e4_radiology_guard_test.js
 * ============================================================================
 */
'use strict';
const fs = require('fs');
const path = require('path');

const s = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const m1 = fs.readFileSync(path.join(__dirname, 'migrations', 'e4_01_rad_worklist_up_validate_down.js'), 'utf8');
const m2 = fs.readFileSync(path.join(__dirname, 'migrations', 'e4_02_dicom_studies_up_validate_down.js'), 'utf8');
const m3 = fs.readFileSync(path.join(__dirname, 'migrations', 'e4_03_rad_reports_up_validate_down.js'), 'utf8');
const app = fs.readFileSync(path.join(__dirname, 'public', 'js', 'app.js'), 'utf8');

let pass = 0, fail = 0;
function chk(name, cond) { if (cond) { pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name); } }

// ---- Endpoints exist ----
chk('worklist GET route', s.includes("app.get('/api/radiology/worklist'"));
chk('worklist POST schedule route', s.includes("app.post('/api/radiology/worklist'"));
chk('worklist state transition route', s.includes("app.put('/api/radiology/worklist/:id/state'"));
chk('dicom-studies register route', s.includes("app.post('/api/radiology/dicom-studies'"));
chk('dicom-studies list route', s.includes("app.get('/api/radiology/dicom-studies'"));
chk('MWL route', s.includes("app.get('/api/radiology/mwl'"));
chk('report priors route', s.includes("app.get('/api/radiology/reports/priors'"));
chk('report create route', s.includes("app.post('/api/radiology/reports'"));
chk('report critical-notify route', s.includes("app.post('/api/radiology/reports/:id/critical-notify'"));
chk('report sign route', s.includes("app.put('/api/radiology/reports/:id/sign'"));
chk('report addendum route', s.includes("app.post('/api/radiology/reports/:id/addendum'"));

// ---- FAIL-CLOSED null tenant on every E4 handler ----
{
  const failClosed = (s.match(/Tenant scope required/g) || []).length;
  chk('multiple FAIL-CLOSED tenant guards (>=10)', failClosed >= 10);
  // every E4 route is also gated by requireTenantScope middleware
  const e4Block = s.slice(s.indexOf('===== E4: RADIOLOGY'), s.indexOf('===== END E4 RADIOLOGY ====='));
  const routeCount = (e4Block.match(/app\.(get|post|put)\(/g) || []).length;
  const tenantScopeCount = (e4Block.match(/requireTenantScope/g) || []).length;
  chk('every E4 route uses requireTenantScope', routeCount > 0 && tenantScopeCount === routeCount);
  // every E4 route checks if(!tenantId) -> 403 fail-closed
  chk('E4 fail-closed count == route count', (e4Block.match(/if \(!tenantId\) return res\.status\(403\)/g) || []).length === routeCount);
}

// ---- Explicit tenant_id predicate on every E4 query (no bare table read/write) ----
{
  const e4Block = s.slice(s.indexOf('===== E4: RADIOLOGY'), s.indexOf('===== END E4 RADIOLOGY ====='));
  // No SELECT/UPDATE on the new tables without a tenant_id predicate
  const radExamsSelNoTenant = /FROM rad_exams(?![\s\S]{0,200}tenant_id)/.test(e4Block.replace(/\s+/g, ' '));
  chk('rad_exams reads carry tenant_id predicate', !radExamsSelNoTenant);
  chk('rad_exams updates carry tenant_id predicate', !/UPDATE rad_exams SET[\s\S]*?WHERE (?!.*tenant_id)/m.test(e4Block));
  chk('rad_reports updates carry tenant_id predicate', !/UPDATE rad_reports SET[\s\S]*?WHERE (?!.*tenant_id)/m.test(e4Block));
  chk('dicom_studies insert stamps tenant_id', e4Block.includes('INSERT INTO dicom_studies (tenant_id'));
  chk('rad_exams insert stamps tenant_id', e4Block.includes('INSERT INTO rad_exams (tenant_id'));
  chk('rad_reports insert stamps tenant_id', e4Block.includes('INSERT INTO rad_reports (tenant_id'));
  chk('order ownership verified before scheduling (IDOR)', e4Block.includes('lab_radiology_orders WHERE id=$1 AND is_radiology=1 AND tenant_id=$2'));
}

// ---- CRITICAL fail-closed: cannot sign critical without documented notification ----
chk('critical sign fail-closed guard', s.includes('rep.is_critical && !rep.critical_notified_at') && s.includes("code: 'CRITICAL_NOTIFY_REQUIRED'"));
chk('critical notify writes notifications type=critical', /INSERT INTO notifications[\s\S]{0,160}'critical'/.test(s));
chk('critical notify documented via critical_notified_at', s.includes('critical_notified_at=CURRENT_TIMESTAMP'));
chk('critical notify audited', s.includes("'RAD_CRITICAL_NOTIFY'"));
chk('sign audited', s.includes("'SIGN_RAD_REPORT'"));

// ---- RBAC: report state-mutating endpoints restricted to radiology/doctor (medico-legal) ----
{
  // helper: assert the route line that mounts a given path carries requireRole('radiology', 'doctor')
  function routeLine(method, route) {
    const re = new RegExp(`app\\.${method}\\('${route.replace(/[/:]/g, m => '\\' + m)}'[^\\n]*`);
    const mm = s.match(re);
    return mm ? mm[0] : '';
  }
  const cn = routeLine('post', '/api/radiology/reports/:id/critical-notify');
  const sg = routeLine('put', '/api/radiology/reports/:id/sign');
  const ad = routeLine('post', '/api/radiology/reports/:id/addendum');
  chk('critical-notify requires requireRole(radiology,doctor)', /requireRole\('radiology', 'doctor'\)/.test(cn));
  chk('sign requires requireRole(radiology,doctor)', /requireRole\('radiology', 'doctor'\)/.test(sg));
  chk('addendum requires requireRole(radiology,doctor)', /requireRole\('radiology', 'doctor'\)/.test(ad));
  // requireAuth + requireTenantScope must still be present on all three (RBAC is additive, not a replacement)
  ['requireAuth', 'requireTenantScope'].forEach(mw => {
    chk(`critical-notify keeps ${mw}`, cn.includes(mw));
    chk(`sign keeps ${mw}`, sg.includes(mw));
    chk(`addendum keeps ${mw}`, ad.includes(mw));
  });
  // role set admits Radiologist (radiology) + Doctor, denies Reception/Nurse/Finance — verify ROLE_PERMISSIONS mapping
  chk('Radiologist role maps to radiology module', /'Radiologist':\s*\[[^\]]*'radiology'/.test(s));
  chk('Reception role does NOT map to radiology', !/'Reception':\s*\[[^\]]*'radiology'/.test(s));
}

// ---- Issue 2: notified_doctor_id is validated as a REAL tenant user (no dangling/foreign user_id) ----
{
  const e4Block = s.slice(s.indexOf('===== E4: RADIOLOGY'), s.indexOf('===== END E4 RADIOLOGY ====='));
  chk('notified_doctor_id validated against system_users', /FROM system_users[\s\S]{0,200}user_tenants/.test(e4Block));
  chk('notified_doctor_id scoped to session tenant via user_tenants', /user_tenants[\s\S]{0,160}tenant_id = \$2[\s\S]{0,80}is_active = true/.test(e4Block));
  chk('invalid notified_doctor_id rejected (400)', /Invalid notified_doctor_id|notified_doctor_id not found in this tenant/.test(e4Block));
  // validation must occur BEFORE the notifications INSERT that uses the user_id target
  const valIdx = e4Block.search(/FROM system_users[\s\S]{0,200}user_tenants/);
  const insIdx = e4Block.indexOf('INSERT INTO notifications (user_id');
  chk('notified_doctor_id validated before notifications insert', valIdx !== -1 && insIdx !== -1 && valIdx < insIdx);
}

// ---- PRIOR-COMPARE: signed priors only, tenant + modality scoped ----
chk('priors query is signed-only', /status='Signed' AND signed_at IS NOT NULL/.test(s));
chk('priors query is tenant + patient scoped', s.includes('WHERE tenant_id=$1 AND patient_id=$2'));
chk('prior_study_id must be signed when referenced', s.includes("status='Signed' AND signed_at IS NOT NULL") && s.includes('Prior report not found or not signed'));

// ---- DICOM metadata only; images ONLY via guarded phi-files; no public path ----
{
  const e4Block = s.slice(s.indexOf('===== E4: RADIOLOGY'), s.indexOf('===== END E4 RADIOLOGY ====='));
  chk('no /uploads/ public path in E4', !e4Block.includes('/uploads/'));
  chk('no res.sendFile in E4 (bytes only via phi-files)', !e4Block.includes('sendFile'));
  chk('stored_ref validated against tenant-owned phi_files', e4Block.includes('FROM phi_files WHERE id=$1 AND tenant_id=$2'));
  chk('guarded phi-files endpoint still present', s.includes("app.get('/api/phi-files/:id', requireAuth"));
}

// ---- MWL GATED, no external connection ----
chk('MWL gated by RAD_MWL_ENABLED', s.includes('RAD_MWL_ENABLED') && s.includes("if (!RAD_MWL_ENABLED) return res.status(503)"));
chk('MWL serves only local scheduled exams (no PACS pull)', /FROM rad_exams[\s\S]{0,200}state IN \('Scheduled','Arrived'\)/.test(s.replace(/\n/g, ' ')));
chk('MWL audited', s.includes("'READ_RAD_MWL'"));

// ---- audit actions present ----
['CREATE_RAD_EXAM', 'UPDATE_RAD_EXAM_STATE', 'REGISTER_DICOM_STUDY', 'CREATE_RAD_REPORT', 'ADDENDUM_RAD_REPORT'].forEach(a =>
  chk('audit ' + a, s.includes(`'${a}'`)));

// ---- Migrations: FORCE RLS canonical + tenant_id NOT NULL + idempotency + down drops indexes ----
[['e4_01', m1], ['e4_02', m2], ['e4_03', m3]].forEach(([tag, mm]) => {
  chk(`${tag} tenant_id NOT NULL`, mm.includes('tenant_id       INTEGER NOT NULL') || mm.includes('tenant_id             INTEGER NOT NULL') || /tenant_id +INTEGER NOT NULL/.test(mm));
  chk(`${tag} ENABLE RLS`, mm.includes('ENABLE ROW LEVEL SECURITY'));
  chk(`${tag} FORCE RLS`, mm.includes('FORCE ROW LEVEL SECURITY'));
  chk(`${tag} canonical policy predicate`, mm.includes("NULLIF(current_setting('app.tenant_id', true), '')::integer"));
  chk(`${tag} idempotent table (IF NOT EXISTS)`, mm.includes('CREATE TABLE IF NOT EXISTS'));
  chk(`${tag} idempotent policy (DROP IF EXISTS)`, /DROP POLICY IF EXISTS/.test(mm));
  chk(`${tag} idempotent index (IF NOT EXISTS)`, mm.includes('CREATE INDEX IF NOT EXISTS'));
  chk(`${tag} down drops own indexes`, /DROP INDEX IF EXISTS/.test(mm));
  chk(`${tag} down drops table`, mm.includes('DROP TABLE IF EXISTS'));
  chk(`${tag} exports up/validate/down`, mm.includes('module.exports') && /up\b/.test(mm) && /validate\b/.test(mm) && /down\b/.test(mm));
});
chk('e4_02 dicom is metadata-only (no bytes column)', !m2.includes('bytea') && !m2.includes('BYTEA') && m2.includes('stored_ref'));
chk('e4_03 has critical_notified_at column', m3.includes('critical_notified_at'));

// ---- Frontend: tr()+escapeHTML+safeId, image link via phi-files only, no innerHTML of raw ----
chk('app.js E4 worklist loader present', app.includes('window.loadRisWorklist'));
chk('app.js E4 sign handler present', app.includes('window.risSignReport'));
chk('app.js E4 critical notify present', app.includes('window.risCriticalNotify'));
chk('app.js E4 uses escapeHTML', /risOpenReport[\s\S]{0,2000}escapeHTML/.test(app));
chk('app.js E4 uses safeId', /loadRisWorklist[\s\S]{0,1500}safeId/.test(app));
chk('app.js E4 no public /uploads path', !/RIS[\s\S]{0,4000}\/uploads\//.test(app));

console.log(`\n${pass}/${pass + fail} PASS`);
process.exit(fail ? 1 : 0);
