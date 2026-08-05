const { spawnSync } = require('child_process');
const KEY = 'C:\\Users\\ice\\.ssh\\nama_medical_key';
const TARGET = 'root@204.168.144.74';
function ssh(cmd) {
  const r = spawnSync('ssh', ['-i', KEY, '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=no', '-o', 'ConnectTimeout=15', TARGET, cmd], { encoding: 'utf8', shell: false });
  return (r.stdout || r.stderr || '');
}
console.log('pgx:', ssh("curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/api/v4/pgx/pairs"));
console.log('body:', ssh("curl -s http://127.0.0.1:3000/api/v4/pgx/pairs | head -c 200"));