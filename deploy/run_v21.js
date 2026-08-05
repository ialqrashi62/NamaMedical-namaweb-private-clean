const H = require('./hetzner');
const files = [
  'server.js',
  'deploy/server-wire.js',
  'deploy/hetzner.js',
  'deploy/run.js',
  'deploy/verify.js',
];
const r = H.deploy({
  host: '204.168.144.74',
  user: 'root',
  keyPath: 'C:\\Users\\ice\\.ssh\\nama_medical_key',
  remoteDir: '/var/www/namaweb',
  files,
  run: [
    "cd /var/www/namaweb && pm2 reload nama-medical-erp --wait-ready 2>&1 || echo PM2_FAIL",
    "curl -s -o /dev/null -w 'HTTP %{http_code}' http://127.0.0.1:3000/health || echo CURL_FAIL",
    "curl -s -o /dev/null -w 'FHIR %{http_code}' http://127.0.0.1:3000/fhir/metadata || echo FHIR_FAIL",
    "curl -s -o /dev/null -w 'STATION %{http_code}' http://127.0.0.1:3000/station-index.html",
  ],
});
const okFiles = r.files.filter(x => x.ok).length;
console.log('files ok:', okFiles + '/' + r.files.length);
r.commands.forEach(c => console.log(' cmd:', c.cmd.slice(0, 60), '=>', (c.out || '').trim().slice(0, 200)));