/**
 * e4_03_rad_reports_up_validate_down.js
 * ============================================================================
 * E4 — STRUCTURED RADIOLOGY REPORTING + CRITICAL + PRIOR COMPARE
 *      (candidate migration; NOT auto-run; gated; idempotent)
 *
 * Adds `rad_reports`: a structured radiology report with templated findings
 * (e.g. BI-RADS) stored as `structured_json`, an `impression`, a critical-finding
 * flag, signing fields, and an addendum chain (`addendum_of`).
 *
 * CRITICAL-RESULT FAIL-CLOSED RULE (enforced in the server, schema-supported here):
 *   A report flagged `is_critical = TRUE` CANNOT be signed (`signed_at`/`signed_by`)
 *   until a critical notification has been documented — tracked by
 *   `critical_notified_at` (and a `notifications` row of type 'critical' + audit).
 *   The server refuses the sign transition when is_critical AND NOT critical_notified.
 *
 * PRIOR-COMPARE RULE: the prior-study list returns only SIGNED reports for the same
 * patient + modality within the tenant (the E3 Issue-1 lesson: signed priors only).
 *
 * Posture: tenant_id NOT NULL + FORCE RLS canonical policy + (tenant_id, ...) index.
 * ============================================================================
 */
'use strict';

const TABLE = 'rad_reports';
const POLICY = 'rad_reports_tenant_isolation';

async function up(db) {
    await db.query(`
        CREATE TABLE IF NOT EXISTS ${TABLE} (
            id                    SERIAL PRIMARY KEY,
            tenant_id             INTEGER NOT NULL,
            facility_id           INTEGER,
            rad_exam_id           INTEGER,                 -- FK -> rad_exams.id
            rad_order_id          INTEGER,                 -- FK -> lab_radiology_orders.id
            patient_id            INTEGER,
            modality              TEXT    DEFAULT '',
            template              TEXT    DEFAULT '',      -- e.g. 'BI-RADS', 'generic'
            structured_json       TEXT    DEFAULT '',      -- JSON string of templated findings
            findings              TEXT    DEFAULT '',
            impression            TEXT    DEFAULT '',
            birads                TEXT    DEFAULT '',       -- BI-RADS category when applicable
            is_critical           BOOLEAN DEFAULT FALSE,
            critical_notified_at  TIMESTAMP,               -- set when critical notification documented
            critical_notify_ref   INTEGER,                 -- soft ref -> notifications.id
            status                TEXT    NOT NULL DEFAULT 'Draft',   -- Draft | Signed | Addended
            radiologist_id        INTEGER,
            signed_by             INTEGER,
            signed_at             TIMESTAMP,
            addendum_of           INTEGER,                 -- self-ref -> rad_reports.id (prior signed report)
            prior_study_id        INTEGER,                 -- ref -> rad_reports.id used as comparison prior
            created_by            INTEGER,
            created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await db.query(`
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rad_reports_status_chk') THEN
                ALTER TABLE ${TABLE} ADD CONSTRAINT rad_reports_status_chk
                    CHECK (status IN ('Draft','Signed','Addended'));
            END IF;
        END $$;
    `);

    await db.query(`ALTER TABLE ${TABLE} ENABLE ROW LEVEL SECURITY`);
    await db.query(`ALTER TABLE ${TABLE} FORCE ROW LEVEL SECURITY`);

    await db.query(`DROP POLICY IF EXISTS ${POLICY} ON ${TABLE}`);
    await db.query(`
        CREATE POLICY ${POLICY} ON ${TABLE}
            FOR ALL
            USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
            WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer)
    `);

    await db.query(`CREATE INDEX IF NOT EXISTS idx_rad_reports_tenant_exam ON ${TABLE} (tenant_id, rad_exam_id)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_rad_reports_tenant_patient_modality ON ${TABLE} (tenant_id, patient_id, modality)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_rad_reports_tenant_status ON ${TABLE} (tenant_id, status)`);

    return { ok: true, table: TABLE };
}

async function validate(db) {
    const checks = {};
    const t = await db.query(`SELECT to_regclass('public.${TABLE}') AS reg`);
    checks.tableExists = !!t.rows[0].reg;

    const col = await db.query(
        `SELECT is_nullable FROM information_schema.columns WHERE table_name=$1 AND column_name='tenant_id'`, [TABLE]
    );
    checks.tenantIdNotNull = col.rows.length === 1 && col.rows[0].is_nullable === 'NO';

    const crit = await db.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name=$1 AND column_name='critical_notified_at'`, [TABLE]
    );
    checks.criticalNotifyColumn = crit.rows.length === 1;

    const rls = await db.query(
        `SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname=$1`, [TABLE]
    );
    checks.rlsEnabled = rls.rows.length === 1 && rls.rows[0].relrowsecurity === true;
    checks.rlsForced = rls.rows.length === 1 && rls.rows[0].relforcerowsecurity === true;

    const pol = await db.query(`SELECT polname FROM pg_policy WHERE polname=$1`, [POLICY]);
    checks.policyExists = pol.rows.length === 1;

    const idx = await db.query(
        `SELECT indexname FROM pg_indexes WHERE tablename=$1 AND indexname='idx_rad_reports_tenant_patient_modality'`, [TABLE]
    );
    checks.priorCompareIndexExists = idx.rows.length === 1;

    checks.ok = Object.values(checks).every(Boolean);
    return checks;
}

async function down(db) {
    await db.query(`DROP POLICY IF EXISTS ${POLICY} ON ${TABLE}`);
    await db.query(`ALTER TABLE IF EXISTS ${TABLE} NO FORCE ROW LEVEL SECURITY`);
    await db.query(`ALTER TABLE IF EXISTS ${TABLE} DISABLE ROW LEVEL SECURITY`);
    await db.query(`DROP INDEX IF EXISTS idx_rad_reports_tenant_exam`);
    await db.query(`DROP INDEX IF EXISTS idx_rad_reports_tenant_patient_modality`);
    await db.query(`DROP INDEX IF EXISTS idx_rad_reports_tenant_status`);
    await db.query(`ALTER TABLE IF EXISTS ${TABLE} DROP CONSTRAINT IF EXISTS rad_reports_status_chk`);
    await db.query(`DROP TABLE IF EXISTS ${TABLE}`);
    return { ok: true, dropped: TABLE };
}

module.exports = { up, validate, down, TABLE, POLICY };
