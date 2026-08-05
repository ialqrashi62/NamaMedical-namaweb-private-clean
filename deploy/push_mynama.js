const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const KEY = 'C:\\Users\\ice\\.ssh\\nama_medical_key';
const TARGET = 'root@204.168.144.74';
const REMOTE_DIR = '/var/www/namaweb';

function sshArgs() {
  return ['-i', KEY, '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=no', '-o', 'ConnectTimeout=15'];
}

// Create remote dir first
console.log('mkdir:', spawnSync('ssh', [...sshArgs(), TARGET, `mkdir -p ${REMOTE_DIR}/mynama`], { encoding: 'utf8' }).status);

// Push each file
const files = ['mynama/server.js', 'mynama/README.md'];
for (const f of files) {
  const localAbs = path.resolve(__dirname, '..', f);
  const r = spawnSync('scp', [...sshArgs(), localAbs, `${TARGET}:${REMOTE_DIR}/${f}`], { encoding: 'utf8' });
  console.log(f, ':', r.status === 0 ? 'OK' : 'FAIL ' + (r.stderr || '').slice(0, 200));
}

// Push mynama/mobile subdir
const mobileDir = path.resolve(__dirname, '../mynama/mobile');
if (fs.existsSync(mobileDir)) {
  const r = spawnSync('scp', [...sshArgs(), '-r', mobileDir, `${TARGET}:${REMOTE_DIR}/mynama/`], { encoding: 'utf8' });
  console.log('mynama/mobile:', r.status === 0 ? 'OK' : 'FAIL ' + (r.stderr || '').slice(0, 200));
}

// Verify
const v = spawnSync('ssh', [...sshArgs(), TARGET, 'ls -la /var/www/namaweb/mynama/'], { encoding: 'utf8' });
console.log('verify:', (v.stdout || '').slice(0, 500));

// Restart + verify HTTP
console.log('restart:', spawnSync('ssh', [...sshArgs(), TARGET, 'pm2 restart nama-medical-erp'], { encoding: 'utf8' }).status);
const h = (s) => new Promise((r) => setTimeout(r, s * 1000));
h(10).then(() => {
  const r = spawnSync('ssh', [...sshArgs(), TARGET, "curl -s -o /dev/null -w 'health=%{http_code} mynama=%{http_code}{http_code}\\n' http://127.0.0.1:3000/health; curl -s -o /dev/null -w 'mynama=%{http_code}\\n' http://127.0.0.1:3000/mynama"], { encoding: 'utf8' });
  console.log((r.stdout || '').slice(0, 500));
});