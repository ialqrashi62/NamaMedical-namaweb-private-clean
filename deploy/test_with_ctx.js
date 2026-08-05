const { spawnSync } = require('child_process');
const r = spawnSync('ssh', [
  '-i', 'C:\\Users\\ice\\.ssh\\nama_medical_key',
  '-o', 'BatchMode=yes',
  '-o', 'StrictHostKeyChecking=no',
  '-o', 'ConnectTimeout=15',
  'root@204.168.144.74',
  "curl -sv -H 'x-tenant-id: 1' -H 'x-user-id: dev' -H 'x-user-role: doctor' http://127.0.0.1:3000/api/v4/bi/dashboards 2>&1 | head -25 && echo '---' && curl -sv -H 'x-tenant-id: 1' -H 'x-user-id: dev' -H 'x-user-role: doctor' http://127.0.0.1:3000/api/v4/pgx/pairs 2>&1 | head -25"
]);
console.log((r.stdout || r.stderr || '').toString().slice(0, 5000));