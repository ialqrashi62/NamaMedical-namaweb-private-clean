const { spawnSync } = require('child_process');
const r = spawnSync('ssh', [
  '-i', 'C:\\Users\\ice\\.ssh\\nama_medical_key',
  '-o', 'BatchMode=yes',
  '-o', 'StrictHostKeyChecking=no',
  '-o', 'ConnectTimeout=15',
  'root@204.168.144.74',
  "md5sum /var/www/namaweb/server.js && pm2 list && curl -s -o /dev/null -w 'sf: %{http_code}\\n' http://127.0.0.1:3000/api/v4/integrations/sf/query -H 'x-tenant-id: 1' -H 'x-user-id: dev' -H 'x-user-role: admin' && curl -s -o /dev/null -w 'mobile: %{http_code}\\n' http://127.0.0.1:3000/api/mobile/login && curl -s -o /dev/null -w 'home-health: %{http_code}\\n' http://127.0.0.1:3000/api/v4/home-health/slots -H 'x-tenant-id: 1' -H 'x-user-id: dev' -H 'x-user-role: nurse' && curl -s -o /dev/null -w 'careplans/active: %{http_code}\\n' http://127.0.0.1:3000/api/v4/careplans/active -H 'x-tenant-id: 1' -H 'x-user-id: dev' -H 'x-user-role: doctor' && curl -s -o /dev/null -w 'genomic: %{http_code}\\n' http://127.0.0.1:3000/api/v4/genomic/genes -H 'x-tenant-id: 1' -H 'x-user-id: dev' -H 'x-user-role: doctor'"
]);
console.log((r.stdout || r.stderr || '').toString().slice(0, 3000));