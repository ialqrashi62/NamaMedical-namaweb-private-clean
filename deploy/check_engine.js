const path = require('path');
try {
  const r = require('./routes/dept_registry');
  console.log('loaded');
} catch (e) {
  console.log('ERR:', e.message);
  console.log('stack:', e.stack.split('\n').slice(0, 5).join('\n'));
}