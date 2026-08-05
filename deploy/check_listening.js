const { spawnSync } = require('child_process');
const args = [
  '-i', 'C:\\Users\\ice\\.ssh\\nama_medical_key',
  '-o', 'BatchMode=yes',
  '-o', 'StrictHostKeyChecking=no',
  '-o', 'ConnectTimeout=15',
  'root@204.168.144.74',
  "ls -la /root/.pm2/logs/ && echo '---' && wc -l /root/.pm2/logs/nama-medical-erp-out.log /root/.pm2/logs/nama-medical-erp-error.log"
];
const r = spawnSync('ssh', args);
console.log((r.stdout || r.stderr || '').toString().slice(0, 4000));