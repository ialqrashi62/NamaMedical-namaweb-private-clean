// Mini test that matches production setup
const express = require('express');
const path = require('path');
const app = express();

// Order: app.use first, app.get('*') last (like production)
const _cloned = express.Router();
_cloned.get('/pairs', (req, res) => res.json({ ok: true, msg: 'matched' }));
app.use('/api/v4/pgx', _cloned);

app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const srv = app.listen(3940, () => {
  const http = require('http');
  http.get('http://127.0.0.1:3940/api/v4/pgx/pairs', (r) => {
    let d = '';
    r.on('data', c => d += c);
    r.on('end', () => {
      console.log('status:', r.statusCode, 'body:', d);
      srv.close();
    });
  });
});