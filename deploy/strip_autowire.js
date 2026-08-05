const fs = require('fs');
const path = require('path');
const sp = path.resolve('../server.js');
let s = fs.readFileSync(sp, 'utf8');
// Find the start "// ===== autowire_all_v23" and end at the last try { ... } catch (e) line
const startIdx = s.indexOf('// ===== autowire_all_v23');
if (startIdx === -1) {
  console.log('not found');
  process.exit(0);
}
// Find the block end — after the last "try { app.use(...)" line that ends with "}); }"
let endIdx = s.indexOf('[autowire] /api/v4/integrations/sf skipped:', startIdx);
if (endIdx !== -1) {
  // Move to end of that line
  endIdx = s.indexOf('\n', endIdx) + 1;
}
if (endIdx === -1 || endIdx <= startIdx) {
  console.log('end not found');
  process.exit(1);
}
// Also remove the trailing "try { app.use('/api/v4/dept', require('./routes/dept_router')); }" added separately
// Look for the dept_router line right after endIdx
const after = s.slice(endIdx, endIdx + 200);
console.log('after preview:', after.split('\n').slice(0, 3).join(' | ').slice(0, 200));
// Remove only up to endIdx
const removed = s.slice(startIdx, endIdx);
const newS = s.slice(0, startIdx) + '\n' + s.slice(endIdx);
fs.writeFileSync(sp, newS);
console.log('removed lines:', removed.split('\n').length);
console.log('done');