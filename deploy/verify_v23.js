const H = require('./hetzner');
const r = H.deploy({
  host: '204.168.144.74',
  user: 'root',
  keyPath: 'C:\\Users\\ice\\.ssh\\nama_medical_key',
  remoteDir: '/var/www/namaweb',
  files: [],
  run: [
    "sleep 5",
    "curl -s -o /dev/null -w 'health: %{http_code}\\n' http://127.0.0.1:3000/health",
    "curl -s -o /dev/null -w 'fhir: %{http_code}\\n' http://127.0.0.1:3000/fhir/metadata",
    "curl -s -X POST -H 'Content-Type: application/json' -d '{\"tenantId\":\"demo\",\"patientId\":\"p1\",\"setId\":\"stroke_alert\",\"actorId\":\"dr-x\",\"actorRoles\":[\"doctor\"]}' -o /dev/null -w 'careplans: %{http_code}\\n' http://127.0.0.1:3000/api/v4/careplans/apply",
    "curl -s -o /dev/null -w 'dicom: %{http_code}\\n' http://127.0.0.1:3000/api/dicom/qido/studies?PatientID=P-001",
    "curl -s -o /dev/null -w 'hl7: %{http_code}\\n' http://127.0.0.1:3000/api/v4/hl7/inbox",
    "curl -s -o /dev/null -w 'mobile: %{http_code}\\n' -X POST -H 'Content-Type: application/json' -d '{\"tenantId\":\"demo\",\"username\":\"u1\",\"password\":\"x\",\"deviceToken\":\"dt-1\",\"platform\":\"ios\"}' http://127.0.0.1:3000/api/mobile/login",
    "curl -s -o /dev/null -w 'telehealth: %{http_code}\\n' -X POST -H 'Content-Type: application/json' -d '{\"tenantId\":\"demo\",\"encounterId\":\"e1\",\"hostId\":\"dr-x\",\"lang\":\"ar-SA\"}' http://127.0.0.1:3000/api/v4/telehealth/room",
    "curl -s -o /dev/null -w 'genomic: %{http_code}\\n' http://127.0.0.1:3000/api/v4/genomic/genes",
    "curl -s -o /dev/null -w 'bi: %{http_code}\\n' http://127.0.0.1:3000/api/v4/bi/dashboards",
    "curl -s -o /dev/null -w 'compliance: %{http_code}\\n' http://127.0.0.1:3000/api/v4/compliance/iso27001/controls",
    "curl -s -o /dev/null -w 'pgx: %{http_code}\\n' http://127.0.0.1:3000/api/v4/pgx/pairs",
  ],
});
r.commands.forEach(c => console.log((c.out || '').trim()));