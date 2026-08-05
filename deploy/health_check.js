const H = require('./hetzner');
const r = H.deploy({
  host: '204.168.144.74',
  user: 'root',
  keyPath: 'C:\\Users\\ice\\.ssh\\nama_medical_key',
  remoteDir: '/var/www/namaweb',
  files: [],
  run: [
    "sleep 3",
    "curl -s -o /dev/null -w 'health: %{http_code}' http://127.0.0.1:3000/health",
    "curl -s -o /dev/null -w 'station: %{http_code}' http://127.0.0.1:3000/station-index.html",
  ],
});
r.commands.forEach(c => console.log((c.out || '').trim()));