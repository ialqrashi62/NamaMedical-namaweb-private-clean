try {
  const m = require('./routes/pgx');
  const i = m.newPgxRouter();
  console.log('stack:', i.stack.length);
  i.stack.forEach(l => {
    if (l.route) console.log(' ', Object.keys(l.route.methods), l.route.path);
  });
} catch (e) {
  console.log('ERR:', e.message);
}