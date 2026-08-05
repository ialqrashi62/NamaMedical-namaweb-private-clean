const http = require('http');
const options = {
  hostname: '127.0.0.1',
  port: 3000,
  path: '/api/v4/pgx/pairs',
  method: 'GET',
  headers: {
    'x-tenant-id': 'tnt-demo',
    'x-user-id': 'dr-test',
    'x-user-role': 'doctor',
  },
};
const req = http.request(options, (res) => {
  let d = '';
  res.on('data', (c) => d += c);
  res.on('end', () => console.log(res.statusCode, d.slice(0, 500)));
});
req.on('error', console.error);
req.end();