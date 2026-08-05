const { spawnSync } = require('child_process');
const args = [
  '-i', 'C:\\Users\\ice\\.ssh\\nama_medical_key',
  '-o', 'BatchMode=yes',
  '-o', 'StrictHostKeyChecking=no',
  '-o', 'ConnectTimeout=15',
  'root@204.168.144.74',
  "grep -rn 'tenant_plan_assignments' /var/www/namaweb/*.js | head -10 && echo '---' && grep -rn 'tenant_plan_assignments' /var/www/namaweb/lib/ | head -10"
];
const r = spawnSync('ssh', args);
console.log((r.stdout || r.stderr || '').toString().slice(0, 4000));