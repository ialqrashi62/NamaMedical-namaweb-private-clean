const H = require('./hetzner');
const r = H.deploy({
  host: '204.168.144.74',
  user: 'root',
  keyPath: 'C:\\Users\\ice\\.ssh\\nama_medical_key',
  remoteDir: '/var/www/namaweb',
  files: [],
  run: [
    "ls -la /var/www/namaweb/plans_public_alias.js",
    "node -e \"require('/var/www/namaweb/plans_public_alias')\" 2>&1 | head -5",
  ],
});
r.commands.forEach(c => console.log((c.out || c.err || '').trim()));