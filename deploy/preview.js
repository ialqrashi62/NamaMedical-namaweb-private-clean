const path = require('path');
const A = require('./autowire');
const preview = A.mount({
  serverPath: path.resolve(__dirname, '../server.js'),
  routes: A.ALL_ROUTES,
  anchor: "app.use('/api/v4/dept'",
  label: 'autowire_all_v23',
  dryRun: true,
});
console.log('mounted:', preview.mounted);
console.log('errors:', preview.errors);
console.log('--- first 800 chars of mount block ---');
console.log(preview.preview ? preview.preview.slice(0, 800) : '(empty)');