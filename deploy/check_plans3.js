const { spawnSync } = require('child_process');
const args = [
  '-i', 'C:\\Users\\ice\\.ssh\\nama_medical_key',
  '-o', 'BatchMode=yes',
  '-o', 'StrictHostKeyChecking=no',
  '-o', 'ConnectTimeout=15',
  'root@204.168.144.74',
  "PGPASSWORD='NamaMedicalApp@2026!' psql -U nama_medical_app -h localhost -d nama_medical_web -c 'SELECT plan_key, name_en FROM plans;' 2>&1 | head -30"
];
const r = spawnSync('ssh', args);
console.log((r.stdout || r.stderr || '').toString().slice(0, 4000));