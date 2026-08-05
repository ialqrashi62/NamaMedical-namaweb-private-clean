const { spawnSync } = require('child_process');
const r = spawnSync('scp', [
  '-i', 'C:\\Users\\ice\\.ssh\\nama_medical_key',
  '-o', 'BatchMode=yes',
  '-o', 'StrictHostKeyChecking=no',
  '-o', 'ConnectTimeout=15',
  'db_postgres.js',
  'root@204.168.144.74:/var/www/namaweb/db_postgres.js'
]);
console.log('scp stdout:', (r.stdout || '').toString());
console.log('scp stderr:', (r.stderr || '').toString());
console.log('scp status:', r.status);

const r2 = spawnSync('ssh', [
  '-i', 'C:\\Users\\ice\\.ssh\\nama_medical_key',
  '-o', 'BatchMode=yes',
  '-o', 'StrictHostKeyChecking=no',
  '-o', 'ConnectTimeout=15',
  'root@204.168.144.74',
  "md5sum /var/www/namaweb/db_postgres.js && sed -n '1980,1985p' /var/www/namaweb/db_postgres.js"
]);
console.log('ssh:', (r2.stdout || r2.stderr || '').toString());