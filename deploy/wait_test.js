const { spawnSync } = require('child_process');
const r = spawnSync('ssh', [
  '-i', 'C:\\Users\\ice\\.ssh\\nama_medical_key',
  '-o', 'BatchMode=yes',
  '-o', 'StrictHostKeyChecking=no',
  '-o', 'ConnectTimeout=15',
  'root@204.168.144.74',
  "sleep 8 && pm2 list && echo '---ERR---' && tail -20 /root/.pm2/logs/nama-medical-erp-error.log && echo '---OUT---' && tail -50 /root/.pm2/logs/nama-medical-erp-out.log && echo '---TEST---' && curl -s -o /dev/null -w 'health: %{http_code}\\n' http://127.0.0.1:3000/api/health && curl -s -o /dev/null -w 'pgx pairs: %{http_code}\\n' http://127.0.0.1:3000/api/v4/pgx/pairs && curl -s -o /dev/null -w 'bi dashboard: %{http_code}\\n' http://127.0.0.1:3000/api/v4/bi/dashboard && curl -s -o /dev/null -w 'voice: %{http_code}\\n' http://127.0.0.1:3000/api/v4/voice/sessions && curl -s -o /dev/null -w 'telehealth: %{http_code}\\n' http://127.0.0.1:3000/api/v4/telehealth/visits && curl -s -o /dev/null -w 'genomic: %{http_code}\\n' http://127.0.0.1:3000/api/v4/genomic/variants && curl -s -o /dev/null -w 'compounding: %{http_code}\\n' http://127.0.0.1:3000/api/v4/compounding/orders && curl -s -o /dev/null -w 'salesforce: %{http_code}\\n' http://127.0.0.1:3000/api/v4/salesforce/accounts && curl -s -o /dev/null -w 'trials: %{http_code}\\n' http://127.0.0.1:3000/api/v4/trials/list && curl -s -o /dev/null -w 'mobile: %{http_code}\\n' http://127.0.0.1:3000/api/v4/mobile/devices"
], { timeout: 90000 });
console.log((r.stdout || r.stderr || '').toString().slice(0, 10000));