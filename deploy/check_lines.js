const fs = require('fs');
const s = fs.readFileSync('/var/www/namaweb/server.js', 'utf8');
const lines = s.split('\n');
console.log('total lines:', lines.length);
// find "app.get('*'" line
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes("app.get('*'") || lines[i].includes('app.get("*')) {
    console.log('catch-all at:', i + 1, lines[i].slice(0, 200));
  }
}
// find autowire block start
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('autowire_all_v23')) {
    console.log('autowire at:', i + 1, lines[i].slice(0, 200));
  }
}