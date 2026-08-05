const { spawnSync } = require('child_process');
const r = spawnSync('ssh', [
  '-i', 'C:\\Users\\ice\\.ssh\\nama_medical_key',
  '-o', 'BatchMode=yes',
  '-o', 'StrictHostKeyChecking=no',
  '-o', 'ConnectTimeout=15',
  'root@204.168.144.74',
  "for p in 'careplans/active' 'careplans/bundles' 'careplans/abc123/progress' 'careplans/abc123/adherence' 'home-health/slots' 'home-health/visits' 'integrations/sf/query' 'fhir/metadata' 'audit/chain/search'; do code=$(curl -s -o /tmp/r.txt -w '%{http_code}' -H 'x-tenant-id: 1' -H 'x-user-id: dev' -H 'x-user-role: doctor' http://127.0.0.1:3000/api/v4/$p); body=$(head -c 100 /tmp/r.txt | tr '\\n' ' '); echo \"/api/v4/$p => $code | $body\"; done"
]);
console.log((r.stdout || r.stderr || '').toString().slice(0, 5000));