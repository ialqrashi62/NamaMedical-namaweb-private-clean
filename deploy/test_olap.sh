#!/bin/bash
for p in "api/v4/olap/views" "api/v4/olap/query" "api/v4/olap/export" "api/v4/olap/refresh/mv_daily_admissions/history"; do
  code=$(curl -s -o /tmp/b.txt -w "%{http_code}" -H "x-tenant-id: tnt-demo" -H "x-user-id: dr-test" -H "x-user-role: admin" "http://127.0.0.1:3000/$p")
  body=$(head -c 200 /tmp/b.txt)
  echo "$p => $code | $body"
done
