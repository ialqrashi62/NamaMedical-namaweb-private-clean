const fs = require('fs');
const path = require('path');
const Autowire = require('./autowire');

const serverPath = path.resolve(__dirname, '..', 'server.js');
let src = fs.readFileSync(serverPath, 'utf8');

// Strip existing autowire blocks (any version)
const markers = ['// ===== autowire_all_v23', '// ===== autowire_all_v24', '// ===== autowire_all_v22', '// ===== autowire_all_v21'];
let stripped = 0;
for (const m of markers) {
  const idx = src.indexOf(m);
  if (idx > 0) {
    const before = src.lastIndexOf('\n// ===== ', idx);
    const cutFrom = before > 0 ? before + 1 : idx;
    const lastCatch = src.indexOf('})(); } catch (e) { console.warn(', idx);
    const eol = src.indexOf('\n', lastCatch);
    const cutTo = eol > 0 ? eol + 1 : src.length;
    if (src.slice(cutFrom, cutTo).includes('autowire_all')) {
      src = src.slice(0, cutFrom) + src.slice(cutTo);
      stripped++;
    }
  }
}
console.log('[strip] removed', stripped, 'old blocks');

// Backup
fs.writeFileSync(serverPath + '.pre_remount3.bak', fs.readFileSync(serverPath));

// Only the routes that actually exist
const ROUTES = [
  { module: './routes/bi', base: '/api/v4/bi', role: 'doctor' },
  { module: './routes/voice', base: '/api/v4/voice', role: 'doctor' },
  { module: './routes/dr', base: '/api/v4/dr', role: 'doctor' },
  { module: './routes/trials', base: '/api/v4/trials', role: 'researcher' },
  { module: './routes/populationHealth', base: '/api/v4/population', role: 'doctor' },
  { module: './routes/salesforce', base: '/api/v4/integrations/sf', role: 'admin' },
  { module: './routes/mobile', base: '/api/mobile', role: 'any_authed' },
  { module: './routes/homeHealth', base: '/api/v4/home-health', role: 'nurse_home' },
  { module: './routes/telehealth', base: '/api/v4/telehealth', role: 'doctor' },
  { module: './routes/genomic', base: '/api/v4/genomic', role: 'specialist' },
  { module: './routes/compounding', base: '/api/v4/compounding', role: 'pharmacist' },
  { module: './routes/cardiology', base: '/api/v4/cardiology', role: 'cardiologist' },
  { module: './routes/anesthesia', base: '/api/v4/anesthesia', role: 'anesthesiologist' },
  { module: './routes/pgx', base: '/api/v4/pgx', role: 'doctor' },
  { module: './routes/careplans', base: '/api/v4/careplans', role: 'doctor' },
  { module: './routes/compliance', base: '/api/v4/compliance', role: 'admin' },
  { module: './routes/aiCoPilot', base: '/api/v4/ai', role: 'doctor' },
  { module: './routes/analytics_kpi', base: '/api/v4/kpi', role: 'admin' },
  { module: './routes/analytics_export', base: '/api/v4/analytics', role: 'admin' },
  { module: './routes/audit_chain_search', base: '/api/v4/audit', role: 'admin' },
  { module: './routes/billing_v2', base: '/api/v4/billing2', role: 'finance' },
  { module: './routes/cqm', base: '/api/v4/cqm', role: 'quality' },
  { module: './routes/credentialing', base: '/api/v4/credentialing', role: 'admin' },
  { module: './routes/denial', base: '/api/v4/denial', role: 'finance' },
  { module: './routes/dept_attach', base: '/api/v4/deptAttach', role: 'admin' },
  { module: './routes/dept_registry', base: '/api/v4/deptRegistry', role: 'admin' },
  { module: './routes/developer', base: '/api/v4/developer', role: 'admin' },
  { module: './routes/dicomweb', base: '/api/v4/dicomweb', role: 'radiologist' },
  { module: './routes/discharge', base: '/api/v4/discharge', role: 'doctor' },
  { module: './routes/fhir_server', base: '/api/v4/fhir', role: 'doctor' },
  { module: './routes/hl7v2', base: '/api/v4/hl7', role: 'admin' },
  { module: './routes/interop', base: '/api/v4/interop', role: 'admin' },
  { module: './routes/metrics', base: '/api/v4/metrics', role: 'admin' },
  { module: './routes/nlp_query', base: '/api/v4/nlp', role: 'doctor' },
  { module: './routes/olap', base: '/api/v4/olap', role: 'admin' },
  { module: './routes/pathways', base: '/api/v4/pathways', role: 'doctor' },
  { module: './routes/patient_portal_v2', base: '/api/v4/portal2', role: 'any_authed' },
  { module: './routes/patient_records_ro', base: '/api/v4/records', role: 'doctor' },
  { module: './routes/portal', base: '/api/v4/portal', role: 'any_authed' },
  { module: './routes/tenant_admin', base: '/api/v4/tenant', role: 'admin' },
  { module: './routes/tenant_billing', base: '/api/v4/tenantBilling', role: 'admin' },
  { module: './routes/billing_multi_currency', base: '/api/v4/billing', role: 'finance' },
  { module: './routes/tumorBoard', base: '/api/v4/tumorBoard', role: 'doctor' },
  { module: './routes/voice_scribe', base: '/api/v4/voiceScribe', role: 'doctor' },
];

console.log('[mount] routes to add:', ROUTES.length);

const res = Autowire.mount({
  serverPath,
  routes: ROUTES,
  anchor: "app.use('/api/v4/dept', require('./routes/dept_router'));\r\n} catch (e) { console.warn('[mount] /api/v4/dept not mounted:', e.message); }",
  label: 'autowire_all_v25',
});

console.log('[mount]', JSON.stringify({
  mounted: res.mounted,
  skipped: res.skipped,
  errors: res.errors,
  backup: res.backup,
}, null, 2));