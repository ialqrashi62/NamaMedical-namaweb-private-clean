-- e50_clinical_rls_candidate_validate.sql — post-apply validation for the e50 candidate.
DO $$
DECLARE
    forced BOOLEAN;
BEGIN
    -- 1. patient_clinical_records FORCE RLS + policy + FK
    SELECT relforcerowsecurity INTO forced FROM pg_class WHERE relname = 'patient_clinical_records';
    IF forced IS NOT TRUE THEN
        RAISE EXCEPTION 'e50 validate: FORCE RLS not enabled on patient_clinical_records';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'patient_clinical_records' AND policyname = 'rls_patient_clinical_records') THEN
        RAISE EXCEPTION 'e50 validate: policy missing on patient_clinical_records';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE table_name = 'patient_clinical_records' AND constraint_name = 'fk_pcr_tenant') THEN
        RAISE EXCEPTION 'e50 validate: FK fk_pcr_tenant missing';
    END IF;

    -- 2. clinical_templates FORCE RLS + tenant_id NOT NULL
    SELECT relforcerowsecurity INTO forced FROM pg_class WHERE relname = 'clinical_templates';
    IF forced IS NOT TRUE THEN
        RAISE EXCEPTION 'e50 validate: FORCE RLS not enabled on clinical_templates';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clinical_templates' AND column_name = 'tenant_id' AND is_nullable = 'YES') THEN
        RAISE EXCEPTION 'e50 validate: clinical_templates.tenant_id must be NOT NULL';
    END IF;

    -- 4. clinical_departments per-tenant unique
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'clinical_departments'::regclass AND conname = 'uq_clinical_dept_tenant_code') THEN
        RAISE EXCEPTION 'e50 validate: uq_clinical_dept_tenant_code missing';
    END IF;
    IF EXISTS (
        SELECT 1 FROM pg_constraint c
        WHERE c.conrelid = 'clinical_departments'::regclass AND c.contype = 'u'
          AND pg_get_constraintdef(c.oid) = 'UNIQUE (code)'
    ) THEN
        RAISE EXCEPTION 'e50 validate: global UNIQUE(code) still present — should be per-tenant';
    END IF;

    RAISE NOTICE 'e50 validate OK';
END $$;
