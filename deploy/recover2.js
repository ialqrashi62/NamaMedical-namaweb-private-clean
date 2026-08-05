const H = require('./hetzner');
const r = H.deploy({
  host: '204.168.144.74',
  user: 'root',
  keyPath: 'C:\\Users\\ice\\.ssh\\nama_medical_key',
  remoteDir: '/var/www/namaweb',
  files: ['server.js'],
  run: [
    "node -c /var/www/namaweb/server.js && echo SYNTAX-OK",
    "pm2 restart nama-medical-erp",
    "sleep 10",
    "curl -s -o /dev/null -w 'health=%{http_code}\\n' http://127.0.0.1:3000/health",
    "curl -s -o /dev/null -w 'fhir=%{http_code}\\n' http://127.0.0.1:3000/fhir/metadata",
    "curl -s -o /dev/null -w 'depts=%{http_code}\\n' http://127.0.0.1:3000/api/v4/dept/list",
    "curl -s -o /dev/null -w 'careplans=%{http_code}\\n' -X POST -H 'Content-Type: application/json' -d '{\"tenantId\":\"demo\",\"patientId\":\"p1\",\"setId\":\"stroke_alert\",\"actorId\":\"dr-x\",\"actorRoles\":[\"doctor\"]}' http://127.0.0.1:3000/api/v4/careplans/apply",
    "curl -s -o /dev/null -w 'bi=%{http_code}\\n' http://127.0.0.1:3000/api/v4/bi/dashboards",
    "curl -s -o /dev/null -w 'pgx=%{http_code}\\n' http://127.0.0.1:3000/api/v4/pgx/pairs",
  ],
});
r.commands.forEach(c => console.log('CMD:', c.cmd.slice(0, 120), '\n', (c.out || '').slice(0, 2000)));