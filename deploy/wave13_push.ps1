$key = "C:\Users\ice\.ssh\nama_medical_key"
$sshOpts = @("-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=no", "-o", "ConnectTimeout=15")
$remote = "root@204.168.144.74"

$files = @(
  @{Local = "public\index.html"; Remote = "/var/www/namaweb/public/index.html"},
  @{Local = "public\js\a11y.js"; Remote = "/var/www/namaweb/public/js/a11y.js"},
  @{Local = "public\js\app.js"; Remote = "/var/www/namaweb/public/js/app.js"}
)

foreach ($f in $files) {
  $localMd5 = (Get-FileHash $f.Local -Algorithm MD5).Hash
  $scpArgs = @("-i", $key) + $sshOpts + @($f.Local, "${remote}:$($f.Remote)")
  & scp @scpArgs 2>&1 | Out-Null
  $sshArgs = @("-i", $key) + $sshOpts + @($remote, "md5sum $($f.Remote) | awk '{print `$1}'")
  $remoteMd5 = (& ssh @sshArgs).Trim()
  Write-Host "$($f.Local): local=$localMd5 remote=$remoteMd5"
}

# pm2 already running, no restart needed for static assets. But we still restart to flush app.js.
$sshArgs = @("-i", $key) + $sshOpts + @($remote, "pm2 restart nama-medical-erp && sleep 6")
& ssh @sshArgs 2>&1 | Out-Null

# Verify a11y tokens live
$body = @'
#!/bin/bash
echo "=== a11y.js 200? ==="
curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:3000/js/a11y.js?v=20260826_1"
echo ""
echo "=== nmLiveStatus present in HTML? ==="
curl -s "http://127.0.0.1:3000/" | grep -c "nmLiveStatus"
echo "=== sr-only CSS present? ==="
curl -s "http://127.0.0.1:3000/" | grep -c "sr-only"
echo "=== a11y.js script tag in HTML? ==="
curl -s "http://127.0.0.1:3000/" | grep -c "a11y.js"
echo "=== a11y tokens in app.js ==="
ssh_or_local() { :; }
'@
[System.IO.File]::WriteAllText("C:\Users\ice\Desktop\NMEDCALVSCODE\namaweb\deploy\test_a11y.sh", $body -replace "`r","")

$scpArgs = @("-i", $key) + $sshOpts + @("deploy\test_a11y.sh", "${remote}:/tmp/test_a11y.sh")
& scp @scpArgs 2>&1 | Out-Null
$sshArgs = @("-i", $key) + $sshOpts + @($remote, "bash /tmp/test_a11y.sh")
& ssh @sshArgs 2>&1

# App-side token count
$sshArgs = @("-i", $key) + $sshOpts + @($remote, "grep -cE 'aria-label|aria-modal|aria-live|role=' /var/www/namaweb/public/js/app.js")
& ssh @sshArgs 2>&1
