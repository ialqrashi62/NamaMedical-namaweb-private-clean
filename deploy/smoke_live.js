const { spawnSync } = require('child_process');
// Real smoke — test all autowired routes on server
const r = spawnSync('ssh', [
  '-i', 'C:\\Users\\ice\\.ssh\\nama_medical_key',
  '-o', 'BatchMode=yes',
  '-o', 'StrictHostKeyChecking=no',
  '-o', 'ConnectTimeout=15',
  'root@204.168.144.74',
  "cd /var/www/namaweb && node -e \"\nconst http = require('http');\nconst TESTS = [\n  ['/api/health', ''],\n  ['/api/v4/pgx/pairs', 'doctor'],\n  ['/api/v4/bi/workspaces', 'doctor'],\n  ['/api/v4/voice/models', 'doctor'],\n  ['/api/v4/dr/regions', 'admin'],\n  ['/api/v4/trials/protocols', 'researcher'],\n  ['/api/v4/population/registries', 'doctor'],\n  ['/api/v4/genomic/genes', 'doctor'],\n  ['/api/v4/integrations/sf/patient360/123', 'admin'],\n  ['/api/v4/careplans/active', 'doctor'],\n  ['/api/v4/careplans/bundles', 'doctor'],\n  ['/api/v4/analytics/export.csv', 'admin'],\n  ['/api/v4/analytics/kpi', 'admin'],\n  ['/api/v4/voice/session/abc', 'doctor'],\n  ['/api/v4/dr/replication/status/us-east', 'admin'],\n  ['/api/v4/home-health/nurse-route/n1/2026-08-03', 'nurse'],\n  ['/api/v4/tenant_admin/list', 'admin'],\n  ['/api/v4/pathways', 'doctor'],\n];\nlet ok = 0, fail = 0;\nconst done = () => {};\nfunction go(i) {\n  if (i >= TESTS.length) {\n    console.log('TOTAL:', ok, 'ok /', fail, 'fail');\n    process.exit(0);\n  }\n  const [p, role] = TESTS[i];\n  http.get({hostname:'127.0.0.1',port:3000,path:p,headers:{'x-tenant-id':'1','x-user-id':'dev','x-user-role':role||'doctor'}}, res => {\n    let d=''; res.on('data',c=>d+=c); res.on('end',()=>{\n      const c = res.statusCode;\n      if (c === 404) { fail++; console.log(p, '=>', c, '(NOT MOUNTED)'); }\n      else { ok++; console.log(p, '=>', c, d.slice(0,40)); }\n      go(i+1);\n    });\n  });\n}\ngo(0);\n\" 2>&1"
], { timeout: 30000 });
console.log((r.stdout || r.stderr || '').toString().slice(0, 8000));