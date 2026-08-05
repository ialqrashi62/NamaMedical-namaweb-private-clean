const { execFileSync, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const KEY = 'C:\\Users\\ice\\.ssh\\nama_medical_key';
const HOST = '204.168.144.74';
const TARGET = `root@${HOST}`;
const REMOTE_DIR = '/var/www/namaweb';

function sshArgs() {
  return ['-i', KEY, '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=no', '-o', 'ConnectTimeout=15'];
}

function scpFile(localRel, remoteRel) {
  // Use remote-target as cwd then put file at exact dest
  const localAbs = path.resolve(__dirname, '..', localRel);
  if (!fs.existsSync(localAbs)) {
    return { ok: false, err: 'LOCAL_MISSING: ' + localAbs };
  }
  const dst = `${TARGET}:${REMOTE_DIR}/${remoteRel}`;
  const r = spawnSync('scp', [...sshArgs(), localAbs, dst], { encoding: 'utf8' });
  return { ok: r.status === 0, out: (r.stdout || '').slice(0, 200), err: r.status === 0 ? '' : (r.stderr || '').slice(0, 300) };
}

function ssh(cmd) {
  const r = spawnSync('ssh', [...sshArgs(), TARGET, cmd], { encoding: 'utf8' });
  return { ok: r.status === 0, out: (r.stdout || '').slice(0, 4000), err: r.status === 0 ? '' : (r.stderr || '').slice(0, 500) };
}

console.log('=== UPLOAD server.js ===');
console.log(JSON.stringify(scpFile('server.js', 'server.js')));

const cmds = [
  "node -c /var/www/namaweb/server.js && echo SYNTAX-OK || echo SYNTAX-FAIL",
  "pm2 restart nama-medical-erp",
  "sleep 10",
  "curl -s -o /dev/null -w 'health=%{http_code}\\n' http://127.0.0.1:3000/health",
  "curl -s -o /dev/null -w 'fhir=%{http_code}\\n' http://127.0.0.1:3000/fhir/metadata",
  "curl -s -o /dev/null -w 'depts=%{http_code}\\n' http://127.0.0.1:3000/api/v4/dept/list",
  "curl -s -o /dev/null -w 'careplans=%{http_code}\\n' -X POST -H 'Content-Type: application/json' -d '{\"tenantId\":\"demo\",\"patientId\":\"p1\",\"setId\":\"stroke_alert\",\"actorId\":\"dr-x\",\"actorRoles\":[\"doctor\"]}' http://127.0.0.1:3000/api/v4/careplans/apply",
  "curl -s -o /dev/null -w 'bi=%{http_code}\\n' http://127.0.0.1:3000/api/v4/bi/dashboards",
  "curl -s -o /dev/null -w 'pgx=%{http_code}\\n' http://127.0.0.1:3000/api/v4/pgx/pairs",
  "curl -s -o /dev/null -w 'anesthesia=%{http_code}\\n' http://127.0.0.1:3000/api/v4/anesthesia/cases",
  "curl -s -o /dev/null -w 'cardiology=%{http_code}\\n' http://127.0.0.1:3000/api/v4/cardiology/studies",
  "curl -s -o /dev/null -w 'denial=%{http_code}\\n' http://127.0.0.1:3000/api/v4/denial/worklist",
  "curl -s -o /dev/null -w 'compliance=%{http_code}\\n' http://127.0.0.1:3000/api/v4/compliance/iso27001/controls",
];

for (const c of cmds) {
  const r = ssh(c);
  console.log('CMD:', c.slice(0, 100), '\n', r.out);
}