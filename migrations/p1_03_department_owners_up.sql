-- p1_03_department_owners_up.sql
-- Step 1: Add owner_role column to clinical_departments table with a default of 'CMO'
ALTER TABLE clinical_departments ADD COLUMN IF NOT EXISTS owner_role VARCHAR(50) NOT NULL DEFAULT 'CMO';

-- Step 2: Update existing clinical departments to their default executive owners
-- CMO: Clinical & Medical (e.g. Cardiology, Pediatrics, Internal Medicine, OB/GYN, Pathology, ICU)
-- CNO: Nursing & Inpatient (e.g. Wards, Nursing triage, ADT)
-- COO: Operations & Auxiliary (e.g. Patient Transport, CSSD, Emergency beds)
-- CFO: Finance & Billing (e.g. Invoices, Accounts, Reception/Cashier)
-- CIO: IT & Systems (e.g. Settings, Admin, Clinical templates)

UPDATE clinical_departments 
SET owner_role = 'CNO'
WHERE code IN ('WARDS', 'NURSING', 'INPATIENT', 'ADT', 'MATERNITY', 'OB_GYN');

UPDATE clinical_departments 
SET owner_role = 'COO'
WHERE code IN ('TRANSPORT', 'CSSD', 'EMERGENCY', 'OR', 'SURGERY', 'ANESTHESIA');

UPDATE clinical_departments 
SET owner_role = 'CFO'
WHERE code IN ('FINANCE', 'BILLING', 'RECEPTION', 'ACCOUNTS', 'PHARMACY');

UPDATE clinical_departments 
SET owner_role = 'CIO'
WHERE code IN ('IT', 'SETTINGS', 'ADMIN');
