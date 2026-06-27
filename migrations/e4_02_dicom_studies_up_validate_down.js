/**
 * e4_02_dicom_studies_up_validate_down.js
 * ============================================================================
 * E4 — DICOM STUDIES METADATA (candidate migration; NOT auto-run; gated; idempotent)
 *
 * Adds `dicom_studies`: PACS/DICOM study+series METADATA ONLY.
 *   - NO image bytes are stored here. Image/object bytes (incl. .dcm) are served
 *     EXCLUSIVELY through the existing guarded /api/phi-files/:id endpoint
 *     (auth + explicit tenant predicate + path-traversal deny + nosniff + sandbox CSP).
 *   - `stored_ref` is a soft reference to a phi_files row (the encrypted-at-rest object),
 *     never a public path.
 *   - This table is GATED for real PACS integration (RAD_MWL_ENABLED); by default the
 *     app only registers metadata captured manually — NO external PACS connection.
 *
 * Posture: tenant_id NOT NULL + FORCE RLS canonical policy + (tenant_id, ...) index.
 * ============================================================================
 */
'use strict';

const TABLE = 'dicom_studies';
const POLICY = 'dicom_studies_tenant_isolation';

async function up(db) {
    await db.query(`
        CREATE TABLE IF NOT EXISTS ${TABLE} (
            id              SERIAL PRIMARY KEY,
            tenant_id       INTEGER NOT NULL,
            facility_id     INTEGER,
            rad_exam_id     INTEGER,                       -- FK -> rad_exams.id (worklist row)
            rad_order_id    INTEGER,                       -- FK -> lab_radiology_orders.id (convenience)
            patient_id      INTEGER,
            study_uid       TEXT    DEFAULT '',            -- DICOM StudyInstanceUID (metadata only)
            accession       TEXT    DEFAULT '',            -- AccessionNumber (worklist key)
            modality        TEXT    DEFAULT '',            -- DICOM Modality (CT/MR/CR/US/MG/...)
            study_desc      TEXT    DEFAULT '',
            series_count    INTEGER DEFAULT 0,
            instance_count  INTEGER DEFAULT 0,
            stored_ref      INTEGER,                       -- soft ref -> phi_files.id (guarded object); NOT a public path
            source          TEXT    DEFAULT 'manual',      -- 'manual' | 'mwl' (gated) — never an open PACS pull
            study_at        TIMESTAMP,
            created_by      INTEGER,
            created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
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

    await db.query(`CREATE INDEX IF NOT EXISTS idx_dicom_studies_tenant_exam ON ${TABLE} (tenant_id, rad_exam_id)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_dicom_studies_tenant_accession ON ${TABLE} (tenant_id, accession)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_dicom_studies_tenant_uid ON ${TABLE} (tenant_id, study_uid)`);

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

    const rls = await db.query(
        `SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname=$1`, [TABLE]
    );
    checks.rlsEnabled = rls.rows.length === 1 && rls.rows[0].relrowsecurity === true;
    checks.rlsForced = rls.rows.length === 1 && rls.rows[0].relforcerowsecurity === true;

    const pol = await db.query(`SELECT polname FROM pg_policy WHERE polname=$1`, [POLICY]);
    checks.policyExists = pol.rows.length === 1;

    const idx = await db.query(
        `SELECT indexname FROM pg_indexes WHERE tablename=$1 AND indexname='idx_dicom_studies_tenant_accession'`, [TABLE]
    );
    checks.tenantIndexExists = idx.rows.length === 1;

    checks.ok = Object.values(checks).every(Boolean);
    return checks;
}

async function down(db) {
    await db.query(`DROP POLICY IF EXISTS ${POLICY} ON ${TABLE}`);
    await db.query(`ALTER TABLE IF EXISTS ${TABLE} NO FORCE ROW LEVEL SECURITY`);
    await db.query(`ALTER TABLE IF EXISTS ${TABLE} DISABLE ROW LEVEL SECURITY`);
    await db.query(`DROP INDEX IF EXISTS idx_dicom_studies_tenant_exam`);
    await db.query(`DROP INDEX IF EXISTS idx_dicom_studies_tenant_accession`);
    await db.query(`DROP INDEX IF EXISTS idx_dicom_studies_tenant_uid`);
    await db.query(`DROP TABLE IF EXISTS ${TABLE}`);
    return { ok: true, dropped: TABLE };
}

module.exports = { up, validate, down, TABLE, POLICY };
