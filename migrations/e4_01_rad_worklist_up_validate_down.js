/**
 * e4_01_rad_worklist_up_validate_down.js
 * ============================================================================
 * E4 — RIS WORKLIST (candidate migration; NOT auto-run; gated; idempotent)
 *
 * Adds `rad_exams`: the RIS worklist state machine row that hangs off an existing
 * radiology order in `lab_radiology_orders`. State machine:
 *   Scheduled -> Arrived -> InProgress -> Completed -> Reported
 *
 * Posture (matches the 150 FORCE-RLS tables already enforced in this codebase):
 *   - tenant_id INTEGER NOT NULL
 *   - ENABLE + FORCE ROW LEVEL SECURITY
 *   - single canonical FOR ALL policy keyed on current_setting('app.tenant_id')
 *   - (tenant_id, state) composite index
 *
 * NOTE: No DB exec here. Caller invokes up/validate/down with a pg pool/client.
 * ============================================================================
 */
'use strict';

const TABLE = 'rad_exams';
const POLICY = 'rad_exams_tenant_isolation';
const VALID_STATES = ['Scheduled', 'Arrived', 'InProgress', 'Completed', 'Reported'];

async function up(db) {
    // 1) table (additive, idempotent)
    await db.query(`
        CREATE TABLE IF NOT EXISTS ${TABLE} (
            id              SERIAL PRIMARY KEY,
            tenant_id       INTEGER NOT NULL,
            facility_id     INTEGER,
            rad_order_id    INTEGER NOT NULL,              -- FK -> lab_radiology_orders.id (is_radiology=1)
            patient_id      INTEGER,
            modality        TEXT    DEFAULT '',            -- XR/CT/MRI/US/MG/...
            exam_name       TEXT    DEFAULT '',
            accession       TEXT    DEFAULT '',            -- accession number (worklist key for MWL)
            state           TEXT    NOT NULL DEFAULT 'Scheduled',
            scheduled_at    TIMESTAMP,
            arrived_at      TIMESTAMP,
            started_at      TIMESTAMP,
            completed_at    TIMESTAMP,
            reported_at     TIMESTAMP,
            assigned_tech   INTEGER,
            notes           TEXT    DEFAULT '',
            created_by      INTEGER,
            created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // CHECK constraint on the state machine (idempotent: add only if absent)
    await db.query(`
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'rad_exams_state_chk'
            ) THEN
                ALTER TABLE ${TABLE} ADD CONSTRAINT rad_exams_state_chk
                    CHECK (state IN ('Scheduled','Arrived','InProgress','Completed','Reported'));
            END IF;
        END $$;
    `);

    // 2) RLS: enable + force (idempotent — ALTER is no-op if already set)
    await db.query(`ALTER TABLE ${TABLE} ENABLE ROW LEVEL SECURITY`);
    await db.query(`ALTER TABLE ${TABLE} FORCE ROW LEVEL SECURITY`);

    // 3) canonical tenant-isolation policy (drop+create = idempotent)
    await db.query(`DROP POLICY IF EXISTS ${POLICY} ON ${TABLE}`);
    await db.query(`
        CREATE POLICY ${POLICY} ON ${TABLE}
            FOR ALL
            USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
            WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    `);

    // 4) tenant-scoped indexes
    await db.query(`CREATE INDEX IF NOT EXISTS idx_rad_exams_tenant_state ON ${TABLE} (tenant_id, state)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_rad_exams_tenant_order ON ${TABLE} (tenant_id, rad_order_id)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_rad_exams_tenant_accession ON ${TABLE} (tenant_id, accession)`);

    return { ok: true, table: TABLE };
}

async function validate(db) {
    const checks = {};
    const t = await db.query(`SELECT to_regclass('public.${TABLE}') AS reg`);
    checks.tableExists = !!t.rows[0].reg;

    const col = await db.query(
        `SELECT is_nullable FROM information_schema.columns WHERE table_name=$1 AND column_name='tenant_id'`,
        [TABLE]
    );
    checks.tenantIdNotNull = col.rows.length === 1 && col.rows[0].is_nullable === 'NO';

    const rls = await db.query(
        `SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname=$1`, [TABLE]
    );
    checks.rlsEnabled = rls.rows.length === 1 && rls.rows[0].relrowsecurity === true;
    checks.rlsForced = rls.rows.length === 1 && rls.rows[0].relforcerowsecurity === true;

    const pol = await db.query(`SELECT polname FROM pg_policy WHERE polname=$1`, [POLICY]);
    checks.policyExists = pol.rows.length === 1;

    const idx = await db.query(
        `SELECT indexname FROM pg_indexes WHERE tablename=$1 AND indexname='idx_rad_exams_tenant_state'`, [TABLE]
    );
    checks.tenantIndexExists = idx.rows.length === 1;

    checks.ok = Object.values(checks).every(Boolean);
    return checks;
}

async function down(db) {
    // reverse order: policy -> disable RLS -> own indexes -> constraint -> table
    await db.query(`DROP POLICY IF EXISTS ${POLICY} ON ${TABLE}`);
    await db.query(`ALTER TABLE IF EXISTS ${TABLE} NO FORCE ROW LEVEL SECURITY`);
    await db.query(`ALTER TABLE IF EXISTS ${TABLE} DISABLE ROW LEVEL SECURITY`);
    await db.query(`DROP INDEX IF EXISTS idx_rad_exams_tenant_state`);
    await db.query(`DROP INDEX IF EXISTS idx_rad_exams_tenant_order`);
    await db.query(`DROP INDEX IF EXISTS idx_rad_exams_tenant_accession`);
    await db.query(`ALTER TABLE IF EXISTS ${TABLE} DROP CONSTRAINT IF EXISTS rad_exams_state_chk`);
    await db.query(`DROP TABLE IF EXISTS ${TABLE}`);
    return { ok: true, dropped: TABLE };
}

module.exports = { up, validate, down, TABLE, POLICY, VALID_STATES };
