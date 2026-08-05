$key = "C:\Users\ice\.ssh\nama_medical_key"
$remote = "root@204.168.144.74"
$root = Split-Path -Parent $PSScriptRoot

$files = @(
  @{Local = Join-Path $root "lib\dev-ctx.js";              Remote = "/var/www/namaweb/lib/dev-ctx.js"},
  @{Local = Join-Path $root "lib\fhir\router.js";          Remote = "/var/www/namaweb/lib/fhir/router.js"},
  @{Local = Join-Path $root "routes\hl7v2.js";             Remote = "/var/www/namaweb/routes/hl7v2.js"},
  @{Local = Join-Path $root "routes\dicomweb.js";          Remote = "/var/www/namaweb/routes/dicomweb.js"},
  @{Local = Join-Path $root "routes\patient_portal_v2.js";  Remote = "/var/www/namaweb/routes/patient_portal_v2.js"}
)

Write-Host "PWD=$PWD  ROOT=$root"
foreach ($f in $files) {
  if (-not (Test-Path $f.Local)) {
    Write-Host "MISSING LOCAL: $($f.Local)"
    continue
  }
  $localMd5 = (Get-FileHash $f.Local -Algorithm MD5).Hash
  $localForScp = $f.Local -replace "\\", "/"
  # Note the colon after host: scp requires user@host:/path
  $dest = "${remote}:$($f.Remote)"
  $scpOut = & scp -i $key -o BatchMode=yes -o StrictHostKeyChecking=no -o ConnectTimeout=15 $localForScp $dest 2>&1
  if ($LASTEXITCODE -ne 0) {
    Write-Host "SCP FAIL: $localForScp"
    $scpOut | ForEach-Object { Write-Host "  $_" }
    continue
  }
  $remoteMd5 = (& ssh -i $key -o BatchMode=yes -o StrictHostKeyChecking=no -o ConnectTimeout=15 $remote "md5sum $($f.Remote) | awk '{print `$1}'").Trim()
  $match = if ($localMd5 -eq $remoteMd5) { "MATCH" } else { "MISMATCH" }
  Write-Host "$($f.Local): local=$localMd5 remote=$remoteMd5 $match"
}

Write-Host "---RESTART---"
& ssh -i $key -o BatchMode=yes -o StrictHostKeyChecking=no -o ConnectTimeout=15 $remote "pm2 flush && pm2 restart nama-medical-erp && sleep 8 && pm2 list | head -10" 2>&1
