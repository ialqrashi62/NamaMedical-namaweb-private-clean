const H = require('./hetzner');
const r = H.deploy({
  host: '204.168.144.74',
  user: 'root',
  keyPath: 'C:\\Users\\ice\\.ssh\\nama_medical_key',
  remoteDir: '/var/www/namaweb',
  files: [],
  run: [
    "curl -s -o /dev/null -w 'health: %{http_code}\\n' http://127.0.0.1:3000/health",
    "curl -s -o /dev/null -w 'fhir: %{http_code}\\n' http://127.0.0.1:3000/fhir/metadata",
    "curl -s -o /dev/null -w 'fhir-patient: %{http_code}\\n' 'http://127.0.0.1:3000/fhir/Patient?name=A'",
    "curl -s -X POST -H 'Content-Type: application/json' -d '{\"tenantId\":\"demo\",\"patientId\":\"p1\",\"setId\":\"stroke_alert\",\"actorId\":\"dr-x\",\"actorRoles\":[\"doctor\"]}' -o /dev/null -w 'careplans: %{http_code}\\n' http://127.0.0.1:3000/api/v4/careplans/apply",
    "curl -s -o /dev/null -w 'station: %{http_code}\\n' http://127.0.0.1:3000/station-index.html",
    "curl -s -o /dev/null -w 'i18n: %{http_code}\\n' http://127.0.0.1:3000/i18n/medical_dictionary.json",
  ],
});
r.commands.forEach(c => console.log((c.out || '').trim()));