const http = require('http');
const express = require('express');

// Setup mini-server
const app = express();
const r = require('../routes/pgx');
const inst = r.newPgxRouter();

console.log('typeof inst:', typeof inst);
console.log('inst.stack length:', inst.stack?.length);

// Try mount WITHOUT middleware
app.use('/api/v4/pgx', inst);

// Try mount WITH middleware
function dev(req, _res, next) { req.tenantId='tnt-demo'; next(); }
const app2 = express();
app2.use('/api/v4/pgx', dev, inst);

// Test both
const srv1 = app.listen(3210, () => {
  http.get('http://127.0.0.1:3210/api/v4/pgx/pairs', (res) => {
    let d=''; res.on('data',c=>d+=c); res.on('end',()=>{
      console.log('NO MW:', res.statusCode, d.slice(0, 200));
      srv1.close();
      const srv2 = app2.listen(3211, () => {
        http.get('http://127.0.0.1:3211/api/v4/pgx/pairs', (res) => {
          let d=''; res.on('data',c=>d+=c); res.on('end',()=>{
            console.log('WITH MW:', res.statusCode, d.slice(0, 200));
            srv2.close();
          });
        });
      });
    });
  });
});