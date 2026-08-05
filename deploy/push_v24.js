const { spawnSync } = require('child_process');

// Push server.js
const r1 = spawnSync('scp', [
  '-i', 'C:\\Users\\ice\\.ssh\\nama_medical_key',
  '-o', 'BatchMode=yes',
  '-o', 'StrictHostKeyChecking=no',
  '-o', 'ConnectTimeout=15',
  'server.js',
  'root@204.168.144.74:/var/www/namaweb/server.js'
]);
console.log('scp:', r1.status, (r1.stderr || '').toString().slice(0, 200));

// Push autowire.js too (in case it changed)
const r2 = spawnSync('scp', [
  '-i', 'C:\\Users\\ice\\.ssh\\nama_medical_key',
  '-o', 'BatchMode=yes',
  '-o', 'StrictHostKeyChecking=no',
  '-o', 'ConnectTimeout=15',
  'deploy/autowire.js',
  'root@204.168.144.74:/var/www/namaweb/deploy/autowire.js'
]);
console.log('scp autowire:', r2.status);

const r3 = spawnSync('ssh', [
  '-i', 'C:\\Users\\ice\\.ssh\\nama_medical_key',
  '-o', 'BatchMode=yes',
  '-o', 'StrictHostKeyChecking=no',
  '-o', 'ConnectTimeout=15',
  'root@204.168.144.74',
  "md5sum /var/www/namaweb/server.js && pm2 flush && pm2 restart nama-medical-erp && sleep 7 && tail -50 /root/.pm2/logs/nama-medical-erp-out.log && echo '---' && curl -s -o /dev/null -w 'health: %{http_code}\\n' http://127.0.0.1:3000/api/health && curl -s -o /dev/null -w 'pgx pairs: %{http_code}\\n' http://127.0.0.1:3000/api/v4/pgx/pairs && curl -s -o /dev/null -w 'bi dashboard: %{http_code}\\n' http://127.0.0.1:3000/api/v4/bi/dashboard && curl -s -o /dev/null -w 'voice: %{http_code}\\n' http://127.0.0.1:3000/api/v4/voice/sessions && curl -s -o /dev/null -w 'telehealth: %{http_code}\\n' http://127.0.0.1:3000/api/v4/telehealth/visits"
], { timeout: 90000 });
console.log((r3.stdout || r3.stderr || '').toString().slice(0, 8000));