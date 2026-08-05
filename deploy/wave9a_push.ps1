$key = "C:\Users\ice\.ssh\nama_medical_key"
$sshOpts = @("-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=no", "-o", "ConnectTimeout=15")
$remote = "root@204.168.144.74"

# MD5 check local
$localMd5 = (Get-FileHash "lib\careplans\orderSets.js" -Algorithm MD5).Hash

# SCP to Hetzner
$scpArgs = @("-i", $key) + $sshOpts + @("lib\careplans\orderSets.js", "${remote}:/var/www/namaweb/lib/careplans/orderSets.js")
& scp @scpArgs 2>&1 | Out-Null

# MD5 check remote
$sshArgs = @("-i", $key) + $sshOpts + @($remote, "md5sum /var/www/namaweb/lib/careplans/orderSets.js | awk '{print `$1}'")
$remoteMd5 = (& ssh @sshArgs).Trim()
Write-Host "local=$localMd5 remote=$remoteMd5 match=$($localMd5 -eq $remoteMd5)"

# Restart + verify server bundle count
$verifyCmd = 'pm2 restart nama-medical-erp && sleep 7 && bash -lc "cd /var/www/namaweb && node -e `"const o=require(\"./lib/careplans/orderSets\");console.log(`"server bundles:`", o.listIds().length)`""'
$sshArgs2 = @("-i", $key) + $sshOpts + @($remote, $verifyCmd)
& ssh @sshArgs2 2>&1

# Test bundles endpoint
$bundleCmd = 'bash -lc "curl -s -H \"x-tenant-id: tnt-demo\" -H \"x-user-id: dr-test\" -H \"x-user-role: doctor\" http://127.0.0.1:3000/api/v4/careplans/bundles > /tmp/bundles.json && node -e `"\`"const fs=require(\\\"fs\\\"); const j=JSON.parse(fs.readFileSync(\\\"/tmp/bundles.json\\\",\\\"utf8\\\")); console.log(\\\"API bundles:\\\", j.count, \\\"| items in stroke_alert:\\\", (j.bundles.stroke_alert||{}).items?j.bundles.stroke_alert.items.length:0)\`""'
$sshArgs3 = @("-i", $key) + $sshOpts + @($remote, $bundleCmd)
& ssh @sshArgs3 2>&1

# Smoke full bundles list
$listCmd = 'bash -lc "curl -s -H \"x-tenant-id: tnt-demo\" -H \"x-user-id: dr-test\" -H \"x-user-role: doctor\" http://127.0.0.1:3000/api/v4/careplans/bundles > /tmp/bundles.json && node -e `"\`"const fs=require(\\\"fs\\\"); const j=JSON.parse(fs.readFileSync(\\\"/tmp/bundles.json\\\",\\\"utf8\\\")); console.log(Object.keys(j.bundles).join(\\\", \\\"))\`""'
$sshArgs4 = @("-i", $key) + $sshOpts + @($remote, $listCmd)
& ssh @sshArgs4 2>&1
