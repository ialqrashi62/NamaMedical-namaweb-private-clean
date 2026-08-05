$key = "C:\Users\ice\.ssh\nama_medical_key"
$sshOpts = @("-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=no", "-o", "ConnectTimeout=15")
$remote = "root@204.168.144.74"

# Build the remote curl commands as single-quoted shell strings (no shell escaping needed)
# We'll use printf-style embedded JSON via heredoc on the remote side.

$cmdAR = @'
bash -c "cat > /tmp/body_ar.json <<'JSON'
{\"patientId\":\"P-002\",\"primaryDx\":\"Stroke\",\"notes\":[\"left hemiparesis\"],\"events\":[\"CT head\"],\"meds\":[\"tPA\"],\"actorId\":\"dr-test\",\"actorRoles\":[\"doctor\"]}
JSON
curl -s -X POST -H 'Content-Type: application/json' -H 'x-tenant-id: tnt-demo' -H 'x-user-id: dr-test' -H 'x-user-role: doctor' --data-binary @/tmp/body_ar.json http://127.0.0.1:3000/api/v4/discharge/draft"
'@

$cmdEN = @'
bash -c "cat > /tmp/body_en.json <<'JSON'
{\"patientId\":\"P-003\",\"lang\":\"en-US\",\"primaryDx\":\"Sepsis\",\"notes\":[\"fever 39C\"],\"events\":[\"lactate 4.5\"],\"meds\":[\"Pip-Tazo\"],\"actorId\":\"dr-test\",\"actorRoles\":[\"doctor\"]}
JSON
curl -s -X POST -H 'Content-Type: application/json' -H 'x-tenant-id: tnt-demo' -H 'x-user-id: dr-test' -H 'x-user-role: doctor' --data-binary @/tmp/body_en.json http://127.0.0.1:3000/api/v4/discharge/draft"
'@

$cmdFR = @'
bash -c "cat > /tmp/body_fr.json <<'JSON'
{\"patientId\":\"P-004\",\"lang\":\"fr-FR\",\"primaryDx\":\"Pneumonie\",\"notes\":[\"fièvre 39C\"],\"events\":[\"CXR\"],\"meds\":[\"Amoxicilline\"],\"actorId\":\"dr-test\",\"actorRoles\":[\"doctor\"]}
JSON
curl -s -X POST -H 'Content-Type: application/json' -H 'x-tenant-id: tnt-demo' -H 'x-user-id: dr-test' -H 'x-user-role: doctor' --data-binary @/tmp/body_fr.json http://127.0.0.1:3000/api/v4/discharge/draft"
'@

Write-Host "=== HEADER-ONLY tenantId (after fix) ==="
& ssh -i $key @sshOpts $remote $cmdAR 2>&1
Write-Host ""
Write-Host "=== ENGLISH (header-only) ==="
& ssh -i $key @sshOpts $remote $cmdEN 2>&1
Write-Host ""
Write-Host "=== FRENCH (header-only) ==="
& ssh -i $key @sshOpts $remote $cmdFR 2>&1
Write-Host ""
