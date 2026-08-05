const H = require('./hetzner');
const r = H.deploy({
  host: '204.168.144.74',
  user: 'root',
  keyPath: 'C:\\Users\\ice\\.ssh\\nama_medical_key',
  remoteDir: '/var/www/namaweb',
  files: [],
  run: [
    "pm2 logs nama-medical-erp --lines 100 --nostream --raw 2>&1 | tail -40",
    "pm2 describe nama-medical-erp 2>&1 | head -25",
  ],
});
r.commands.forEach(c => console.log('===', c.cmd.slice(0, 50), '===\n', (c.out || c.err || '').trim()));