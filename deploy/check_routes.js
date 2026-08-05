const H = require('./hetzner');
const r = H.deploy({
  host: '204.168.144.74',
  user: 'root',
  keyPath: 'C:\\Users\\ice\\.ssh\\nama_medical_key',
  remoteDir: '/var/www/namaweb',
  files: [],
  run: [
    "ls /var/www/namaweb/routes/ 2>&1 | head -100",
    "echo ===WARN===",
    "pm2 logs nama-medical-erp --lines 80 --nostream --raw | grep -i 'autowire' | head -40",
  ],
});
r.commands.forEach(c => console.log('CMD:', c.cmd.slice(0, 120), '\n', (c.out || '').slice(0, 4000)));