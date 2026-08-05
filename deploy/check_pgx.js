try {
  const r = require('../routes/pgx');
  const i = r.newPgxRouter();
  i.stack.forEach(l => {
    if (l.route) {
      console.log(Object.keys(l.route.methods), l.route.path);
    }
  });
  // Simulate call
  console.log('---routes OK');
} catch (e) {
  console.log('ERR:', e.message);
  console.log(e.stack.split('\n').slice(0, 3).join('\n'));
}