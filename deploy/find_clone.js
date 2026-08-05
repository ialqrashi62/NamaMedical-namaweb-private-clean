const fs = require('fs');
const s = fs.readFileSync('/var/www/namaweb/server.js', 'utf8');
const lines = s.split('\n');
// show pgx block (lines 22720-22745)
for (let i = 22718; i < 22760; i++) {
  if (lines[i]) console.log((i + 1) + ': ' + lines[i].slice(0, 200));
}