const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const KEY = 'C:\\Users\\ice\\.ssh\\nama_medical_key';
const TARGET = 'root@204.168.144.74';
function ssh(cmd) {
  const r = spawnSync('ssh', ['-i', KEY, '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=no', '-o', 'ConnectTimeout=15', TARGET, cmd], { encoding: 'utf8', shell: false });
  return r.status === 0;
}
const local = path.resolve(__dirname, '../mynama/server.js');
console.log('push mynama:', ssh(`mkdir -p /var/www/namaweb/mynama`) && spawnSync('scp', ['-i', KEY, '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=no', '-o', 'ConnectTimeout=15', local, `${TARGET}:/var/www/namaweb/mynama/server.js`], { encoding: 'utf8' }).status === 0);

console.log('flush + restart:', ssh('pm2 flush && pm2 restart nama-medical-erp'));

const r2 = spawnSync('ssh', ['-i', KEY, '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=no', '-o', 'ConnectTimeout=15', TARGET, 'sleep 8 && curl -s -o /dev/null -w health=%{http_code} http://127.0.0.1:3000/health && curl -s -o /dev/null -w mynama=%{http_code} http://127.0.0.1:3000/mynama && curl -s -o /dev/null -w dept=%{http_code} http://127.0.0.1:3000/api/v4/dept/list'], { encoding: 'utf8' });
console.log((r2.stdout || '').slice(0, 500));