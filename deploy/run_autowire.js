// run_autowire.js — wire all 30 routers + push to Hetzner + reload + verify
const fs = require('fs');
const path = require('path');
const Autowire = require('./autowire');
const H = require('./hetzner');

const serverPath = path.join(__dirname, '..', 'server.js');

// Step 1: local autowire (dryRun first to preview)
const preview = Autowire.mount({
  serverPath,
  routes: Autowire.ALL_ROUTES,
  anchor: "app.use('/api/v4/dept'",
  backup: serverPath + '.pre_autowire_all.bak',
  label: 'autowire_all_v23',
  dryRun: true,
});

console.log('=== PREVIEW (dry-run) ===');
console.log('mounted:', preview.mounted);
console.log('backup:', preview.backup);
console.log('preview length:', preview.preview ? preview.preview.length : 0, 'chars');
console.log('first 500 chars:');
console.log(preview.preview ? preview.preview.slice(0, 500) : '(empty)');

// Step 2: real write
const result = Autowire.mount({
  serverPath,
  routes: Autowire.ALL_ROUTES,
  anchor: "app.use('/api/v4/dept'",
  backup: serverPath + '.pre_autowire_all.bak',
  label: 'autowire_all_v23',
  dryRun: false,
});

console.log('\n=== APPLIED ===');
console.log(JSON.stringify({ mounted: result.mounted, skipped: result.skipped, errors: result.errors, backup: result.backup }, null, 2));

// Step 3: push to Hetzner + reload
const files = ['server.js', 'deploy/autowire.js'];
console.log('\n=== PUSHING TO HETZNER ===');
const r = H.deploy({
  host: '204.168.144.74',
  user: 'root',
  keyPath: 'C:\\Users\\ice\\.ssh\\nama_medical_key',
  remoteDir: '/var/www/namaweb',
  files,
  run: [
    "cd /var/www/namaweb && pm2 reload nama-medical-erp --wait-ready 2>&1 || echo PM2_FAIL",
    "sleep 5",
    "curl -s -o /dev/null -w 'health: %{http_code}\\n' http://127.0.0.1:3000/health",
    "curl -s -o /dev/null -w 'fhir: %{http_code}\\n' http://127.0.0.1:3000/fhir/metadata",
    "curl -s -o /dev/null -w 'careplans: %{http_code}\\n' -X POST -H 'Content-Type: application/json' -d '{\"tenantId\":\"demo\",\"patientId\":\"p1\",\"setId\":\"stroke_alert\",\"actorId\":\"dr-x\",\"actorRoles\":[\"doctor\"]}' http://127.0.0.1:3000/api/v4/careplans/apply",
  ],
});
const okFiles = r.files.filter(x => x.ok).length;
console.log('files ok:', okFiles + '/' + r.files.length);
r.commands.forEach(c => console.log((c.out || '').trim()));