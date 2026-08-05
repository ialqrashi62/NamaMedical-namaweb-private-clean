const { spawnSync } = require('child_process');
const KEY = 'C:\\Users\\ice\\.ssh\\nama_medical_key';
const HOST = '204.168.144.74';
const TARGET = `root@${HOST}`;
function ssh(cmd) {
  const r = spawnSync('ssh', ['-i', KEY, '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=no', '-o', 'ConnectTimeout=15', TARGET, cmd], { encoding: 'utf8' });
  return (r.stdout || r.stderr || '').slice(0, 6000);
}
console.log(ssh("pm2 logs nama-medical-erp --lines 200 --nostream --raw | grep -E 'autowire|skipped' | head -30"));
console.log('---');
console.log(ssh("pm2 logs nama-medical-erp --lines 200 --nostream --raw | tail -50"));