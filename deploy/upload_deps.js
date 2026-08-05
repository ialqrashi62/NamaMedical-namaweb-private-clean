const H = require('./hetzner');
const fs = require('fs');
const path = require('path');
const list = fs.readFileSync(path.join(__dirname, 'deps_to_upload.txt'), 'utf8').trim().split('\n');
const files = list.map(n => n.trim() + '.js').filter(f => fs.existsSync(path.join(__dirname, '..', f)));
console.log('uploading', files.length, 'deps');
const r = H.deploy({
  host: '204.168.144.74',
  user: 'root',
  keyPath: 'C:\\Users\\ice\\.ssh\\nama_medical_key',
  remoteDir: '/var/www/namaweb',
  files,
  run: [
    "cd /var/www/namaweb && pm2 reload nama-medical-erp --wait-ready 2>&1",
    "sleep 4",
    "curl -s -o /dev/null -w 'health: %{http_code}\\n' http://127.0.0.1:3000/health",
  ],
});
const okFiles = r.files.filter(x => x.ok).length;
console.log('files ok:', okFiles + '/' + r.files.length);
r.commands.forEach(c => console.log((c.out || '').trim()));