#!/bin/bash
# Comprehensive DB schema dump for ERD diagram
# Outputs to /tmp/jumana_schema_full.json
set -e
cd /tmp

sudo -u postgres psql -d nama_medical_web -A -t -F "|" <<'EOF' > /tmp/jumana_tables.txt
SELECT
  c.relname AS table_name,
  (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name=c.relname) AS col_count,
  COALESCE(c.relrowsecurity, false) AS rls,
  COALESCE(c.relforcerowsecurity, false) AS force
FROM pg_class c
JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind='r'
ORDER BY c.relname;
EOF

sudo -u postgres psql -d nama_medical_web -A -t -F "|" <<'EOF' > /tmp/jumana_columns.txt
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema='public'
ORDER BY table_name, ordinal_position;
EOF

sudo -u postgres psql -d nama_medical_web -A -t -F "|" <<'EOF' > /tmp/jumana_fks.txt
SELECT
  tc.table_name, kcu.column_name,
  ccu.table_name AS foreign_table, ccu.column_name AS foreign_column,
  tc.constraint_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu USING (constraint_name)
JOIN information_schema.constraint_column_usage ccu USING (constraint_name)
WHERE tc.constraint_type='FOREIGN KEY' AND tc.table_schema='public'
ORDER BY tc.table_name;
EOF

sudo -u postgres psql -d nama_medical_web -A -t -F "|" <<'EOF' > /tmp/jumana_indexes.txt
SELECT tablename, indexname, indexdef
FROM pg_indexes WHERE schemaname='public'
ORDER BY tablename, indexname;
EOF

sudo -u postgres psql -d nama_medical_web -A -t -F "|" <<'EOF' > /tmp/jumana_policies.txt
SELECT tablename, policyname, cmd, qual
FROM pg_policies WHERE schemaname='public'
ORDER BY tablename, policyname;
EOF

echo "TABLES: $(wc -l < /tmp/jumana_tables.txt)"
echo "COLUMNS: $(wc -l < /tmp/jumana_columns.txt)"
echo "FKS: $(wc -l < /tmp/jumana_fks.txt)"
echo "INDEXES: $(wc -l < /tmp/jumana_indexes.txt)"
echo "POLICIES: $(wc -l < /tmp/jumana_policies.txt)"
