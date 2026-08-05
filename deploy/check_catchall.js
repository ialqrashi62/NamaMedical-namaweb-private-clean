const fs = require('fs');
const s = fs.readFileSync('/var/www/namaweb/server.js', 'utf8');
const lines = s.split('\n');
// Find all catch-all patterns near the end
for (let i = 23440; i < lines.length; i++) {
  if (lines[i]) console.log((i + 1) + ': ' + lines[i].slice(0, 200));
}