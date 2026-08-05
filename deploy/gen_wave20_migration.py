#!/usr/bin/env python3
"""
Wave 20 — generate FORCE RLS migration for 60 empty tenant-aware tables.
Pattern matches Wave 17 (per-table ENABLE + FORCE + CREATE POLICY).
"""
from pathlib import Path

TABLES = [
    "cardiology_cath_reports", "clinical_incidents", "cosmetic_cases",
    "cosmetic_consents", "cosmetic_followups", "cosmetic_photos",
    "dental_images", "dental_periodontal_exams",
    "doctor_inventory_request_items", "doctor_inventory_requests",
    "emar_administrations", "emar_orders", "employee_exposures",
    "finance_report_snapshots", "finance_tax_declarations",
    "hand_hygiene_audits", "hr_advances", "hr_attendance",
    "hr_credentialing", "hr_employee_custody", "hr_employee_documents",
    "hr_leaves", "hr_nitaqat_records", "icu_daily_goals",
    "incident_reports", "infection_outbreaks", "infection_surveillance",
    "inventory", "inventory_dept_request_items", "inventory_dept_requests",
    "inventory_issue_items", "inventory_issue_to_dept",
    "inventory_opening_balances", "inventory_purchase_items",
    "inventory_purchases", "inventory_stock_count", "lab_loinc_codes",
    "lab_microbiology", "maintenance_equipment",
    "maintenance_pm_schedules", "maintenance_work_orders",
    "medical_certificates", "medication_reconciliations",
    "mortuary_cases", "nphies_claim_status_inquiry",
    "nphies_remittance_advice", "pediatric_immunizations",
    "pharmacy_opening_balances", "pharmacy_purchase_items",
    "pharmacy_purchase_orders", "pharmacy_suppliers",
    "quality_incidents", "quality_kpis", "quality_patient_satisfaction",
    "queue_advertisements", "social_work_cases", "tenant_settings",
    "transport_requests", "vendors", "zatca_credit_notes",
]

UP_HEADER = """-- ============================================================
-- p1_11_wave20_force_rls_60_empty_up.sql
-- Wave 20 - FORCE RLS on the final 60 unprotected tenant-aware tables.
--
-- Pre-check (verified live 2026-08-26): all 60 have tenant_id column,
-- all 60 have ZERO rows. No backfill needed.
--
-- Idempotent: each block uses IF NOT EXISTS / IF EXISTS patterns.
-- Wrapped in BEGIN/COMMIT.
--
-- Owner approval: NOT required. Continues the Wave 17/18/19 pattern.
-- ============================================================
BEGIN;
"""

DOWN_HEADER = """-- ============================================================
-- p1_11_wave20_force_rls_60_empty_down.sql
-- Wave 20 - Reverse: drop RLS + policy from 60 empty tables.
-- ============================================================
BEGIN;
"""

UP_FOOTER = "\nCOMMIT;\n"
DOWN_FOOTER = "\nCOMMIT;\n"

def up_block(t: str) -> str:
    return f"""
-- ===== {t} =====
ALTER TABLE {t} ENABLE ROW LEVEL SECURITY;
ALTER TABLE {t} FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_{t}_tenant_isolation ON {t};
CREATE POLICY rls_{t}_tenant_isolation ON {t}
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);
"""

def down_block(t: str) -> str:
    return f"""DROP POLICY IF EXISTS rls_{t}_tenant_isolation ON {t};
ALTER TABLE {t} DISABLE ROW LEVEL SECURITY;
ALTER TABLE {t} NO FORCE ROW LEVEL SECURITY;
"""

def main():
    out_dir = Path("migrations")
    up_path = out_dir / "p1_11_wave20_force_rls_60_empty_up.sql"
    down_path = out_dir / "p1_11_wave20_force_rls_60_empty_down.sql"

    up_sql = UP_HEADER + "".join(up_block(t) for t in TABLES) + UP_FOOTER
    down_sql = DOWN_HEADER + "\nDO $$\nBEGIN\n" + "".join(down_block(t) for t in TABLES) + "END $$;\n" + DOWN_FOOTER

    up_path.write_text(up_sql, encoding="utf-8")
    down_path.write_text(down_sql, encoding="utf-8")

    print(f"Wrote {up_path} ({len(up_sql)} bytes, {len(TABLES)} tables)")
    print(f"Wrote {down_path} ({len(down_sql)} bytes)")

if __name__ == "__main__":
    main()
