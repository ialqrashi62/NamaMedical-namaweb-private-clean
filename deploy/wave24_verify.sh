#!/bin/bash
echo "=== smoke ==="
curl -s -o /dev/null -w "health=%{http_code} " -H "x-tenant-id: tnt-demo" -H "x-user-id: dr-wave24" -H "x-user-role: doctor" http://127.0.0.1:3000/api/health
curl -s -o /dev/null -w "olap=%{http_code} " -H "x-tenant-id: tnt-demo" -H "x-user-id: dr-wave24" -H "x-user-role: doctor" http://127.0.0.1:3000/api/v4/olap/views
echo ""
sleep 1
echo "=== last 3 http_request log lines ==="
pm2 logs nama-medical-erp --lines 200 --nostream --raw 2>/dev/null | grep http_request | tail -3
