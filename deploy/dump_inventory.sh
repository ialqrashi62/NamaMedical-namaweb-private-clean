#!/bin/bash
# Comprehensive inventory: routes, migrations, skills, engines, stations
set -e
cd /var/www/namaweb

echo "=== ROUTES ===" > /tmp/jumana_inventory.txt
ls routes/ | grep -v '_test\|node_modules' | sort >> /tmp/jumana_inventory.txt
echo "" >> /tmp/jumana_inventory.txt

echo "=== MIGRATIONS ===" >> /tmp/jumana_inventory.txt
ls migrations/ | grep -v node_modules | sort >> /tmp/jumana_inventory.txt
echo "" >> /tmp/jumana_inventory.txt

echo "=== ENGINES ===" >> /tmp/jumana_inventory.txt
ls engines/ 2>/dev/null | sort >> /tmp/jumana_inventory.txt
echo "" >> /tmp/jumana_inventory.txt

echo "=== STATIONS ===" >> /tmp/jumana_inventory.txt
ls public/js/*-station.js 2>/dev/null | xargs -n1 basename | sort >> /tmp/jumana_inventory.txt
echo "" >> /tmp/jumana_inventory.txt

echo "=== LIB FILES ===" >> /tmp/jumana_inventory.txt
ls lib/ | grep '\.js$' | sort >> /tmp/jumana_inventory.txt
echo "" >> /tmp/jumana_inventory.txt

echo "=== SKILLS (project_brain) ===" >> /tmp/jumana_inventory.txt
ls /var/www/namaweb-ovr-audit-independent/project_brain/skills/ 2>/dev/null | head -100 >> /tmp/jumana_inventory.txt
ls /root/.agents/skills/ 2>/dev/null | head -100 >> /tmp/jumana_inventory.txt
ls /root/Desktop/NMEDCALVSCODE/.agents/skills/ 2>/dev/null | head -100 >> /tmp/jumana_inventory.txt
echo "" >> /tmp/jumana_inventory.txt

echo "=== TOP server.js routes count ===" >> /tmp/jumana_inventory.txt
grep -c "^app\.\(get\|post\|put\|patch\|delete\)" server.js >> /tmp/jumana_inventory.txt
echo "" >> /tmp/jumana_inventory.txt

echo "=== Mounted routers in server.js (app.use) ===" >> /tmp/jumana_inventory.txt
grep "^app\.use" server.js | head -50 >> /tmp/jumana_inventory.txt
echo "" >> /tmp/jumana_inventory.txt

echo "TOTAL INVENTORY:" >> /tmp/jumana_inventory.txt
wc -l /tmp/jumana_inventory.txt >> /tmp/jumana_inventory.txt

cat /tmp/jumana_inventory.txt
