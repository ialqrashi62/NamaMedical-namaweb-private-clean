const { spawnSync } = require('child_process');
const args = [
  '-i', 'C:\\Users\\ice\\.ssh\\nama_medical_key',
  '-o', 'BatchMode=yes',
  '-o', 'StrictHostKeyChecking=no',
  '-o', 'ConnectTimeout=15',
  'root@204.168.144.74',
  "PGPASSWORD=$(cat /var/www/namaweb/.env | grep DB_PASS | cut -d= -f2) psql -U $(cat /var/www/namaweb/.env | grep DB_USER | cut -d= -f2) -h $(cat /var/www/namaweb/.env | grep DB_HOST | cut -d= -f2) -d $(cat /var/www/namaweb/.env | grep DB_NAME | cut -d= -f2) -c 'SELECT plan_key, name_en FROM plans;' 2>&1 | head -30"
];
const r = spawnSync('ssh', args);
console.log((r.stdout || r.stderr || '').toString().slice(0, 4000));