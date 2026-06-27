-- ============================================================
-- ex_03_tenant_id_indexes_up.sql
-- E-X2 TENANT_ID INDEXES — foundational migration (3 of group EX).
-- CANDIDATE ONLY — DO NOT EXECUTE ON PRODUCTION WITHOUT EXPLICIT DDL APPROVAL (DB gate).
--
-- الهدف: إضافة فهرس tenant_id لكل جدول FORCE-RLS مرتبط بمستأجر لا يملك فهرساً (الفجوة ~59/147).
--   يجمع هذا الملف:
--     (أ) 88 جدولاً صغيراً/فارغاً مُعدّاً مسبقاً في docs/sql/tenant_id_index_candidate_up.sql (المصدر).
--     (ب) جداول E-X الجديدة: orders, order_items, order_sets, role_permissions.
--   (الجداول الأخرى ~59 لديها بالفعل فهارس مركبة (tenant_id, facility_id, ...) أُنشئت inline في db_postgres.js.)
--
-- ⚠️ CONCURRENTLY لا يمكن تشغيله داخل كتلة معاملة (BEGIN/COMMIT) — لا تُغلّف هذا الملف بمعاملة.
--   كل عبارة idempotent عبر IF NOT EXISTS. إن فشلت CONCURRENTLY (مثلاً قفل سابق) فهرس INVALID قد يبقى؛
--   استخدم النسخة العادية أدناه (المُعلّقة) إن لزم تشغيل ضمن معاملة لمالك الجدول.
-- ============================================================

-- ---------- E-X1 / E-X3 net-new tables (created by ex_01 / ex_02; idempotent here) ----------
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_tenant_id ON "orders" (tenant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_order_items_tenant_id ON "order_items" (tenant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_order_sets_tenant_id ON "order_sets" (tenant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_role_permissions_tenant_id ON "role_permissions" (tenant_id);

-- ---------- 88 prepared FORCE-RLS tables still missing a tenant_id index ----------
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_admission_daily_rounds_tenant_id ON "admission_daily_rounds" (tenant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_branches_tenant_id ON "branches" (tenant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cme_activities_tenant_id ON "cme_activities" (tenant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cme_events_tenant_id ON "cme_events" (tenant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cme_registrations_tenant_id ON "cme_registrations" (tenant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_company_settings_tenant_id ON "company_settings" (tenant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cosmetic_cases_tenant_id ON "cosmetic_cases" (tenant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cosmetic_consents_tenant_id ON "cosmetic_consents" (tenant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cosmetic_followups_tenant_id ON "cosmetic_followups" (tenant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cosmetic_photos_tenant_id ON "cosmetic_photos" (tenant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cssd_batches_tenant_id ON "cssd_batches" (tenant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cssd_instrument_sets_tenant_id ON "cssd_instrument_sets" (tenant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cssd_load_items_tenant_id ON "cssd_load_items" (tenant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cssd_sterilization_cycles_tenant_id ON "cssd_sterilization_cycles" (tenant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_departments_tenant_id ON "departments" (tenant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_discount_rules_tenant_id ON "discount_rules" (tenant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_doctor_inventory_request_items_tenant_id ON "doctor_inventory_request_items" (tenant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_doctor_inventory_requests_tenant_id ON "doctor_inventory_requests" (tenant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_emergency_beds_tenant_id ON "emergency_beds" (tenant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_emergency_trauma_assessments_tenant_id ON "emergency_trauma_assessments" (tenant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_employee_exposures_tenant_id ON "employee_exposures" (tenant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_employees_tenant_id ON "employees" (tenant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_facilities_tenant_id ON "facilities" (tenant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_finance_cost_centers_tenant_id ON "finance_cost_centers" (tenant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_finance_doctor_commissions_tenant_id ON "finance_doctor_commissions" (tenant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_finance_fiscal_years_tenant_id ON "finance_fiscal_years" (tenant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_finance_tax_declarations_tenant_id ON "finance_tax_declarations" (tenant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_finance_vouchers_tenant_id ON "finance_vouchers" (tenant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_form_templates_tenant_id ON "form_templates" (tenant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_hand_hygiene_audits_tenant_id ON "hand_hygiene_audits" (tenant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_hr_advances_tenant_id ON "hr_advances" (tenant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_hr_attendance_tenant_id ON "hr_attendance" (tenant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_hr_employee_custody_tenant_id ON "hr_employee_custody" (tenant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_hr_employee_documents_tenant_id ON "hr_employee_documents" (tenant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_hr_leaves_tenant_id ON "hr_leaves" (tenant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_hr_salaries_tenant_id ON "hr_salaries" (tenant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_infection_control_reports_tenant_id ON "infection_control_reports" (tenant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_infection_outbreaks_tenant_id ON "infection_outbreaks" (tenant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_infection_surveillance_tenant_id ON "infection_surveillance" (tenant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_insurance_companies_tenant_id ON "insurance_companies" (tenant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_insurance_contracts_tenant_id ON "insurance_contracts" (tenant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_insurance_policies_tenant_id ON "insurance_policies" (tenant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_integration_settings_tenant_id ON "integration_settings" (tenant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_inventory_tenant_id ON "inventory" (tenant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_inventory_dept_request_items_tenant_id ON "inventory_dept_request_items" (tenant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_inventory_dept_requests_tenant_id ON "inventory_dept_requests" (tenant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_inventory_issue_items_tenant_id ON "inventory_issue_items" (tenant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_inventory_issue_to_dept_tenant_id ON "inventory_issue_to_dept" (tenant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_inventory_items_tenant_id ON "inventory_items" (tenant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_inventory_opening_balances_tenant_id ON "inventory_opening_balances" (tenant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_inventory_purchase_items_tenant_id ON "inventory_purchase_items" (tenant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_inventory_purchases_tenant_id ON "inventory_purchases" (tenant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_inventory_stock_count_tenant_id ON "inventory_stock_count" (tenant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_invoices_tenant_id ON "invoices" (tenant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_maintenance_equipment_tenant_id ON "maintenance_equipment" (tenant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_maintenance_orders_tenant_id ON "maintenance_orders" (tenant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_maintenance_pm_schedules_tenant_id ON "maintenance_pm_schedules" (tenant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_maintenance_work_orders_tenant_id ON "maintenance_work_orders" (tenant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_medical_reports_tenant_id ON "medical_reports" (tenant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mortuary_cases_tenant_id ON "mortuary_cases" (tenant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_obgyn_deliveries_tenant_id ON "obgyn_deliveries" (tenant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_obgyn_pregnancies_tenant_id ON "obgyn_pregnancies" (tenant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_online_bookings_tenant_id ON "online_bookings" (tenant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_operating_rooms_tenant_id ON "operating_rooms" (tenant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pathology_cases_tenant_id ON "pathology_cases" (tenant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pathology_specimens_tenant_id ON "pathology_specimens" (tenant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_patients_tenant_id ON "patients" (tenant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pharmacy_drug_catalog_tenant_id ON "pharmacy_drug_catalog" (tenant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pharmacy_opening_balances_tenant_id ON "pharmacy_opening_balances" (tenant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pharmacy_prescriptions_tenant_id ON "pharmacy_prescriptions" (tenant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pharmacy_purchase_items_tenant_id ON "pharmacy_purchase_items" (tenant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pharmacy_purchase_orders_tenant_id ON "pharmacy_purchase_orders" (tenant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pharmacy_sale_items_tenant_id ON "pharmacy_sale_items" (tenant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pharmacy_sales_tenant_id ON "pharmacy_sales" (tenant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pharmacy_suppliers_tenant_id ON "pharmacy_suppliers" (tenant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_portal_appointments_tenant_id ON "portal_appointments" (tenant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_quality_incidents_tenant_id ON "quality_incidents" (tenant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_quality_kpis_tenant_id ON "quality_kpis" (tenant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_quality_patient_satisfaction_tenant_id ON "quality_patient_satisfaction" (tenant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_queue_advertisements_tenant_id ON "queue_advertisements" (tenant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_referrals_tenant_id ON "referrals" (tenant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_social_work_cases_tenant_id ON "social_work_cases" (tenant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_surgery_anesthesia_records_tenant_id ON "surgery_anesthesia_records" (tenant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_surgery_preop_assessments_tenant_id ON "surgery_preop_assessments" (tenant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_surgery_preop_tests_tenant_id ON "surgery_preop_tests" (tenant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_telemedicine_sessions_tenant_id ON "telemedicine_sessions" (tenant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transport_requests_tenant_id ON "transport_requests" (tenant_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_visit_lifecycle_tenant_id ON "visit_lifecycle" (tenant_id);
