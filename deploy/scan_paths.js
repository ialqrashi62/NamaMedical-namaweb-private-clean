const { spawnSync } = require('child_process');
const r = spawnSync('ssh', [
  '-i', 'C:\\Users\\ice\\.ssh\\nama_medical_key',
  '-o', 'BatchMode=yes',
  '-o', 'StrictHostKeyChecking=no',
  '-o', 'ConnectTimeout=15',
  'root@204.168.144.74',
  "cd /var/www/namaweb && node -e \"\nconst express = require('express');\nconst fs = require('fs');\nconst paths = ['./routes/voice','./routes/salesforce','./routes/trials','./routes/mobile','./routes/dr','./routes/populationHealth','./routes/telehealth','./routes/genomic','./routes/compounding','./routes/homeHealth','./routes/careplans','./routes/fhir_server','./routes/audit_chain_search','./routes/tenant_admin','./routes/analytics_export','./routes/analytics_kpi','./routes/metrics','./routes/pathways'];\npaths.forEach(p => {\n  try {\n    const m = require(p);\n    let fn = null;\n    for (const k of Object.keys(m)) {\n      if (typeof m[k] === 'function') { fn = m[k]; break; }\n    }\n    if (!fn) { console.log(p, ': no factory'); return; }\n    const r = fn();\n    const stack = r.stack || [];\n    console.log(p, ':', stack.length, 'routes');\n    stack.forEach(l => {\n      if (l.route) {\n        const methods = Object.keys(l.route.methods).join(',').toUpperCase();\n        console.log('  ', methods, l.route.path);\n      }\n    });\n  } catch (e) {\n    console.log(p, ':', 'ERR', e.message.slice(0,60));\n  }\n});\n\" 2>&1 | head -80"
]);
console.log((r.stdout || r.stderr || '').toString().slice(0, 8000));