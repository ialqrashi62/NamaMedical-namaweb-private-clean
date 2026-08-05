const { spawnSync } = require('child_process');
const KEY = 'C:\\Users\\ice\\.ssh\\nama_medical_key';
const TARGET = 'root@204.168.144.74';
function ssh(cmd) {
  const r = spawnSync('ssh', ['-i', KEY, '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=no', '-o', 'ConnectTimeout=15', TARGET, cmd], { encoding: 'utf8', shell: false });
  return (r.stdout || r.stderr || '');
}
console.log('kill:', ssh('pm2 kill'));
console.log('start:', ssh('cd /var/www/namaweb && pm2 start server.js --name nama-medical-erp'));
console.log('wait:', ssh('sleep 12'));
console.log('test:', ssh("curl -s -o /dev/null -w 'health=%{http_code}\\n' http://127.0.0.1:3000/health"));
console.log('pgx:', ssh("curl -s -o /dev/null -w '%{http_code}\\n' -H 'x-tenant-id: tnt-demo' -H 'x-user-id: dr-test' -H 'x-user-role: doctor' http://127.0.0.1:3000/api/v4/pgx/pairs"));
console.log('logs:', ssh("pm2 logs nama-medical-erp --lines 100 --nostream --raw 2>&1 | tail -30"));