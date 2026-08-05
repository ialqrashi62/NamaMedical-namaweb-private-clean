const H = require('./hetzner');
const r = H.deploy({
  host: '204.168.144.74',
  user: 'root',
  keyPath: 'C:\\Users\\ice\\.ssh\\nama_medical_key',
  remoteDir: '/var/www/namaweb',
  files: [],
  run: [
    "ls /var/www/namaweb/lib/ 2>&1 | head -30",
    "echo --- routes count --- ; ls /var/www/namaweb/routes/ | wc -l",
    "echo --- server.js size --- ; wc -l /var/www/namaweb/server.js",
    "echo --- key files present --- ; for f in lib/fhir/router.js lib/careplans/engine.js lib/dicom/qidoWado.js lib/voice/dictation.js lib/aiCoPilot/orchestrator.js lib/dr/regions.js lib/bi/powerbi.js lib/integrations/salesforce.js; do [ -f \"/var/www/namaweb/$f\" ] && echo OK $f || echo MISSING $f; done",
    "echo --- routes === ; ls /var/www/namaweb/routes/ | sort",
  ],
});
r.commands.forEach(c => console.log('===', c.cmd.slice(0, 60), '===\n', (c.out || '').trim()));