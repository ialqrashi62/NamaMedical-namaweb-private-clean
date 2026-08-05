const H = require('./hetzner');
const r = H.deploy({
  host: '204.168.144.74',
  user: 'root',
  keyPath: 'C:\\Users\\ice\\.ssh\\nama_medical_key',
  remoteDir: '/var/www/namaweb',
  files: [],
  run: [
    "node -c /var/www/namaweb/server.js 2>&1 | head -20",
    "wc -l /var/www/namaweb/server.js",
    "tail -n 5 /var/www/namaweb/server.js",
  ],
});
r.commands.forEach(c => console.log('CMD:', c.cmd.slice(0, 120), '\n', (c.out || '').slice(0, 5000)));