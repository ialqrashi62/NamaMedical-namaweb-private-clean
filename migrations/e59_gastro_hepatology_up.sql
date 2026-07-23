-- Migration for Gastroenterology & Hepatology Specialized Data
-- Target: namaweb/migrations/e59_gastro_hepatology_up.sql

CREATE TABLE IF NOT EXISTS gastro_endoscopy_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,
    encounter_id UUID NOT NULL,
    procedure_type TEXT CHECK (procedure_type IN ('EGD', 'Colonoscopy', 'ERCP', 'EUS', 'Enteroscopy')),
    boston_scale_right INTEGER CHECK (boston_scale_right BETWEEN 0 AND 3),
    boston_scale_left INTEGER CHECK (boston_scale_left BETWEEN 0 AND 3),
    findings TEXT,
    biopsy_taken BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS gastro_liver_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,
    bilirubin DECIMAL(5,2),
    albumin DECIMAL(5,2),
    creatinine DECIMAL(5,2),
    ascites_grade INTEGER CHECK (ascites_grade BETWEEN 0 AND 3),
    encephalopathy_grade INTEGER CHECK (encephalopathy_grade BETWEEN 0 AND 4),
    meld_score DECIMAL(4,2),
    child_pugh_class TEXT CHECK (child_pugh_class IN ('A', 'B', 'C')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS gastro_nutrition_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,
    calorie_target INTEGER,
    protein_target DECIMAL(5,2),
    route TEXT CHECK (route IN ('Oral', 'Enteral', 'Parenteral')),
    special_requirements TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Enable RLS
ALTER TABLE gastro_endoscopy_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE gastro_liver_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE gastro_nutrition_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON gastro_endoscopy_logs 
    USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_policy ON gastro_liver_metrics 
    USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_policy ON gastro_nutrition_plans 
    USING (tenant_id = current_setting('app.current_tenant')::uuid);
