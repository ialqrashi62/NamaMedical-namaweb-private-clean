const H = require('./hetzner');
const r = H.deploy({
  host: '204.168.144.74',
  user: 'root',
  keyPath: 'C:\\Users\\ice\\.ssh\\nama_medical_key',
  remoteDir: '/var/www/namaweb',
  files: [],
  run: [
    "cd /var/www/namaweb && for f in nphies_v1_stub plans_public_alias plans; do [ -f \"$f.js\" ] && echo OK $f.js || echo MISSING $f.js; done",
  ],
});
r.commands.forEach(c => console.log((c.out || '').trim()));