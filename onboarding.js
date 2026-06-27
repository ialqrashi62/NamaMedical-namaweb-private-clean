// ============================================================
// onboarding.js — E0 Facility Onboarding Wizard (server side)
// Self-contained module: archetype -> enabled module-index mapping, input validation,
// and a mountable POST /api/admin/facilities/provision route.
//
// Security posture (must NOT be weakened):
//  - Route guarded by requireAuth + requireRole('settings') + INLINE super-admin guard
//    (role !== 'Admin' -> 403 + audit BLOCKED_), mirroring the deployed Gate-4 / user-create pattern.
//  - Single DB transaction on a raw pooled client (BEGIN/COMMIT/ROLLBACK). After the tenant row is
//    created, app.tenant_id is set (transaction-local) so RLS-protected INSERTs (facilities,
//    facility_modules) pass WITH CHECK for the NEW tenant.
//  - NO default passwords: a strong random password is generated if none is supplied; the plaintext
//    is returned ONCE in the 201 body for out-of-band delivery and is NEVER logged.
//  - Integrations are GATED: only name + enabled flag + non-secret config are recorded. No API keys,
//    secrets, certificates, OTP, CSR, or outbound calls during provisioning.
//  - audit_trail written via logAudit('FACILITY_PROVISIONED').
// ============================================================
'use strict';

const bcrypt = require('bcryptjs');
const crypto = require('crypto');

// NAV_ITEMS index space is 0..42 (mirror of public/js/app.js NAV_ITEMS; index 0=Dashboard, 42=Settings).
const MODULE_INDEX_MIN = 0;
const MODULE_INDEX_MAX = 42;
const ALL_MODULE_INDICES = Array.from({ length: MODULE_INDEX_MAX + 1 }, (_, i) => i);

// Explicit subsets, consistent with the existing FACILITY_ALLOWED in public/js/app.js:
//   health_center (app.js): [0,1,2,3,4,5,6,7,8,9,11,12,13,14,15,20,21,30,33,34,35,41,42]
//   clinic/polyclinic (app.js): [0,1,2,3,4,6,7,8,9,11,12,13,14,15,20,30,34,42]
const HEALTH_CENTER_MODULES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 14, 15, 20, 21, 30, 33, 34, 35, 41, 42];
const POLYCLINIC_MODULES = [0, 1, 2, 3, 4, 6, 7, 8, 9, 11, 12, 13, 14, 15, 20, 30, 34, 42];
// general_hospital: clinical core + inpatient + lab/rad/pharmacy + finance/insurance + nursing/waiting/accounts.
// 0 Dashboard,1 Reception,2 Appointments,3 Doctor,4 Lab,5 Radiology,6 Pharmacy,7 HR,8 Finance,9 Insurance,
// 10 Inventory,11 Nursing,12 Waiting,13 Patient Accounts,14 Reports,15 Messaging,16 Catalog,17 Dept Requests,
// 18 Surgery,19 Blood Bank,20 Consent,21 Emergency,22 Inpatient ADT,23 ICU,24 CSSD,30 Medical Records,
// 33 ZATCA,34 Telemedicine,42 Settings.
const GENERAL_HOSPITAL_MODULES = [
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 30, 33, 34, 42
];

// archetype -> enabled module indices. medical_city & large_hospital = ALL (FACILITY_ALLOWED null).
const ARCHETYPE_MODULES = {
    medical_city: ALL_MODULE_INDICES,
    large_hospital: ALL_MODULE_INDICES,
    general_hospital: GENERAL_HOSPITAL_MODULES,
    polyclinic: POLYCLINIC_MODULES,
    health_center: HEALTH_CENTER_MODULES
};

const VALID_ARCHETYPES = Object.keys(ARCHETYPE_MODULES);

// Archetypes that support inpatient beds (others must be bed-less).
const BED_ARCHETYPES = new Set(['medical_city', 'large_hospital', 'general_hospital']);

// Allow-list of integration providers that MAY be recorded (gated, no secrets).
const ALLOWED_INTEGRATIONS = new Set(['MOH', 'CBAHI', 'NPHIES', 'ZATCA', 'SCFHS', 'PACS']);

/**
 * Resolve the enabled module-index set for an archetype.
 * @returns {number[]} sorted, de-duplicated, in-range indices. [] for unknown archetype.
 */
function modulesForArchetype(archetype) {
    const list = ARCHETYPE_MODULES[archetype];
    if (!list) return [];
    return [...new Set(list)]
        .filter(i => Number.isInteger(i) && i >= MODULE_INDEX_MIN && i <= MODULE_INDEX_MAX)
        .sort((a, b) => a - b);
}

/**
 * Generate a strong random password (NO default / NO guessable value).
 * URL-safe base64, ~24 bytes of entropy. Never logged.
 */
function generateStrongPassword() {
    return crypto.randomBytes(24).toString('base64').replace(/[+/=]/g, '').slice(0, 28);
}

/**
 * Validate the provisioning payload. Pure function (no I/O) so it is unit-testable.
 * @returns {{ ok: boolean, errors: string[], value?: object }}
 */
function validateProvisionInput(body) {
    const errors = [];
    body = body && typeof body === 'object' ? body : {};

    const archetype = String(body.archetype || '').trim();
    if (!VALID_ARCHETYPES.includes(archetype)) {
        errors.push('archetype must be one of: ' + VALID_ARCHETYPES.join(', '));
    }

    const tenantName = String(body.tenant_name || body.name || '').trim();
    if (tenantName.length < 2 || tenantName.length > 200) {
        errors.push('tenant_name is required (2..200 chars)');
    }

    // subdomain: lowercase alnum + hyphen, 2..63 (DNS label). Required & UNIQUE in DB.
    // Must start AND end with alnum (no edge hyphen); explicit length guard enforces the
    // stated 2..63 (the regex alone would accept a single character).
    const subdomain = String(body.subdomain || '').trim().toLowerCase();
    if (subdomain.length < 2 || subdomain.length > 63 ||
        !/^[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$/.test(subdomain)) {
        errors.push('subdomain must be a valid DNS label (a-z, 0-9, hyphen; 2..63 chars)');
    }

    const facilityName = String(body.facility_name || tenantName || '').trim();
    if (facilityName.length < 2 || facilityName.length > 255) {
        errors.push('facility_name is required (2..255 chars)');
    }

    // Optional regulatory identifiers (non-secret). Trimmed, length-bounded; '' if absent.
    const mohLicense = String(body.moh_license || '').trim();
    if (mohLicense.length > 100) errors.push('moh_license must be at most 100 chars');
    const crNo = String(body.cr_no || '').trim();
    if (crNo.length > 100) errors.push('cr_no must be at most 100 chars');
    const vatNo = String(body.vat_no || '').trim();
    if (vatNo.length > 100) errors.push('vat_no must be at most 100 chars');

    // beds: integer >= 0. Bed-less archetypes must have 0.
    let beds = body.beds === undefined || body.beds === null || body.beds === '' ? 0 : Number(body.beds);
    if (!Number.isInteger(beds) || beds < 0 || beds > 100000) {
        errors.push('beds must be a non-negative integer');
        beds = 0;
    } else if (!BED_ARCHETYPES.has(archetype) && beds > 0) {
        errors.push('this archetype does not support inpatient beds (beds must be 0)');
    }

    const currency = String(body.currency || 'SAR').trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) errors.push('currency must be a 3-letter ISO code');

    const timezone = String(body.timezone || 'Asia/Riyadh').trim();
    if (timezone.length < 1 || timezone.length > 64 || /[^A-Za-z0-9_+\-/]/.test(timezone)) {
        errors.push('timezone is invalid');
    }

    // Admin user
    const adminUsername = String(body.admin_username || '').trim();
    if (!/^[A-Za-z0-9._-]{3,50}$/.test(adminUsername)) {
        errors.push('admin_username must be 3..50 chars (letters, digits, . _ -)');
    }
    const adminDisplayName = String(body.admin_display_name || adminUsername || '').trim().slice(0, 200);
    // password is OPTIONAL — if absent we generate a strong one (no default password).
    const adminPassword = body.admin_password !== undefined && body.admin_password !== null
        ? String(body.admin_password) : '';
    if (adminPassword && adminPassword.length < 8) {
        errors.push('admin_password, if supplied, must be at least 8 characters');
    }

    // optional: explicit module override (subset of archetype set). If absent -> archetype default.
    let modules = null;
    if (Array.isArray(body.modules)) {
        modules = body.modules.map(Number).filter(n => Number.isInteger(n) && n >= MODULE_INDEX_MIN && n <= MODULE_INDEX_MAX);
        modules = [...new Set(modules)].sort((a, b) => a - b);
        if (modules.length === 0) errors.push('modules, if supplied, must contain valid indices (0..42)');
    }

    // optional integrations: only allow-listed names, only {name, enabled, config(no-secret)}.
    let integrations = [];
    if (Array.isArray(body.integrations)) {
        for (const it of body.integrations) {
            const nm = String((it && it.name) || '').trim().toUpperCase();
            if (!ALLOWED_INTEGRATIONS.has(nm)) {
                errors.push('integration not allowed: ' + (nm || '(empty)'));
                continue;
            }
            integrations.push({ name: nm, enabled: !!(it && it.enabled) });
        }
    }

    // optional branding/lang (non-secret)
    const language = ['ar', 'en'].includes(String(body.language || 'ar')) ? String(body.language || 'ar') : 'ar';
    const brandColor = /^#[0-9a-fA-F]{6}$/.test(String(body.brand_color || '')) ? String(body.brand_color) : null;

    if (errors.length) return { ok: false, errors };

    return {
        ok: true,
        errors: [],
        value: {
            archetype, tenantName, subdomain, facilityName, mohLicense, crNo, vatNo, beds, currency, timezone,
            adminUsername, adminDisplayName, adminPassword, modules, integrations, language, brandColor
        }
    };
}

/**
 * Mount the provisioning route. Dependencies are injected so the module stays test-friendly and
 * does not duplicate server.js wiring.
 * @param {object} app express app
 * @param {object} deps { pool, requireAuth, requireRole, logAudit }
 */
function mountOnboardingRoutes(app, deps) {
    const { pool, requireAuth, requireRole, logAudit } = deps;

    app.post('/api/admin/facilities/provision', requireAuth, requireRole('settings'), async (req, res) => {
        // ===== SUPER-ADMIN GUARD (inline, mirrors deployed user-create Gate-4 pattern) =====
        // 'settings' perm is held by non-admin roles (e.g. IT); creating a tenant/facility + Admin
        // user is strictly Admin-only. Identity comes from session, never req.body.
        if (req.session.user.role !== 'Admin') {
            logAudit(req.session.user?.id, req.session.user?.display_name,
                'BLOCKED_FACILITY_PROVISION', 'Onboarding',
                `Non-admin attempted facility provisioning (archetype=${String(req.body?.archetype || '').slice(0, 40)})`,
                req.ip);
            return res.status(403).json({ error: 'Access denied: only an administrator can provision a facility' });
        }

        const parsed = validateProvisionInput(req.body);
        if (!parsed.ok) {
            return res.status(400).json({ error: 'Validation failed', details: parsed.errors });
        }
        const v = parsed.value;

        // Resolve module set: explicit subset (intersected with archetype set) OR archetype default.
        const archetypeSet = new Set(modulesForArchetype(v.archetype));
        let enabledModules = [...archetypeSet];
        if (v.modules) {
            const inter = v.modules.filter(i => archetypeSet.has(i));
            // module 0 (Dashboard) and 42 (Settings) always enabled.
            if (!inter.includes(0)) inter.push(0);
            if (!inter.includes(42)) inter.push(42);
            enabledModules = [...new Set(inter)].sort((a, b) => a - b);
        }

        // Generate password if none supplied (NO default password ever).
        const generated = !v.adminPassword;
        const plainPassword = v.adminPassword || generateStrongPassword();

        // Raw pooled client => we control app.tenant_id (transaction-local) ourselves; the patched
        // pool.query wrapper is bypassed because we call client.query directly.
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // 1) tenant (archetype). subdomain UNIQUE — duplicate -> 409.
            const tenantRow = (await client.query(
                `INSERT INTO tenants (name, subdomain, status, plan_type, archetype, moh_license, cr_no, vat_no)
                 VALUES ($1,$2,'active','standard',$3,$4,$5,$6) RETURNING id`,
                [v.tenantName, v.subdomain, v.archetype, v.mohLicense, v.crNo, v.vatNo]
            )).rows[0];
            const tenantId = tenantRow.id;

            // Bind RLS context to the NEW tenant for the rest of the transaction (local => auto-reset on COMMIT/ROLLBACK).
            await client.query("SELECT set_config('app.tenant_id', $1, true)", [String(tenantId)]);

            // 2) facility (type/beds/currency/timezone; parent_facility_id null for the root facility).
            const facilityRow = (await client.query(
                `INSERT INTO facilities (tenant_id, name, type, beds, currency, timezone)
                 VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
                [tenantId, v.facilityName, v.archetype, v.beds, v.currency, v.timezone]
            )).rows[0];
            const facilityId = facilityRow.id;

            // 3) default branch + department so the Admin has a primary facility/branch scope (mirror establishSession).
            const branchRow = (await client.query(
                `INSERT INTO branches (facility_id, name) VALUES ($1,$2) RETURNING id`,
                [facilityId, v.facilityName + ' - Main']
            )).rows[0];
            const branchId = branchRow.id;
            await client.query(
                `INSERT INTO departments (branch_id, name_ar, name_en) VALUES ($1,$2,$3)`,
                [branchId, 'الإدارة', 'Administration']
            );

            // 4) facility_modules from archetype map.
            for (const idx of enabledModules) {
                await client.query(
                    `INSERT INTO facility_modules (tenant_id, module_index, enabled)
                     VALUES ($1,$2,TRUE) ON CONFLICT (tenant_id, module_index) DO NOTHING`,
                    [tenantId, idx]
                );
            }

            // 5) Admin system_user (bcrypt, NO default password). system_users has no tenant_id column;
            //    tenant scope is linked via user_tenants / user_facilities (mirror establishSession).
            const hash = await bcrypt.hash(plainPassword, 10);
            const adminUser = (await client.query(
                `INSERT INTO system_users (username, password_hash, display_name, role, permissions, is_active)
                 VALUES ($1,$2,$3,'Admin','*',1) RETURNING id`,
                [v.adminUsername, hash, v.adminDisplayName]
            )).rows[0];
            const adminUserId = adminUser.id;

            await client.query(
                `INSERT INTO user_tenants (user_id, tenant_id, is_active) VALUES ($1,$2,true)
                 ON CONFLICT (user_id, tenant_id) DO NOTHING`,
                [adminUserId, tenantId]
            );
            await client.query(
                `INSERT INTO user_facilities (user_id, facility_id, branch_id, is_primary) VALUES ($1,$2,$3,true)
                 ON CONFLICT (user_id, facility_id, branch_id) DO NOTHING`,
                [adminUserId, facilityId, branchId]
            );

            // 6) integrations (GATED: name + enabled only; NO secrets/keys/certs). config_json carries
            //    a non-secret marker so the UI can show "configured later".
            for (const it of v.integrations) {
                await client.query(
                    `INSERT INTO integration_settings (tenant_id, integration_name, provider, is_enabled, config_json)
                     VALUES ($1,$2,$3,$4,$5)`,
                    [tenantId, it.name, it.name, it.enabled ? 1 : 0, JSON.stringify({ gated: true, configured: false })]
                );
            }

            // 7) branding / language (non-secret) -> tenant_settings.
            await client.query(
                `INSERT INTO tenant_settings (tenant_id, setting_key, setting_value) VALUES ($1,'language',$2)
                 ON CONFLICT (tenant_id, setting_key) DO UPDATE SET setting_value=EXCLUDED.setting_value`,
                [tenantId, v.language]
            );
            if (v.brandColor) {
                await client.query(
                    `INSERT INTO tenant_settings (tenant_id, setting_key, setting_value) VALUES ($1,'brand_color',$2)
                     ON CONFLICT (tenant_id, setting_key) DO UPDATE SET setting_value=EXCLUDED.setting_value`,
                    [tenantId, v.brandColor]
                );
            }

            // 8) facility_type -> company_settings (tenant-scoped, RLS-bound via app.tenant_id set above).
            //    GET /api/settings reads company_settings(setting_key='facility_type') and app.js maps it to
            //    `facilityType`, driving FACILITY_ALLOWED. The archetype string IS the facility_type key
            //    (medical_city/large_hospital/general_hospital/polyclinic/health_center) — exact match in app.js.
            //    Server route remains the real module authority; this only makes the UI load the right set.
            await client.query(
                `INSERT INTO company_settings (tenant_id, setting_key, setting_value) VALUES ($1,'facility_type',$2)
                 ON CONFLICT (setting_key) DO UPDATE SET setting_value=EXCLUDED.setting_value`,
                [tenantId, v.archetype]
            );

            await client.query('COMMIT');

            // Audit — NO password, NO secrets in details.
            logAudit(req.session.user.id, req.session.user.display_name,
                'FACILITY_PROVISIONED', 'Onboarding',
                `tenant_id=${tenantId} archetype=${v.archetype} subdomain=${v.subdomain} facility_id=${facilityId} modules=${enabledModules.length} admin_user_id=${adminUserId}`,
                req.ip);

            // 201 — plaintext password returned ONCE for out-of-band delivery (never logged/stored).
            return res.status(201).json({
                tenant_id: tenantId,
                facility_id: facilityId,
                branch_id: branchId,
                admin_user_id: adminUserId,
                enabled_modules: enabledModules,
                admin_username: v.adminUsername,
                admin_password: plainPassword,
                admin_password_generated: generated
            });
        } catch (e) {
            try { await client.query('ROLLBACK'); } catch (_) { /* best-effort */ }
            if (e && e.code === '23505') { // unique_violation (subdomain or username)
                return res.status(409).json({ error: 'A tenant subdomain or admin username already exists' });
            }
            console.error('Facility provision error:', e.message);
            return res.status(500).json({ error: 'Server error' });
        } finally {
            try { await client.query("SELECT set_config('app.tenant_id', '', false)"); } catch (_) { /* reset */ }
            client.release();
        }
    });
}

module.exports = {
    ARCHETYPE_MODULES,
    VALID_ARCHETYPES,
    ALLOWED_INTEGRATIONS,
    BED_ARCHETYPES,
    ALL_MODULE_INDICES,
    HEALTH_CENTER_MODULES,
    POLYCLINIC_MODULES,
    GENERAL_HOSPITAL_MODULES,
    MODULE_INDEX_MIN,
    MODULE_INDEX_MAX,
    modulesForArchetype,
    generateStrongPassword,
    validateProvisionInput,
    mountOnboardingRoutes
};
