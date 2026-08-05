const { spawnSync } = require('child_process');
const args = [
  '-i', 'C:\\Users\\ice\\.ssh\\nama_medical_key',
  '-o', 'BatchMode=yes',
  '-o', 'StrictHostKeyChecking=no',
  '-o', 'ConnectTimeout=15',
  'root@204.168.144.74',
  "sed -n '1960,2000p' /var/www/namaweb/db_postgres.js"
];
const r = spawnSync('ssh', args);
console.log((r.stdout || r.stderr || '').toString().slice(0, 4000));