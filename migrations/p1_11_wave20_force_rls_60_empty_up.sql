-- ============================================================
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

-- ===== cardiology_cath_reports =====
ALTER TABLE cardiology_cath_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE cardiology_cath_reports FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_cardiology_cath_reports_tenant_isolation ON cardiology_cath_reports;
CREATE POLICY rls_cardiology_cath_reports_tenant_isolation ON cardiology_cath_reports
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- ===== clinical_incidents =====
ALTER TABLE clinical_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinical_incidents FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_clinical_incidents_tenant_isolation ON clinical_incidents;
CREATE POLICY rls_clinical_incidents_tenant_isolation ON clinical_incidents
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- ===== cosmetic_cases =====
ALTER TABLE cosmetic_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE cosmetic_cases FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_cosmetic_cases_tenant_isolation ON cosmetic_cases;
CREATE POLICY rls_cosmetic_cases_tenant_isolation ON cosmetic_cases
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- ===== cosmetic_consents =====
ALTER TABLE cosmetic_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE cosmetic_consents FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_cosmetic_consents_tenant_isolation ON cosmetic_consents;
CREATE POLICY rls_cosmetic_consents_tenant_isolation ON cosmetic_consents
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- ===== cosmetic_followups =====
ALTER TABLE cosmetic_followups ENABLE ROW LEVEL SECURITY;
ALTER TABLE cosmetic_followups FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_cosmetic_followups_tenant_isolation ON cosmetic_followups;
CREATE POLICY rls_cosmetic_followups_tenant_isolation ON cosmetic_followups
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- ===== cosmetic_photos =====
ALTER TABLE cosmetic_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE cosmetic_photos FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_cosmetic_photos_tenant_isolation ON cosmetic_photos;
CREATE POLICY rls_cosmetic_photos_tenant_isolation ON cosmetic_photos
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- ===== dental_images =====
ALTER TABLE dental_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE dental_images FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_dental_images_tenant_isolation ON dental_images;
CREATE POLICY rls_dental_images_tenant_isolation ON dental_images
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- ===== dental_periodontal_exams =====
ALTER TABLE dental_periodontal_exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE dental_periodontal_exams FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_dental_periodontal_exams_tenant_isolation ON dental_periodontal_exams;
CREATE POLICY rls_dental_periodontal_exams_tenant_isolation ON dental_periodontal_exams
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- ===== doctor_inventory_request_items =====
ALTER TABLE doctor_inventory_request_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE doctor_inventory_request_items FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_doctor_inventory_request_items_tenant_isolation ON doctor_inventory_request_items;
CREATE POLICY rls_doctor_inventory_request_items_tenant_isolation ON doctor_inventory_request_items
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- ===== doctor_inventory_requests =====
ALTER TABLE doctor_inventory_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE doctor_inventory_requests FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_doctor_inventory_requests_tenant_isolation ON doctor_inventory_requests;
CREATE POLICY rls_doctor_inventory_requests_tenant_isolation ON doctor_inventory_requests
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- ===== emar_administrations =====
ALTER TABLE emar_administrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE emar_administrations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_emar_administrations_tenant_isolation ON emar_administrations;
CREATE POLICY rls_emar_administrations_tenant_isolation ON emar_administrations
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- ===== emar_orders =====
ALTER TABLE emar_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE emar_orders FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_emar_orders_tenant_isolation ON emar_orders;
CREATE POLICY rls_emar_orders_tenant_isolation ON emar_orders
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- ===== employee_exposures =====
ALTER TABLE employee_exposures ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_exposures FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_employee_exposures_tenant_isolation ON employee_exposures;
CREATE POLICY rls_employee_exposures_tenant_isolation ON employee_exposures
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- ===== finance_report_snapshots =====
ALTER TABLE finance_report_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_report_snapshots FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_finance_report_snapshots_tenant_isolation ON finance_report_snapshots;
CREATE POLICY rls_finance_report_snapshots_tenant_isolation ON finance_report_snapshots
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- ===== finance_tax_declarations =====
ALTER TABLE finance_tax_declarations ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_tax_declarations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_finance_tax_declarations_tenant_isolation ON finance_tax_declarations;
CREATE POLICY rls_finance_tax_declarations_tenant_isolation ON finance_tax_declarations
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- ===== hand_hygiene_audits =====
ALTER TABLE hand_hygiene_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE hand_hygiene_audits FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_hand_hygiene_audits_tenant_isolation ON hand_hygiene_audits;
CREATE POLICY rls_hand_hygiene_audits_tenant_isolation ON hand_hygiene_audits
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- ===== hr_advances =====
ALTER TABLE hr_advances ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_advances FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_hr_advances_tenant_isolation ON hr_advances;
CREATE POLICY rls_hr_advances_tenant_isolation ON hr_advances
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- ===== hr_attendance =====
ALTER TABLE hr_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_attendance FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_hr_attendance_tenant_isolation ON hr_attendance;
CREATE POLICY rls_hr_attendance_tenant_isolation ON hr_attendance
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- ===== hr_credentialing =====
ALTER TABLE hr_credentialing ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_credentialing FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_hr_credentialing_tenant_isolation ON hr_credentialing;
CREATE POLICY rls_hr_credentialing_tenant_isolation ON hr_credentialing
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- ===== hr_employee_custody =====
ALTER TABLE hr_employee_custody ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_employee_custody FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_hr_employee_custody_tenant_isolation ON hr_employee_custody;
CREATE POLICY rls_hr_employee_custody_tenant_isolation ON hr_employee_custody
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- ===== hr_employee_documents =====
ALTER TABLE hr_employee_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_employee_documents FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_hr_employee_documents_tenant_isolation ON hr_employee_documents;
CREATE POLICY rls_hr_employee_documents_tenant_isolation ON hr_employee_documents
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- ===== hr_leaves =====
ALTER TABLE hr_leaves ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_leaves FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_hr_leaves_tenant_isolation ON hr_leaves;
CREATE POLICY rls_hr_leaves_tenant_isolation ON hr_leaves
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- ===== hr_nitaqat_records =====
ALTER TABLE hr_nitaqat_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_nitaqat_records FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_hr_nitaqat_records_tenant_isolation ON hr_nitaqat_records;
CREATE POLICY rls_hr_nitaqat_records_tenant_isolation ON hr_nitaqat_records
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- ===== icu_daily_goals =====
ALTER TABLE icu_daily_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE icu_daily_goals FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_icu_daily_goals_tenant_isolation ON icu_daily_goals;
CREATE POLICY rls_icu_daily_goals_tenant_isolation ON icu_daily_goals
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- ===== incident_reports =====
ALTER TABLE incident_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE incident_reports FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_incident_reports_tenant_isolation ON incident_reports;
CREATE POLICY rls_incident_reports_tenant_isolation ON incident_reports
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- ===== infection_outbreaks =====
ALTER TABLE infection_outbreaks ENABLE ROW LEVEL SECURITY;
ALTER TABLE infection_outbreaks FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_infection_outbreaks_tenant_isolation ON infection_outbreaks;
CREATE POLICY rls_infection_outbreaks_tenant_isolation ON infection_outbreaks
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- ===== infection_surveillance =====
ALTER TABLE infection_surveillance ENABLE ROW LEVEL SECURITY;
ALTER TABLE infection_surveillance FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_infection_surveillance_tenant_isolation ON infection_surveillance;
CREATE POLICY rls_infection_surveillance_tenant_isolation ON infection_surveillance
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- ===== inventory =====
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_inventory_tenant_isolation ON inventory;
CREATE POLICY rls_inventory_tenant_isolation ON inventory
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- ===== inventory_dept_request_items =====
ALTER TABLE inventory_dept_request_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_dept_request_items FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_inventory_dept_request_items_tenant_isolation ON inventory_dept_request_items;
CREATE POLICY rls_inventory_dept_request_items_tenant_isolation ON inventory_dept_request_items
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- ===== inventory_dept_requests =====
ALTER TABLE inventory_dept_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_dept_requests FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_inventory_dept_requests_tenant_isolation ON inventory_dept_requests;
CREATE POLICY rls_inventory_dept_requests_tenant_isolation ON inventory_dept_requests
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- ===== inventory_issue_items =====
ALTER TABLE inventory_issue_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_issue_items FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_inventory_issue_items_tenant_isolation ON inventory_issue_items;
CREATE POLICY rls_inventory_issue_items_tenant_isolation ON inventory_issue_items
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- ===== inventory_issue_to_dept =====
ALTER TABLE inventory_issue_to_dept ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_issue_to_dept FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_inventory_issue_to_dept_tenant_isolation ON inventory_issue_to_dept;
CREATE POLICY rls_inventory_issue_to_dept_tenant_isolation ON inventory_issue_to_dept
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- ===== inventory_opening_balances =====
ALTER TABLE inventory_opening_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_opening_balances FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_inventory_opening_balances_tenant_isolation ON inventory_opening_balances;
CREATE POLICY rls_inventory_opening_balances_tenant_isolation ON inventory_opening_balances
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- ===== inventory_purchase_items =====
ALTER TABLE inventory_purchase_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_purchase_items FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_inventory_purchase_items_tenant_isolation ON inventory_purchase_items;
CREATE POLICY rls_inventory_purchase_items_tenant_isolation ON inventory_purchase_items
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- ===== inventory_purchases =====
ALTER TABLE inventory_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_purchases FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_inventory_purchases_tenant_isolation ON inventory_purchases;
CREATE POLICY rls_inventory_purchases_tenant_isolation ON inventory_purchases
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- ===== inventory_stock_count =====
ALTER TABLE inventory_stock_count ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_stock_count FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_inventory_stock_count_tenant_isolation ON inventory_stock_count;
CREATE POLICY rls_inventory_stock_count_tenant_isolation ON inventory_stock_count
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- ===== lab_loinc_codes =====
ALTER TABLE lab_loinc_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_loinc_codes FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_lab_loinc_codes_tenant_isolation ON lab_loinc_codes;
CREATE POLICY rls_lab_loinc_codes_tenant_isolation ON lab_loinc_codes
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- ===== lab_microbiology =====
ALTER TABLE lab_microbiology ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_microbiology FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_lab_microbiology_tenant_isolation ON lab_microbiology;
CREATE POLICY rls_lab_microbiology_tenant_isolation ON lab_microbiology
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- ===== maintenance_equipment =====
ALTER TABLE maintenance_equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_equipment FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_maintenance_equipment_tenant_isolation ON maintenance_equipment;
CREATE POLICY rls_maintenance_equipment_tenant_isolation ON maintenance_equipment
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- ===== maintenance_pm_schedules =====
ALTER TABLE maintenance_pm_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_pm_schedules FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_maintenance_pm_schedules_tenant_isolation ON maintenance_pm_schedules;
CREATE POLICY rls_maintenance_pm_schedules_tenant_isolation ON maintenance_pm_schedules
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- ===== maintenance_work_orders =====
ALTER TABLE maintenance_work_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_work_orders FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_maintenance_work_orders_tenant_isolation ON maintenance_work_orders;
CREATE POLICY rls_maintenance_work_orders_tenant_isolation ON maintenance_work_orders
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- ===== medical_certificates =====
ALTER TABLE medical_certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE medical_certificates FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_medical_certificates_tenant_isolation ON medical_certificates;
CREATE POLICY rls_medical_certificates_tenant_isolation ON medical_certificates
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- ===== medication_reconciliations =====
ALTER TABLE medication_reconciliations ENABLE ROW LEVEL SECURITY;
ALTER TABLE medication_reconciliations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_medication_reconciliations_tenant_isolation ON medication_reconciliations;
CREATE POLICY rls_medication_reconciliations_tenant_isolation ON medication_reconciliations
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- ===== mortuary_cases =====
ALTER TABLE mortuary_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE mortuary_cases FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_mortuary_cases_tenant_isolation ON mortuary_cases;
CREATE POLICY rls_mortuary_cases_tenant_isolation ON mortuary_cases
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- ===== nphies_claim_status_inquiry =====
ALTER TABLE nphies_claim_status_inquiry ENABLE ROW LEVEL SECURITY;
ALTER TABLE nphies_claim_status_inquiry FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_nphies_claim_status_inquiry_tenant_isolation ON nphies_claim_status_inquiry;
CREATE POLICY rls_nphies_claim_status_inquiry_tenant_isolation ON nphies_claim_status_inquiry
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- ===== nphies_remittance_advice =====
ALTER TABLE nphies_remittance_advice ENABLE ROW LEVEL SECURITY;
ALTER TABLE nphies_remittance_advice FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_nphies_remittance_advice_tenant_isolation ON nphies_remittance_advice;
CREATE POLICY rls_nphies_remittance_advice_tenant_isolation ON nphies_remittance_advice
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- ===== pediatric_immunizations =====
ALTER TABLE pediatric_immunizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE pediatric_immunizations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_pediatric_immunizations_tenant_isolation ON pediatric_immunizations;
CREATE POLICY rls_pediatric_immunizations_tenant_isolation ON pediatric_immunizations
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- ===== pharmacy_opening_balances =====
ALTER TABLE pharmacy_opening_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE pharmacy_opening_balances FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_pharmacy_opening_balances_tenant_isolation ON pharmacy_opening_balances;
CREATE POLICY rls_pharmacy_opening_balances_tenant_isolation ON pharmacy_opening_balances
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- ===== pharmacy_purchase_items =====
ALTER TABLE pharmacy_purchase_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE pharmacy_purchase_items FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_pharmacy_purchase_items_tenant_isolation ON pharmacy_purchase_items;
CREATE POLICY rls_pharmacy_purchase_items_tenant_isolation ON pharmacy_purchase_items
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- ===== pharmacy_purchase_orders =====
ALTER TABLE pharmacy_purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE pharmacy_purchase_orders FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_pharmacy_purchase_orders_tenant_isolation ON pharmacy_purchase_orders;
CREATE POLICY rls_pharmacy_purchase_orders_tenant_isolation ON pharmacy_purchase_orders
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- ===== pharmacy_suppliers =====
ALTER TABLE pharmacy_suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE pharmacy_suppliers FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_pharmacy_suppliers_tenant_isolation ON pharmacy_suppliers;
CREATE POLICY rls_pharmacy_suppliers_tenant_isolation ON pharmacy_suppliers
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- ===== quality_incidents =====
ALTER TABLE quality_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE quality_incidents FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_quality_incidents_tenant_isolation ON quality_incidents;
CREATE POLICY rls_quality_incidents_tenant_isolation ON quality_incidents
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- ===== quality_kpis =====
ALTER TABLE quality_kpis ENABLE ROW LEVEL SECURITY;
ALTER TABLE quality_kpis FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_quality_kpis_tenant_isolation ON quality_kpis;
CREATE POLICY rls_quality_kpis_tenant_isolation ON quality_kpis
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- ===== quality_patient_satisfaction =====
ALTER TABLE quality_patient_satisfaction ENABLE ROW LEVEL SECURITY;
ALTER TABLE quality_patient_satisfaction FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_quality_patient_satisfaction_tenant_isolation ON quality_patient_satisfaction;
CREATE POLICY rls_quality_patient_satisfaction_tenant_isolation ON quality_patient_satisfaction
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- ===== queue_advertisements =====
ALTER TABLE queue_advertisements ENABLE ROW LEVEL SECURITY;
ALTER TABLE queue_advertisements FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_queue_advertisements_tenant_isolation ON queue_advertisements;
CREATE POLICY rls_queue_advertisements_tenant_isolation ON queue_advertisements
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- ===== social_work_cases =====
ALTER TABLE social_work_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_work_cases FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_social_work_cases_tenant_isolation ON social_work_cases;
CREATE POLICY rls_social_work_cases_tenant_isolation ON social_work_cases
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- ===== tenant_settings =====
ALTER TABLE tenant_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_settings FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_tenant_settings_tenant_isolation ON tenant_settings;
CREATE POLICY rls_tenant_settings_tenant_isolation ON tenant_settings
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- ===== transport_requests =====
ALTER TABLE transport_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE transport_requests FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_transport_requests_tenant_isolation ON transport_requests;
CREATE POLICY rls_transport_requests_tenant_isolation ON transport_requests
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- ===== vendors =====
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendors FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_vendors_tenant_isolation ON vendors;
CREATE POLICY rls_vendors_tenant_isolation ON vendors
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- ===== zatca_credit_notes =====
ALTER TABLE zatca_credit_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE zatca_credit_notes FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_zatca_credit_notes_tenant_isolation ON zatca_credit_notes;
CREATE POLICY rls_zatca_credit_notes_tenant_isolation ON zatca_credit_notes
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

COMMIT;
