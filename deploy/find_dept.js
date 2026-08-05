const fs = require('fs');
const s = fs.readFileSync('server.js', 'utf8');
const idx = s.indexOf("require('./routes/dept_router')");
console.log('dept_router at:', idx);
if (idx > 0) {
  console.log(JSON.stringify(s.slice(idx - 30, idx + 250)));
}