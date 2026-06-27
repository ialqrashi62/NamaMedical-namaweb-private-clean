#!/usr/bin/env bash
# =============================================================================
# NamaMedical — one-shot DDL deploy for integration/all-epics (E-X + E0..E18)
# RUN AS A DB ROLE WITH DDL PRIVILEGE (owner-run; the app role cannot do this).
# Run from a checkout of the integration/all-epics branch (has all migration files).
#
# Usage:
#   export PGHOST=localhost PGDATABASE=nama_medical_web PGUSER=<priv_role>
#   export PGPASSWORD=<...>                 # privileged/migration role
#   bash DEPLOY_RUN.sh                      # runs all migrations + validators, stops on first error
#
# SAFETY (read before running):
#  - TAKE A BACKUP FIRST:  pg_dump -Fc nama_medical_web > pre_deploy_$(date +%F).dump
#  - Several migrations contain `UPDATE ... SET tenant_id=1 WHERE tenant_id IS NULL`
#    (single-tenant dev backfill). If PRODUCTION IS MULTI-TENANT with live rows,
#    REVIEW/EDIT those backfills to the correct tenant mapping BEFORE running.
#  - FORCE RLS is enabled on existing tables; the app must run as the non-superuser
#    app role with per-request app.tenant_id binding (already the case) so rows stay visible.
#  - Each _up is followed by its _validate (a clean validate prints 0 problem rows /
#    expected counts). If a validate fails, STOP and inspect before continuing.
# =============================================================================
set -euo pipefail
PSQL="psql -v ON_ERROR_STOP=1 -X -q"
run() { echo ">>> $1"; $PSQL -f "$1"; }
val() { echo "--- validate: $1"; $PSQL -f "$1"; }

# ---- PREFLIGHT SAFETY GATE (tenant-aware backfill protection) ----
# Several _up scripts backfill `UPDATE <t> SET tenant_id=1 WHERE tenant_id IS NULL`.
# That dev backfill is only safe when it mis-assigns NOTHING. On a MULTI-tenant DB it
# would wrongly stamp legacy NULL rows to tenant 1. Old behaviour aborted on tenants>1
# unless CONFIRM_MULTITENANT=1 (a blanket bypass). New behaviour: on multi-tenant we
# PROVE the backfill is a NO-OP (zero null/unmapped rows in every backfill target) and
# only then proceed. The audit runs as the (privileged) deploy role which bypasses RLS,
# so the counts are TRUE. If ANY unsafe rows exist we abort and require a manual mapping.
# CONFIRM_MULTITENANT=1 is kept ONLY as an explicit owner override for the post-mapping
# case (it is NOT needed, and NOT the default path, when the backfill is a proven no-op).
echo "=== PREFLIGHT ==="
TENANTS=$($PSQL -tA -c "select count(*) from tenants" 2>/dev/null || echo "ERR")
echo "tenant rows: ${TENANTS}"
if [ "${TENANTS}" = "ERR" ]; then
  echo "!! Could not read tenants table — check connection/role privileges. Aborting."; exit 1
fi

# The 30 backfill-target tables (every table that has a `tenant_id=1 WHERE tenant_id IS NULL`
# backfill across the E-X/E0..E18 _up scripts). Keep in sync with those migrations.
BACKFILL_TABLES_SQL="VALUES
   ('admission_daily_rounds'),('admissions'),('bed_transfers'),('beds'),
   ('blood_bank_crossmatch'),('blood_bank_donors'),('blood_bank_transfusions'),('blood_bank_units'),
   ('cssd_instrument_sets'),('cssd_load_items'),('cssd_sterilization_cycles'),('daily_close'),
   ('emergency_beds'),('emergency_trauma_assessments'),('emergency_visits'),('finance_chart_of_accounts'),
   ('finance_cost_centers'),('finance_journal_entries'),('finance_journal_lines'),('icu_fluid_balance'),
   ('icu_monitoring'),('icu_scores'),('icu_ventilator'),('insurance_claims'),
   ('insurance_companies'),('insurance_contracts'),('insurance_policies'),('inventory_items'),
   ('wards'),('zatca_invoices')"

# Builds a CTE that, per target table, computes total_rows, null_tenant_rows, and whether
# the tenant_id column is missing while rows exist (also unsafe — ADD COLUMN would create
# NULLs that the backfill then stamps). $1 = trailing projection/filter.
mk_audit_sql() {
  cat <<AUDIT
WITH x(t) AS ( ${BACKFILL_TABLES_SQL} ),
meta AS (
  SELECT x.t,
    to_regclass('public.'||x.t) IS NOT NULL AS tbl_exists,
    EXISTS(SELECT 1 FROM information_schema.columns c
           WHERE c.table_schema='public' AND c.table_name=x.t AND c.column_name='tenant_id') AS has_tid
  FROM x),
cnt AS (
  SELECT m.t, m.tbl_exists, m.has_tid,
    CASE WHEN m.tbl_exists
      THEN (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) c FROM %I', m.t), false, true, '')))[1]::text::bigint
      ELSE 0 END AS total_rows,
    CASE WHEN m.tbl_exists AND m.has_tid
      THEN (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) c FROM %I WHERE tenant_id IS NULL', m.t), false, true, '')))[1]::text::bigint
      ELSE 0 END AS null_tid
  FROM meta m)
$1
AUDIT
}

if [ "${TENANTS}" -gt 1 ]; then
  echo "-- multi-tenant DB (${TENANTS} tenants): proving tenant_id backfills are a NO-OP before proceeding."
  echo "-- unsafe backfill targets (table|total_rows|null_tenant_rows|reason); empty list = all no-op:"
  $PSQL -tA -c "$(mk_audit_sql "SELECT t||'|'||total_rows||'|'||null_tid||'|'||
        (CASE WHEN tbl_exists AND NOT has_tid AND total_rows>0 THEN 'MISSING_TENANT_ID_COL_WITH_ROWS'
              WHEN null_tid>0 THEN 'NULL_TENANT_ROWS' ELSE 'noop' END)
   FROM cnt
   WHERE (null_tid>0) OR (tbl_exists AND NOT has_tid AND total_rows>0)
   ORDER BY t;")"
  UNSAFE=$($PSQL -tA -c "$(mk_audit_sql "SELECT COALESCE(SUM(null_tid),0)
        + COALESCE(SUM(CASE WHEN tbl_exists AND NOT has_tid AND total_rows>0 THEN total_rows ELSE 0 END),0)
   FROM cnt;")" 2>/dev/null || echo "ERR")
  echo "unsafe (null-tenant or missing-column-with-rows) backfill rows: ${UNSAFE}"
  if [ "${UNSAFE}" = "ERR" ] || [ -z "${UNSAFE}" ]; then
    echo "!! Could not compute the null-tenant audit — aborting for safety."; exit 1
  fi
  if [ "${UNSAFE}" != "0" ]; then
    if [ "${CONFIRM_MULTITENANT:-0}" = "1" ]; then
      echo "!! ${UNSAFE} unsafe backfill rows present, but CONFIRM_MULTITENANT=1 — owner asserts a"
      echo "!! manual tenant mapping has been applied to the _up backfills. Proceeding on override."
    else
      echo "!! MULTI-TENANT DB with ${UNSAFE} legacy NULL/unmapped tenant rows in backfill targets."
      echo "!! The tenant_id=1 backfills would MIS-ASSIGN these rows across tenants. Provide a manual"
      echo "!! tenant mapping and edit the _up backfills FIRST. Aborting (no blanket bypass)."
      exit 1
    fi
  else
    echo "decision: multi-tenant BUT all backfill targets have 0 null/unmapped rows => backfills are a"
    echo "decision: proven NO-OP => SAFE to proceed (no CONFIRM_MULTITENANT bypass required)."
  fi
else
  echo "single-tenant DB => tenant_id backfills are safe."
fi
echo "preflight OK. proceeding."
echo ""

echo "=== E-X foundational ==="
run migrations/ex_01_orders_up.sql;            val migrations/ex_01_orders_validate.sql
run migrations/ex_02_rbac_up.sql;              val migrations/ex_02_rbac_validate.sql
run migrations/ex_03_tenant_id_indexes_up.sql; val migrations/ex_03_tenant_id_indexes_validate.sql

echo "=== E1 doctor station ==="
run migrations/e1_01_problems_up.sql;          val migrations/e1_01_problems_validate.sql
run migrations/e1_02_clinical_notes_up.sql;    val migrations/e1_02_clinical_notes_validate.sql

echo "=== E2 HIM ==="
run migrations/e2_01_coding_up.sql;            val migrations/e2_01_coding_validate.sql
run migrations/e2_02_roi_up.sql;               val migrations/e2_02_roi_validate.sql
run migrations/e2_03_record_access_up.sql;     val migrations/e2_03_record_access_validate.sql

echo "=== E3 laboratory ==="
run migrations/e3_01_lab_samples_up.sql;       val migrations/e3_01_lab_samples_validate.sql
run migrations/e3_02_lab_results_up.sql;       val migrations/e3_02_lab_results_validate.sql
run migrations/e3_03_lab_qc_up.sql;            val migrations/e3_03_lab_qc_validate.sql

echo "=== E4 radiology: no new DDL (route guards + existing tables) ==="

echo "=== E5 pharmacy ==="
run migrations/e5_01_drug_batches_up.sql;      val migrations/e5_01_drug_batches_validate.sql
run migrations/e5_02_pharmacy_dispense_up.sql; val migrations/e5_02_pharmacy_dispense_validate.sql
run migrations/e5_03_controlled_log_up.sql;    val migrations/e5_03_controlled_log_validate.sql

echo "=== E6 nursing/MAR ==="
run migrations/e6_01_mar_administrations_up.sql; val migrations/e6_01_mar_administrations_validate.sql
run migrations/e6_02_nursing_io_records_up.sql;  val migrations/e6_02_nursing_io_records_validate.sql
run migrations/e6_03_nursing_scores_up.sql;      val migrations/e6_03_nursing_scores_validate.sql

echo "=== E7 emergency/ED ==="
run migrations/e7_01_emergency_ed_workflow_up.sql; val migrations/e7_01_emergency_ed_workflow_validate.sql
run migrations/e7_02_emergency_rls_up.sql;         val migrations/e7_02_emergency_rls_validate.sql

echo "=== E8 inpatient/ADT ==="
run migrations/e8_01_inpatient_adt_rls_up.sql;  val migrations/e8_01_inpatient_adt_rls_validate.sql
run migrations/e8_02_bed_status_history_up.sql; val migrations/e8_02_bed_status_history_validate.sql

echo "=== E9 ICU ==="
run migrations/e9_01_icu_rls_up.sql;       val migrations/e9_01_icu_rls_validate.sql
run migrations/e9_02_icu_infusions_up.sql; val migrations/e9_02_icu_infusions_validate.sql

echo "=== E10 finance/GL/ZATCA ==="
run migrations/e10_01_gl_structure_up.sql;    val migrations/e10_01_gl_structure_validate.sql
run migrations/e10_02_cost_centers_up.sql;    val migrations/e10_02_cost_centers_validate.sql
run migrations/e10_03_zatca_invoices_up.sql;  val migrations/e10_03_zatca_invoices_validate.sql
run migrations/e10_04_invoice_gl_link_up.sql; val migrations/e10_04_invoice_gl_link_validate.sql
run migrations/e10_05_daily_close_rls_up.sql; val migrations/e10_05_daily_close_rls_validate.sql

echo "=== E11 insurance/NPHIES ==="
run migrations/e11_01_claims_lifecycle_up.sql;        val migrations/e11_01_claims_lifecycle_validate.sql
run migrations/e11_02_companies_policies_up.sql;      val migrations/e11_02_companies_policies_validate.sql
run migrations/e11_03_nphies_lifecycle_tables_up.sql; val migrations/e11_03_nphies_lifecycle_tables_validate.sql

echo "=== E12 surgery/OR ==="
run migrations/e12_001_surgery_or_up.sql; val migrations/e12_001_surgery_or_validate.sql
run docs/sql/surgery_or_rls_up.sql

echo "=== E13 blood bank ==="
run docs/migrations/blood_bank/01_blood_bank_e13_up.sql; val docs/migrations/blood_bank/01_blood_bank_e13_validate.sql

echo "=== E14 OB/maternity ==="
run migrations/e14_ob_maternity_up.sql; val migrations/e14_ob_maternity_validate.sql

echo "=== E15 pathology ==="
run migrations/e15_pathology_01_specimens_blocks_slides_reports_up.sql; val migrations/e15_pathology_01_specimens_blocks_slides_reports_validate.sql

echo "=== E16 inventory/CSSD ==="
run migrations/e16_01_inventory_cssd_rls_up.sql; val migrations/e16_01_inventory_cssd_rls_validate.sql
run migrations/e16_02_supply_chain_up.sql;       val migrations/e16_02_supply_chain_validate.sql
run migrations/e16_03_cssd_trays_up.sql;         val migrations/e16_03_cssd_trays_validate.sql

echo "=== E17 quality/infection ==="
run migrations/e17_001_quality_capa_up.sql; val migrations/e17_001_quality_capa_validate.sql
run migrations/e17_002_infection_up.sql;    val migrations/e17_002_infection_validate.sql

echo "=== E18 HR/workforce ==="
run migrations/e18_01_hr_workforce_up.sql; val migrations/e18_01_hr_workforce_validate.sql

echo "=== E0 onboarding ==="
run migrations/e0_01_tenants_archetype_up.sql;        val migrations/e0_01_tenants_archetype_validate.sql
run migrations/e0_02_facilities_extend_up.sql;        val migrations/e0_02_facilities_extend_validate.sql
run migrations/e0_03_facility_modules_up.sql;         val migrations/e0_03_facility_modules_validate.sql
run migrations/e0_04_integration_settings_rls_up.sql; val migrations/e0_04_integration_settings_rls_validate.sql

echo ""
echo "=== ALL MIGRATIONS APPLIED + VALIDATED ==="
echo "Next (operator): deploy the integration code + restart, then smoke:"
echo "  pm2 restart nama-app && sleep 3 && curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/health"
echo "Gated flags stay OFF unless real keys exist: ACCOUNTING_POSTING_ENABLED, ZATCA_ENABLED, NPHIES_ENABLED, HR_PAYROLL_POSTING_ENABLED."
