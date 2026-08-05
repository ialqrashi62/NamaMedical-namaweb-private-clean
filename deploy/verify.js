const H = require('./hetzner');
const r = H.deploy({
  host: '204.168.144.74',
  user: 'root',
  keyPath: 'C:\\Users\\ice\\.ssh\\nama_medical_key',
  remoteDir: '/var/www/namaweb',
  files: [],
  run: [
    "echo === FHIR metadata === ; curl -s http://127.0.0.1:3000/fhir/metadata | head -c 400",
    "echo === FHIR Patient search === ; curl -s 'http://127.0.0.1:3000/fhir/Patient?name=A' | head -c 400",
    "echo === Care Plans apply === ; curl -s -X POST -H 'Content-Type: application/json' -d '{\"tenantId\":\"demo\",\"patientId\":\"p1\",\"setId\":\"stroke_alert\",\"actorId\":\"dr-x\",\"actorRoles\":[\"doctor\"]}' http://127.0.0.1:3000/api/v4/careplans/apply | head -c 400",
    "echo === Invoice === ; curl -s -X POST -H 'Content-Type: application/json' -d '{\"tenantId\":\"demo\",\"patientId\":\"p1\",\"items\":[{\"code\":\"CONS\",\"amount\":200}],\"currencyCode\":\"AED\",\"fxDate\":\"2026-08-01\"}' http://127.0.0.1:3000/api/v4/billing_v2/invoice | head -c 400",
    "echo === Station Index === ; curl -s -o /dev/null -w 'HTTP %{http_code}' http://127.0.0.1:3000/station-index.html",
    "echo === i18n === ; curl -s -o /dev/null -w 'HTTP %{http_code}' http://127.0.0.1:3000/i18n/medical_dictionary.json",
  ],
});
r.commands.forEach(c => console.log(c.cmd.slice(0, 50), '=>', (c.out || '').trim().slice(0, 400)));