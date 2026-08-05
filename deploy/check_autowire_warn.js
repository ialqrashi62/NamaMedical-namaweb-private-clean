const { spawnSync } = require('child_process');
const r = spawnSync('ssh', [
  '-i', 'C:\\Users\\ice\\.ssh\\nama_medical_key',
  '-o', 'BatchMode=yes',
  '-o', 'StrictHostKeyChecking=no',
  '-o', 'ConnectTimeout=15',
  'root@204.168.144.74',
  "pm2 flush && pm2 restart nama-medical-erp && sleep 6 && grep -E 'autowire' /root/.pm2/logs/nama-medical-erp-out.log | head -30"
], { timeout: 60000 });
console.log((r.stdout || r.stderr || '').toString().slice(0, 6000));