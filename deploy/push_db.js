const { spawnSync } = require('child_process');
const args = [
  '-i', 'C:\\Users\\ice\\.ssh\\nama_medical_key',
  '-o', 'BatchMode=yes',
  '-o', 'StrictHostKeyChecking=no',
  '-o', 'ConnectTimeout=15',
  'scp', 'db_postgres.js', 'root@204.168.144.74:/var/www/namaweb/db_postgres.js'
];
const r = spawnSync('scp', args.slice(1));
console.log('scp:', r.status, (r.stderr || '').toString().slice(0, 500));

const r2 = spawnSync('ssh', [
  '-i', 'C:\\Users\\ice\\.ssh\\nama_medical_key',
  '-o', 'BatchMode=yes',
  '-o', 'StrictHostKeyChecking=no',
  '-o', 'ConnectTimeout=15',
  'root@204.168.144.74',
  'md5sum /var/www/namaweb/db_postgres.js && pm2 restart nama-medical-erp && sleep 5 && pm2 list && echo --- && curl -s -o /dev/null -w "health: %{http_code}\\n" http://127.0.0.1:3000/api/health && curl -s -o /dev/null -w "pgx pairs: %{http_code}\\n" http://127.0.0.1:3000/api/v4/pgx/pairs && curl -s -o /dev/null -w "bi dashboard: %{http_code}\\n" http://127.0.0.1:3000/api/v4/bi/dashboard && tail -10 /root/.pm2/logs/nama-medical-erp-error.log'
], { timeout: 60000 });
console.log('ssh:', (r2.stdout || r2.stderr || '').toString().slice(0, 5000));