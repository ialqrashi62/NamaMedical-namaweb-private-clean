const { spawnSync } = require('child_process');
const r = spawnSync('ssh', [
  '-i', 'C:\\Users\\ice\\.ssh\\nama_medical_key',
  '-o', 'BatchMode=yes',
  '-o', 'StrictHostKeyChecking=no',
  '-o', 'ConnectTimeout=15',
  'root@204.168.144.74',
  "for p in 'home-health/slot' 'home-health/visit' 'home-health/visits' 'home-health/slots' 'home-health/nurse-route/test/2026-08-03' 'home-health/offline-sync' 'mobile/refresh' 'mobile/login' 'integrations/sf/connect' 'integrations/sf/sync' 'integrations/sf/patient360/123' 'pathways/abc/run'; do code=$(curl -s -o /tmp/r.txt -w '%{http_code}' -X GET http://127.0.0.1:3000/api/v4/$p -H 'x-tenant-id: 1' -H 'x-user-id: dev' -H 'x-user-role: nurse'); body=$(head -c 80 /tmp/r.txt | tr '\\n' ' '); echo \"/api/v4/$p => $code | $body\"; done"
]);
console.log((r.stdout || r.stderr || '').toString().slice(0, 5000));