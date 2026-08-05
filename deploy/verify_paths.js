const { spawnSync } = require('child_process');
const KEY = 'C:\\Users\\ice\\.ssh\\nama_medical_key';
const TARGET = 'root@204.168.144.74';
function ssh(cmd) {
  const r = spawnSync('ssh', ['-i', KEY, '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=no', '-o', 'ConnectTimeout=15', TARGET, cmd], { encoding: 'utf8' });
  return (r.stdout || r.stderr || '').trim();
}
const paths = [
  '/api/v4/compliance/iso27001',
  '/api/v4/compliance/hipaa',
  '/api/v4/compliance/baa',
  '/api/v4/bi/workspaces',
  '/api/v4/bi/dashboard/123/embed',
  '/api/v4/home-health/visits',
  '/api/v4/home-health/slots',
  '/api/v4/pgx/pairs',
  '/api/v4/voice/models',
  '/api/v4/dr/regions',
  '/api/v4/trials/protocols',
  '/api/v4/population/registries',
  '/api/v4/voice/session',
];
for (const p of paths) {
  console.log(p + ' = ' + ssh(`curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000${p}`));
}