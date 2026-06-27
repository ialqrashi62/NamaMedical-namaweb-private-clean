-- ex_03_tenant_id_indexes_validate.sql  (run AFTER ex_03_tenant_id_indexes_up.sql; read-only)
-- PASS = every targeted tenant_id index exists AND is valid (not a failed CONCURRENTLY remnant).

-- 1) total count of idx_*_tenant_id indexes created by this migration set (expect 92 = 88 prepared + 4 E-X)
SELECT count(*)::int AS tenant_id_indexes_present
FROM pg_indexes
WHERE indexname LIKE 'idx\_%\_tenant_id' ESCAPE '\'
  AND indexname IN (
    'idx_orders_tenant_id','idx_order_items_tenant_id','idx_order_sets_tenant_id','idx_role_permissions_tenant_id',
    'idx_admission_daily_rounds_tenant_id','idx_branches_tenant_id','idx_cme_activities_tenant_id','idx_cme_events_tenant_id',
    'idx_cme_registrations_tenant_id','idx_company_settings_tenant_id','idx_cosmetic_cases_tenant_id','idx_cosmetic_consents_tenant_id',
    'idx_cosmetic_followups_tenant_id','idx_cosmetic_photos_tenant_id','idx_cssd_batches_tenant_id','idx_cssd_instrument_sets_tenant_id',
    'idx_cssd_load_items_tenant_id','idx_cssd_sterilization_cycles_tenant_id','idx_departments_tenant_id','idx_discount_rules_tenant_id',
    'idx_doctor_inventory_request_items_tenant_id','idx_doctor_inventory_requests_tenant_id','idx_emergency_beds_tenant_id',
    'idx_emergency_trauma_assessments_tenant_id','idx_employee_exposures_tenant_id','idx_employees_tenant_id','idx_facilities_tenant_id',
    'idx_finance_cost_centers_tenant_id','idx_finance_doctor_commissions_tenant_id','idx_finance_fiscal_years_tenant_id',
    'idx_finance_tax_declarations_tenant_id','idx_finance_vouchers_tenant_id','idx_form_templates_tenant_id','idx_hand_hygiene_audits_tenant_id',
    'idx_hr_advances_tenant_id','idx_hr_attendance_tenant_id','idx_hr_employee_custody_tenant_id','idx_hr_employee_documents_tenant_id',
    'idx_hr_leaves_tenant_id','idx_hr_salaries_tenant_id','idx_infection_control_reports_tenant_id','idx_infection_outbreaks_tenant_id',
    'idx_infection_surveillance_tenant_id','idx_insurance_companies_tenant_id','idx_insurance_contracts_tenant_id','idx_insurance_policies_tenant_id',
    'idx_integration_settings_tenant_id','idx_inventory_tenant_id','idx_inventory_dept_request_items_tenant_id','idx_inventory_dept_requests_tenant_id',
    'idx_inventory_issue_items_tenant_id','idx_inventory_issue_to_dept_tenant_id','idx_inventory_items_tenant_id',
    'idx_inventory_opening_balances_tenant_id','idx_inventory_purchase_items_tenant_id','idx_inventory_purchases_tenant_id',
    'idx_inventory_stock_count_tenant_id','idx_invoices_tenant_id','idx_maintenance_equipment_tenant_id','idx_maintenance_orders_tenant_id',
    'idx_maintenance_pm_schedules_tenant_id','idx_maintenance_work_orders_tenant_id','idx_medical_reports_tenant_id','idx_mortuary_cases_tenant_id',
    'idx_obgyn_deliveries_tenant_id','idx_obgyn_pregnancies_tenant_id','idx_online_bookings_tenant_id','idx_operating_rooms_tenant_id',
    'idx_pathology_cases_tenant_id','idx_pathology_specimens_tenant_id','idx_patients_tenant_id','idx_pharmacy_drug_catalog_tenant_id',
    'idx_pharmacy_opening_balances_tenant_id','idx_pharmacy_prescriptions_tenant_id','idx_pharmacy_purchase_items_tenant_id',
    'idx_pharmacy_purchase_orders_tenant_id','idx_pharmacy_sale_items_tenant_id','idx_pharmacy_sales_tenant_id','idx_pharmacy_suppliers_tenant_id',
    'idx_portal_appointments_tenant_id','idx_quality_incidents_tenant_id','idx_quality_kpis_tenant_id','idx_quality_patient_satisfaction_tenant_id',
    'idx_queue_advertisements_tenant_id','idx_referrals_tenant_id','idx_social_work_cases_tenant_id','idx_surgery_anesthesia_records_tenant_id',
    'idx_surgery_preop_assessments_tenant_id','idx_surgery_preop_tests_tenant_id','idx_telemedicine_sessions_tenant_id',
    'idx_transport_requests_tenant_id','idx_visit_lifecycle_tenant_id'
  );

-- 2) any INVALID indexes left behind by a failed CONCURRENTLY build (expect 0)
SELECT count(*)::int AS invalid_tenant_id_indexes
FROM pg_index i
JOIN pg_class c ON c.oid = i.indexrelid
WHERE NOT i.indisvalid
  AND c.relname LIKE 'idx\_%\_tenant_id' ESCAPE '\';
