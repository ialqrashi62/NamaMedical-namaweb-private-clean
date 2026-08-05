const { spawnSync } = require('child_process');
const KEY = 'C:\\Users\\ice\\.ssh\\nama_medical_key';
const TARGET = 'root@204.168.144.74';
function ssh(cmd) {
  const r = spawnSync('ssh', ['-i', KEY, '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=no', '-o', 'ConnectTimeout=15', TARGET, cmd], { encoding: 'utf8' });
  return (r.stdout || r.stderr || '').trim();
}

const tests = [
  // 28 routes — check that each responds with 2xx, 4xx, or 5xx (NOT 000 = unbooted, NOT 404 from SPA catch-all)
  { name: 'health', url: 'http://127.0.0.1:3000/health' },
  { name: 'fhir', url: 'http://127.0.0.1:3000/fhir/metadata' },
  { name: 'careplans', url: 'http://127.0.0.1:3000/api/v4/careplans/list', method: 'POST', data: '{"tenantId":"demo","patientId":"p1","setId":"stroke_alert","actorId":"dr-x","actorRoles":["doctor"]}' },
  { name: 'discharge', url: 'http://127.0.0.1:3000/api/v4/discharge/patients/p1/summary', query: '?tenantId=demo' },
  { name: 'billing_v2', url: 'http://127.0.0.1:3000/api/v4/billing_v2/invoices' },
  { name: 'dicom', url: 'http://127.0.0.1:3000/api/dicom/qido/studies', query: '?PatientID=P-001' },
  { name: 'hl7', url: 'http://127.0.0.1:3000/api/v4/hl7/inbox' },
  { name: 'portal', url: 'http://127.0.0.1:3000/api/v4/portal/me' },
  { name: 'olap', url: 'http://127.0.0.1:3000/api/v4/olap/views' },
  { name: 'mobile', url: 'http://127.0.0.1:3000/api/mobile/login', method: 'POST', data: '{"tenantId":"demo","username":"u1","password":"x","deviceToken":"dt-1","platform":"ios"}' },
  { name: 'telehealth', url: 'http://127.0.0.1:3000/api/v4/telehealth/rooms' },
  { name: 'genomic', url: 'http://127.0.0.1:3000/api/v4/genomic/genes' },
  { name: 'compounding', url: 'http://127.0.0.1:3000/api/v4/compounding/formulas' },
  { name: 'cqm', url: 'http://127.0.0.1:3000/api/v4/cqm/measures' },
  { name: 'anesthesia', url: 'http://127.0.0.1:3000/api/v4/anesthesia/cases' },
  { name: 'cardiology', url: 'http://127.0.0.1:3000/api/v4/cardiology/studies' },
  { name: 'tumorBoard', url: 'http://127.0.0.1:3000/api/v4/mdt/schedule' },
  { name: 'denial', url: 'http://127.0.0.1:3000/api/v4/denial/worklist' },
  { name: 'homeHealth', url: 'http://127.0.0.1:3000/api/v4/home-health/visits' },
  { name: 'trials', url: 'http://127.0.0.1:3000/api/v4/trials' },
  { name: 'population', url: 'http://127.0.0.1:3000/api/v4/population/cohorts' },
  { name: 'pgx', url: 'http://127.0.0.1:3000/api/v4/pgx/pairs' },
  { name: 'voice', url: 'http://127.0.0.1:3000/api/v4/voice/sessions' },
  { name: 'ai', url: 'http://127.0.0.1:3000/api/v4/ai/sessions' },
  { name: 'interop', url: 'http://127.0.0.1:3000/api/v4/interop/xca/request' },
  { name: 'dr', url: 'http://127.0.0.1:3000/api/v4/dr/sites' },
  { name: 'bi', url: 'http://127.0.0.1:3000/api/v4/bi/dashboards' },
  { name: 'compliance', url: 'http://127.0.0.1:3000/api/v4/compliance/iso27001/controls' },
  { name: 'salesforce', url: 'http://127.0.0.1:3000/api/v4/integrations/sf/health' },
];

for (const t of tests) {
  const m = t.method || 'GET';
  let cmd = `curl -s -o /dev/null -w '${t.name}=%{http_code}' -X ${m}`;
  if (t.data) cmd += ` -H 'Content-Type: application/json' -d '${t.data}'`;
  cmd += ` '${t.url}${t.query||''}'`;
  console.log(ssh(cmd));
}