const { spawnSync } = require('child_process');
const r = spawnSync('ssh', [
  '-i', 'C:\\Users\\ice\\.ssh\\nama_medical_key',
  '-o', 'BatchMode=yes',
  '-o', 'StrictHostKeyChecking=no',
  '-o', 'ConnectTimeout=15',
  'root@204.168.144.74',
  "cd /var/www/namaweb && node -e \"\nconst fs = require('fs');\nconst path = require('path');\nconst files = fs.readdirSync('./routes').filter(f => f.endsWith('.js'));\nfiles.forEach(f => {\n  const src = fs.readFileSync('./routes/'+f, 'utf8');\n  const m = src.match(/app\\.(get|post|put|delete|patch)\\(['\\\"]([^'\\\"]+)['\\\"]/g) || [];\n  if (!m.length) return;\n  const paths = m.map(s => s.match(/['\\\"]([^'\\\"]+)['\\\"]/)[1]).filter(p => p.startsWith('/api/'));\n  if (!paths.length) return;\n  // Find common base prefix\n  const baseCounts = {};\n  paths.forEach(p => {\n    const parts = p.split('/').slice(0, 4);\n    const base = parts.join('/');\n    baseCounts[base] = (baseCounts[base] || 0) + 1;\n  });\n  const top = Object.entries(baseCounts).sort((a,b)=>b[1]-a[1])[0];\n  if (top) console.log(f, '=>', top[0], '(' + top[1] + ' paths, total ' + paths.length + ')');\n});\n\" 2>&1"
]);
console.log((r.stdout || r.stderr || '').toString().slice(0, 8000));