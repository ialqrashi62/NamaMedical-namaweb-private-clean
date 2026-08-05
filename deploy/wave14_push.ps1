$key = "C:\Users\ice\.ssh\nama_medical_key"
$sshOpts = @("-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=no", "-o", "ConnectTimeout=15")
$remote = "root@204.168.144.74"

# Push all 30 station files
$stations = Get-ChildItem "public\js\*-station.js" | Sort-Object Name
foreach ($s in $stations) {
  $localMd5 = (Get-FileHash $s.FullName -Algorithm MD5).Hash
  $scpArgs = @("-i", $key) + $sshOpts + @($s.FullName, "${remote}:/var/www/namaweb/public/js/$($s.Name)")
  & scp @scpArgs 2>&1 | Out-Null
  $sshArgs = @("-i", $key) + $sshOpts + @($remote, "md5sum /var/www/namaweb/public/js/$($s.Name) | awk '{print `$1}'")
  $remoteMd5 = (& ssh @sshArgs).Trim()
  if ($localMd5 -eq $remoteMd5) {
    Write-Host "  $($s.Name): MATCH"
  } else {
    Write-Host "  $($s.Name): MISMATCH local=$localMd5 remote=$remoteMd5"
  }
}

# Restart pm2 to flush static assets
$sshArgs = @("-i", $key) + $sshOpts + @($remote, "pm2 restart nama-medical-erp && sleep 6")
& ssh @sshArgs 2>&1 | Out-Null

# Verify a11y tokens per file live
$body = @'
#!/bin/bash
echo "=== aria tokens per station (live) ==="
total=0
for f in /var/www/namaweb/public/js/*-station.js; do
  n=$(grep -cE "aria-label" "$f" 2>/dev/null)
  total=$((total + n))
done
echo "TOTAL aria-label across 30 stations: $total"
echo ""
echo "=== HTML serves doctor-station.js with aria-label ==="
curl -s "http://127.0.0.1:3000/js/doctor-station.js" | grep -c "aria-label"
echo ""
echo "=== index.html has script tag ==="
curl -s "http://127.0.0.1:3000/" | grep -c "doctor-station.js"
'@
[System.IO.File]::WriteAllText("C:\Users\ice\Desktop\NMEDCALVSCODE\namaweb\deploy\test_wave14.sh", $body -replace "`r","")

$scpArgs = @("-i", $key) + $sshOpts + @("deploy\test_wave14.sh", "${remote}:/tmp/test_wave14.sh")
& scp @scpArgs 2>&1 | Out-Null
$sshArgs = @("-i", $key) + $sshOpts + @($remote, "bash /tmp/test_wave14.sh")
& ssh @sshArgs 2>&1
