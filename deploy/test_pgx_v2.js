// Use express directly to test
const express = require('express');
const app = express();

const _cloned = express.Router();
_cloned.get('/pairs', (req, res) => res.json({ ok: true }));

app.use('/api/v4/pgx', _cloned);
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  res.send('SPA');
});

const srv = app.listen(3939, () => {
  const http = require('http');
  http.get('http://127.0.0.1:3939/api/v4/pgx/pairs', (r) => {
    let d = '';
    r.on('data', c => d += c);
    r.on('end', () => {
      console.log('status:', r.statusCode, 'body:', d);
      srv.close();
    });
  });
});