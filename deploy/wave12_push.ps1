$key = "C:\Users\ice\.ssh\nama_medical_key"
$sshOpts = @("-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=no", "-o", "ConnectTimeout=15")
$remote = "root@204.168.144.74"

$files = @(
  @{Local = "server.js"; Remote = "/var/www/namaweb/server.js"},
  @{Local = "routes\olap.js"; Remote = "/var/www/namaweb/routes/olap.js"}
)

foreach ($f in $files) {
  $localMd5 = (Get-FileHash $f.Local -Algorithm MD5).Hash
  $scpArgs = @("-i", $key) + $sshOpts + @($f.Local, "${remote}:$($f.Remote)")
  & scp @scpArgs 2>&1 | Out-Null
  $sshArgs = @("-i", $key) + $sshOpts + @($remote, "md5sum $($f.Remote) | awk '{print `$1}'")
  $remoteMd5 = (& ssh @sshArgs).Trim()
  $match = if ($localMd5 -eq $remoteMd5) { "MATCH" } else { "MISMATCH" }
  Write-Host "$($f.Local): local=$localMd5 remote=$remoteMd5 $match"
}

$sshArgs = @("-i", $key) + $sshOpts + @($remote, "pm2 restart nama-medical-erp && sleep 7")
& ssh @sshArgs 2>&1 | Out-Null

# Verify olap endpoints
$sshArgs = @("-i", $key) + $sshOpts + @($remote, "bash -c 'for p in api/v4/olap/views api/v4/olap/query api/v4/olap/export api/v4/olap/refresh/mv_daily_admissions/history ; do code=`$(curl -s -o /tmp/b.txt -w %{http_code} -H \"x-tenant-id: tnt-demo\" -H \"x-user-id: dr-test\" -H \"x-user-role: admin\" \"http://127.0.0.1:3000/$p\") ; body=`$(head -c 120 /tmp/b.txt) ; echo \"$p => $code | $body\" ; done'")
& ssh @sshArgs 2>&1