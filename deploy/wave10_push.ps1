$key = "C:\Users\ice\.ssh\nama_medical_key"
$sshOpts = @("-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=no", "-o", "ConnectTimeout=15")
$remote = "root@204.168.144.74"

$files = @(
  @{Local = "server.js"; Remote = "/var/www/namaweb/server.js"},
  @{Local = "routes\billing_multi_currency.js"; Remote = "/var/www/namaweb/routes/billing_multi_currency.js"},
  @{Local = "migrations\e55_invoices_multi_currency_up.sql"; Remote = "/var/www/namaweb/migrations/e55_invoices_multi_currency_up.sql"},
  @{Local = "migrations\e55_invoices_multi_currency_down.sql"; Remote = "/var/www/namaweb/migrations/e55_invoices_multi_currency_down.sql"}
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

# Apply migration
Write-Host "---APPLYING MIGRATION---"
$sshArgs = @("-i", $key) + $sshOpts + @($remote, "PGPASSWORD='NamaMedicalApp@2026!' psql -U nama_medical_app -h localhost -d nama_medical_web -f /var/www/namaweb/migrations/e55_invoices_multi_currency_up.sql 2>&1 | tail -10")
& ssh @sshArgs 2>&1

# Restart
Write-Host "---RESTART---"
$sshArgs = @("-i", $key) + $sshOpts + @($remote, "pm2 restart nama-medical-erp && sleep 7")
& ssh @sshArgs 2>&1

# Verify
Write-Host "---VERIFY---"
$verifyCmd = @'
bash -lc 'for path in api/v4/billing/currencies "api/v4/billing/fx?from=USD&to=SAR" api/v4/billing/convert api/v4/billing/invoices ; do code=$(curl -s -o /tmp/b.txt -w %{http_code} -H "x-tenant-id: tnt-demo" -H "x-user-id: dr-test" -H "x-user-role: doctor" "http://127.0.0.1:3000/$path" 2>/dev/null) ; body=$(head -c 200 /tmp/b.txt 2>/dev/null | tr -d "\n") ; echo "$path => $code | $body" ; done'
'@
$sshArgs = @("-i", $key) + $sshOpts + @($remote, $verifyCmd)
& ssh @sshArgs 2>&1
