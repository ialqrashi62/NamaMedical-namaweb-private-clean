const { spawnSync } = require('child_process');
const args = [
  '-i', 'C:\\Users\\ice\\.ssh\\nama_medical_key',
  '-o', 'BatchMode=yes',
  '-o', 'StrictHostKeyChecking=no',
  '-o', 'ConnectTimeout=15',
  'root@204.168.144.74',
  "cat /root/.pm2/logs/nama-medical-erp-out.log | grep -E 'autowire|warn|pgx|404|listening' | tail -60"
];
const r = spawnSync('ssh', args);
console.log((r.stdout || r.stderr || '').toString().slice(0, 6000));