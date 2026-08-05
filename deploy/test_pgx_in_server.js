// Inject a probe into the running server's routes
const http = require('http');
const opt = { hostname: '127.0.0.1', port: 3000, path: '/api/v4/pgx/pairs', method: 'GET' };
const req = http.request(opt, (res) => {
  let d = '';
  res.on('data', c => d += c);
  res.on('end', () => {
    console.log('status:', res.statusCode);
    console.log('body:', d.slice(0, 500));
  });
});
req.end();