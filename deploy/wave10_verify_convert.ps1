$key = "C:\Users\ice\.ssh\nama_medical_key"
$opts = @("-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=no", "-o", "ConnectTimeout=15")
$remote = "root@204.168.144.74"

$body = '{"amount":100,"from":"USD","to":"SAR"}'
$b64  = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($body))

$cmd  = "echo $b64 | base64 -d > /tmp/body.json; cat /tmp/body.json; echo; "
$cmd += "curl -s -o /tmp/b.txt -w %{http_code} -X POST -H 'Content-Type: application/json' -H 'x-tenant-id: tnt-demo' -H 'x-user-id: dr-test' -H 'x-user-role: doctor' --data @/tmp/body.json http://127.0.0.1:3000/api/v4/billing/convert > /tmp/code.txt 2>/dev/null; cat /tmp/code.txt; echo ' | '; head -c 300 /tmp/b.txt 2>/dev/null"

$out = & ssh -i $key @opts $remote $cmd 2>&1
Write-Host "POST api/v4/billing/convert => $out"
