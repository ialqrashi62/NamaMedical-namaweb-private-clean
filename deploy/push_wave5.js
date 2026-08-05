const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const KEY = 'C:\\Users\\ice\\.ssh\\nama_medical_key';
const TARGET = 'root@204.168.144.74';
const REMOTE_DIR = '/var/www/namaweb';

function sshArgs() {
  return ['-i', KEY, '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=no', '-o', 'ConnectTimeout=15'];
}
function scp(localAbs, remoteRel) {
  const r = spawnSync('scp', [...sshArgs(), localAbs, `${TARGET}:${REMOTE_DIR}/${remoteRel}`], { encoding: 'utf8' });
  return { ok: r.status === 0, err: r.status === 0 ? '' : (r.stderr || '').slice(0, 300) };
}
function ssh(cmd) {
  const r = spawnSync('ssh', [...sshArgs(), TARGET, cmd], { encoding: 'utf8' });
  return (r.stdout || '').slice(0, 4000);
}

const files = [
  'server.js',
  'lib/auth/testSession.js',
  'lib/auth/authProbe.js',
];
for (const f of files) {
  const localAbs = path.resolve(__dirname, '..', f);
  if (!fs.existsSync(localAbs)) { console.log('MISSING', f); continue; }
  const remoteDir = REMOTE_DIR + '/' + f.split('/').slice(0, -1).join('/');
  ssh(`mkdir -p ${remoteDir}`);
  console.log(f, JSON.stringify(scp(localAbs, f)));
}

console.log('=== verify ===');
const cmds = [
  "node -c /var/www/namaweb/server.js && echo SYNTAX-OK || echo SYNTAX-FAIL",
  "pm2 restart nama-medical-erp",
  "sleep 10",
  "curl -s -o /dev/null -w 'health=%{http_code}\\n' http://127.0.0.1:3000/health",
  "curl -s -o /dev/null -w 'depts=%{http_code}\\n' http://127.0.0.1:3000/api/v4/dept/list",
  "curl -s -o /dev/null -w 'pgx=%{http_code}\\n' http://127.0.0.1:3000/api/v4/pgx/pairs",
  "curl -s -o /dev/null -w 'bi=%{http_code}\\n' http://127.0.0.1:3000/api/v4/bi/workspaces",
  "curl -s -o /dev/null -w 'voice=%{http_code}\\n' http://127.0.0.1:3000/api/v4/voice/models",
  "curl -s -o /dev/null -w 'dr=%{http_code}\\n' http://127.0.0.1:3000/api/v4/dr/regions",
  "curl -s -o /dev/null -w 'trials=%{http_code}\\n' http://127.0.0.1:3000/api/v4/trials/protocols",
  "curl -s -o /dev/null -w 'pop=%{http_code}\\n' http://127.0.0.1:3000/api/v4/population/registries",
];
for (const c of cmds) console.log('CMD:', c.slice(0, 80), '\n', ssh(c));