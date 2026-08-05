const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const KEY = 'C:\\Users\\ice\\.ssh\\nama_medical_key';
const TARGET = 'root@204.168.144.74';
function ssh(cmd) {
  const r = spawnSync('ssh', ['-i', KEY, '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=no', '-o', 'ConnectTimeout=15', TARGET, cmd], { encoding: 'utf8', shell: false });
  return (r.stdout || r.stderr || '');
}
// Use && to chain
const r = ssh('pm2 restart nama-medical-erp && sleep 8 && pm2 logs nama-medical-erp --lines 200 --nostream --raw 2>&1 | grep -E "engine-registry|autowire|not mounted" | tail -30');
fs.writeFileSync(path.resolve(__dirname, 'fresh_log.txt'), r);
console.log('wrote', r.length, 'bytes');