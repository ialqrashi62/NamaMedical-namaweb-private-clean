-- e50_clinical_rls_candidate_down.sql — rollback for the e50 candidate.
-- Removes the RLS policies and the added constraints/columns. Dropping RLS RE-OPENS
-- cross-tenant access to PHI (patient_clinical_records) — only run deliberately in a
-- controlled window. tenant_id columns are dropped last (data-losing on those columns).

BEGIN;

-- 4. restore global unique on clinical_departments.code
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'clinical_departments'::regclass AND conname = 'uq_clinical_dept_tenant_code') THEN
        ALTER TABLE clinical_departments DROP CONSTRAINT uq_clinical_dept_tenant_code;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint c
        WHERE c.conrelid = 'clinical_departments'::regclass AND c.contype = 'u'
          AND pg_get_constraintdef(c.oid) = 'UNIQUE (code)'
    ) THEN
        ALTER TABLE clinical_departments ADD CONSTRAINT clinical_departments_code_key UNIQUE (code);
    END IF;
END $$;

-- 3. clinical_knowledge_vectors
DO $$
BEGIN
    IF to_regclass('public.clinical_knowledge_vectors') IS NOT NULL THEN
        DROP POLICY IF EXISTS rls_clinical_knowledge_vectors ON clinical_knowledge_vectors;
        ALTER TABLE clinical_knowledge_vectors NO FORCE ROW LEVEL SECURITY;
        ALTER TABLE clinical_knowledge_vectors DISABLE ROW LEVEL SECURITY;
        ALTER TABLE clinical_knowledge_vectors DROP COLUMN IF EXISTS tenant_id;
    END IF;
END $$;

-- 2. clinical_templates
DROP POLICY IF EXISTS rls_clinical_templates ON clinical_templates;
ALTER TABLE clinical_templates NO FORCE ROW LEVEL SECURITY;
ALTER TABLE clinical_templates DISABLE ROW LEVEL SECURITY;
ALTER TABLE clinical_templates DROP CONSTRAINT IF EXISTS fk_ct_tenant;
ALTER TABLE clinical_templates DROP COLUMN IF EXISTS tenant_id;

-- 1. patient_clinical_records
DROP POLICY IF EXISTS rls_patient_clinical_records ON patient_clinical_records;
ALTER TABLE patient_clinical_records NO FORCE ROW LEVEL SECURITY;
ALTER TABLE patient_clinical_records DISABLE ROW LEVEL SECURITY;
ALTER TABLE patient_clinical_records DROP CONSTRAINT IF EXISTS fk_pcr_tenant;

COMMIT;
