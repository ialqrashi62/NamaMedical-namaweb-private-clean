#!/bin/bash
for spec in \
  "GET api/v4/olap/views" \
  "GET api/v4/olap/query?view=mv_daily_admissions&limit=5" \
  "GET api/v4/olap/export?view=mv_daily_admissions&format=json" \
  "GET api/v4/olap/refresh/mv_daily_admissions/history?limit=5"; do
  m=$(echo "$spec" | awk '{print $1}')
  p=$(echo "$spec" | awk '{print $2}')
  code=$(curl -s -o /tmp/b.txt -w "%{http_code}" -X "$m" -H "x-tenant-id: tnt-demo" -H "x-user-id: dr-test" -H "x-user-role: admin" "http://127.0.0.1:3000/$p")
  body=$(head -c 250 /tmp/b.txt)
  echo "--- $m /$p => $code"
  echo "$body"
done
