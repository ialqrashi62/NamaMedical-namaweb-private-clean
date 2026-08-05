const H = require('./hetzner');
const r = H.deploy({
  host: '204.168.144.74',
  user: 'root',
  keyPath: 'C:\\Users\\ice\\.ssh\\nama_medical_key',
  remoteDir: '/var/www/namaweb',
  files: [],
  run: [
    "node -c /var/www/namaweb/server.js && echo SYNTAX-OK || echo SYNTAX-FAIL",
    "cd /var/www/namaweb && timeout 25 node server.js > /tmp/srv.out 2> /tmp/srv.err &",
    "sleep 20",
    "ss -lntp | grep -E '3000|node' | head -10",
    "echo ===STDOUT===",
    "tail -n 60 /tmp/srv.out",
    "echo ===STDERR===",
    "tail -n 60 /tmp/srv.err",
    "echo ===HEALTH===",
    "curl -s -o /dev/null -w 'health=%{http_code}\\n' http://127.0.0.1:3000/health",
  ],
});
r.commands.forEach(c => console.log('CMD:', c.cmd.slice(0, 120), '\n', (c.out || '').slice(0, 3000)));