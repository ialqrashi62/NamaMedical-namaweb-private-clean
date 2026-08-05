const H = require('./hetzner');
const r = H.deploy({
  host: '204.168.144.74',
  user: 'root',
  keyPath: 'C:\\Users\\ice\\.ssh\\nama_medical_key',
  remoteDir: '/var/www/namaweb',
  files: [],
  run: [
    "cat /var/www/namaweb/package.json | grep -A5 scripts | head -15",
    "pm2 describe nama-medical-erp | grep -E 'script|status|pid|exec_mode|errored' | head -20",
    "ss -lntp 2>&1 | grep -E '3000|node' | head -10",
  ],
});
r.commands.forEach(c => console.log('CMD:', c.cmd.slice(0, 120), '\n', (c.out || '').slice(0, 2000)));