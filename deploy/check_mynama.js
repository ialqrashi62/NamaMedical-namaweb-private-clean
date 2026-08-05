const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const KEY = 'C:\\Users\\ice\\.ssh\\nama_medical_key';
const TARGET = 'root@204.168.144.74';
function ssh(cmd) {
  const r = spawnSync('ssh', ['-i', KEY, '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=no', '-o', 'ConnectTimeout=15', TARGET, cmd], { encoding: 'utf8' });
  return (r.stdout || r.stderr || '');
}
const out = ssh('ls -la /var/www/namaweb/mynama/ 2>&1; cat /var/www/namaweb/mynama/server.js 2>&1 | head -5');
fs.writeFileSync(path.resolve(__dirname, 'mynama_dump.txt'), out);
console.log('wrote', out.length, 'bytes');