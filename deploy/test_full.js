const { spawnSync } = require('child_process');
const r = spawnSync('ssh', [
  '-i', 'C:\\Users\\ice\\.ssh\\nama_medical_key',
  '-o', 'BatchMode=yes',
  '-o', 'StrictHostKeyChecking=no',
  '-o', 'ConnectTimeout=15',
  'root@204.168.144.74',
  "for p in 'pgx/pairs' 'pgx/recommend' 'voice/sessions' 'telehealth/visits' 'genomic/variants' 'compounding/orders' 'salesforce/accounts' 'trials/list' 'mobile/devices' 'dr/list' 'population/cohort' 'homeHealth/visits' 'bi/workspaces' 'bi/dashboards' 'careplans/list' 'compliance/iso27001' 'compliance/hipaa' 'fhir/Patient/123' 'audit/chains' 'tenant/list' 'analytics/dashboard' 'kpi/snapshot' 'metrics/health' 'pathways/list' 'department/list'; do code=$(curl -s -o /tmp/r.txt -w '%{http_code}' -H 'x-tenant-id: 1' -H 'x-user-id: dev' -H 'x-user-role: doctor' http://127.0.0.1:3000/api/v4/$p); body=$(head -c 80 /tmp/r.txt | tr '\\n' ' '); echo \"$p => $code | $body\"; done"
]);
console.log((r.stdout || r.stderr || '').toString().slice(0, 10000));