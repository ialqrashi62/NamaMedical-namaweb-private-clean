const H = require('./hetzner');
const files = [
  'lib/fhir/router.js','lib/fhir/storage.js','routes/fhir_router.js',
  'lib/careplans/orderSets.js','lib/careplans/engine.js','lib/careplans/storage.js','routes/careplans.js',
  'lib/llm/dischargeSummarizer.js','lib/llm/templates.js','lib/llm/contextBuilder.js','routes/discharge.js',
  'lib/billing/currency.js','lib/billing/invoice.js','lib/billing/storage.js','routes/billing_v2.js',
  'lib/dicom/storage.js','lib/dicom/qidoWado.js','lib/dicom/ohifConfig.js','routes/dicomweb.js',
  'lib/hl7v2/parser.js','lib/hl7v2/mapper.js','lib/hl7v2/storage.js','routes/hl7v2.js',
  'lib/portal/auth.js','lib/portal/portal.js','lib/portal/notifications.js','routes/portal.js',
  'lib/olap/materializedViews.js','lib/olap/queryRunner.js','lib/olap/refresh.js','routes/olap.js',
  'lib/route-guards.js','lib/test-fixtures.js','lib/route-factory.js','lib/cross-tenant-runner.js',
  'lib/prompt-engineering/PromptRegistry.js','lib/vector/VectorStore.js','lib/security/Pentest.js',
  'lib/auth/RBAC.js','lib/bpmn/Engine.js','lib/observability/LLMTracker.js',
  'public/js/render-snippets.js','public/js/modal.js','public/js/station-snippets.js','public/js/station-builder.js',
  'public/js/wireframe-snippets.js','public/js/components/hospital.js','public/js/clinical-form-builder.js',
  'public/js/fhir-bridge.js','public/js/vital-trend.js','public/js/audit-trail.js','public/js/barcode-meds.js',
  'public/js/procedure-consent.js','public/js/station-clinical-enhancer.js','public/js/station-api.js','public/js/i18n-runtime.js',
  'public/index.html','public/station-index.html','public/all-stations.html',
  'i18n/medical_dictionary.json',
  'deploy/hetzner.js',
];
console.log('files:', files.length);
const r = H.deploy({
  host: '204.168.144.74',
  user: 'root',
  keyPath: 'C:\\Users\\ice\\.ssh\\nama_medical_key',
  remoteDir: '/var/www/namaweb',
  files,
  run: [
    "mkdir -p /var/www/namaweb/lib/fhir /var/www/namaweb/lib/careplans /var/www/namaweb/lib/llm /var/www/namaweb/lib/billing /var/www/namaweb/lib/dicom /var/www/namaweb/lib/hl7v2 /var/www/namaweb/lib/portal /var/www/namaweb/lib/olap /var/www/namaweb/lib/prompt-engineering /var/www/namaweb/lib/vector /var/www/namaweb/lib/security /var/www/namaweb/lib/auth /var/www/namaweb/lib/bpmn /var/www/namaweb/lib/observability /var/www/namaweb/public/js/components /var/www/namaweb/deploy",
    "cd /var/www/namaweb && pm2 reload nama-medical-erp --wait-ready 2>&1 || echo PM2_FAIL",
    "curl -s -o /dev/null -w 'HTTP %{http_code}' http://127.0.0.1:3000/health || echo CURL_FAIL",
    "curl -s -o /dev/null -w 'FHIR HTTP %{http_code}' http://127.0.0.1:3000/fhir/metadata || echo FHIR_NOT_MOUNTED",
  ],
});
const okFiles = r.files.filter(x => x.ok).length;
const okCmds = r.commands.filter(x => x.ok).length;
console.log('files ok:', okFiles + '/' + r.files.length);
console.log('commands ok:', okCmds + '/' + r.commands.length);
console.log('failures:');
r.files.filter(x => !x.ok).slice(0, 5).forEach(f => console.log('  file', f.file, ':', (f.err || '').split('\n')[0]));
r.commands.filter(x => !x.ok).forEach(c => console.log('  cmd', c.cmd.slice(0, 60), ':', (c.err || '').split('\n')[0]));
r.commands.filter(x => x.ok).forEach(c => console.log('  ok cmd:', c.cmd.slice(0, 60), '=>', (c.out || '').trim().split('\n')[0]));