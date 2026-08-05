const H = require('./hetzner');
const r = H.deploy({
  host: '204.168.144.74',
  user: 'root',
  keyPath: 'C:\\Users\\ice\\.ssh\\nama_medical_key',
  remoteDir: '/var/www/namaweb',
  files: ['server.js'],
  run: [
    "cd /var/www/namaweb && pm2 reload nama-medical-erp --wait-ready 2>&1",
    "sleep 5",
    "curl -s -o /dev/null -w 'health: %{http_code}\\n' http://127.0.0.1:3000/health",
  ],
});
const okFiles = r.files.filter(x => x.ok).length;
console.log('files ok:', okFiles + '/' + r.files.length);
r.commands.forEach(c => console.log((c.out || '').trim()));