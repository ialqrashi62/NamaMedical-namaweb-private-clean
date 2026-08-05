const H = require('./hetzner');
const r = H.deploy({
  host: '204.168.144.74',
  user: 'root',
  keyPath: 'C:\\Users\\ice\\.ssh\\nama_medical_key',
  remoteDir: '/var/www/namaweb',
  files: [],
  run: [
    "pm2 list",
    "pm2 logs nama-medical-erp --lines 30 --nostream --err",
    "tail -n 20 /var/log/nginx/error.log 2>/dev/null || echo 'no nginx log'",
    "curl -v http://127.0.0.1:3000/health 2>&1 | head -20",
  ],
});
r.commands.forEach(c => console.log('===', c.cmd.slice(0, 50), '===\n', (c.out || c.err || '').trim()));