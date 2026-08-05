const fs = require('fs');
const s = fs.readFileSync('/var/www/namaweb/server.js', 'utf8');
const lines = s.split('\n');
// show pgx block end
for (let i = 22750; i < 22785; i++) {
  if (lines[i]) console.log((i + 1) + ': ' + lines[i].slice(0, 200));
}