const { spawnSync } = require('child_process');
const KEY = 'C:\\Users\\ice\\.ssh\\nama_medical_key';
const TARGET = 'root@204.168.144.74';
function ssh(cmd) {
  const r = spawnSync('ssh', ['-i', KEY, '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=no', '-o', 'ConnectTimeout=15', TARGET, cmd], { encoding: 'utf8', shell: false });
  return (r.stdout || r.stderr || '');
}
// Try login
console.log('LOGIN:');
const login = ssh("curl -s -X POST -H 'Content-Type: application/json' -d '{\"username\":\"admin\",\"password\":\"admin\",\"tenantId\":\"demo\"}' http://127.0.0.1:3000/api/login");
console.log(login.slice(0, 500));
// Try cookies
console.log('---cookie---');
const c = ssh("curl -s -i -X POST -H 'Content-Type: application/json' -d '{\"username\":\"admin\",\"password\":\"admin\",\"tenantId\":\"demo\"}' http://127.0.0.1:3000/api/login | grep -i set-cookie");
console.log(c);
// Use cookie to test pgx
console.log('---pgx w/ cookie---');
const COOKIE = c.match(/nama.sess=([^;]+)/)?.[1] || '';
const withCookie = ssh(`curl -s -o /dev/null -w '%{http_code}' -H 'Cookie: nama.sess=${COOKIE}' http://127.0.0.1:3000/api/v4/pgx/pairs`);
console.log('pgx w/cookie:', withCookie);