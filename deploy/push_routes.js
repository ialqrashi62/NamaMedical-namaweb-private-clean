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
  return { ok: r.status === 0, out: (r.stdout || '').slice(0, 200), err: r.status === 0 ? '' : (r.stderr || '').slice(0, 300) };
}
function ssh(cmd) {
  const r = spawnSync('ssh', [...sshArgs(), TARGET, cmd], { encoding: 'utf8' });
  return { ok: r.status === 0, out: (r.stdout || '').slice(0, 4000), err: r.status === 0 ? '' : (r.stderr || '').slice(0, 500) };
}

const files = [
  'routes/bi.js',
  'routes/homeHealth.js',
  'routes/compliance.js',
];
for (const f of files) {
  const localAbs = path.resolve(__dirname, '..', f);
  if (!fs.existsSync(localAbs)) {
    console.log('LOCAL_MISSING', f);
    continue;
  }
  // Use mkdir -p on remote then scp
  const remoteDir = REMOTE_DIR + '/' + f.split('/').slice(0, -1).join('/');
  ssh(`mkdir -p ${remoteDir}`);
  console.log(JSON.stringify(scp(localAbs, f)));
}

const cmds = [
  "node -c /var/www/namaweb/routes/bi.js && echo BI-OK",
  "node -c /var/www/namaweb/routes/homeHealth.js && echo HH-OK",
  "node -c /var/www/namaweb/routes/compliance.js && echo COMP-OK",
  "pm2 restart nama-medical-erp",
  "sleep 10",
  "curl -s -o /dev/null -w 'health=%{http_code}\\n' http://127.0.0.1:3000/health",
  "curl -s -o /dev/null -w 'bi=%{http_code}\\n' http://127.0.0.1:3000/api/v4/bi/dashboards",
  "curl -s -o /dev/null -w 'compliance=%{http_code}\\n' http://127.0.0.1:3000/api/v4/compliance/iso27001/controls",
  "curl -s -o /dev/null -w 'homeHealth=%{http_code}\\n' http://127.0.0.1:3000/api/v4/home-health/slots",
];
for (const c of cmds) console.log('CMD:', c.slice(0, 90), '\n', ssh(c).out);