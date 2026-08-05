const { spawnSync } = require('child_process');
const KEY = 'C:\\Users\\ice\\.ssh\\nama_medical_key';
const TARGET = 'root@204.168.144.74';
function ssh(cmd) {
  const r = spawnSync('ssh', ['-i', KEY, '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=no', '-o', 'ConnectTimeout=15', TARGET, cmd], { encoding: 'utf8' });
  return (r.stdout || r.stderr || '');
}
const a = ssh('pm2 restart nama-medical-erp');
console.log('restart:', a.slice(0, 500));
const b = ssh('sleep 8; pm2 logs nama-medical-erp --lines 80 --nostream --raw 2>&1 | grep -E "autowire|skipped" | head -25');
console.log('logs:');
console.log(b);