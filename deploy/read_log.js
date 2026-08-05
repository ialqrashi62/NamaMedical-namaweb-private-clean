const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const KEY = 'C:\\Users\\ice\\.ssh\\nama_medical_key';
const TARGET = 'root@204.168.144.74';
const r = spawnSync('ssh', ['-i', KEY, '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=no', '-o', 'ConnectTimeout=15', TARGET, "pm2 logs nama-medical-erp --lines 300 --nostream --raw 2>&1 | grep -E 'autowire|skipped' | head -40"], { encoding: 'utf8' });
fs.writeFileSync(path.resolve(__dirname, 'log_dump.txt'), (r.stdout || r.stderr || '').slice(0, 20000));
console.log('wrote log_dump.txt', (r.stdout || '').length, 'bytes');