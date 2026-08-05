const H = require('./hetzner');
const files = [
  'lib/trials/protocol.js','lib/trials/storage.js','lib/trials/consent.js','routes/trials.js',
  'lib/populationHealth/registry.js','lib/populationHealth/cohort.js','lib/populationHealth/outreach.js','routes/populationHealth.js',
  'lib/pgxDosing/pairings.js','lib/pgxDosing/variants.js','lib/pgxDosing/doseEngine.js','routes/pgx.js',
  'lib/voice/asr.js','lib/voice/ner.js','lib/voice/dictation.js','routes/voice.js',
  'lib/aiCoPilot/orchestrator.js','lib/aiCoPilot/agents.js','lib/aiCoPilot/consensus.js','routes/aiCoPilot.js',
  'lib/interop/xca.js','lib/interop/fhirExchange.js','lib/interop/mapping.js','routes/interop.js',
  'lib/dr/regions.js','lib/dr/replication.js','lib/dr/failover.js','routes/dr.js',
  'lib/bi/powerbi.js','lib/bi/dashboards.js','lib/bi/storage.js','routes/bi.js',
  'lib/compliance/iso27001.js','lib/compliance/hipaa.js','lib/compliance/baa.js','routes/compliance.js',
  'lib/integrations/salesforce.js','lib/integrations/patient360.js','lib/integrations/storage.js','routes/salesforce.js',
];
console.log('files:', files.length);
const r = H.deploy({
  host: '204.168.144.74',
  user: 'root',
  keyPath: 'C:\\Users\\ice\\.ssh\\nama_medical_key',
  remoteDir: '/var/www/namaweb',
  files,
  run: [
    "mkdir -p /var/www/namaweb/lib/trials /var/www/namaweb/lib/populationHealth /var/www/namaweb/lib/pgxDosing /var/www/namaweb/lib/voice /var/www/namaweb/lib/aiCoPilot /var/www/namaweb/lib/interop /var/www/namaweb/lib/dr /var/www/namaweb/lib/bi /var/www/namaweb/lib/compliance /var/www/namaweb/lib/integrations",
    "cd /var/www/namaweb && pm2 reload nama-medical-erp --wait-ready 2>&1 || echo PM2_FAIL",
    "sleep 4",
    "curl -s -o /dev/null -w 'health: %{http_code}\\n' http://127.0.0.1:3000/health",
  ],
});
const okFiles = r.files.filter(x => x.ok).length;
console.log('files ok:', okFiles + '/' + r.files.length);
console.log('failed:');
r.files.filter(x => !x.ok).slice(0, 5).forEach(f => console.log(' ', f.file, ':', (f.err || '').split('\n')[0]));
r.commands.forEach(c => console.log((c.out || '').trim()));