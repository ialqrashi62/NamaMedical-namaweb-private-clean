const fs = require('fs');
const path = require('path');
const A = require('./autowire');

const sp = path.resolve(__dirname, '../server.js');
let s = fs.readFileSync(sp, 'utf8');

// Remove existing autowire block
const startIdx = s.indexOf('// ===== autowire_all_v23');
if (startIdx === -1) {
  console.log('no existing block');
  process.exit(0);
}
let endIdx = s.indexOf('[autowire] /api/v4/integrations/sf skipped:', startIdx);
if (endIdx === -1) {
  console.log('end not found');
  process.exit(1);
}
endIdx = s.indexOf('\n', endIdx) + 1;
const removed = s.slice(startIdx, endIdx);
console.log('removing lines:', removed.split('\n').length);
s = s.slice(0, startIdx) + s.slice(endIdx);
fs.writeFileSync(sp, s);
console.log('wrote clean');

// Re-mount with new factory-aware genMount
const result = A.mount({
  serverPath: sp,
  routes: A.ALL_ROUTES,
  anchor: "app.use('/api/v4/dept'",
  label: 'autowire_all_v23',
  dryRun: false,
});
console.log('mount result:', JSON.stringify({ mounted: result.mounted, skipped: result.skipped, errors: result.errors, backup: result.backup }));
console.log('first 800:', result.preview ? result.preview.slice(0, 800) : '');