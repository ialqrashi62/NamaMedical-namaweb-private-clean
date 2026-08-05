const { spawnSync } = require('child_process');
const args = [
  '-i', 'C:\\Users\\ice\\.ssh\\nama_medical_key',
  '-o', 'BatchMode=yes',
  '-o', 'StrictHostKeyChecking=no',
  '-o', 'ConnectTimeout=15',
  'root@204.168.144.74',
  "pm2 delete nama-medical-erp && pm2 start /var/www/namaweb/server.js --name nama-medical-erp -f && sleep 3 && pm2 list && echo '---' && curl -s -o /dev/null -w 'pgx pairs status: %{http_code}\\n' http://127.0.0.1:3000/api/v4/pgx/pairs && curl -s -o /dev/null -w 'health: %{http_code}\\n' http://127.0.0.1:3000/api/health"
];
const r = spawnSync('ssh', args, { timeout: 60000 });
console.log((r.stdout || r.stderr || '').toString().slice(0, 5000));