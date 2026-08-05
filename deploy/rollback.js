// Rollback server.js to pre-v21
const fs = require('fs');
const path = require('path');
const serverPath = path.join(__dirname, '..', 'server.js');
const backupPath = serverPath + '.pre_v21.bak';

if (!fs.existsSync(backupPath)) {
  console.log('no backup found');
  process.exit(1);
}
fs.copyFileSync(backupPath, serverPath);
console.log('rolled back to', backupPath);