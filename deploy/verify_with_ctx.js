const { spawnSync } = require('child_process');
const KEY = 'C:\\Users\\ice\\.ssh\\nama_medical_key';
const TARGET = 'root@204.168.144.74';
function ssh(cmd) {
  const r = spawnSync('ssh', ['-i', KEY, '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=no', '-o', 'ConnectTimeout=15', TARGET, cmd], { encoding: 'utf8', shell: false });
  return (r.stdout || r.stderr || '');
}
const paths = [
  '/api/v4/pgx/pairs',
  '/api/v4/bi/workspaces',
  '/api/v4/voice/models',
  '/api/v4/dr/regions',
  '/api/v4/trials/protocols',
  '/api/v4/population/registries',
  '/api/v4/salesforce/connect', // POST
  '/api/v4/mobile/login',       // POST
  '/api/v4/telehealth/rooms',
  '/api/v4/genomic/genes',
  '/api/v4/compounding/formulas',
];
for (const p of paths) {
  const method = p.includes('connect') || p.includes('login') ? 'POST' : 'GET';
  const data = method === 'POST' ? ` -d '{}' -H 'Content-Type: application/json'` : '';
  const cmd = `curl -s -o /dev/null -w '%{http_code}' -X ${method} -H 'x-tenant-id: tnt-demo' -H 'x-user-id: dr-test' -H 'x-user-role: doctor'${data} http://127.0.0.1:3000${p}`;
  console.log(p + ' = ' + ssh(cmd));
}