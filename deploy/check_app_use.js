// Inspect: how many app.use() calls are in server.js near pgx?
const fs = require('fs');
const s = fs.readFileSync('/var/www/namaweb/server.js', 'utf8');
const lines = s.split('\n');
// Find "pgx" mentions and show 5 lines around
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('pgx') && lines[i].includes('var _base=')) {
    console.log((i + 1) + ': ' + lines[i].slice(0, 200));
    for (let j = 1; j < 5; j++) {
      if (lines[i + j]) console.log((i + j + 1) + ': ' + lines[i + j].slice(0, 200));
    }
    console.log('---');
  }
}