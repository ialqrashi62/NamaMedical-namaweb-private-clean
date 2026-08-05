const { spawnSync } = require('child_process');
const KEY = 'C:\\Users\\ice\\.ssh\\nama_medical_key';
const TARGET = 'root@204.168.144.74';
function ssh(cmd) {
  const r = spawnSync('ssh', ['-i', KEY, '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=no', '-o', 'ConnectTimeout=15', TARGET, cmd], { encoding: 'utf8', shell: false });
  return (r.stdout || r.stderr || '');
}
const a = ssh('pm2 flush');
console.log('flush:', a.slice(0, 100));
const b = ssh("curl -s -o /dev/null -w 'pgx=%{http_code}' -H 'x-tenant-id: tnt-demo' -H 'x-user-id: dr-test' -H 'x-user-role: doctor' http://127.0.0.1:3000/api/v4/pgx/pairs");
console.log('request:', b);
const c = ssh("pm2 logs nama-medical-erp --lines 100 --nostream --raw 2>&1 | grep -E 'pgx|TypeError|at ' | tail -30");
console.log('logs:', c);