const fs = require('fs');
const s = fs.readFileSync('/var/www/namaweb/server.js', 'utf8');
// find pgx block
const idx = s.indexOf('// ===== autowire_all_v23');
const before = s.slice(idx, idx + 3000);
// extract app.use lines
const uses = before.split('\n').filter(l => l.includes('app.use'));
uses.slice(0, 8).forEach((l, i) => console.log(i + ': ' + l.slice(0, 200)));