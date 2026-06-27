-- ============================================================================
-- Epic E12 — Surgery / Operating Room
-- Candidate migration (UP). Idempotent. DO NOT auto-execute in production.
-- Adds 5 new tables: or_slots, who_surgical_checklist, pacu_records,
-- operative_notes, or_consumption. All FORCE RLS + canonical tenant policy.
-- ============================================================================
BEGIN;

-- ---- OR scheduling slots (conflict detection backing table) ----
CREATE TABLE IF NOT EXISTS or_slots (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    facility_id INTEGER,
    surgery_id INTEGER NOT NULL REFERENCES surgeries(id) ON DELETE CASCADE,
    room_id INTEGER NOT NULL REFERENCES operating_rooms(id) ON DELETE CASCADE,
    surgeon_id INTEGER NOT NULL REFERENCES system_users(id),
    slot_date DATE NOT NULL,
    slot_start_time TIME NOT NULL,
    slot_end_time TIME NOT NULL,
    duration_minutes INTEGER NOT NULL DEFAULT 60,
    status TEXT NOT NULL DEFAULT 'Booked',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE or_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE or_slots FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_or_slots_tenant_isolation ON or_slots;
CREATE POLICY rls_or_slots_tenant_isolation ON or_slots
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);
CREATE INDEX IF NOT EXISTS idx_or_slots_tenant_facility ON or_slots (tenant_id, facility_id);
CREATE INDEX IF NOT EXISTS idx_or_slots_room_date ON or_slots (room_id, slot_date, status);
CREATE INDEX IF NOT EXISTS idx_or_slots_surgeon_date ON or_slots (surgeon_id, slot_date, status);

-- ---- WHO Safe Surgery Checklist ----
CREATE TABLE IF NOT EXISTS who_surgical_checklist (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    facility_id INTEGER,
    surgery_id INTEGER NOT NULL REFERENCES surgeries(id) ON DELETE CASCADE,
    patient_id INTEGER,
    sign_in_completed INTEGER DEFAULT 0,
    sign_in_completed_by TEXT DEFAULT '',
    sign_in_at TIMESTAMP,
    time_out_completed INTEGER DEFAULT 0,
    time_out_completed_by TEXT DEFAULT '',
    time_out_at TIMESTAMP,
    sign_out_completed INTEGER DEFAULT 0,
    sign_out_completed_by TEXT DEFAULT '',
    sign_out_at TIMESTAMP,
    state TEXT NOT NULL DEFAULT 'Not Started',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (surgery_id)
);
ALTER TABLE who_surgical_checklist ENABLE ROW LEVEL SECURITY;
ALTER TABLE who_surgical_checklist FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_who_surgical_checklist_tenant_isolation ON who_surgical_checklist;
CREATE POLICY rls_who_surgical_checklist_tenant_isolation ON who_surgical_checklist
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);
CREATE INDEX IF NOT EXISTS idx_who_checklist_tenant_surgery ON who_surgical_checklist (tenant_id, surgery_id);

-- ---- PACU (recovery) records ----
CREATE TABLE IF NOT EXISTS pacu_records (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    facility_id INTEGER,
    surgery_id INTEGER NOT NULL REFERENCES surgeries(id) ON DELETE CASCADE,
    patient_id INTEGER,
    start_time TEXT DEFAULT '',   -- L1: freeform text; pending migration to TIMESTAMP (kept TEXT to avoid breaking existing inserts)
    end_time   TEXT DEFAULT '',   -- L1: freeform text; pending migration to TIMESTAMP (kept TEXT to avoid breaking existing inserts)
    pain_score INTEGER DEFAULT 0,
    bp TEXT DEFAULT '',
    hr TEXT DEFAULT '',
    spo2 TEXT DEFAULT '',
    temp TEXT DEFAULT '',
    aldrete_score INTEGER,
    discharge_status TEXT DEFAULT 'In Recovery',
    recovery_nurse TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (surgery_id)
);
ALTER TABLE pacu_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE pacu_records FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_pacu_records_tenant_isolation ON pacu_records;
CREATE POLICY rls_pacu_records_tenant_isolation ON pacu_records
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);
CREATE INDEX IF NOT EXISTS idx_pacu_records_tenant_surgery ON pacu_records (tenant_id, surgery_id);

-- ---- Operative notes (surgery report) ----
CREATE TABLE IF NOT EXISTS operative_notes (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    facility_id INTEGER,
    surgery_id INTEGER NOT NULL REFERENCES surgeries(id) ON DELETE CASCADE,
    patient_id INTEGER,
    procedure_description TEXT DEFAULT '',
    findings TEXT DEFAULT '',
    complications TEXT DEFAULT '',
    blood_loss_final INTEGER DEFAULT 0,
    counts_verified TEXT DEFAULT 'Incomplete',
    specimen TEXT DEFAULT '',
    surgeon_signature TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (surgery_id)
);
ALTER TABLE operative_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE operative_notes FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_operative_notes_tenant_isolation ON operative_notes;
CREATE POLICY rls_operative_notes_tenant_isolation ON operative_notes
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);
CREATE INDEX IF NOT EXISTS idx_operative_notes_tenant_surgery ON operative_notes (tenant_id, surgery_id);

-- ---- OR consumption (links to inventory_items) ----
CREATE TABLE IF NOT EXISTS or_consumption (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    facility_id INTEGER,
    surgery_id INTEGER NOT NULL REFERENCES surgeries(id) ON DELETE CASCADE,
    item_id INTEGER NOT NULL,
    qty_used INTEGER NOT NULL DEFAULT 0,
    batch_id INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE or_consumption ENABLE ROW LEVEL SECURITY;
ALTER TABLE or_consumption FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_or_consumption_tenant_isolation ON or_consumption;
CREATE POLICY rls_or_consumption_tenant_isolation ON or_consumption
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer);
CREATE INDEX IF NOT EXISTS idx_or_consumption_tenant_surgery ON or_consumption (tenant_id, surgery_id);
CREATE INDEX IF NOT EXISTS idx_or_consumption_item ON or_consumption (item_id);

COMMIT;
