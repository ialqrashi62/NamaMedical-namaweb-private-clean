const fs = require('fs');
const Autowire = require('./autowire');

const serverPath = require('path').resolve(__dirname, '..', 'server.js');
let src = fs.readFileSync(serverPath, 'utf8');

const marker = '// ===== autowire_all_v23';
const idx = src.indexOf(marker);
console.log('v23 marker:', idx);

const ROUTES = [
  { module: './routes/bi', base: '/api/v4/bi', role: 'doctor' },
  { module: './routes/pgx', base: '/api/v4/pgx', role: 'doctor' },
  { module: './routes/voice', base: '/api/v4/voice', role: 'doctor' },
];

const res = Autowire.mount({
  serverPath,
  routes: ROUTES,
  anchor: "app.use('/api/v4/dept', require('./routes/dept_router'));\n} catch (e) { console.warn('[mount] /api/v4/dept not mounted:', e.message); }",
  label: 'autowire_test',
});

console.log('mount result:', JSON.stringify(res, null, 2).slice(0, 2000));