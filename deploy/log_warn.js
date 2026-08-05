const { spawnSync } = require('child_process');
const KEY = 'C:\\Users\\ice\\.ssh\\nama_medical_key';
const TARGET = 'root@204.168.144.74';
function ssh(cmd) {
  const r = spawnSync('ssh', ['-i', KEY, '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=no', '-o', 'ConnectTimeout=15', TARGET, cmd], { encoding: 'utf8' });
  return (r.stdout || r.stderr || '').slice(0, 8000);
}
console.log(ssh("pm2 logs nama-medical-erp --lines 100 --nostream --raw 2>&1 | grep -E 'autowire|skipped' | head -30"));