-- e50_clinical_rls_candidate_up.sql — CANDIDATE, NOT RUN (requires owner DDL approval).
-- Gate 5 (Wave 2 isolation): close the remaining e21 clinical-metadata isolation gaps.
--
-- Findings (from Gate 0 + Gate 5 code read):
--   1. patient_clinical_records HOLDS PHI (recorded_values JSONB) but has NO RLS and no FK
--      to tenants — app-layer WHERE tenant_id=$ is the only guard (no DB backstop).
--   2. clinical_templates has NO tenant_id and NO RLS (isolation only transitive via the
--      RLS-protected clinical_departments; direct dept_id reads were unguarded until the
--      Gate 5 code fix added a JOIN).
--   3. clinical_knowledge_vectors (RAG chunks) has NO tenant_id and NO RLS.
--   4. clinical_departments.code is GLOBALLY UNIQUE, so `ON CONFLICT (code)` (server.js
--      POST /api/clinical/departments) collides across tenants — two tenants cannot both
--      own 'CARDIOLOGY'. Correct constraint is UNIQUE (tenant_id, code).
--
-- This migration is idempotent and additive. It BACKFILLS tenant_id where the column is
-- newly added: clinical_templates/knowledge_vectors inherit tenant_id from their parent
-- department (which is already tenant-scoped). Rows whose parent tenant is unresolved are
-- left NULL and the NOT NULL / FK steps are guarded so the migration fails loudly rather
-- than silently mis-assigning PHI/metadata to tenant 1.
--
-- ORDER OF OPERATIONS matters: run this DDL FIRST, THEN flip server.js
-- POST /api/clinical/departments to `ON CONFLICT (tenant_id, code)` (coupled code change,
-- documented in the Gate 5 report — do NOT flip the code before this lands).

BEGIN;

-- ---------- 1. patient_clinical_records: FK + FORCE RLS (PHI) ----------
DO $$
BEGIN
    IF to_regclass('public.patient_clinical_records') IS NOT NULL THEN
        -- FK to tenants (only if every tenant_id already resolves — else the ADD fails loudly)
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints
            WHERE table_name = 'patient_clinical_records' AND constraint_type = 'FOREIGN KEY'
              AND constraint_name = 'fk_pcr_tenant'
        ) THEN
            ALTER TABLE patient_clinical_records
                ADD CONSTRAINT fk_pcr_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
        END IF;
    END IF;
END $$;

ALTER TABLE patient_clinical_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_clinical_records FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_patient_clinical_records ON patient_clinical_records;
CREATE POLICY rls_patient_clinical_records ON patient_clinical_records
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);

-- ---------- 2. clinical_templates: add tenant_id (backfill from dept) + FORCE RLS ----------
ALTER TABLE clinical_templates ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
UPDATE clinical_templates t
   SET tenant_id = d.tenant_id
  FROM clinical_departments d
 WHERE d.id = t.department_id AND t.tenant_id IS NULL;
-- fail loudly if any template could not inherit a tenant (orphan department)
DO $$
DECLARE orphan_count INTEGER;
BEGIN
    SELECT count(*) INTO orphan_count FROM clinical_templates WHERE tenant_id IS NULL;
    IF orphan_count > 0 THEN
        RAISE EXCEPTION 'e50: % clinical_templates rows have unresolved tenant_id — resolve before enforcing', orphan_count;
    END IF;
END $$;
ALTER TABLE clinical_templates ALTER COLUMN tenant_id SET NOT NULL;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name = 'clinical_templates' AND constraint_name = 'fk_ct_tenant'
    ) THEN
        ALTER TABLE clinical_templates
            ADD CONSTRAINT fk_ct_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
    END IF;
END $$;
ALTER TABLE clinical_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinical_templates FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_clinical_templates ON clinical_templates;
CREATE POLICY rls_clinical_templates ON clinical_templates
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);
CREATE INDEX IF NOT EXISTS idx_clinical_templates_tenant ON clinical_templates (tenant_id);

-- ---------- 3. clinical_knowledge_vectors: add tenant_id (backfill from dept) + FORCE RLS ----------
DO $$
BEGIN
    IF to_regclass('public.clinical_knowledge_vectors') IS NOT NULL THEN
        ALTER TABLE clinical_knowledge_vectors ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
        UPDATE clinical_knowledge_vectors v
           SET tenant_id = d.tenant_id
          FROM clinical_departments d
         WHERE d.id = v.department_id AND v.tenant_id IS NULL;
        -- department_id is nullable here; global (dept-less) chunks stay NULL and are left
        -- readable to all tenants ONLY if a permissive policy is chosen. We instead require a
        -- tenant: fail loudly on NULL so no cross-tenant RAG leakage is silently allowed.
        IF EXISTS (SELECT 1 FROM clinical_knowledge_vectors WHERE tenant_id IS NULL) THEN
            RAISE EXCEPTION 'e50: clinical_knowledge_vectors has rows with unresolved tenant_id (dept-less chunks) — assign a tenant or add a deliberate shared-catalog policy before enforcing';
        END IF;
        ALTER TABLE clinical_knowledge_vectors ALTER COLUMN tenant_id SET NOT NULL;
        ALTER TABLE clinical_knowledge_vectors ENABLE ROW LEVEL SECURITY;
        ALTER TABLE clinical_knowledge_vectors FORCE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS rls_clinical_knowledge_vectors ON clinical_knowledge_vectors;
        CREATE POLICY rls_clinical_knowledge_vectors ON clinical_knowledge_vectors
            USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
            WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);
        CREATE INDEX IF NOT EXISTS idx_ckv_tenant ON clinical_knowledge_vectors (tenant_id);
    END IF;
END $$;

-- ---------- 4. clinical_departments: per-tenant uniqueness on code ----------
-- Replace the global UNIQUE(code) with UNIQUE(tenant_id, code). The old constraint name is
-- Postgres-generated (clinical_departments_code_key); drop defensively by discovery.
DO $$
DECLARE conname TEXT;
BEGIN
    SELECT c.conname INTO conname
      FROM pg_constraint c
     WHERE c.conrelid = 'clinical_departments'::regclass AND c.contype = 'u'
       AND pg_get_constraintdef(c.oid) = 'UNIQUE (code)';
    IF conname IS NOT NULL THEN
        EXECUTE format('ALTER TABLE clinical_departments DROP CONSTRAINT %I', conname);
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'clinical_departments'::regclass AND conname = 'uq_clinical_dept_tenant_code'
    ) THEN
        ALTER TABLE clinical_departments ADD CONSTRAINT uq_clinical_dept_tenant_code UNIQUE (tenant_id, code);
    END IF;
END $$;

-- grants (mirror the repo convention; only if the app roles exist)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nama_medical_app') THEN
        EXECUTE 'GRANT ALL PRIVILEGES ON TABLE patient_clinical_records, clinical_templates TO nama_medical_app';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'jumanasoft_staging_user') THEN
        EXECUTE 'GRANT ALL PRIVILEGES ON TABLE patient_clinical_records, clinical_templates TO jumanasoft_staging_user';
    END IF;
END $$;

COMMIT;
