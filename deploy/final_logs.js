const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const KEY = 'C:\\Users\\ice\\.ssh\\nama_medical_key';
const TARGET = 'root@204.168.144.74';
function ssh(cmd) {
  const r = spawnSync('ssh', ['-i', KEY, '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=no', '-o', 'ConnectTimeout=15', TARGET, cmd], { encoding: 'utf8', shell: false });
  return (r.stdout || r.stderr || '');
}
const out = ssh("pm2 logs nama-medical-erp --lines 200 --nostream --raw 2>&1 | grep -E 'engine-registry|autowire|not mounted|AuditService' | tail -25");
fs.writeFileSync(path.resolve(__dirname, 'final_log.txt'), out);
console.log('wrote', out.length, 'bytes');