const { spawnSync } = require('child_process');
const args = [
  '-i', 'C:\\Users\\ice\\.ssh\\nama_medical_key',
  '-o', 'BatchMode=yes',
  '-o', 'StrictHostKeyChecking=no',
  '-o', 'ConnectTimeout=15',
  'root@204.168.144.74',
  "sleep 5 && tail -30 /root/.pm2/logs/nama-medical-erp-error.log && echo '---' && pm2 list && echo '---' && curl -s -o /dev/null -w 'health: %{http_code}\\n' http://127.0.0.1:3000/api/health && curl -s -o /dev/null -w 'pgx pairs: %{http_code}\\n' http://127.0.0.1:3000/api/v4/pgx/pairs && curl -s -o /dev/null -w 'bi dashboard: %{http_code}\\n' http://127.0.0.1:3000/api/v4/bi/dashboard"
];
const r = spawnSync('ssh', args, { timeout: 60000 });
console.log((r.stdout || r.stderr || '').toString().slice(0, 6000));