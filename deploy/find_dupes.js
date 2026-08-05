const fs = require('fs');
const path = require('path');
const s = fs.readFileSync(path.resolve(__dirname, '../server.js'), 'utf8');
const lines = s.split('\n');
lines.forEach((l, i) => {
  if (l.includes('dept_router')) {
    console.log((i + 1) + ': ' + l.slice(0, 200));
  }
});