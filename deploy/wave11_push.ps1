$key = "C:\Users\ice\.ssh\nama_medical_key"
$sshOpts = @("-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=no", "-o", "ConnectTimeout=15")
$remote = "root@204.168.144.74"

# 1) Push file and verify MD5
$files = @(@{Local = "routes\discharge.js"; Remote = "/var/www/namaweb/routes/discharge.js"})
foreach ($f in $files) {
  $localMd5 = (Get-FileHash $f.Local -Algorithm MD5).Hash
  $scpArgs = @("-i", $key) + $sshOpts + @($f.Local, "${remote}:$($f.Remote)")
  & scp @scpArgs 2>&1 | Out-Null
  $sshArgs = @("-i", $key) + $sshOpts + @($remote, "md5sum $($f.Remote) | awk '{print `$1}'")
  $remoteMd5 = (& ssh @sshArgs).Trim()
  $match = if ($localMd5 -eq $remoteMd5) { "MATCH" } else { "MISMATCH" }
  Write-Host "$($f.Local): local=$localMd5 remote=$remoteMd5 $match"
}

# 2) Restart PM2
$sshArgs = @("-i", $key) + $sshOpts + @($remote, "pm2 restart nama-medical-erp && sleep 7")
& ssh @sshArgs 2>&1 | Out-Null

# 3) Build test script with bodies written to files (no shell escaping at all)
$tmpDir = Join-Path $env:TEMP "wave11_$([guid]::NewGuid().ToString('N').Substring(0,8))"
New-Item -ItemType Directory -Path $tmpDir | Out-Null

$tests = @(
  @{
    Name = "Test 1: tenantId in BODY (full Arabic summary expected)"
    Body = '{"tenantId":"tnt-demo","patientId":"P-001","primaryDx":"Acute MI STEMI","notes":["chest pain"],"events":["ECG done"],"meds":["Aspirin 81mg"],"actorId":"dr-test","actorRoles":["doctor"]}'
  },
  @{
    Name = "Test 2: tenantId ONLY in header (after dev-ctx fix)"
    Body = '{"patientId":"P-002","primaryDx":"Stroke","notes":["left hemiparesis"],"events":["CT head"],"meds":["tPA"],"actorId":"dr-test","actorRoles":["doctor"]}'
  },
  @{
    Name = "Test 3: English (lang=en-US)"
    Body = '{"tenantId":"tnt-demo","patientId":"P-003","lang":"en-US","primaryDx":"Sepsis","notes":["fever 39C"],"events":["lactate 4.5"],"meds":["Pip-Tazo"],"actorId":"dr-test","actorRoles":["doctor"]}'
  }
)

# Write all test bodies as files
$bodyFileMap = @{}
foreach ($i in 0..($tests.Count-1)) {
  $f = Join-Path $tmpDir "body$i.json"
  [System.IO.File]::WriteAllText($f, $tests[$i].Body, [System.Text.UTF8Encoding]::new($false))
  $bodyFileMap[$i] = $f
  Write-Host ("body$i.json length: " + (Get-Item $f).Length)
}

# Build the bash script using @file references
$bashLines = @()
$bashLines += '#!/bin/bash'
foreach ($i in 0..($tests.Count-1)) {
  $localFile = $bodyFileMap[$i]
  $remoteFile = "/tmp/wave11_body$i.json"
  $scpArgs = @("-i", $key) + $sshOpts + @($localFile, "${remote}:$remoteFile")
  & scp @scpArgs 2>&1 | Out-Null

  $bashLines += "echo '$($tests[$i].Name)'"
  $bashLines += "curl -s -X POST -H 'Content-Type: application/json' -H 'x-tenant-id: tnt-demo' -H 'x-user-id: dr-test' -H 'x-user-role: doctor' --data-binary @$remoteFile http://127.0.0.1:3000/api/v4/discharge/draft"
  $bashLines += "echo ''"
  $bashLines += "echo '===END$i==='"
  $bashLines += "echo ''"
}

$bashScript = ($bashLines -join "`n")

# Upload via base64
$b64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($bashScript))
$tmpB64 = Join-Path $tmpDir "b64.txt"
[System.IO.File]::WriteAllText($tmpB64, $b64, [System.Text.Encoding]::ASCII)
$scpArgs = @("-i", $key) + $sshOpts + @($tmpB64, "${remote}:/tmp/wave11_b64.txt")
& scp @scpArgs 2>&1 | Out-Null

$sshArgs = @("-i", $key) + $sshOpts + @($remote, "base64 -d /tmp/wave11_b64.txt > /tmp/wave11_test.sh && bash /tmp/wave11_test.sh")
& ssh @sshArgs 2>&1
Write-Host ""

Remove-Item -Path $tmpDir -Recurse -Force -ErrorAction SilentlyContinue
