const { spawnSync } = require('child_process');

const r1 = spawnSync('scp', [
  '-i', 'C:\\Users\\ice\\.ssh\\nama_medical_key',
  '-o', 'BatchMode=yes',
  '-o', 'StrictHostKeyChecking=no',
  '-o', 'ConnectTimeout=15',
  'server.js',
  'root@204.168.144.74:/var/www/namaweb/server.js'
]);
console.log('scp:', r1.status);

const r3 = spawnSync('ssh', [
  '-i', 'C:\\Users\\ice\\.ssh\\nama_medical_key',
  '-o', 'BatchMode=yes',
  '-o', 'StrictHostKeyChecking=no',
  '-o', 'ConnectTimeout=15',
  'root@204.168.144.74',
  "pm2 flush && pm2 restart nama-medical-erp && sleep 9 && pm2 list && echo '---ERR---' && tail -10 /root/.pm2/logs/nama-medical-erp-error.log && echo '---TEST---' && curl -s -o /dev/null -w 'health: %{http_code}\\n' http://127.0.0.1:3000/api/health && curl -s -o /dev/null -w 'pgx pairs: %{http_code}\\n' http://127.0.0.1:3000/api/v4/pgx/pairs && curl -s -o /dev/null -w 'bi dashboard: %{http_code}\\n' http://127.0.0.1:3000/api/v4/bi/dashboard && curl -s -o /dev/null -w 'voice sessions: %{http_code}\\n' http://127.0.0.1:3000/api/v4/voice/sessions && curl -s -o /dev/null -w 'telehealth visits: %{http_code}\\n' http://127.0.0.1:3000/api/v4/telehealth/visits && curl -s -o /dev/null -w 'genomic variants: %{http_code}\\n' http://127.0.0.1:3000/api/v4/genomic/variants && curl -s -o /dev/null -w 'compounding orders: %{http_code}\\n' http://127.0.0.1:3000/api/v4/compounding/orders && curl -s -o /dev/null -w 'salesforce accounts: %{http_code}\\n' http://127.0.0.1:3000/api/v4/salesforce/accounts && curl -s -o /dev/null -w 'trials list: %{http_code}\\n' http://127.0.0.1:3000/api/v4/trials/list && curl -s -o /dev/null -w 'mobile devices: %{http_code}\\n' http://127.0.0.1:3000/api/v4/mobile/devices && curl -s -o /dev/null -w 'dr list: %{http_code}\\n' http://127.0.0.1:3000/api/v4/dr/list && curl -s -o /dev/null -w 'population cohort: %{http_code}\\n' http://127.0.0.1:3000/api/v4/population/cohort"
], { timeout: 90000 });
console.log((r3.stdout || r3.stderr || '').toString().slice(0, 6000));