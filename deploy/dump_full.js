const { spawnSync } = require('child_process');
const KEY = 'C:\\Users\\ice\\.ssh\\nama_medical_key';
const TARGET = 'root@204.168.144.74';
function ssh(cmd) {
  const r = spawnSync('ssh', ['-i', KEY, '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=no', '-o', 'ConnectTimeout=15', TARGET, cmd], { encoding: 'utf8', shell: false });
  return (r.stdout || r.stderr || '');
}
ssh('pm2 flush > /dev/null');
ssh("curl -s -H 'x-tenant-id: tnt-demo' -H 'x-user-id: dr-test' http://127.0.0.1:3000/api/v4/pgx/pairs > /dev/null");
const out = ssh("pm2 logs nama-medical-erp --lines 50 --nostream --raw 2>&1");
console.log(out);