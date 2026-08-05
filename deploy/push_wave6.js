const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const KEY = 'C:\\Users\\ice\\.ssh\\nama_medical_key';
const TARGET = 'root@204.168.144.74';
const REMOTE_DIR = '/var/www/namaweb';

function sshArgs() {
  return ['-i', KEY, '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=no', '-o', 'ConnectTimeout=15'];
}
function ssh(cmd) {
  const r = spawnSync('ssh', [...sshArgs(), TARGET, cmd], { encoding: 'utf8' });
  return (r.stdout || r.stderr || '').slice(0, 4000);
}
function scpFile(localAbs, remoteRel) {
  ssh(`mkdir -p "${REMOTE_DIR}/${path.dirname(remoteRel).replace(/\\/g, '/')}"`);
  const r = spawnSync('scp', [...sshArgs(), localAbs, `${TARGET}:${REMOTE_DIR}/${remoteRel}`], { encoding: 'utf8' });
  return r.status === 0;
}

const enginesDir = path.resolve(__dirname, '../engines');
let engineCount = 0;
const dirs = fs.readdirSync(enginesDir).filter(d => fs.statSync(path.join(enginesDir, d)).isDirectory());
for (const d of dirs) {
  const f = path.join(enginesDir, d, 'initial_assessment.engine');
  if (fs.existsSync(f)) {
    if (scpFile(f, `engines/${d}/initial_assessment.engine`)) engineCount++;
  }
}
console.log('engines pushed:', engineCount);

const mynamaDir = path.resolve(__dirname, '../mynama');
if (fs.existsSync(mynamaDir)) {
  const r = spawnSync('scp', [...sshArgs(), '-r', mynamaDir, `${TARGET}:${REMOTE_DIR}/`], { encoding: 'utf8' });
  console.log('mynama push:', r.status === 0 ? 'OK' : 'FAIL ' + (r.stderr || '').slice(0, 200));
}

console.log('=== verify ===');
console.log(ssh('pm2 restart nama-medical-erp'));
const cmds = [
  "sleep 10",
  "curl -s -o /dev/null -w 'health=%{http_code}\\n' http://127.0.0.1:3000/health",
  "curl -s -o /dev/null -w 'depts=%{http_code}\\n' http://127.0.0.1:3000/api/v4/dept/list",
  "curl -s -o /dev/null -w 'mynama=%{http_code}\\n' http://127.0.0.1:3000/mynama",
];
for (const c of cmds) console.log('CMD:', c, '\n', ssh(c));