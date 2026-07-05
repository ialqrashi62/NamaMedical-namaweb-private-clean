-- ============================================================================
-- P1 PHASE exam_rooms PROVISIONING — UP
-- Creates the exam_rooms table, configures RLS, and inserts default clinics.
-- ============================================================================
BEGIN;

-- 1. Create exam_rooms table if not exists
CREATE TABLE IF NOT EXISTS exam_rooms (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    room_number VARCHAR(50) NOT NULL,
    name_ar TEXT DEFAULT '',
    name_en TEXT DEFAULT '',
    department_id INTEGER REFERENCES clinical_departments(id) ON DELETE SET NULL,
    status VARCHAR(30) DEFAULT 'Available'
        CHECK (status IN ('Available', 'Occupied', 'UnderMaintenance', 'Inactive')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Create index for performance
CREATE INDEX IF NOT EXISTS idx_exam_rooms_tenant_status ON exam_rooms (tenant_id, status);

-- 3. Enable RLS and Force it
ALTER TABLE exam_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_rooms FORCE ROW LEVEL SECURITY;

-- 4. Create or replace tenant isolation policy
DROP POLICY IF EXISTS rls_exam_rooms_tenant_isolation ON exam_rooms;
CREATE POLICY rls_exam_rooms_tenant_isolation ON exam_rooms
    FOR ALL
    TO PUBLIC
    USING (tenant_id = current_setting('app.tenant_id', true)::integer);

-- 5. Seed default clinics/rooms for Tenant 1
INSERT INTO exam_rooms (tenant_id, room_number, name_ar, name_en, status)
VALUES 
    (1, 'Room 101', 'العيادة العامة 1', 'General Clinic 1', 'Available'),
    (1, 'Room 102', 'عيادة الأطفال 1', 'Pediatric Clinic 1', 'Available'),
    (1, 'Room 103', 'عيادة النساء والولادة 1', 'OB-GYN Clinic 1', 'Available'),
    (1, 'Room 104', 'عيادة الأسنان 1', 'Dental Clinic 1', 'Available'),
    (1, 'Triage-01', 'غرفة الفرز 1', 'Triage Room 1', 'Available'),
    (1, 'Bed-A', 'سرير الطوارئ A', 'Emergency Bed A', 'Available')
ON CONFLICT DO NOTHING;

COMMIT;
