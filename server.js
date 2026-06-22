require('dotenv').config();
const express = require('express');
const session = require('express-session');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { pool, initDatabase, tenantStore } = require('./db_postgres');
const bcrypt = require('bcryptjs');
const { insertSampleData, populateLabCatalog, populateRadiologyCatalog } = require('./seed_data_pg');
const { populateMedicalServices, populateBaseDrugs } = require('./seed_services_pg');
const { addExtraLabTests, addExtraRadiology } = require('./seed_extra_catalog');

// Multer setup for radiology image uploads
const uploadsDir = path.join(__dirname, 'public', 'uploads', 'radiology');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
const upload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, uploadsDir),
        filename: (req, file, cb) => cb(null, `rad_${req.params.id}_${Date.now()}${path.extname(file.originalname)}`)
    }),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = /jpeg|jpg|png|gif|bmp|webp|dicom|dcm/;
        cb(null, allowed.test(path.extname(file.originalname).toLowerCase()));
    }
});

const compression = require('compression');
const app = express();
app.set('trust proxy', 1);
app.use(compression());
const PORT = process.env.PORT || 3000;

// Security Middleware
app.use(helmet({ contentSecurityPolicy: false }));

// Rate limiting for login endpoint
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: { error: 'Too many login attempts, please try again after 15 minutes' } });

// Middleware
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
// Redis Session Store Setup with graceful Fallback
let sessionStore;
if (process.env.REDIS_URL || process.env.REDIS_HOST) {
    try {
        const { createClient } = require('redis');
        const { RedisStore } = require('connect-redis');
        const redisClient = createClient({
            url: process.env.REDIS_URL || `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`
        });
        redisClient.on('error', (err) => {
            console.warn('[REDIS WARNING] Could not connect to Redis, session store falling back to MemoryStore:', err.message);
        });
        redisClient.connect().then(() => {
            console.log('[REDIS SUCCESS] Connected to Redis successfully for distributed sessions.');
        }).catch(err => {
            console.warn('[REDIS WARNING] Failed to connect to Redis server, falling back to MemoryStore:', err.message);
        });
        sessionStore = new RedisStore({ client: redisClient, prefix: "nama_session:" });
    } catch (e) {
        console.warn('[SESSION WARNING] Redis dependencies or connection failed, falling back to MemoryStore:', e.message);
    }
} else {
    console.log('[SESSION INFO] No Redis configuration detected, using default MemoryStore for sessions.');
}

const sessionConfig = {
    secret: process.env.SESSION_SECRET || 'nama-medical-erp-secret-x7k9m2p4q8w1',
    resave: true,
    saveUninitialized: true,
    cookie: {
        maxAge: 8 * 60 * 60 * 1000,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production' && process.env.PUBLIC_STAGING_HTTP_ONLY !== 'true',
        sameSite: 'lax'
    },
    rolling: true
};

if (sessionStore) {
    sessionConfig.store = sessionStore;
}

app.use(session(sessionConfig));

// ===== TENANT CONTEXT MIDDLEWARE (RLS wiring, ported from 10ded01) =====
// Binds the request's tenant (from trusted session via getRequestTenantContext) into
// AsyncLocalStorage so the patched pool.query sets app.tenant_id on the DB connection before
// any RLS-protected query. No tenant context (unauthenticated/public) -> passthrough; protected
// routes still gate via requireTenantScope. Per-request, no cross-request leak.
app.use((req, res, next) => {
    const { tenantId, facilityId } = getRequestTenantContext(req);
    if (tenantId) {
        tenantStore.run({ tenantId, facilityId }, () => next());
    } else {
        next();
    }
});

// Static files
app.use(express.static(path.join(__dirname, 'public')));

function requireAuth(req, res, next) {
    if (req.session && req.session.user) return next();
    res.status(401).json({ error: 'Unauthorized' });
}

// ===== CATALOG EDIT RESTRICTION (Admin/Manager only) =====
const requireCatalogAccess = (req, res, next) => {
    const role = (req.session.user?.role || '').toLowerCase();
    if (['admin', 'manager', 'administrator'].includes(role)) return next();
    return res.status(403).json({ error: 'Access denied. Only Admin/Manager can edit catalog items.' });
};

// ===== DISCOUNT LIMIT BY ROLE =====
const MAX_DISCOUNT_BY_ROLE = { admin: 100, manager: 50, cashier: 10, receptionist: 10, doctor: 20 };

// RBAC middleware - role-based access control
const ROLE_PERMISSIONS = {
    'Admin': '*',
    'Doctor': ['dashboard', 'patients', 'appointments', 'doctor', 'lab', 'radiology', 'pharmacy', 'nursing', 'waiting', 'reports', 'messaging', 'surgery', 'consent', 'icu', 'research', 'publichealth', 'crisis', 'toxicology'],
    'Nurse': ['dashboard', 'patients', 'nursing', 'waiting', 'vitals', 'icu', 'emergency', 'inpatient', 'transport', 'dietary', 'publichealth', 'crisis', 'toxicology'],
    'Pharmacist': ['dashboard', 'pharmacy', 'inventory', 'messaging'],
    'Lab Technician': ['dashboard', 'lab', 'messaging'],
    'Radiologist': ['dashboard', 'radiology', 'messaging'],
    'Reception': ['dashboard', 'patients', 'appointments', 'waiting', 'messaging', 'accounts'],
    'Finance': ['dashboard', 'finance', 'insurance', 'reports', 'accounts', 'invoices', 'legal'],
    'HR': ['dashboard', 'hr', 'messaging', 'reports', 'legal'],
    'IT': ['dashboard', 'settings', 'messaging', 'maintenance', 'research', 'publichealth', 'crisis', 'iot'],
    'Staff': ['dashboard', 'messaging']
};
function requireRole(...modules) {
    return (req, res, next) => {
        if (!req.session || !req.session.user) return res.status(401).json({ error: 'Unauthorized' });
        const role = req.session.user.role;
        const perms = ROLE_PERMISSIONS[role];
        if (perms === '*') return next(); // Admin
        if (perms && modules.some(m => perms.includes(m))) return next();
        res.status(403).json({ error: 'Access denied' });
    };
}

// Audit trail helper
async function logAudit(userId, userName, action, module, details, ip) {
    try {
        await pool.query(
            'INSERT INTO audit_trail (user_id, username, action, module, new_values, ip_address) VALUES ($1,$2,$3,$4,$5,$6)',
            [userId, userName || '', action || '', module || '', details || '', ip || '']
        );
    } catch (e) { console.error('Audit log error:', e.message); }
}

// ===== TENANT ISOLATION MIDDLEWARES =====
function getRequestTenantContext(req) {
    let tenantId = req.session?.user?.tenantId || null;
    let facilityId = req.session?.user?.facilityId || null;
    const isProduction = process.env.NODE_ENV === 'production';

    // Fallback ONLY in development/test — never in production
    if (!tenantId && !isProduction) {
        tenantId = 1;
        facilityId = 1;
    }

    // In production: if tenantId is still null, flag it so callers can block the request
    return { tenantId, facilityId, isProduction };
}

// Middleware: block any request that has no tenantId in production
function requireTenantScope(req, res, next) {
    const { tenantId, isProduction } = getRequestTenantContext(req);
    if (!tenantId && isProduction) {
        // Security: reject in production with 403 — never expose unscoped data
        return res.status(403).json({ error: 'Tenant scope required' });
    }
    next();
}

function requireTenantContext(req, res, next) {
    const { tenantId } = getRequestTenantContext(req);
    if (!tenantId) {
        return res.status(400).json({ error: 'Missing tenant context' });
    }
    req.tenantId = tenantId;
    next();
}

function requireFacilityContext(req, res, next) {
    const { tenantId, facilityId } = getRequestTenantContext(req);
    if (!tenantId) {
        return res.status(400).json({ error: 'Missing tenant context' });
    }
    if (!facilityId) {
        return res.status(400).json({ error: 'Missing facility context' });
    }
    req.tenantId = tenantId;
    req.facilityId = facilityId;
    next();
}

function withTenantFilter(queryText, params, tenantId) {
    if (!tenantId) return { queryText, params };
    const hasWhere = queryText.toLowerCase().includes('where');
    const separator = hasWhere ? ' AND ' : ' WHERE ';
    const paramIndex = params.length + 1;
    const modifiedQuery = queryText + separator + `tenant_id = $${paramIndex}`;
    const modifiedParams = [...params, tenantId];
    return { queryText: modifiedQuery, params: modifiedParams };
}


// ===== SINGLE SESSION ENFORCEMENT =====
// Track active session IDs per user to prevent concurrent logins
const activeUserSessions = new Map(); // userId -> sessionId

// ===== AUTH ROUTES =====
app.post('/api/auth/login', loginLimiter, async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ error: 'Missing credentials' });
        const { rows } = await pool.query('SELECT id, display_name, role, speciality, permissions, password_hash FROM system_users WHERE username=$1 AND is_active=1', [username]);
        if (!rows.length) return res.status(401).json({ error: 'Invalid credentials' });
        const user = rows[0];
        // Check bcrypt hash (Plaintext password fallback is disabled for security)
        let valid = false;
        if (user.password_hash && user.password_hash.startsWith('$2')) {
            valid = await bcrypt.compare(password, user.password_hash);
        }
        if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

        // ===== SINGLE SESSION: Destroy previous session if exists =====
        const previousSessionId = activeUserSessions.get(user.id);
        if (previousSessionId && previousSessionId !== req.sessionID) {
            // Destroy the old session from the store
            req.sessionStore.destroy(previousSessionId, (err) => {
                if (err) console.error('Error destroying old session:', err);
            });
        }

        // Fetch user's tenant and facility scope
        let userTenantId = null;
        let userFacilityId = null;
        try {
            const tenantRow = (await pool.query('SELECT tenant_id FROM user_tenants WHERE user_id=$1 AND is_active=true LIMIT 1', [user.id])).rows[0];
            if (tenantRow) {
                userTenantId = tenantRow.tenant_id;
                const facRow = (await pool.query('SELECT facility_id FROM user_facilities WHERE user_id=$1 AND is_primary=true LIMIT 1', [user.id])).rows[0];
                if (facRow) {
                    userFacilityId = facRow.facility_id;
                }
            }
        } catch (e) {
            console.error('Error fetching tenant/facility scope for user:', e);
        }

        // Fallback logic for dev environment
        if (!userTenantId && process.env.NODE_ENV !== 'production') {
            userTenantId = 1; // Default Tenant ID
            userFacilityId = 1; // Default Facility ID
        }

        req.session.user = {
            id: user.id,
            name: user.display_name,
            display_name: user.display_name,
            role: user.role,
            speciality: user.speciality || '',
            permissions: user.permissions || '',
            tenantId: userTenantId,
            facilityId: userFacilityId
        };
        // Track this user's active session
        activeUserSessions.set(user.id, req.sessionID);

        // Save last IP
        const clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.ip;
        await pool.query('UPDATE system_users SET last_ip=$1 WHERE id=$2', [clientIp, user.id]).catch(() => { });
        logAudit(user.id, user.display_name, 'LOGIN', 'Auth', `User logged in as ${user.role}`, clientIp);
        res.json({ success: true, user: req.session.user });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/auth/logout', (req, res) => {
    // Remove from single-session tracking
    if (req.session && req.session.user) {
        activeUserSessions.delete(req.session.user.id);
    }
    req.session.destroy();
    res.json({ success: true });
});

app.get('/api/health', (req, res) => {
    res.status(200).json({ status: 'UP' });
});

app.get('/api/auth/me', (req, res) => {
    if (req.session && req.session.user) return res.json({ user: req.session.user });
    res.status(401).json({ error: 'Not logged in' });
});

// ===== VAT HELPER =====
async function calcVAT(patientId) {
    if (!patientId) return { rate: 0, vatAmount: 0, applyVAT: false };
    const p = (await pool.query('SELECT nationality FROM patients WHERE id=$1', [patientId])).rows[0];
    const nat = (p && p.nationality) || '';
    const isSaudi = nat === 'سعودي' || nat.toLowerCase() === 'saudi';
    return { rate: isSaudi ? 0 : 0.15, applyVAT: !isSaudi };
}
function addVAT(amount, vatRate) {
    const vat = Math.round(amount * vatRate * 100) / 100;
    return { total: Math.round((amount + vat) * 100) / 100, vatAmount: vat };
}

// ===== DASHBOARD =====
app.get('/api/dashboard/stats', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const { tenantId } = getRequestTenantContext(req);

        const patientsQuery = tenantId ? 'SELECT COUNT(*) as cnt FROM patients WHERE tenant_id=$1' : 'SELECT COUNT(*) as cnt FROM patients';
        const revenueQuery = tenantId ? 'SELECT COALESCE(SUM(total),0) as total FROM invoices WHERE paid=1 AND tenant_id=$1' : 'SELECT COALESCE(SUM(total),0) as total FROM invoices WHERE paid=1';
        const waitingQuery = tenantId ? "SELECT COUNT(*) as cnt FROM patients WHERE status='Waiting' AND tenant_id=$1" : "SELECT COUNT(*) as cnt FROM patients WHERE status='Waiting'";
        const pendingClaimsQuery = tenantId ? "SELECT COUNT(*) as cnt FROM insurance_claims WHERE status='Pending' AND tenant_id=$1" : "SELECT COUNT(*) as cnt FROM insurance_claims WHERE status='Pending'";
        const todayApptsQuery = tenantId ? "SELECT COUNT(*) as cnt FROM appointments WHERE appt_date=CURRENT_DATE::TEXT AND tenant_id=$1" : "SELECT COUNT(*) as cnt FROM appointments WHERE appt_date=CURRENT_DATE::TEXT";

        const params = tenantId ? [tenantId] : [];

        const patients = (await pool.query(patientsQuery, params)).rows[0].cnt;
        const revenue = (await pool.query(revenueQuery, params)).rows[0].total;
        const waiting = (await pool.query(waitingQuery, params)).rows[0].cnt;
        const pendingClaims = (await pool.query(pendingClaimsQuery, params)).rows[0].cnt;
        const todayAppts = (await pool.query(todayApptsQuery, params)).rows[0].cnt;

        // employees is a deferred risk table (no tenant_id column)
        const employees = (await pool.query('SELECT COUNT(*) as cnt FROM employees')).rows[0].cnt;

        res.json({ patients, revenue, waiting, pendingClaims, todayAppts, employees });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== PATIENTS =====
app.get('/api/patients', requireAuth, requireRole('patients'), async (req, res) => {
    try {
        const { search } = req.query;
        const { tenantId } = getRequestTenantContext(req);
        let rows;
        if (search) {
            const s = `%${search}%`;
            if (tenantId) {
                rows = (await pool.query(`SELECT * FROM patients WHERE (name_ar ILIKE $1 OR name_en ILIKE $2 OR national_id LIKE $3 OR phone LIKE $4 OR CAST(file_number AS TEXT) LIKE $5) AND tenant_id = $6 ORDER BY id DESC LIMIT 200`, [s, s, s, s, s, tenantId])).rows;
            } else {
                rows = (await pool.query(`SELECT * FROM patients WHERE (name_ar ILIKE $1 OR name_en ILIKE $2 OR national_id LIKE $3 OR phone LIKE $4 OR CAST(file_number AS TEXT) LIKE $5) ORDER BY id DESC LIMIT 200`, [s, s, s, s, s])).rows;
            }
        } else {
            if (tenantId) {
                rows = (await pool.query('SELECT * FROM patients WHERE tenant_id = $1 ORDER BY id DESC LIMIT 200', [tenantId])).rows;
            } else {
                rows = (await pool.query('SELECT * FROM patients ORDER BY id DESC LIMIT 200')).rows;
            }
        }
        res.json(rows);
    } catch (e) { console.error('Patients query error:', e.message); res.status(500).json({ error: 'Server error' }); }
});

// ===== GET PATIENT BY ID (with tenant scope) =====
app.get('/api/patients/:id', requireAuth, requireRole('patients'), async (req, res) => {
    try {
        const { tenantId } = getRequestTenantContext(req);
        const whereClause = tenantId ? 'WHERE id=$1 AND tenant_id=$2' : 'WHERE id=$1';
        const queryParams = tenantId ? [req.params.id, tenantId] : [req.params.id];
        const patient = (await pool.query(`SELECT * FROM patients ${whereClause}`, queryParams)).rows[0];
        if (!patient) return res.status(404).json({ error: 'Patient not found' });
        res.json(patient);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/patients', requireAuth, requireRole('patients'), async (req, res) => {
    try {
        const { name_ar, name_en, national_id, nationality, gender, phone, department, amount, payment_method, dob, dob_hijri, blood_type, allergies, chronic_diseases, emergency_contact_name, emergency_contact_phone, address, insurance_company, insurance_policy_number, insurance_class } = req.body;
        const maxFile = (await pool.query('SELECT COALESCE(MAX(file_number), 1000) as mf FROM patients')).rows[0].mf;
        let age = 0;
        if (dob) {
            const bd = new Date(dob);
            const ageDifMs = Date.now() - bd.getTime();
            const ageDate = new Date(ageDifMs);
            age = Math.abs(ageDate.getUTCFullYear() - 1970);
        }
        const fileOpenFee = parseFloat(amount) || 0;
        const newFileNum = maxFile + 1;
        const mrn = 'MRN-' + String(newFileNum).padStart(6, '0');
        // --- TENANT SCOPE: stamp tenant_id & facility_id from session (never from body) ---
        const { tenantId, facilityId } = getRequestTenantContext(req);
        const result = await pool.query('INSERT INTO patients (file_number, mrn, name_ar, name_en, national_id, nationality, gender, phone, department, amount, payment_method, dob, dob_hijri, age, blood_type, allergies, chronic_diseases, emergency_contact_name, emergency_contact_phone, address, insurance_company, insurance_policy_number, insurance_class, tenant_id, facility_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25) RETURNING id',
            [newFileNum, mrn, name_ar || '', name_en || '', national_id || '', nationality || '', gender || '', phone || '', department || '', fileOpenFee, payment_method || '', dob || '', dob_hijri || '', age || 0, blood_type || '', allergies || '', chronic_diseases || '', emergency_contact_name || '', emergency_contact_phone || '', address || '', insurance_company || '', insurance_policy_number || '', insurance_class || '', tenantId || null, facilityId || null]);
        const patient = (await pool.query('SELECT * FROM patients WHERE id=$1', [result.rows[0].id])).rows[0];
        // Auto-create invoice for file opening fee (with VAT for non-Saudis)
        if (fileOpenFee > 0) {
            const vat = await calcVAT(patient.id);
            const { total: finalTotal, vatAmount } = addVAT(fileOpenFee, vat.rate);
            const desc = vat.applyVAT ? `فتح ملف / File Opening Fee (+ ضريبة ${vatAmount} SAR)` : 'فتح ملف / File Opening Fee';
            await pool.query('INSERT INTO invoices (patient_id, patient_name, total, vat_amount, description, service_type, paid, payment_method, tenant_id, facility_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
                [patient.id, name_en || name_ar, finalTotal, vatAmount, desc, 'File Opening', payment_method === 'كاش' || payment_method === 'Cash' ? 1 : 0, payment_method || '', tenantId || null, facilityId || null]);
        }
        logAudit(req.session.user?.id, req.session.user?.display_name, 'CREATE_PATIENT', 'Patients', 'Created patient ' + (name_en || name_ar) + ' MRN:' + mrn, req.ip);
        res.json(patient);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.put('/api/patients/:id', requireAuth, requireRole('patients'), async (req, res) => {
    try {
        const { name_ar, name_en, national_id, nationality, gender, phone, dob, dob_hijri, department, status, blood_type, allergies, chronic_diseases, emergency_contact_name, emergency_contact_phone, address, insurance_company, insurance_policy_number, insurance_class } = req.body;
        // --- TENANT SCOPE: verify record belongs to current tenant before update (IDOR prevention) ---
        const { tenantId } = getRequestTenantContext(req);
        const tenantCheck = tenantId ? ' AND tenant_id=$2' : '';
        const tenantParams = tenantId ? [req.params.id, tenantId] : [req.params.id];
        const existing = (await pool.query(`SELECT id FROM patients WHERE id=$1${tenantCheck}`, tenantParams)).rows[0];
        if (!existing) return res.status(404).json({ error: 'Patient not found' });
        const sets = []; const vals = []; let i = 1;
        if (name_ar !== undefined) { sets.push(`name_ar=$${i++}`); vals.push(name_ar); }
        if (name_en !== undefined) { sets.push(`name_en=$${i++}`); vals.push(name_en); }
        if (national_id !== undefined) { sets.push(`national_id=$${i++}`); vals.push(national_id); }
        if (nationality !== undefined) { sets.push(`nationality=$${i++}`); vals.push(nationality); }
        if (gender !== undefined) { sets.push(`gender=$${i++}`); vals.push(gender); }
        if (phone !== undefined) { sets.push(`phone=$${i++}`); vals.push(phone); }
        if (dob !== undefined) { sets.push(`dob=$${i++}`); vals.push(dob); }
        if (dob_hijri !== undefined) { sets.push(`dob_hijri=$${i++}`); vals.push(dob_hijri); }
        if (department !== undefined) { sets.push(`department=$${i++}`); vals.push(department); }
        if (status !== undefined) { sets.push(`status=$${i++}`); vals.push(status); }
        if (blood_type !== undefined) { sets.push(`blood_type=$${i++}`); vals.push(blood_type); }
        if (allergies !== undefined) { sets.push(`allergies=$${i++}`); vals.push(allergies); }
        if (chronic_diseases !== undefined) { sets.push(`chronic_diseases=$${i++}`); vals.push(chronic_diseases); }
        if (emergency_contact_name !== undefined) { sets.push(`emergency_contact_name=$${i++}`); vals.push(emergency_contact_name); }
        if (emergency_contact_phone !== undefined) { sets.push(`emergency_contact_phone=$${i++}`); vals.push(emergency_contact_phone); }
        if (address !== undefined) { sets.push(`address=$${i++}`); vals.push(address); }
        if (insurance_company !== undefined) { sets.push(`insurance_company=$${i++}`); vals.push(insurance_company); }
        if (insurance_policy_number !== undefined) { sets.push(`insurance_policy_number=$${i++}`); vals.push(insurance_policy_number); }
        if (insurance_class !== undefined) { sets.push(`insurance_class=$${i++}`); vals.push(insurance_class); }
        if (sets.length > 0) {
            vals.push(req.params.id);
            // --- TENANT SCOPE: enforce tenant_id in WHERE using parameterized query (not interpolation) ---
            if (tenantId) {
                vals.push(tenantId);
                await pool.query(`UPDATE patients SET ${sets.join(',')} WHERE id=$${i} AND tenant_id=$${i + 1}`, vals);
            } else {
                await pool.query(`UPDATE patients SET ${sets.join(',')} WHERE id=$${i}`, vals);
            }
        }
        logAudit(req.session.user?.id, req.session.user?.display_name, 'UPDATE_PATIENT', 'Patients', 'Updated patient #' + req.params.id, req.ip);
        const patient = (await pool.query('SELECT * FROM patients WHERE id=$1', [req.params.id])).rows[0];
        res.json(patient);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// DELETE /api/patients/:id hard-delete route was removed to prevent routing conflicts and compliance breaches.
// All patient deletion operations are processed securely by the safe soft-delete handler.

// ===== NURSING =====
app.get('/api/nursing/vitals', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const { tenantId } = getRequestTenantContext(req);
        let q = 'SELECT * FROM nursing_vitals';
        let params = [];
        if (tenantId) {
            q += ' WHERE tenant_id=$1';
            params.push(tenantId);
        }
        q += ' ORDER BY id DESC LIMIT 100';
        res.json((await pool.query(q, params)).rows);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/nursing/vitals/:patientId', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const { tenantId } = getRequestTenantContext(req);
        if (tenantId) {
            const patientCheck = await pool.query('SELECT id FROM patients WHERE id=$1 AND tenant_id=$2', [req.params.patientId, tenantId]);
            if (patientCheck.rows.length === 0) return res.status(404).json({ error: 'Patient not found' });
        }
        let q = 'SELECT * FROM nursing_vitals WHERE patient_id=$1';
        let params = [req.params.patientId];
        if (tenantId) {
            q += ' AND tenant_id=$2';
            params.push(tenantId);
        }
        q += ' ORDER BY id DESC LIMIT 1';
        res.json((await pool.query(q, params)).rows);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/nursing/vitals', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const { patient_id, patient_name, bp, temp, weight, height, pulse, o2_sat, respiratory_rate, blood_sugar, chronic_diseases, current_medications, allergies, notes } = req.body;
        const { tenantId, facilityId } = getRequestTenantContext(req);
        if (tenantId) {
            const patientCheck = await pool.query('SELECT id FROM patients WHERE id=$1 AND tenant_id=$2', [patient_id, tenantId]);
            if (patientCheck.rows.length === 0) return res.status(404).json({ error: 'Patient not found' });
        }
        await pool.query('INSERT INTO nursing_vitals (patient_id, patient_name, bp, temp, weight, height, pulse, o2_sat, respiratory_rate, blood_sugar, chronic_diseases, current_medications, allergies, notes, tenant_id, facility_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)',
            [patient_id, patient_name || '', bp || '', temp || 0, weight || 0, height || 0, pulse || 0, o2_sat || 0, respiratory_rate || 0, blood_sugar || 0, chronic_diseases || '', current_medications || '', allergies || '', notes || '', tenantId || null, facilityId || null]);

        let updateQ = 'UPDATE patients SET status=$1 WHERE id=$2';
        let updateParams = ['Waiting', patient_id];
        if (tenantId) {
            updateQ += ' AND tenant_id=$3';
            updateParams.push(tenantId);
        }
        await pool.query(updateQ, updateParams);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== APPOINTMENTS =====
app.get('/api/appointments', requireAuth, requireRole('appointments'), async (req, res) => {
    try {
        // --- TENANT SCOPE: filter appointments by current tenant_id ---
        const { tenantId } = getRequestTenantContext(req);
        let rows;
        if (tenantId) {
            rows = (await pool.query('SELECT * FROM appointments WHERE tenant_id = $1 ORDER BY id DESC', [tenantId])).rows;
        } else {
            rows = (await pool.query('SELECT * FROM appointments ORDER BY id DESC')).rows;
        }
        res.json(rows);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/appointments', requireAuth, requireRole('appointments'), async (req, res) => {
    try {
        const { patient_name, patient_id, doctor_name, department, appt_date, appt_time, notes, fee } = req.body;
        const apptFee = parseFloat(fee) || 0;
        // --- TENANT SCOPE: stamp tenant_id & facility_id from session (never from body) ---
        const { tenantId, facilityId } = getRequestTenantContext(req);
        const result = await pool.query('INSERT INTO appointments (patient_id, patient_name, doctor_name, department, appt_date, appt_time, notes, tenant_id, facility_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id',
            [patient_id || null, patient_name, doctor_name, department, appt_date, appt_time, notes || '', tenantId || null, facilityId || null]);
        // Auto-create invoice for appointment fee
        if (apptFee > 0 && patient_id) {
            await pool.query('INSERT INTO invoices (patient_id, patient_name, total, description, service_type, paid, tenant_id, facility_id) VALUES ($1,$2,$3,$4,$5,0,$6,$7)',
                [patient_id, patient_name, apptFee, `رسوم موعد: ${doctor_name} - ${appt_date}`, 'Appointment', tenantId || null, facilityId || null]);
        }
        const appt = (await pool.query('SELECT * FROM appointments WHERE id=$1', [result.rows[0].id])).rows[0];

        // AUTO: Add to waiting queue when appointment is today
        try {
            const apptDate = new Date(appt_date);
            const today = new Date();
            if (apptDate.toDateString() === today.toDateString()) {
                await pool.query(
                    "INSERT INTO waiting_queue (patient_id, patient_name, doctor, department, status, check_in_time, tenant_id) VALUES ($1, $2, $3, $4, 'Waiting', CURRENT_TIMESTAMP, $5) ON CONFLICT DO NOTHING",
                    [patient_id, patient_name, doctor_name, department || 'General', tenantId || null]
                );
            }
        } catch (qe) { console.error('Queue auto-insert:', qe.message); }
        logAudit(req.session.user?.id, req.session.user?.display_name, 'CREATE_APPOINTMENT', 'Appointments',
            `Appointment for ${patient_name} with Dr. ${doctor_name} on ${appt_date}`, req.ip);
        res.json(appt);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.delete('/api/appointments/:id', requireAuth, requireRole('appointments'), async (req, res) => {
    try {
        // --- TENANT SCOPE: verify record belongs to current tenant before delete (IDOR prevention) ---
        const { tenantId } = getRequestTenantContext(req);
        const tenantCheck = tenantId ? ' AND tenant_id=$2' : '';
        const tenantParams = tenantId ? [req.params.id, tenantId] : [req.params.id];
        const appt = (await pool.query(`SELECT * FROM appointments WHERE id=$1${tenantCheck}`, tenantParams)).rows[0];
        if (!appt) return res.status(404).json({ error: 'Appointment not found' });
        await pool.query('DELETE FROM appointments WHERE id=$1', [req.params.id]);
        logAudit(req.session.user?.id, req.session.user?.display_name, 'DELETE_APPOINTMENT', 'Appointments',
            `Deleted appointment #${req.params.id} for ${appt.patient_name}`, req.ip);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== EMPLOYEES =====
app.get('/api/employees', requireAuth, async (req, res) => {
    try {
        const { role } = req.query;
        if (role) { res.json((await pool.query('SELECT * FROM employees WHERE role LIKE $1 ORDER BY name', [`%${role}%`])).rows); }
        else { res.json((await pool.query('SELECT * FROM employees ORDER BY id DESC')).rows); }
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// employee create/delete = HR/Admin only (requireRole('hr') passes HR + Admin='*'); GET stays open for doctor/staff lists
app.post('/api/employees', requireAuth, requireRole('hr'), async (req, res) => {
    try {
        const { name, name_ar, name_en, role, department_ar, department_en, salary, commission_type, commission_value } = req.body;
        const result = await pool.query('INSERT INTO employees (name, name_ar, name_en, role, department_ar, department_en, salary, commission_type, commission_value) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id',
            [name || name_en, name_ar || '', name_en || '', role || 'Staff', department_ar || '', department_en || '', salary || 0, commission_type || 'percentage', parseFloat(commission_value) || 0]);
        logAudit(req.session.user?.id, req.session.user?.display_name, 'CREATE_EMPLOYEE', 'HR', `Created employee #${result.rows[0].id} (${name_en || name || ''})`, req.ip);
        res.json((await pool.query('SELECT * FROM employees WHERE id=$1', [result.rows[0].id])).rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.delete('/api/employees/:id', requireAuth, requireRole('hr'), async (req, res) => {
    try {
        await pool.query('DELETE FROM employees WHERE id=$1', [req.params.id]);
        logAudit(req.session.user?.id, req.session.user?.display_name, 'DELETE_EMPLOYEE', 'HR', `Deleted employee #${req.params.id}`, req.ip);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== INVOICES =====
app.get('/api/invoices', requireAuth, requireRole('invoices', 'accounts'), async (req, res) => {
    try {
        const { tenantId } = getRequestTenantContext(req);
        let rows;
        if (tenantId) {
            rows = (await pool.query('SELECT * FROM invoices WHERE tenant_id = $1 ORDER BY id DESC', [tenantId])).rows;
        } else {
            rows = (await pool.query('SELECT * FROM invoices ORDER BY id DESC')).rows;
        }
        res.json(rows);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/invoices', requireAuth, requireRole('invoices', 'accounts'), async (req, res) => {
    try {
        const { patient_id, patient_name, total, description, service_type, payment_method, discount, discount_reason } = req.body;
        // Generate sequential invoice number
        const maxInv = (await pool.query("SELECT invoice_number FROM invoices WHERE invoice_number LIKE 'INV-%' ORDER BY id DESC LIMIT 1")).rows[0];
        let nextNum = 1;
        if (maxInv && maxInv.invoice_number) { const parts = maxInv.invoice_number.split('-'); nextNum = parseInt(parts[2]) + 1; }
        const invNumber = 'INV-' + new Date().getFullYear() + '-' + String(nextNum).padStart(5, '0');
        const createdBy = req.session.user?.display_name || '';
        // --- TENANT SCOPE: stamp tenant_id & facility_id from session (never from body) ---
        const { tenantId, facilityId } = getRequestTenantContext(req);
        const result = await pool.query(
            'INSERT INTO invoices (patient_id, patient_name, total, description, service_type, payment_method, discount, discount_reason, invoice_number, created_by, original_amount, tenant_id, facility_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id',
            [patient_id || null, patient_name, total || 0, description || '', service_type || '', payment_method || '', discount || 0, discount_reason || '', invNumber, createdBy, (total || 0) + (discount || 0), tenantId || null, facilityId || null]);
        logAudit(req.session.user?.id, createdBy, 'CREATE_INVOICE', 'Finance', invNumber + ' - ' + (total || 0) + ' SAR for ' + patient_name, req.ip);
        res.json((await pool.query('SELECT * FROM invoices WHERE id=$1', [result.rows[0].id])).rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== INSURANCE =====
app.get('/api/insurance/companies', requireAuth, requireRole('insurance'), async (req, res) => {
    try { res.json((await pool.query('SELECT * FROM insurance_companies ORDER BY id DESC')).rows); }
    catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/insurance/companies', requireAuth, requireRole('insurance'), async (req, res) => {
    try {
        const { name_ar, name_en, contact_info } = req.body;
        const result = await pool.query('INSERT INTO insurance_companies (name_ar, name_en, contact_info) VALUES ($1,$2,$3) RETURNING id',
            [name_ar || '', name_en || '', contact_info || '']);
        res.json((await pool.query('SELECT * FROM insurance_companies WHERE id=$1', [result.rows[0].id])).rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/insurance/claims', requireAuth, requireRole('insurance'), async (req, res) => {
    try { res.json((await pool.query('SELECT * FROM insurance_claims ORDER BY id DESC')).rows); }
    catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/insurance/claims', requireAuth, requireRole('insurance'), async (req, res) => {
    try {
        const { patient_name, insurance_company, claim_amount } = req.body;
        const result = await pool.query('INSERT INTO insurance_claims (patient_name, insurance_company, claim_amount) VALUES ($1,$2,$3) RETURNING id',
            [patient_name, insurance_company, claim_amount || 0]);
        res.json((await pool.query('SELECT * FROM insurance_claims WHERE id=$1', [result.rows[0].id])).rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.put('/api/insurance/claims/:id', requireAuth, requireRole('insurance'), async (req, res) => {
    try {
        const { status } = req.body;
        if (status) await pool.query('UPDATE insurance_claims SET status=$1 WHERE id=$2', [status, req.params.id]);
        res.json((await pool.query('SELECT * FROM insurance_claims WHERE id=$1', [req.params.id])).rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/medical/records', requireAuth, requireRole('doctor', 'nursing'), async (req, res) => {
    try {
        const { patient_id } = req.query;
        if (patient_id) {
            res.json((await pool.query('SELECT mr.*, p.name_en as patient_name FROM medical_records mr LEFT JOIN patients p ON mr.patient_id=p.id WHERE mr.patient_id=$1 ORDER BY mr.id DESC', [patient_id])).rows);
        } else {
            res.json((await pool.query('SELECT mr.*, p.name_en as patient_name FROM medical_records mr LEFT JOIN patients p ON mr.patient_id=p.id ORDER BY mr.id DESC')).rows);
        }
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/medical/records', requireAuth, requireRole('doctor', 'nursing'), async (req, res) => {
    try {
        const { patient_id, doctor_id, diagnosis, symptoms, icd10_codes, notes } = req.body;
        const result = await pool.query('INSERT INTO medical_records (patient_id, doctor_id, diagnosis, symptoms, icd10_codes, notes) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
            [patient_id, doctor_id || 0, diagnosis || '', symptoms || '', icd10_codes || '', notes || '']);
        res.json((await pool.query('SELECT * FROM medical_records WHERE id=$1', [result.rows[0].id])).rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== MEDICAL SERVICES =====
app.get('/api/medical/services', requireAuth, async (req, res) => {
    try {
        const { tenantId } = getRequestTenantContext(req);
        const { specialty } = req.query;
        let sql, params;
        if (specialty) {
            sql = `
                SELECT
                    ms.id,
                    ms.name_en,
                    ms.name_ar,
                    ms.specialty,
                    ms.category,
                    COALESCE(o.custom_price, ms.price) AS price,
                    COALESCE(ms.is_active, 1) AS is_active
                FROM medical_services ms
                LEFT JOIN tenant_service_overrides o ON ms.id = o.service_id AND o.tenant_id = $1
                WHERE ms.specialty = $2
                ORDER BY ms.category, ms.name_en
            `;
            params = [tenantId || null, specialty];
        } else {
            sql = `
                SELECT
                    ms.id,
                    ms.name_en,
                    ms.name_ar,
                    ms.specialty,
                    ms.category,
                    COALESCE(o.custom_price, ms.price) AS price,
                    COALESCE(ms.is_active, 1) AS is_active
                FROM medical_services ms
                LEFT JOIN tenant_service_overrides o ON ms.id = o.service_id AND o.tenant_id = $1
                ORDER BY ms.specialty, ms.category, ms.name_en
            `;
            params = [tenantId || null];
        }
        res.json((await pool.query(sql, params)).rows);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.put('/api/medical/services/:id', requireAuth, requireCatalogAccess, async (req, res) => {
    try {
        const { tenantId } = getRequestTenantContext(req);
        if (!tenantId) return res.status(400).json({ error: 'Tenant context required' });
        const { price } = req.body;
        if (price === undefined) return res.status(400).json({ error: 'Price required' });

        await pool.query(`
            INSERT INTO tenant_service_overrides (tenant_id, service_id, custom_price, is_active)
            VALUES ($1, $2, $3, 1)
            ON CONFLICT (tenant_id, service_id)
            DO UPDATE SET custom_price = EXCLUDED.custom_price, updated_at = CURRENT_TIMESTAMP
        `, [tenantId, req.params.id, price]);

        const resolved = await pool.query(`
            SELECT
                ms.id,
                ms.name_en,
                ms.name_ar,
                ms.specialty,
                ms.category,
                COALESCE(o.custom_price, ms.price) AS price,
                COALESCE(ms.is_active, 1) AS is_active
            FROM medical_services ms
            LEFT JOIN tenant_service_overrides o ON ms.id = o.service_id AND o.tenant_id = $1
            WHERE ms.id = $2
        `, [tenantId, req.params.id]);

        res.json(resolved.rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== DOCTOR PROCEDURE BILLING =====
app.post('/api/medical/bill-procedures', requireAuth, async (req, res) => {
    try {
        const { patient_id, services } = req.body;
        if (!patient_id || !services || !services.length) return res.status(400).json({ error: 'Missing patient or services' });
        const p = (await pool.query('SELECT name_en, name_ar FROM patients WHERE id=$1', [patient_id])).rows[0];
        if (!p) return res.status(404).json({ error: 'Patient not found' });
        let totalBilled = 0;
        const descriptions = [];
        for (const svc of services) {
            totalBilled += parseFloat(svc.price) || 0;
            descriptions.push(`${svc.nameEn || svc.nameAr} (${svc.price} SAR)`);
        }
        if (totalBilled > 0) {
            const vat = await calcVAT(patient_id);
            const { total: finalTotal, vatAmount } = addVAT(totalBilled, vat.rate);
            const desc = descriptions.join(' | ') + (vat.applyVAT ? ` (+ ضريبة ${vatAmount} SAR)` : '');
            await pool.query('INSERT INTO invoices (patient_id, patient_name, total, vat_amount, description, service_type, paid) VALUES ($1,$2,$3,$4,$5,$6,0)',
                [patient_id, p.name_en || p.name_ar, finalTotal, vatAmount, desc, 'Consultation']);
        }
        res.json({ success: true, totalBilled, invoiceCount: 1 });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== DEPARTMENT RESOURCE REQUESTS =====
app.get('/api/dept-requests', requireAuth, async (req, res) => {
    try {
        const { tenantId } = getRequestTenantContext(req);
        const query = tenantId ?
            'SELECT * FROM inventory_dept_requests WHERE tenant_id=$1 ORDER BY id DESC' :
            'SELECT * FROM inventory_dept_requests ORDER BY id DESC';
        const params = tenantId ? [tenantId] : [];
        res.json((await pool.query(query, params)).rows);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/dept-requests', requireAuth, async (req, res) => {
    try {
        const { tenantId, facilityId } = getRequestTenantContext(req);
        const { department, requested_by, items, notes } = req.body;

        // 1. Verify items belong to the current tenant to prevent cross-tenant IDOR
        if (tenantId && items && items.length) {
            for (const item of items) {
                const itemCheck = (await pool.query('SELECT id FROM inventory_items WHERE id=$1 AND tenant_id=$2', [item.item_id || 0, tenantId])).rows[0];
                if (!itemCheck) {
                    return res.status(404).json({ error: `Item not found or access denied for item #${item.item_id}` });
                }
            }
        }

        const result = await pool.query('INSERT INTO inventory_dept_requests (department, requested_by, request_date, notes, tenant_id, branch_id) VALUES ($1,$2,CURRENT_DATE::TEXT,$3,$4,$5) RETURNING id',
            [department || '', requested_by || req.session.user?.display_name || '', notes || '', tenantId || null, facilityId || null]);
        const reqId = result.rows[0].id;

        if (items && items.length) {
            for (const item of items) {
                await pool.query('INSERT INTO inventory_dept_request_items (request_id, item_id, qty_requested, tenant_id, branch_id) VALUES ($1,$2,$3,$4,$5)',
                    [reqId, item.item_id || 0, item.qty || 1, tenantId || null, facilityId || null]);
            }
        }

        logAudit(req.session.user?.id, req.session.user?.display_name, 'CREATE_DEPT_REQUEST', 'Inventory', `Created department request #${reqId} for ${department}`, req.ip);

        const query = tenantId ?
            'SELECT * FROM inventory_dept_requests WHERE id=$1 AND tenant_id=$2' :
            'SELECT * FROM inventory_dept_requests WHERE id=$1';
        const params = tenantId ? [reqId, tenantId] : [reqId];
        res.json((await pool.query(query, params)).rows[0]);
    } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/dept-requests/:id/items', requireAuth, async (req, res) => {
    try {
        const { tenantId } = getRequestTenantContext(req);
        if (tenantId) {
            const check = (await pool.query('SELECT id FROM inventory_dept_requests WHERE id=$1 AND tenant_id=$2', [req.params.id, tenantId])).rows[0];
            if (!check) return res.status(404).json({ error: 'Request not found' });
        }
        const query = tenantId ?
            'SELECT dri.*, ii.item_name FROM inventory_dept_request_items dri LEFT JOIN inventory_items ii ON dri.item_id=ii.id WHERE dri.request_id=$1 AND dri.tenant_id=$2' :
            'SELECT dri.*, ii.item_name FROM inventory_dept_request_items dri LEFT JOIN inventory_items ii ON dri.item_id=ii.id WHERE dri.request_id=$1';
        const params = tenantId ? [req.params.id, tenantId] : [req.params.id];
        res.json((await pool.query(query, params)).rows);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.put('/api/dept-requests/:id', requireAuth, async (req, res) => {
    try {
        const { tenantId } = getRequestTenantContext(req);
        if (tenantId) {
            const check = (await pool.query('SELECT id FROM inventory_dept_requests WHERE id=$1 AND tenant_id=$2', [req.params.id, tenantId])).rows[0];
            if (!check) return res.status(404).json({ error: 'Request not found' });
        }

        const { status, approved_by } = req.body;
        if (status) {
            const queryUpdate = tenantId ?
                'UPDATE inventory_dept_requests SET status=$1, approved_by=$2 WHERE id=$3 AND tenant_id=$4' :
                'UPDATE inventory_dept_requests SET status=$1, approved_by=$2 WHERE id=$3';
            const paramsUpdate = tenantId ?
                [status, approved_by || req.session.user?.display_name || 'System', req.params.id, tenantId] :
                [status, approved_by || req.session.user?.display_name || 'System', req.params.id];
            await pool.query(queryUpdate, paramsUpdate);

            // If approved, deduct from inventory
            if (status === 'Approved') {
                const queryItems = tenantId ?
                    'SELECT * FROM inventory_dept_request_items WHERE request_id=$1 AND tenant_id=$2' :
                    'SELECT * FROM inventory_dept_request_items WHERE request_id=$1';
                const paramsItems = tenantId ? [req.params.id, tenantId] : [req.params.id];
                const items = (await pool.query(queryItems, paramsItems)).rows;

                for (const item of items) {
                    const approved = item.qty_approved || item.qty_requested;
                    const queryDeduct = tenantId ?
                        'UPDATE inventory_items SET stock_qty = GREATEST(stock_qty - $1, 0) WHERE id=$2 AND tenant_id=$3' :
                        'UPDATE inventory_items SET stock_qty = GREATEST(stock_qty - $1, 0) WHERE id=$2';
                    const paramsDeduct = tenantId ? [approved, item.item_id, tenantId] : [approved, item.item_id];
                    await pool.query(queryDeduct, paramsDeduct);
                }
            }
            logAudit(req.session.user?.id, req.session.user?.display_name, 'UPDATE_DEPT_REQUEST_STATUS', 'Inventory', `Updated request #${req.params.id} status to ${status}`, req.ip);
        }

        const queryFinal = tenantId ?
            'SELECT * FROM inventory_dept_requests WHERE id=$1 AND tenant_id=$2' :
            'SELECT * FROM inventory_dept_requests WHERE id=$1';
        const paramsFinal = tenantId ? [req.params.id, tenantId] : [req.params.id];
        res.json((await pool.query(queryFinal, paramsFinal)).rows[0]);
    } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

// ===== BILLING SUMMARY =====
app.get('/api/billing/summary/:patient_id', requireAuth, requireRole('invoices', 'accounts'), async (req, res) => {
    try {
        const pid = req.params.patient_id;
        const invoices = (await pool.query('SELECT * FROM invoices WHERE patient_id=$1 ORDER BY id DESC', [pid])).rows;
        const byType = {};
        invoices.forEach(inv => {
            const t = inv.service_type || 'Other';
            if (!byType[t]) byType[t] = { count: 0, total: 0, paid: 0 };
            byType[t].count++;
            byType[t].total += parseFloat(inv.total) || 0;
            if (inv.paid) byType[t].paid += parseFloat(inv.total) || 0;
        });
        const totalBilled = invoices.reduce((s, i) => s + (parseFloat(i.total) || 0), 0);
        const totalPaid = invoices.filter(i => i.paid).reduce((s, i) => s + (parseFloat(i.total) || 0), 0);
        res.json({ invoices, byType, totalBilled, totalPaid, balance: totalBilled - totalPaid });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== CATALOG APIs =====
app.get('/api/catalog/lab', requireAuth, async (req, res) => {
    try {
        const { tenantId } = getRequestTenantContext(req);
        const sql = `
            SELECT
                lt.id,
                lt.test_name,
                lt.category,
                lt.normal_range,
                COALESCE(o.custom_price, lt.price) AS price,
                COALESCE(o.is_active, 1) AS is_active
            FROM lab_tests_catalog lt
            LEFT JOIN tenant_lab_test_overrides o ON lt.id = o.test_id AND o.tenant_id = $1
            ORDER BY lt.category, lt.test_name
        `;
        res.json((await pool.query(sql, [tenantId || null])).rows);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.put('/api/catalog/lab/:id', requireAuth, requireCatalogAccess, async (req, res) => {
    try {
        const { tenantId } = getRequestTenantContext(req);
        if (!tenantId) return res.status(400).json({ error: 'Tenant context required' });
        const { price } = req.body;
        if (price === undefined) return res.status(400).json({ error: 'Price required' });

        await pool.query(`
            INSERT INTO tenant_lab_test_overrides (tenant_id, test_id, custom_price, is_active)
            VALUES ($1, $2, $3, 1)
            ON CONFLICT (tenant_id, test_id)
            DO UPDATE SET custom_price = EXCLUDED.custom_price, updated_at = CURRENT_TIMESTAMP
        `, [tenantId, req.params.id, price]);

        const resolved = await pool.query(`
            SELECT
                lt.id,
                lt.test_name,
                lt.category,
                lt.normal_range,
                COALESCE(o.custom_price, lt.price) AS price,
                COALESCE(o.is_active, 1) AS is_active
            FROM lab_tests_catalog lt
            LEFT JOIN tenant_lab_test_overrides o ON lt.id = o.test_id AND o.tenant_id = $1
            WHERE lt.id = $2
        `, [tenantId, req.params.id]);

        res.json(resolved.rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/catalog/radiology', requireAuth, async (req, res) => {
    try {
        const { tenantId } = getRequestTenantContext(req);
        const sql = `
            SELECT
                rc.id,
                rc.modality,
                rc.exact_name,
                COALESCE(o.custom_template, rc.default_template) AS default_template,
                COALESCE(o.custom_price, rc.price) AS price,
                COALESCE(o.is_active, 1) AS is_active
            FROM radiology_catalog rc
            LEFT JOIN tenant_radiology_overrides o ON rc.id = o.radiology_id AND o.tenant_id = $1
            ORDER BY rc.modality, rc.exact_name
        `;
        res.json((await pool.query(sql, [tenantId || null])).rows);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.put('/api/catalog/radiology/:id', requireAuth, requireCatalogAccess, async (req, res) => {
    try {
        const { tenantId } = getRequestTenantContext(req);
        if (!tenantId) return res.status(400).json({ error: 'Tenant context required' });
        const { price, template } = req.body;

        if (price !== undefined) {
            await pool.query(`
                INSERT INTO tenant_radiology_overrides (tenant_id, radiology_id, custom_price, is_active)
                VALUES ($1, $2, $3, 1)
                ON CONFLICT (tenant_id, radiology_id)
                DO UPDATE SET custom_price = EXCLUDED.custom_price, updated_at = CURRENT_TIMESTAMP
            `, [tenantId, req.params.id, price]);
        }
        if (template !== undefined) {
            await pool.query(`
                INSERT INTO tenant_radiology_overrides (tenant_id, radiology_id, custom_price, custom_template, is_active)
                VALUES ($1, $2, 0, $3, 1)
                ON CONFLICT (tenant_id, radiology_id)
                DO UPDATE SET custom_template = EXCLUDED.custom_template, updated_at = CURRENT_TIMESTAMP
            `, [tenantId, req.params.id, template]);
        }

        const resolved = await pool.query(`
            SELECT
                rc.id,
                rc.modality,
                rc.exact_name,
                COALESCE(o.custom_template, rc.default_template) AS default_template,
                COALESCE(o.custom_price, rc.price) AS price,
                COALESCE(o.is_active, 1) AS is_active
            FROM radiology_catalog rc
            LEFT JOIN tenant_radiology_overrides o ON rc.id = o.radiology_id AND o.tenant_id = $1
            WHERE rc.id = $2
        `, [tenantId, req.params.id]);

        res.json(resolved.rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== LAB =====
app.get('/api/lab/orders', requireAuth, async (req, res) => {
    try {
        // --- TENANT SCOPE: filter lab orders by current tenant_id ---
        const { tenantId } = getRequestTenantContext(req);
        let rows;
        if (tenantId) {
            rows = (await pool.query(`SELECT lo.*, p.name_en as patient_name FROM lab_radiology_orders lo
                LEFT JOIN patients p ON lo.patient_id=p.id
                WHERE lo.is_radiology=0 AND lo.tenant_id=$1 ORDER BY lo.id DESC`, [tenantId])).rows;
        } else {
            rows = (await pool.query('SELECT lo.*, p.name_en as patient_name FROM lab_radiology_orders lo LEFT JOIN patients p ON lo.patient_id=p.id WHERE lo.is_radiology=0 ORDER BY lo.id DESC')).rows;
        }
        res.json(rows);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/lab/orders', requireAuth, async (req, res) => {
    try {
        const { patient_id, doctor_id, order_type, description, price } = req.body;
        // --- TENANT SCOPE: stamp tenant_id from session + validate patient belongs to same tenant ---
        const { tenantId, facilityId } = getRequestTenantContext(req);
        if (tenantId && patient_id) {
            const patientCheck = (await pool.query('SELECT id FROM patients WHERE id=$1 AND tenant_id=$2', [patient_id, tenantId])).rows[0];
            if (!patientCheck) return res.status(404).json({ error: 'Patient not found' });
        }
        // Auto-lookup price from lab catalog (with tenant overrides) if not provided
        let labPrice = parseFloat(price) || 0;
        if (!labPrice && order_type) {
            const catalogMatch = (await pool.query(`
                SELECT COALESCE(o.custom_price, lt.price) AS price
                FROM lab_tests_catalog lt
                LEFT JOIN tenant_lab_test_overrides o ON lt.id = o.test_id AND o.tenant_id = $2
                WHERE lt.test_name ILIKE $1 LIMIT 1
            `, [`%${order_type}%`, tenantId || null])).rows[0];
            if (catalogMatch) labPrice = catalogMatch.price;
        }
        const result = await pool.query('INSERT INTO lab_radiology_orders (patient_id, doctor_id, order_type, description, is_radiology, price, tenant_id, facility_id) VALUES ($1,$2,$3,$4,0,$5,$6,$7) RETURNING id',
            [patient_id, doctor_id || 0, order_type || '', description || '', labPrice, tenantId || null, facilityId || null]);
        // Auto-create invoice for lab test (with VAT for non-Saudis)
        if (labPrice > 0 && patient_id) {
            const p = (await pool.query('SELECT name_en, name_ar FROM patients WHERE id=$1', [patient_id])).rows[0];
            const vat = await calcVAT(patient_id);
            const { total: finalTotal, vatAmount } = addVAT(labPrice, vat.rate);
            const desc = `فحص مختبر: ${order_type}` + (vat.applyVAT ? ` (+ ضريبة ${vatAmount} SAR)` : '');
            await pool.query('INSERT INTO invoices (patient_id, patient_name, total, vat_amount, description, service_type, paid, tenant_id, facility_id) VALUES ($1,$2,$3,$4,$5,$6,0,$7,$8)',
                [patient_id, p?.name_en || p?.name_ar || '', finalTotal, vatAmount, desc, 'Lab Test', tenantId || null, facilityId || null]);
        }
        logAudit(req.session.user?.id, req.session.user?.display_name, 'CREATE_LAB_ORDER', 'Lab',
            `Lab order: ${order_type} for patient #${patient_id}`, req.ip);
        res.json((await pool.query('SELECT * FROM lab_radiology_orders WHERE id=$1', [result.rows[0].id])).rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/lab/catalog', requireAuth, async (req, res) => {
    try {
        const { tenantId } = getRequestTenantContext(req);
        const sql = `
            SELECT
                lt.id,
                lt.test_name,
                lt.category,
                lt.normal_range,
                COALESCE(o.custom_price, lt.price) AS price,
                COALESCE(o.is_active, 1) AS is_active
            FROM lab_tests_catalog lt
            LEFT JOIN tenant_lab_test_overrides o ON lt.id = o.test_id AND o.tenant_id = $1
            ORDER BY lt.id
        `;
        res.json((await pool.query(sql, [tenantId || null])).rows);
    }
    catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.put('/api/lab/orders/:id', requireAuth, async (req, res) => {
    try {
        const { status, result: testResult } = req.body;
        // --- TENANT SCOPE: verify order belongs to current tenant before update (IDOR prevention) ---
        const { tenantId } = getRequestTenantContext(req);
        const tenantCheck = tenantId ? ' AND tenant_id=$2' : '';
        const tenantParams = tenantId ? [req.params.id, tenantId] : [req.params.id];
        const orderCheck = (await pool.query(`SELECT * FROM lab_radiology_orders WHERE id=$1${tenantCheck}`, tenantParams)).rows[0];
        if (!orderCheck) return res.status(404).json({ error: 'Order not found' });
        if (status) await pool.query('UPDATE lab_radiology_orders SET status=$1 WHERE id=$2', [status, req.params.id]);
        // Notify doctor when result is ready
        if (status === 'Completed') {
            if (orderCheck) await pool.query('INSERT INTO notifications (user_id, title, message, type, module) VALUES ($1,$2,$3,$4,$5)',
                [orderCheck.doctor_id, (orderCheck.is_radiology ? 'Radiology' : 'Lab') + ' Result Ready',
                orderCheck.order_type + ' for patient #' + orderCheck.patient_id + ' is complete', 'success', 'Lab']);
        }
        if (testResult) await pool.query('UPDATE lab_radiology_orders SET results=$1 WHERE id=$2', [testResult, req.params.id]);
        logAudit(req.session.user?.id, req.session.user?.display_name, 'UPDATE_LAB_ORDER', 'Lab',
            `Updated lab order #${req.params.id} status:${status || '-'} result:${testResult ? 'yes' : 'no'}`, req.ip);
        res.json((await pool.query('SELECT * FROM lab_radiology_orders WHERE id=$1', [req.params.id])).rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== RADIOLOGY =====
app.get('/api/radiology/orders', requireAuth, async (req, res) => {
    try {
        // --- TENANT SCOPE: filter radiology orders by current tenant_id ---
        const { tenantId } = getRequestTenantContext(req);
        let rows;
        if (tenantId) {
            rows = (await pool.query(`SELECT lo.*, p.name_en as patient_name FROM lab_radiology_orders lo
                LEFT JOIN patients p ON lo.patient_id=p.id
                WHERE lo.is_radiology=1 AND lo.tenant_id=$1 ORDER BY lo.id DESC`, [tenantId])).rows;
        } else {
            rows = (await pool.query('SELECT lo.*, p.name_en as patient_name FROM lab_radiology_orders lo LEFT JOIN patients p ON lo.patient_id=p.id WHERE lo.is_radiology=1 ORDER BY lo.id DESC')).rows;
        }
        res.json(rows);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/radiology/catalog', requireAuth, async (req, res) => {
    try {
        const { tenantId } = getRequestTenantContext(req);
        const sql = `
            SELECT
                rc.id,
                rc.modality,
                rc.exact_name,
                COALESCE(o.custom_template, rc.default_template) AS default_template,
                COALESCE(o.custom_price, rc.price) AS price,
                COALESCE(o.is_active, 1) AS is_active
            FROM radiology_catalog rc
            LEFT JOIN tenant_radiology_overrides o ON rc.id = o.radiology_id AND o.tenant_id = $1
            ORDER BY rc.id
        `;
        res.json((await pool.query(sql, [tenantId || null])).rows);
    }
    catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.put('/api/radiology/orders/:id', requireAuth, async (req, res) => {
    try {
        const { status, result: testResult } = req.body;
        // --- TENANT SCOPE: verify order belongs to current tenant before update (IDOR prevention) ---
        const { tenantId } = getRequestTenantContext(req);
        const tenantCheck = tenantId ? ' AND tenant_id=$2' : '';
        const tenantParams = tenantId ? [req.params.id, tenantId] : [req.params.id];
        const orderCheck = (await pool.query(`SELECT id FROM lab_radiology_orders WHERE id=$1 AND is_radiology=1${tenantCheck}`, tenantParams)).rows[0];
        if (!orderCheck) return res.status(404).json({ error: 'Radiology order not found' });
        if (status) await pool.query('UPDATE lab_radiology_orders SET status=$1 WHERE id=$2', [status, req.params.id]);
        if (testResult) await pool.query('UPDATE lab_radiology_orders SET results=$1 WHERE id=$2', [testResult, req.params.id]);
        logAudit(req.session.user?.id, req.session.user?.display_name, 'UPDATE_RADIOLOGY_ORDER', 'Radiology',
            `Updated radiology order #${req.params.id} status:${status || '-'}`, req.ip);
        res.json((await pool.query('SELECT * FROM lab_radiology_orders WHERE id=$1', [req.params.id])).rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/radiology/orders', requireAuth, async (req, res) => {
    try {
        const { patient_id, doctor_id, order_type, description, price } = req.body;
        // --- TENANT SCOPE: stamp tenant_id from session + validate patient belongs to same tenant ---
        const { tenantId, facilityId } = getRequestTenantContext(req);
        if (tenantId && patient_id) {
            const patientCheck = (await pool.query('SELECT id FROM patients WHERE id=$1 AND tenant_id=$2', [patient_id, tenantId])).rows[0];
            if (!patientCheck) return res.status(404).json({ error: 'Patient not found' });
        }
        // Auto-lookup price from radiology catalog (with tenant overrides) if not provided
        let radPrice = parseFloat(price) || 0;
        if (!radPrice && order_type) {
            const catalogMatch = (await pool.query(`
                SELECT COALESCE(o.custom_price, rc.price) AS price
                FROM radiology_catalog rc
                LEFT JOIN tenant_radiology_overrides o ON rc.id = o.radiology_id AND o.tenant_id = $2
                WHERE rc.exact_name ILIKE $1 LIMIT 1
            `, [`%${order_type}%`, tenantId || null])).rows[0];
            if (catalogMatch) radPrice = catalogMatch.price;
        }
        const result = await pool.query('INSERT INTO lab_radiology_orders (patient_id, doctor_id, order_type, description, is_radiology, price, tenant_id, facility_id) VALUES ($1,$2,$3,$4,1,$5,$6,$7) RETURNING id',
            [patient_id, doctor_id || 0, order_type || '', description || '', radPrice, tenantId || null, facilityId || null]);
        // Auto-create invoice for radiology (with VAT for non-Saudis)
        if (radPrice > 0 && patient_id) {
            const p = (await pool.query('SELECT name_en, name_ar FROM patients WHERE id=$1', [patient_id])).rows[0];
            const vat = await calcVAT(patient_id);
            const { total: finalTotal, vatAmount } = addVAT(radPrice, vat.rate);
            const desc = `أشعة: ${order_type}` + (vat.applyVAT ? ` (+ ضريبة ${vatAmount} SAR)` : '');
            await pool.query('INSERT INTO invoices (patient_id, patient_name, total, vat_amount, description, service_type, paid, tenant_id, facility_id) VALUES ($1,$2,$3,$4,$5,$6,0,$7,$8)',
                [patient_id, p?.name_en || p?.name_ar || '', finalTotal, vatAmount, desc, 'Radiology', tenantId || null, facilityId || null]);
        }
        logAudit(req.session.user?.id, req.session.user?.display_name, 'CREATE_RADIOLOGY_ORDER', 'Radiology',
            `Radiology order: ${order_type} for patient #${patient_id}`, req.ip);
        res.json((await pool.query('SELECT * FROM lab_radiology_orders WHERE id=$1', [result.rows[0].id])).rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/radiology/orders/:id/upload', requireAuth, upload.single('image'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
        const orderId = req.params.id;
        // --- TENANT SCOPE: verify order belongs to current tenant before upload (IDOR prevention) ---
        const { tenantId } = getRequestTenantContext(req);
        const tenantCheck = tenantId ? ' AND tenant_id=$2' : '';
        const tenantParams = tenantId ? [orderId, tenantId] : [orderId];
        const order = (await pool.query(`SELECT * FROM lab_radiology_orders WHERE id=$1${tenantCheck}`, tenantParams)).rows[0];
        if (!order) return res.status(404).json({ error: 'Order not found' });
        const imagePath = `/uploads/radiology/${req.file.filename}`;
        const existingResults = order.results || '';
        const imageTag = `[IMG:${imagePath}]`;
        const newResults = existingResults ? `${existingResults}\n${imageTag}` : imageTag;
        await pool.query('UPDATE lab_radiology_orders SET results=$1 WHERE id=$2', [newResults, orderId]);
        logAudit(req.session.user?.id, req.session.user?.display_name, 'UPLOAD_RADIOLOGY_IMAGE', 'Radiology',
            `Uploaded image for radiology order #${orderId}`, req.ip);
        const updated = (await pool.query('SELECT * FROM lab_radiology_orders WHERE id=$1', [orderId])).rows[0];
        res.json({ success: true, path: imagePath, order: updated });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== PHARMACY =====
app.get('/api/pharmacy/drugs', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const { tenantId } = getRequestTenantContext(req);
        const query = tenantId ?
            'SELECT * FROM pharmacy_drug_catalog WHERE is_active=1 AND tenant_id=$1 ORDER BY drug_name' :
            'SELECT * FROM pharmacy_drug_catalog WHERE is_active=1 ORDER BY drug_name';
        const params = tenantId ? [tenantId] : [];
        res.json((await pool.query(query, params)).rows);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// Pharmacy low stock alerts
app.get('/api/pharmacy/low-stock', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const { tenantId } = getRequestTenantContext(req);
        const query = tenantId ?
            'SELECT * FROM pharmacy_drug_catalog WHERE is_active=1 AND stock_qty <= COALESCE(min_qty, 10) AND tenant_id=$1 ORDER BY stock_qty ASC' :
            'SELECT * FROM pharmacy_drug_catalog WHERE is_active=1 AND stock_qty <= COALESCE(min_qty, 10) ORDER BY stock_qty ASC';
        const params = tenantId ? [tenantId] : [];
        const lowStock = (await pool.query(query, params)).rows;
        res.json(lowStock);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/pharmacy/drugs', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const { drug_name, active_ingredient, category, unit, selling_price, cost_price, stock_qty } = req.body;
        const { tenantId, facilityId } = getRequestTenantContext(req);
        const result = await pool.query('INSERT INTO pharmacy_drug_catalog (drug_name, active_ingredient, category, unit, selling_price, cost_price, stock_qty, tenant_id, branch_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id',
            [drug_name, active_ingredient || '', category || '', unit || '', selling_price || 0, cost_price || 0, stock_qty || 0, tenantId || null, facilityId || null]);
        logAudit(req.session.user?.id, req.session.user?.display_name, 'ADD_DRUG', 'Pharmacy',
            `Added drug ${drug_name} to catalog`, req.ip);
        const selectQuery = tenantId ?
            'SELECT * FROM pharmacy_drug_catalog WHERE id=$1 AND tenant_id=$2' :
            'SELECT * FROM pharmacy_drug_catalog WHERE id=$1';
        const selectParams = tenantId ? [result.rows[0].id, tenantId] : [result.rows[0].id];
        res.json((await pool.query(selectQuery, selectParams)).rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/pharmacy/queue', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const { tenantId } = getRequestTenantContext(req);
        const query = tenantId ?
            'SELECT pq.*, p.name_en as patient_name FROM pharmacy_prescriptions_queue pq LEFT JOIN patients p ON pq.patient_id=p.id WHERE pq.tenant_id=$1 ORDER BY pq.id DESC' :
            'SELECT pq.*, p.name_en as patient_name FROM pharmacy_prescriptions_queue pq LEFT JOIN patients p ON pq.patient_id=p.id ORDER BY pq.id DESC';
        const params = tenantId ? [tenantId] : [];
        res.json((await pool.query(query, params)).rows);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.put('/api/pharmacy/queue/:id', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const { status } = req.body;
        const { tenantId } = getRequestTenantContext(req);
        const tenantCheck = tenantId ? ' AND tenant_id=$2' : '';
        const checkParams = tenantId ? [req.params.id, tenantId] : [req.params.id];
        const rxCheck = (await pool.query(`SELECT id FROM pharmacy_prescriptions_queue WHERE id=$1${tenantCheck}`, checkParams)).rows[0];
        if (!rxCheck) return res.status(404).json({ error: 'Queue item not found' });

        if (status) {
            const updateQuery = tenantId ?
                'UPDATE pharmacy_prescriptions_queue SET status=$1, dispensed_at=CURRENT_TIMESTAMP WHERE id=$2 AND tenant_id=$3' :
                'UPDATE pharmacy_prescriptions_queue SET status=$1, dispensed_at=CURRENT_TIMESTAMP WHERE id=$2';
            const updateParams = tenantId ? [status, req.params.id, tenantId] : [status, req.params.id];
            await pool.query(updateQuery, updateParams);
        }
        logAudit(req.session.user?.id, req.session.user?.display_name, 'DISPENSE_MEDICATION', 'Pharmacy',
            `Dispensed queue item #${req.params.id} status:${status}`, req.ip);
        const finalQuery = tenantId ?
            'SELECT * FROM pharmacy_prescriptions_queue WHERE id=$1 AND tenant_id=$2' :
            'SELECT * FROM pharmacy_prescriptions_queue WHERE id=$1';
        const finalParams = tenantId ? [req.params.id, tenantId] : [req.params.id];
        res.json((await pool.query(finalQuery, finalParams)).rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== INVENTORY =====
app.get('/api/inventory/items', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const { tenantId } = getRequestTenantContext(req);
        const query = tenantId ?
            'SELECT * FROM inventory_items WHERE is_active=1 AND tenant_id=$1 ORDER BY item_name' :
            'SELECT * FROM inventory_items WHERE is_active=1 ORDER BY item_name';
        const params = tenantId ? [tenantId] : [];
        res.json((await pool.query(query, params)).rows);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/inventory/items', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const { tenantId, facilityId } = getRequestTenantContext(req);
        const { item_name, item_code, category, unit, cost_price, stock_qty } = req.body;
        const result = await pool.query('INSERT INTO inventory_items (item_name, item_code, category, unit, cost_price, stock_qty, tenant_id, branch_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
            [item_name, item_code || '', category || '', unit || '', cost_price || 0, stock_qty || 0, tenantId || null, facilityId || null]);

        logAudit(req.session.user?.id, req.session.user?.display_name, 'CREATE_INVENTORY_ITEM_DETAIL', 'Inventory', `Created item details for ${item_name} with qty ${stock_qty}`, req.ip);

        const query = tenantId ?
            'SELECT * FROM inventory_items WHERE id=$1 AND tenant_id=$2' :
            'SELECT * FROM inventory_items WHERE id=$1';
        const params = tenantId ? [result.rows[0].id, tenantId] : [result.rows[0].id];
        res.json((await pool.query(query, params)).rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== HR =====
app.get('/api/hr/employees', requireAuth, requireRole('hr'), async (req, res) => {
    try { res.json((await pool.query('SELECT * FROM hr_employees WHERE is_active=1 ORDER BY id DESC')).rows); }
    catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/hr/employees', requireAuth, requireRole('hr'), async (req, res) => {
    try {
        const { emp_number, name_ar, name_en, national_id, phone, email, department, job_title, hire_date, basic_salary, housing_allowance, transport_allowance } = req.body;
        const result = await pool.query('INSERT INTO hr_employees (emp_number, name_ar, name_en, national_id, phone, email, department, job_title, hire_date, basic_salary, housing_allowance, transport_allowance) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id',
            [emp_number || '', name_ar || '', name_en || '', national_id || '', phone || '', email || '', department || '', job_title || '', hire_date || '', basic_salary || 0, housing_allowance || 0, transport_allowance || 0]);
        res.json((await pool.query('SELECT * FROM hr_employees WHERE id=$1', [result.rows[0].id])).rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/hr/salaries', requireAuth, requireRole('hr'), async (req, res) => {
    try { res.json((await pool.query('SELECT hs.*, he.name_en as employee_name FROM hr_salaries hs LEFT JOIN hr_employees he ON hs.employee_id=he.id ORDER BY hs.id DESC')).rows); }
    catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/hr/leaves', requireAuth, requireRole('hr'), async (req, res) => {
    try { res.json((await pool.query('SELECT hl.*, he.name_en as employee_name FROM hr_leaves hl LEFT JOIN hr_employees he ON hl.employee_id=he.id ORDER BY hl.id DESC')).rows); }
    catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/hr/attendance', requireAuth, requireRole('hr'), async (req, res) => {
    try { res.json((await pool.query('SELECT ha.*, he.name_en as employee_name FROM hr_attendance ha LEFT JOIN hr_employees he ON ha.employee_id=he.id ORDER BY ha.id DESC')).rows); }
    catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== FINANCE =====
app.get('/api/finance/accounts', requireAuth, requireRole('finance', 'accounts', 'invoices'), async (req, res) => {
    try { res.json((await pool.query('SELECT * FROM finance_chart_of_accounts WHERE is_active=1 ORDER BY account_code')).rows); }
    catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/finance/accounts', requireAuth, requireRole('finance', 'accounts', 'invoices'), async (req, res) => {
    try {
        const { account_code, account_name_ar, account_name_en, parent_id, account_type } = req.body;
        const result = await pool.query('INSERT INTO finance_chart_of_accounts (account_code, account_name_ar, account_name_en, parent_id, account_type) VALUES ($1,$2,$3,$4,$5) RETURNING id',
            [account_code || '', account_name_ar || '', account_name_en || '', parent_id || 0, account_type || '']);
        res.json((await pool.query('SELECT * FROM finance_chart_of_accounts WHERE id=$1', [result.rows[0].id])).rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/finance/journal', requireAuth, requireRole('finance', 'accounts', 'invoices'), async (req, res) => {
    try { res.json((await pool.query('SELECT * FROM finance_journal_entries ORDER BY id DESC')).rows); }
    catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/finance/vouchers', requireAuth, requireRole('finance', 'accounts', 'invoices'), async (req, res) => {
    try { res.json((await pool.query('SELECT * FROM finance_vouchers ORDER BY id DESC')).rows); }
    catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== SETTINGS =====
// GET settings is allowed for all authenticated users (needed for theme loading)
app.get('/api/settings', requireAuth, async (req, res) => {
    try {
        const rows = (await pool.query('SELECT * FROM company_settings')).rows;
        const settings = {};
        rows.forEach(r => settings[r.setting_key] = r.setting_value);
        res.json(settings);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.put('/api/settings', requireAuth, requireRole('settings'), async (req, res) => {
    try {
        const updates = req.body;
        for (const [key, value] of Object.entries(updates)) {
            await pool.query('INSERT INTO company_settings (setting_key, setting_value) VALUES ($1, $2) ON CONFLICT (setting_key) DO UPDATE SET setting_value=$2', [key, value]);
        }
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/settings/users', requireAuth, requireRole('settings'), async (req, res) => {
    try { res.json((await pool.query('SELECT id, username, display_name, role, speciality, permissions, commission_type, commission_value, is_active, last_ip, created_at FROM system_users ORDER BY id')).rows); }
    catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/settings/users', requireAuth, requireRole('settings'), async (req, res) => {
    try {
        // ===== P0 GUARD: creating system users is Admin-only (mirrors PUT privilege guard + DELETE) =====
        // 'settings' perm is held by non-admin roles (e.g. IT); without this, they could create an Admin account.
        if (req.session.user.role !== 'Admin') {
            logAudit(req.session.user?.id, req.session.user?.display_name, 'BLOCKED_USER_CREATE', 'Settings', `Non-admin attempted to create user (role=${req.body?.role || ''})`, req.ip);
            return res.status(403).json({ error: 'Access denied: only an administrator can create system users' });
        }
        const { username, password, display_name, role, speciality, permissions, commission_type, commission_value } = req.body;
        const hash = await bcrypt.hash(password, 10);
        const result = await pool.query('INSERT INTO system_users (username, password_hash, display_name, role, speciality, permissions, commission_type, commission_value) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
            [username, hash, display_name || '', role || 'Reception', speciality || '', permissions || '', commission_type || 'percentage', parseFloat(commission_value) || 0]);
        res.json((await pool.query('SELECT id, username, display_name, role, speciality, permissions, commission_type, commission_value, is_active, created_at FROM system_users WHERE id=$1', [result.rows[0].id])).rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.put('/api/settings/users/:id', requireAuth, async (req, res) => {
    try {
        const actor = req.session.user;                       // identity from session only (never from body)
        const targetId = parseInt(req.params.id, 10);
        const isAdmin = actor.role === 'Admin';               // ROLE_PERMISSIONS['Admin'] = '*' (highest)
        const isSelf = actor.id === targetId;
        const { username, password, display_name, role, speciality, permissions, is_active, commission_type, commission_value } = req.body;
        const norm = v => (v === true || v === 1 || v === '1') ? 1 : (v === false || v === 0 || v === '0') ? 0 : v;

        // ===== P0 GUARD: only Admin may change privileged/account-control fields; no self-escalation =====
        if (!isAdmin) {
            if (!isSelf) {
                logAudit(actor.id, actor.display_name, 'BLOCKED_USER_EDIT', 'Settings', `Non-admin attempted to edit user #${targetId}`, req.ip);
                return res.status(403).json({ error: 'Access denied' });
            }
            const cur = (await pool.query('SELECT username, role, permissions, is_active, commission_type, commission_value FROM system_users WHERE id=$1', [targetId])).rows[0];
            if (!cur) return res.status(404).json({ error: 'User not found' });
            const wantsPriv =
                (role !== undefined && String(role) !== String(cur.role)) ||
                (permissions !== undefined && String(permissions) !== String(cur.permissions || '')) ||
                (is_active !== undefined && norm(is_active) !== norm(cur.is_active)) ||
                (username !== undefined && username !== cur.username) ||
                (commission_type !== undefined && commission_type !== cur.commission_type) ||
                (commission_value !== undefined && parseFloat(commission_value) !== parseFloat(cur.commission_value));
            if (wantsPriv) {
                logAudit(actor.id, actor.display_name, 'BLOCKED_PRIVILEGE_ESCALATION', 'Settings', `Non-admin attempted to change role/permissions/status/username on own account`, req.ip);
                return res.status(403).json({ error: 'Access denied: only an administrator can change role, permissions, status, username, or commission' });
            }
            // safe self-profile update only (display_name, speciality, optional password)
            let sq = 'UPDATE system_users SET display_name=$1, speciality=$2';
            let sp = [display_name !== undefined ? display_name : actor.display_name, speciality || ''];
            let si = 3;
            if (password && password.trim() !== '') { sq += `, password_hash=$${si}`; sp.push(await bcrypt.hash(password, 10)); si++; }
            sq += ` WHERE id=$${si}`; sp.push(targetId);
            await pool.query(sq, sp);
            return res.json((await pool.query('SELECT id, username, display_name, role, speciality, permissions, commission_type, commission_value, is_active, created_at FROM system_users WHERE id=$1', [targetId])).rows[0]);
        }

        // ===== Admin path: full update, with last-active-admin protection =====
        const target = (await pool.query('SELECT role FROM system_users WHERE id=$1', [targetId])).rows[0];
        if (target && target.role === 'Admin') {
            const demoting = (role !== undefined && role !== 'Admin');
            const deactivating = (is_active !== undefined && norm(is_active) === 0);
            if (demoting || deactivating) {
                const adminCount = parseInt((await pool.query("SELECT COUNT(*) c FROM system_users WHERE role='Admin' AND is_active=1")).rows[0].c, 10);
                if (adminCount <= 1) return res.status(400).json({ error: 'Cannot demote or deactivate the last active admin' });
            }
        }
        let query = 'UPDATE system_users SET username=$1, display_name=$2, role=$3, speciality=$4, permissions=$5, is_active=$6, commission_type=$7, commission_value=$8';
        let params = [username, display_name || '', role || 'Reception', speciality || '', permissions || '', is_active === undefined ? 1 : is_active, commission_type || 'percentage', parseFloat(commission_value) || 0];
        let idx = 9;
        if (password && password.trim() !== '') {
            const hash = await bcrypt.hash(password, 10);
            query += `, password_hash=$${idx}`;
            params.push(hash);
            idx++;
        }
        query += ` WHERE id=$${idx}`;
        params.push(targetId);
        await pool.query(query, params);
        logAudit(actor.id, actor.display_name, 'UPDATE_USER', 'Settings', `Admin updated user #${targetId}` + (role !== undefined ? ` role=${role}` : ''), req.ip);
        res.json((await pool.query('SELECT id, username, display_name, role, speciality, permissions, commission_type, commission_value, is_active, created_at FROM system_users WHERE id=$1', [targetId])).rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.delete('/api/settings/users/:id', requireAuth, async (req, res) => {
    try {
        if (req.session.user.role !== 'Admin') {
            return res.status(403).json({ error: 'Access denied. Only Admin can delete system users.' });
        }
        const userId = parseInt(req.params.id);
        if (userId === req.session.user.id) return res.status(400).json({ error: 'Cannot delete your own account' });
        const userRole = (await pool.query('SELECT role FROM system_users WHERE id=$1', [userId])).rows[0];
        if (userRole && userRole.role === 'Admin') {
            const adminCount = (await pool.query("SELECT COUNT(*) as count FROM system_users WHERE role='Admin'")).rows[0].count;
            if (parseInt(adminCount) <= 1) return res.status(400).json({ error: 'Cannot delete the last admin' });
        }
        await pool.query('DELETE FROM system_users WHERE id=$1', [userId]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== MESSAGING =====
app.get('/api/messages', requireAuth, async (req, res) => {
    try {
        const userId = req.session.user.id;
        res.json((await pool.query('SELECT im.*, su.display_name as sender_name FROM internal_messages im LEFT JOIN system_users su ON im.sender_id=su.id WHERE im.receiver_id=$1 ORDER BY im.id DESC', [userId])).rows);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/messages', requireAuth, async (req, res) => {
    try {
        const { receiver_id, subject, body, priority } = req.body;
        const result = await pool.query('INSERT INTO internal_messages (sender_id, receiver_id, subject, body, priority) VALUES ($1,$2,$3,$4,$5) RETURNING id',
            [req.session.user.id, receiver_id, subject || '', body || '', priority || 'Normal']);
        res.json((await pool.query('SELECT * FROM internal_messages WHERE id=$1', [result.rows[0].id])).rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== ONLINE BOOKINGS =====
app.get('/api/bookings', requireAuth, async (req, res) => {
    try { res.json((await pool.query('SELECT * FROM online_bookings ORDER BY id DESC')).rows); }
    catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== PRESCRIPTIONS =====
app.get('/api/prescriptions', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const { patient_id } = req.query;
        const { tenantId } = getRequestTenantContext(req);
        if (patient_id) {
            if (tenantId) {
                const patientCheck = (await pool.query('SELECT id FROM patients WHERE id=$1 AND tenant_id=$2', [patient_id, tenantId])).rows[0];
                if (!patientCheck) return res.status(404).json({ error: 'Patient not found' });
            }
            const query = tenantId ?
                'SELECT * FROM prescriptions WHERE patient_id=$1 AND tenant_id=$2 ORDER BY id DESC' :
                'SELECT * FROM prescriptions WHERE patient_id=$1 ORDER BY id DESC';
            const params = tenantId ? [patient_id, tenantId] : [patient_id];
            res.json((await pool.query(query, params)).rows);
        } else {
            const query = tenantId ?
                'SELECT * FROM prescriptions WHERE tenant_id=$1 ORDER BY id DESC' :
                'SELECT * FROM prescriptions ORDER BY id DESC';
            const params = tenantId ? [tenantId] : [];
            res.json((await pool.query(query, params)).rows);
        }
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/prescriptions', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const { patient_id, medication_name, dosage, frequency, duration, notes, items, patient_name } = req.body;
        const { tenantId, facilityId } = getRequestTenantContext(req);
        if (tenantId && patient_id) {
            const patientCheck = (await pool.query('SELECT id FROM patients WHERE id=$1 AND tenant_id=$2', [patient_id, tenantId])).rows[0];
            if (!patientCheck) return res.status(404).json({ error: 'Patient not found' });
        }
        // Lookup drug price from catalog
        let drugPrice = 0;
        if (medication_name) {
            const drugQuery = tenantId ?
                'SELECT selling_price FROM pharmacy_drug_catalog WHERE drug_name ILIKE $1 AND tenant_id=$2 LIMIT 1' :
                'SELECT selling_price FROM pharmacy_drug_catalog WHERE drug_name ILIKE $1 LIMIT 1';
            const drugParams = tenantId ? [`%${medication_name}%`, tenantId] : [`%${medication_name}%`];
            const drug = (await pool.query(drugQuery, drugParams)).rows[0];
            if (drug) drugPrice = drug.selling_price;
        }
        const result = await pool.query('INSERT INTO prescriptions (patient_id, medication_id, dosage, duration, status, tenant_id, facility_id) VALUES ($1,0,$2,$3,$4,$5,$6) RETURNING id',
            [patient_id, `${medication_name} ${dosage} ${frequency}`, duration || '', 'Pending', tenantId || null, facilityId || null]);
        await pool.query('INSERT INTO pharmacy_prescriptions_queue (patient_id, prescription_text, status, tenant_id, branch_id) VALUES ($1,$2,$3,$4,$5)',
            [patient_id, `${medication_name} - ${dosage} - ${frequency} - ${duration}`, 'Pending', tenantId || null, facilityId || null]);
        // Auto-create invoice for prescription drug (with VAT for non-Saudis)
        if (drugPrice > 0 && patient_id) {
            const p = (await pool.query('SELECT name_en, name_ar FROM patients WHERE id=$1', [patient_id])).rows[0];
            const vat = await calcVAT(patient_id);
            const { total: finalTotal, vatAmount } = addVAT(drugPrice, vat.rate);
            const desc = `دواء: ${medication_name}` + (vat.applyVAT ? ` (+ ضريبة ${vatAmount} SAR)` : '');
            await pool.query('INSERT INTO invoices (patient_id, patient_name, total, vat_amount, description, service_type, paid, tenant_id, facility_id) VALUES ($1,$2,$3,$4,$5,$6,0,$7,$8)',
                [patient_id, p?.name_en || p?.name_ar || '', finalTotal, vatAmount, desc, 'Pharmacy', tenantId || null, facilityId || null]);
        }

        // AUTO: Send prescription to pharmacy queue
        try {
            if (Array.isArray(items)) {
                for (const item of items) {
                    await pool.query(
                        "INSERT INTO pharmacy_queue (patient_id, patient_name, drug_name, dosage, quantity, doctor, status, prescription_id, tenant_id, facility_id) VALUES ($1, $2, $3, $4, $5, $6, 'Pending', $7, $8, $9)",
                        [patient_id, patient_name || '', item.drug || item.name, item.dosage || '', item.quantity || 1, req.session.user?.display_name || '', result.rows[0]?.id || null, tenantId || null, facilityId || null]
                    );
                }
            }
        } catch (pe) { console.error('Pharmacy queue auto-insert:', pe.message); }
        logAudit(req.session.user?.id, req.session.user?.display_name, 'CREATE_PRESCRIPTION', 'Pharmacy',
            `Created prescription for patient #${patient_id}: ${medication_name}`, req.ip);
        const finalQuery = tenantId ?
            'SELECT * FROM prescriptions WHERE id=$1 AND tenant_id=$2' :
            'SELECT * FROM prescriptions WHERE id=$1';
        const finalParams = tenantId ? [result.rows[0].id, tenantId] : [result.rows[0].id];
        res.json((await pool.query(finalQuery, finalParams)).rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== PATIENT RESULTS (for Doctor to browse) =====
app.get('/api/patients/:id/results', requireAuth, requireRole('patients', 'lab', 'radiology'), async (req, res) => {
    try {
        // --- TENANT SCOPE: verify patient belongs to current tenant (IDOR prevention) ---
        const { tenantId } = getRequestTenantContext(req);
        const tenantCheck = tenantId ? ' AND tenant_id=$2' : '';
        const params = tenantId ? [req.params.id, tenantId] : [req.params.id];
        const patient = (await pool.query(`SELECT * FROM patients WHERE id=$1${tenantCheck}`, params)).rows[0];
        if (!patient) return res.status(404).json({ error: 'Patient not found' });
        const labOrders = (await pool.query("SELECT * FROM lab_radiology_orders WHERE patient_id=$1 AND is_radiology=0 ORDER BY created_at DESC", [req.params.id])).rows;
        const radOrders = (await pool.query("SELECT * FROM lab_radiology_orders WHERE patient_id=$1 AND is_radiology=1 ORDER BY created_at DESC", [req.params.id])).rows;
        const records = (await pool.query('SELECT * FROM medical_records WHERE patient_id=$1 ORDER BY visit_date DESC', [req.params.id])).rows;
        res.json({ patient, labOrders, radOrders, records });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== INVOICES (Enhanced) =====
app.post('/api/invoices/generate', requireAuth, requireRole('invoices', 'accounts'), async (req, res) => {
    try {
        const { patient_id, items } = req.body;
        // --- TENANT SCOPE: verify patient belongs to current tenant ---
        const { tenantId, facilityId } = getRequestTenantContext(req);
        const patientCheck = tenantId ? 'WHERE id=$1 AND tenant_id=$2' : 'WHERE id=$1';
        const patientParams = tenantId ? [patient_id, tenantId] : [patient_id];
        const p = (await pool.query(`SELECT * FROM patients ${patientCheck}`, patientParams)).rows[0];
        if (!p) return res.status(404).json({ error: 'Patient not found' });
        const total = items.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
        const description = items.map(i => i.description).join(' | ');
        const invNumber = 'INV-' + new Date().getFullYear() + '-' + String(Date.now()).slice(-5);
        const result = await pool.query('INSERT INTO invoices (patient_id, patient_name, total, description, service_type, invoice_number, tenant_id, facility_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
            [patient_id, p.name_en || p.name_ar, total, description, 'Medical Services', invNumber, tenantId || null, facilityId || null]);
        logAudit(req.session.user?.id, req.session.user?.display_name, 'GENERATE_INVOICE', 'Finance',
            `Generated ${invNumber} for patient ${p.name_en || p.name_ar} total: ${total}`, req.ip);
        res.json((await pool.query('SELECT * FROM invoices WHERE id=$1', [result.rows[0].id])).rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.put('/api/invoices/:id/pay', requireAuth, requireRole('invoices', 'accounts'), async (req, res) => {
    try {
        const { payment_method } = req.body;
        // --- TENANT SCOPE: verify invoice belongs to current tenant before paying (IDOR prevention) ---
        const { tenantId } = getRequestTenantContext(req);
        const tenantCheck = tenantId ? ' AND tenant_id=$2' : '';
        const tenantParams = tenantId ? [req.params.id, tenantId] : [req.params.id];
        const inv = (await pool.query(`SELECT * FROM invoices WHERE id=$1${tenantCheck}`, tenantParams)).rows[0];
        if (!inv) return res.status(404).json({ error: 'Invoice not found' });
        if (inv.paid) return res.status(400).json({ error: 'Invoice already paid' });
        await pool.query('UPDATE invoices SET paid=1, payment_method=$1 WHERE id=$2', [payment_method || 'Cash', req.params.id]);
        logAudit(req.session.user?.id, req.session.user?.display_name, 'PAY_INVOICE', 'Finance',
            `Invoice ${inv.invoice_number} paid (${inv.total} SAR) via ${payment_method || 'Cash'}`, req.ip);
        res.json((await pool.query('SELECT * FROM invoices WHERE id=$1', [req.params.id])).rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== PATIENT ACCOUNT =====
app.get('/api/patients/:id/account', requireAuth, requireRole('patients', 'accounts'), async (req, res) => {
    try {
        const id = req.params.id;
        const patient = (await pool.query('SELECT * FROM patients WHERE id=$1', [id])).rows[0];
        if (!patient) return res.status(404).json({ error: 'Patient not found' });
        const invoices = (await pool.query('SELECT * FROM invoices WHERE patient_id=$1 ORDER BY id DESC', [id])).rows;
        const records = (await pool.query('SELECT * FROM medical_records WHERE patient_id=$1 ORDER BY id DESC', [id])).rows;
        const labOrders = (await pool.query('SELECT * FROM lab_radiology_orders WHERE patient_id=$1 AND is_radiology=0 ORDER BY id DESC', [id])).rows;
        const radOrders = (await pool.query('SELECT * FROM lab_radiology_orders WHERE patient_id=$1 AND is_radiology=1 ORDER BY id DESC', [id])).rows;
        const prescriptions = (await pool.query('SELECT * FROM prescriptions WHERE patient_id=$1 ORDER BY id DESC', [id])).rows;
        const totalBilled = invoices.reduce((s, i) => s + (i.total || 0), 0);
        const totalPaid = invoices.filter(i => i.paid).reduce((s, i) => s + (i.total || 0), 0);
        res.json({ patient, invoices, records, labOrders, radOrders, prescriptions, totalBilled, totalPaid, balance: totalBilled - totalPaid });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== FORM BUILDER =====
app.get('/api/forms', requireAuth, async (req, res) => {
    try { res.json((await pool.query('SELECT * FROM form_templates WHERE is_active=1 ORDER BY id DESC')).rows); }
    catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/forms', requireAuth, async (req, res) => {
    try {
        const { template_name, department, form_fields } = req.body;
        const result = await pool.query('INSERT INTO form_templates (template_name, department, form_fields, created_by) VALUES ($1,$2,$3,$4) RETURNING id',
            [template_name || '', department || '', form_fields || '[]', req.session.user.name || '']);
        res.json((await pool.query('SELECT * FROM form_templates WHERE id=$1', [result.rows[0].id])).rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.delete('/api/forms/:id', requireAuth, async (req, res) => {
    try { await pool.query('UPDATE form_templates SET is_active=0 WHERE id=$1', [req.params.id]); res.json({ success: true }); }
    catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== WAITING QUEUE =====
app.get('/api/queue/patients', requireAuth, async (req, res) => {
    try { res.json((await pool.query("SELECT * FROM patients WHERE status IN ('Waiting','With Doctor','With Nurse') ORDER BY id DESC")).rows); }
    catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.put('/api/queue/patients/:id/status', requireAuth, async (req, res) => {
    try {
        const { status } = req.body;
        await pool.query('UPDATE patients SET status=$1 WHERE id=$2', [status, req.params.id]);
        res.json((await pool.query('SELECT * FROM patients WHERE id=$1', [req.params.id])).rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/queue/ads', requireAuth, async (req, res) => {
    try { res.json((await pool.query('SELECT * FROM queue_advertisements WHERE is_active=1 ORDER BY display_order')).rows); }
    catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/queue/ads', requireAuth, async (req, res) => {
    try {
        const { title, image_path, duration_seconds } = req.body;
        const result = await pool.query('INSERT INTO queue_advertisements (title, image_path, duration_seconds) VALUES ($1,$2,$3) RETURNING id',
            [title || '', image_path || '', duration_seconds || 10]);
        res.json((await pool.query('SELECT * FROM queue_advertisements WHERE id=$1', [result.rows[0].id])).rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== PATIENT REFERRAL =====
app.put('/api/patients/:id/referral', requireAuth, requireRole('patients'), async (req, res) => {
    try {
        const { department } = req.body;
        await pool.query('UPDATE patients SET department=$1 WHERE id=$2', [department, req.params.id]);
        res.json((await pool.query('SELECT * FROM patients WHERE id=$1', [req.params.id])).rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== REPORTS =====
app.get('/api/reports/financial', requireAuth, requireRole('finance'), requireTenantScope, async (req, res) => {
    try {
        const { tenantId } = getRequestTenantContext(req);
        const params = tenantId ? [tenantId] : [];

        const totalRevenueQuery = tenantId ?
            'SELECT COALESCE(SUM(total),0) as total FROM invoices WHERE paid=1 AND tenant_id=$1' :
            'SELECT COALESCE(SUM(total),0) as total FROM invoices WHERE paid=1';

        const totalPendingQuery = tenantId ?
            'SELECT COALESCE(SUM(total),0) as total FROM invoices WHERE paid=0 AND tenant_id=$1' :
            'SELECT COALESCE(SUM(total),0) as total FROM invoices WHERE paid=0';

        const invoiceCountQuery = tenantId ?
            'SELECT COUNT(*) as cnt FROM invoices WHERE tenant_id=$1' :
            'SELECT COUNT(*) as cnt FROM invoices';

        const monthlyRevenueQuery = tenantId ?
            "SELECT COALESCE(SUM(total),0) as total FROM invoices WHERE paid=1 AND created_at >= date_trunc('month', CURRENT_DATE) AND tenant_id=$1" :
            "SELECT COALESCE(SUM(total),0) as total FROM invoices WHERE paid=1 AND created_at >= date_trunc('month', CURRENT_DATE)";

        const totalRevenue = (await pool.query(totalRevenueQuery, params)).rows[0].total;
        const totalPending = (await pool.query(totalPendingQuery, params)).rows[0].total;
        const invoiceCount = (await pool.query(invoiceCountQuery, params)).rows[0].cnt;
        const monthlyRevenue = (await pool.query(monthlyRevenueQuery, params)).rows[0].total;

        res.json({ totalRevenue, totalPending, invoiceCount, monthlyRevenue });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/reports/patients', requireAuth, requireRole('reports'), requireTenantScope, async (req, res) => {
    try {
        const { tenantId } = getRequestTenantContext(req);
        const params = tenantId ? [tenantId] : [];
        const tenantFilter = tenantId ? ' WHERE tenant_id=$1' : '';
        const todayTenantFilter = tenantId ? ' AND tenant_id=$1' : '';
        const todayParams = tenantId ? [tenantId] : [];

        const totalPatients = (await pool.query(`SELECT COUNT(*) as cnt FROM patients${tenantFilter}`, params)).rows[0].cnt;
        const todayPatients = (await pool.query(`SELECT COUNT(*) as cnt FROM patients WHERE created_at >= CURRENT_DATE${todayTenantFilter}`, todayParams)).rows[0].cnt;
        const deptStats = (await pool.query(`SELECT department, COUNT(*) as cnt FROM patients${tenantFilter} GROUP BY department ORDER BY cnt DESC`, params)).rows;
        const statusStats = (await pool.query(`SELECT status, COUNT(*) as cnt FROM patients${tenantFilter} GROUP BY status`, params)).rows;
        res.json({ totalPatients, todayPatients, deptStats, statusStats });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/reports/lab', requireAuth, requireRole('reports'), requireTenantScope, async (req, res) => {
    try {
        const { tenantId } = getRequestTenantContext(req);
        const params = tenantId ? [tenantId] : [];
        const tenantFilter = tenantId ? ' AND tenant_id=$1' : '';

        const totalOrders = (await pool.query(`SELECT COUNT(*) as cnt FROM lab_radiology_orders WHERE is_radiology=0${tenantFilter}`, params)).rows[0].cnt;
        const pendingOrders = (await pool.query(`SELECT COUNT(*) as cnt FROM lab_radiology_orders WHERE is_radiology=0 AND status='Requested'${tenantFilter}`, params)).rows[0].cnt;
        const completedOrders = (await pool.query(`SELECT COUNT(*) as cnt FROM lab_radiology_orders WHERE is_radiology=0 AND status='Completed'${tenantFilter}`, params)).rows[0].cnt;
        res.json({ totalOrders, pendingOrders, completedOrders });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== ONLINE BOOKINGS MANAGEMENT =====
app.put('/api/bookings/:id', requireAuth, async (req, res) => {
    try {
        const { status } = req.body;
        await pool.query('UPDATE online_bookings SET status=$1 WHERE id=$2', [status, req.params.id]);
        res.json((await pool.query('SELECT * FROM online_bookings WHERE id=$1', [req.params.id])).rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== DOCTOR COMMISSION REPORT =====
app.get('/api/reports/commissions', requireAuth, requireRole('finance', 'doctor'), requireTenantScope, async (req, res) => {
    try {
        const { tenantId } = getRequestTenantContext(req);

        // system_users is a deferred risk table (no tenant_id column)
        const doctors = (await pool.query("SELECT id, display_name, speciality, commission_type, commission_value FROM system_users WHERE role='Doctor'")).rows;
        const results = [];
        for (const dr of doctors) {
            // Get all invoices where doctor is linked via medical_records or consultation invoices
            const revenueQuery = tenantId ?
                `SELECT COALESCE(SUM(i.total), 0) as total FROM invoices i
                 WHERE i.service_type = 'Consultation'
                 AND i.description ILIKE $1 AND i.tenant_id = $2` :
                `SELECT COALESCE(SUM(i.total), 0) as total FROM invoices i
                 WHERE i.service_type = 'Consultation'
                 AND i.description ILIKE $1`;
            const revenueParams = tenantId ? [`%${dr.display_name}%`, tenantId] : [`%${dr.display_name}%`];
            const revenue = (await pool.query(revenueQuery, revenueParams)).rows[0].total || 0;

            // Also get revenue from lab/radiology orders by this doctor
            const orderRevenueQuery = tenantId ?
                `SELECT COALESCE(SUM(price), 0) as total FROM lab_radiology_orders WHERE doctor_id=$1 AND tenant_id=$2` :
                `SELECT COALESCE(SUM(price), 0) as total FROM lab_radiology_orders WHERE doctor_id=$1`;
            const orderRevenueParams = tenantId ? [dr.id, tenantId] : [dr.id];
            const orderRevenue = (await pool.query(orderRevenueQuery, orderRevenueParams)).rows[0].total || 0;

            const totalRevenue = parseFloat(revenue) + parseFloat(orderRevenue);
            let commission = 0;
            if (dr.commission_type === 'percentage') {
                commission = totalRevenue * (dr.commission_value / 100);
            } else {
                // Fixed per patient
                const patientCountQuery = tenantId ?
                    'SELECT COUNT(DISTINCT patient_id) as cnt FROM medical_records WHERE doctor_id=$1 AND tenant_id=$2' :
                    'SELECT COUNT(DISTINCT patient_id) as cnt FROM medical_records WHERE doctor_id=$1';
                const patientCountParams = tenantId ? [dr.id, tenantId] : [dr.id];
                const patientCount = (await pool.query(patientCountQuery, patientCountParams)).rows[0].cnt || 0;
                commission = patientCount * dr.commission_value;
            }
            results.push({
                doctor_id: dr.id, doctor_name: dr.display_name, speciality: dr.speciality,
                commission_type: dr.commission_type, commission_value: dr.commission_value,
                totalRevenue, commission: Math.round(commission * 100) / 100
            });
        }
        res.json(results);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== MEDICAL CERTIFICATES =====
app.get('/api/medical/certificates', requireAuth, async (req, res) => {
    try {
        const { patient_id } = req.query;
        if (patient_id) {
            res.json((await pool.query('SELECT * FROM medical_certificates WHERE patient_id=$1 ORDER BY id DESC', [patient_id])).rows);
        } else {
            res.json((await pool.query('SELECT * FROM medical_certificates ORDER BY id DESC')).rows);
        }
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/medical/certificates', requireAuth, async (req, res) => {
    try {
        const { patient_id, patient_name, cert_type, diagnosis, notes, start_date, end_date, days } = req.body;
        const doctorName = req.session.user.name || '';
        const doctorId = req.session.user.id || 0;
        const result = await pool.query(
            'INSERT INTO medical_certificates (patient_id, patient_name, doctor_id, doctor_name, cert_type, diagnosis, notes, start_date, end_date, days) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id',
            [patient_id, patient_name || '', doctorId, doctorName, cert_type || 'sick_leave', diagnosis || '', notes || '', start_date || '', end_date || '', days || 0]);
        res.json((await pool.query('SELECT * FROM medical_certificates WHERE id=$1', [result.rows[0].id])).rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== PATIENT REFERRALS =====
app.get('/api/referrals', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const { patient_id } = req.query;
        const { tenantId } = getRequestTenantContext(req);

        // Verify patient context belongs to tenant if patient_id is passed
        if (tenantId && patient_id) {
            const patientCheck = await pool.query('SELECT id FROM patients WHERE id=$1 AND tenant_id=$2', [patient_id, tenantId]);
            if (patientCheck.rows.length === 0) {
                return res.status(403).json({ error: 'Unauthorized patient context' });
            }
        }

        let query = 'SELECT * FROM patient_referrals';
        let params = [];
        let conds = [];
        if (tenantId) {
            conds.push('tenant_id=$' + (params.length + 1));
            params.push(tenantId);
        }
        if (patient_id) {
            conds.push('patient_id=$' + (params.length + 1));
            params.push(patient_id);
        }
        if (conds.length) query += ' WHERE ' + conds.join(' AND ');
        query += ' ORDER BY id DESC';

        res.json((await pool.query(query, params)).rows);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/referrals', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const { patient_id, patient_name, to_department, to_doctor, reason, urgency, notes } = req.body;
        const { tenantId, facilityId } = getRequestTenantContext(req);

        // Verify patient context belongs to tenant
        if (tenantId && patient_id) {
            const patientCheck = await pool.query('SELECT id FROM patients WHERE id=$1 AND tenant_id=$2', [patient_id, tenantId]);
            if (patientCheck.rows.length === 0) {
                return res.status(403).json({ error: 'Unauthorized patient context' });
            }
        }

        const fromDoctor = req.session.user?.display_name || req.session.user?.name || '';
        const fromDoctorId = req.session.user?.id || 0;
        const result = await pool.query(
            'INSERT INTO patient_referrals (patient_id, patient_name, from_doctor_id, from_doctor, to_department, to_doctor, reason, urgency, notes, tenant_id, facility_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id',
            [patient_id, patient_name || '', fromDoctorId, fromDoctor, to_department || '', to_doctor || '', reason || '', urgency || 'Normal', notes || '', tenantId, facilityId]);
        res.json((await pool.query('SELECT * FROM patient_referrals WHERE id=$1', [result.rows[0].id])).rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.put('/api/referrals/:id', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const { status } = req.body;
        const { tenantId } = getRequestTenantContext(req);

        const q = tenantId ?
            'UPDATE patient_referrals SET status=$1 WHERE id=$2 AND tenant_id=$3 RETURNING *' :
            'UPDATE patient_referrals SET status=$1 WHERE id=$2 RETURNING *';
        const params = tenantId ? [status, req.params.id, tenantId] : [status, req.params.id];

        const r = await pool.query(q, params);
        if (r.rows.length === 0) return res.status(404).json({ error: 'Not found or unauthorized' });
        res.json(r.rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== FOLLOW-UP APPOINTMENTS =====
app.post('/api/appointments/followup', requireAuth, requireRole('appointments'), async (req, res) => {
    try {
        const { patient_id, patient_name, doctor_name, appt_date, appt_time, notes } = req.body;
        // --- TENANT SCOPE: stamp tenant_id from session for follow-up appointments ---
        const { tenantId, facilityId } = getRequestTenantContext(req);
        const result = await pool.query(
            'INSERT INTO appointments (patient_id, patient_name, doctor_name, department, appt_date, appt_time, notes, status, tenant_id, facility_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id',
            [patient_id, patient_name, doctor_name || req.session.user?.display_name, '', appt_date, appt_time || '09:00', `متابعة: ${notes || ''}`, 'Confirmed', tenantId || null, facilityId || null]);
        logAudit(req.session.user?.id, req.session.user?.display_name, 'CREATE_FOLLOWUP', 'Appointments',
            `Follow-up for ${patient_name} with Dr. ${doctor_name} on ${appt_date}`, req.ip);
        res.json((await pool.query('SELECT * FROM appointments WHERE id=$1', [result.rows[0].id])).rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== ENHANCED DASHBOARD STATS =====
app.get('/api/dashboard/enhanced', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const { tenantId } = getRequestTenantContext(req);
        const params = tenantId ? [tenantId] : [];

        const todayRevenueQuery = tenantId ?
            'SELECT COALESCE(SUM(total), 0) as total FROM invoices WHERE created_at::date = CURRENT_DATE AND tenant_id = $1' :
            'SELECT COALESCE(SUM(total), 0) as total FROM invoices WHERE created_at::date = CURRENT_DATE';

        const monthRevenueQuery = tenantId ?
            'SELECT COALESCE(SUM(total), 0) as total FROM invoices WHERE created_at >= date_trunc(\'month\', CURRENT_DATE) AND tenant_id = $1' :
            'SELECT COALESCE(SUM(total), 0) as total FROM invoices WHERE created_at >= date_trunc(\'month\', CURRENT_DATE)';

        const unpaidTotalQuery = tenantId ?
            'SELECT COALESCE(SUM(total), 0) as total FROM invoices WHERE paid = 0 AND tenant_id = $1' :
            'SELECT COALESCE(SUM(total), 0) as total FROM invoices WHERE paid = 0';

        const todayApptsQuery = tenantId ?
            'SELECT COUNT(*) as cnt FROM appointments WHERE appt_date = CURRENT_DATE::TEXT AND tenant_id = $1' :
            'SELECT COUNT(*) as cnt FROM appointments WHERE appt_date = CURRENT_DATE::TEXT';

        const pendingLabQuery = tenantId ?
            'SELECT COUNT(*) as cnt FROM lab_radiology_orders WHERE status = \'Requested\' AND is_radiology = 0 AND tenant_id = $1' :
            'SELECT COUNT(*) as cnt FROM lab_radiology_orders WHERE status = \'Requested\' AND is_radiology = 0';

        const pendingRadQuery = tenantId ?
            'SELECT COUNT(*) as cnt FROM lab_radiology_orders WHERE status = \'Requested\' AND is_radiology = 1 AND tenant_id = $1' :
            'SELECT COUNT(*) as cnt FROM lab_radiology_orders WHERE status = \'Requested\' AND is_radiology = 1';

        const pendingRxQuery = tenantId ?
            'SELECT COUNT(*) as cnt FROM pharmacy_prescriptions_queue WHERE status = \'Pending\' AND tenant_id = $1' :
            'SELECT COUNT(*) as cnt FROM pharmacy_prescriptions_queue WHERE status = \'Pending\'';

        const pendingReferralsQuery = tenantId ?
            'SELECT COUNT(*) as cnt FROM patient_referrals WHERE status = \'Pending\' AND tenant_id = $1' :
            'SELECT COUNT(*) as cnt FROM patient_referrals WHERE status = \'Pending\'';

        const todayRevenue = (await pool.query(todayRevenueQuery, params)).rows[0].total;
        const monthRevenue = (await pool.query(monthRevenueQuery, params)).rows[0].total;
        const unpaidTotal = (await pool.query(unpaidTotalQuery, params)).rows[0].total;
        const todayAppts = (await pool.query(todayApptsQuery, params)).rows[0].cnt;
        const pendingLab = (await pool.query(pendingLabQuery, params)).rows[0].cnt;
        const pendingRad = (await pool.query(pendingRadQuery, params)).rows[0].cnt;
        const pendingRx = (await pool.query(pendingRxQuery, params)).rows[0].cnt;
        const pendingReferrals = (await pool.query(pendingReferralsQuery, params)).rows[0].cnt;

        // Top doctors by revenue this month
        const topDoctorsQuery = tenantId ? `
            SELECT mr.doctor_id, su.display_name, COUNT(DISTINCT mr.patient_id) as patients,
                   COALESCE(SUM(i.total), 0) as revenue
            FROM medical_records mr
            LEFT JOIN system_users su ON mr.doctor_id = su.id
            LEFT JOIN invoices i ON i.patient_id = mr.patient_id AND i.service_type = 'Consultation' AND i.tenant_id = $1
            WHERE mr.visit_date >= date_trunc('month', CURRENT_DATE) AND mr.tenant_id = $1
            GROUP BY mr.doctor_id, su.display_name
            ORDER BY revenue DESC LIMIT 5
        ` : `
            SELECT mr.doctor_id, su.display_name, COUNT(DISTINCT mr.patient_id) as patients,
                   COALESCE(SUM(i.total), 0) as revenue
            FROM medical_records mr
            LEFT JOIN system_users su ON mr.doctor_id = su.id
            LEFT JOIN invoices i ON i.patient_id = mr.patient_id AND i.service_type = 'Consultation'
            WHERE mr.visit_date >= date_trunc('month', CURRENT_DATE)
            GROUP BY mr.doctor_id, su.display_name
            ORDER BY revenue DESC LIMIT 5
        `;
        const topDoctors = (await pool.query(topDoctorsQuery, params)).rows;

        // Revenue by service type
        const revenueByTypeQuery = tenantId ? `
            SELECT service_type, COALESCE(SUM(total), 0) as total, COUNT(*) as cnt
            FROM invoices WHERE created_at >= date_trunc('month', CURRENT_DATE) AND tenant_id = $1
            GROUP BY service_type ORDER BY total DESC
        ` : `
            SELECT service_type, COALESCE(SUM(total), 0) as total, COUNT(*) as cnt
            FROM invoices WHERE created_at >= date_trunc('month', CURRENT_DATE)
            GROUP BY service_type ORDER BY total DESC
        `;
        const revenueByType = (await pool.query(revenueByTypeQuery, params)).rows;

        res.json({ todayRevenue, monthRevenue, unpaidTotal, todayAppts, pendingLab, pendingRad, pendingRx, pendingReferrals, topDoctors, revenueByType });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== PATIENT VISIT TIMELINE =====
app.get('/api/patients/:id/timeline', requireAuth, requireRole('patients'), requireTenantScope, async (req, res) => {
    try {
        const pid = req.params.id;
        // --- TENANT SCOPE: verify patient belongs to current tenant ---
        const { tenantId } = getRequestTenantContext(req);
        const tenantCheck = tenantId ? ' AND tenant_id=$2' : '';
        const tenantParams = tenantId ? [pid, tenantId] : [pid];
        const patientCheck = (await pool.query(`SELECT id FROM patients WHERE id=$1${tenantCheck}`, tenantParams)).rows[0];
        if (!patientCheck) return res.status(404).json({ error: 'Patient not found' });
        const events = [];
        // Medical records
        const records = (await pool.query('SELECT id, diagnosis, visit_date as event_date, symptoms FROM medical_records WHERE patient_id=$1', [pid])).rows;
        records.forEach(r => events.push({ type: 'medical_record', icon: '🩺', title: r.diagnosis || 'Consultation', subtitle: r.symptoms, date: r.event_date }));
        // Lab orders
        const labs = (await pool.query('SELECT id, order_type, status, created_at as event_date FROM lab_radiology_orders WHERE patient_id=$1 AND is_radiology=0', [pid])).rows;
        labs.forEach(l => events.push({ type: 'lab', icon: '🔬', title: l.order_type, subtitle: l.status, date: l.event_date }));
        // Radiology
        const rads = (await pool.query('SELECT id, order_type, status, created_at as event_date FROM lab_radiology_orders WHERE patient_id=$1 AND is_radiology=1', [pid])).rows;
        rads.forEach(r => events.push({ type: 'radiology', icon: '📡', title: r.order_type, subtitle: r.status, date: r.event_date }));
        // Prescriptions
        const rxs = (await pool.query('SELECT id, dosage, status, created_at as event_date FROM prescriptions WHERE patient_id=$1', [pid])).rows;
        rxs.forEach(rx => events.push({ type: 'prescription', icon: '💊', title: rx.dosage, subtitle: rx.status, date: rx.event_date }));
        // Invoices
        const invs = (await pool.query('SELECT id, description, total, paid, created_at as event_date FROM invoices WHERE patient_id=$1', [pid])).rows;
        invs.forEach(i => events.push({ type: 'invoice', icon: '🧾', title: i.description, subtitle: `${i.total} SAR - ${i.paid ? 'Paid' : 'Unpaid'}`, date: i.event_date }));
        // Certificates
        const certs = (await pool.query('SELECT id, cert_type, diagnosis, created_at as event_date FROM medical_certificates WHERE patient_id=$1', [pid])).rows;
        certs.forEach(c => events.push({ type: 'certificate', icon: '📋', title: c.cert_type === 'sick_leave' ? 'Sick Leave' : c.cert_type, subtitle: c.diagnosis, date: c.event_date }));
        // Sort by date descending
        events.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
        res.json(events);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== SURGERY MANAGEMENT =====
app.get('/api/surgeries', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const { status, date } = req.query;
        const { tenantId } = getRequestTenantContext(req);
        let q = 'SELECT * FROM surgeries';
        const params = [];
        const conds = [];
        if (tenantId) {
            params.push(tenantId);
            conds.push(`tenant_id = $${params.length}`);
        }
        if (status) { params.push(status); conds.push(`status = $${params.length}`); }
        if (date) { params.push(date); conds.push(`scheduled_date = $${params.length}`); }
        if (conds.length) q += ' WHERE ' + conds.join(' AND ');
        q += ' ORDER BY scheduled_date DESC, scheduled_time DESC';
        res.json((await pool.query(q, params)).rows);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// Added to allow secure fetch of single surgery record and prevent IDOR
app.get('/api/surgeries/:id', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const { tenantId } = getRequestTenantContext(req);
        const q = tenantId
            ? 'SELECT * FROM surgeries WHERE id = $1 AND tenant_id = $2'
            : 'SELECT * FROM surgeries WHERE id = $1';
        const params = tenantId ? [req.params.id, tenantId] : [req.params.id];
        const row = (await pool.query(q, params)).rows[0];
        if (!row) return res.status(404).json({ error: 'Surgery not found' });
        res.json(row);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/surgeries', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const { patient_id, patient_name, surgeon_id, surgeon_name, anesthetist_id, anesthetist_name,
            procedure_name, procedure_name_ar, surgery_type, operating_room, priority,
            scheduled_date, scheduled_time, estimated_duration, notes } = req.body;

        const { tenantId, facilityId } = getRequestTenantContext(req);

        // Validate patient context to prevent IDOR / illegal references
        if (patient_id) {
            const patientCheckQ = tenantId
                ? 'SELECT id FROM patients WHERE id = $1 AND tenant_id = $2'
                : 'SELECT id FROM patients WHERE id = $1';
            const patientCheckParams = tenantId ? [patient_id, tenantId] : [patient_id];
            const patientCheck = (await pool.query(patientCheckQ, patientCheckParams)).rows[0];
            if (!patientCheck) {
                return res.status(403).json({ error: 'Invalid patient context or access denied' });
            }
        }

        const result = await pool.query(
            `INSERT INTO surgeries (patient_id, patient_name, surgeon_id, surgeon_name, anesthetist_id, anesthetist_name,
             procedure_name, procedure_name_ar, surgery_type, operating_room, priority,
             scheduled_date, scheduled_time, estimated_duration, notes, tenant_id, facility_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING id`,
            [patient_id, patient_name || '', surgeon_id || 0, surgeon_name || '', anesthetist_id || 0, anesthetist_name || '',
                procedure_name || '', procedure_name_ar || '', surgery_type || 'Elective', operating_room || '',
                priority || 'Normal', scheduled_date || '', scheduled_time || '', estimated_duration || 60, notes || '',
                tenantId, facilityId]);

        const selectQ = tenantId
            ? 'SELECT * FROM surgeries WHERE id = $1 AND tenant_id = $2'
            : 'SELECT * FROM surgeries WHERE id = $1';
        const selectParams = tenantId ? [result.rows[0].id, tenantId] : [result.rows[0].id];

        logAudit(req.session.user?.id, req.session.user?.display_name || '', 'CREATE_SURGERY', 'Surgery', `Scheduled surgery for patient ${patient_name || patient_id}`, req.ip);
        res.json((await pool.query(selectQ, selectParams)).rows[0]);
    } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

app.put('/api/surgeries/:id', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const { tenantId } = getRequestTenantContext(req);

        // Verify surgery ownership first
        const checkQ = tenantId
            ? 'SELECT id FROM surgeries WHERE id = $1 AND tenant_id = $2'
            : 'SELECT id FROM surgeries WHERE id = $1';
        const checkParams = tenantId ? [req.params.id, tenantId] : [req.params.id];
        const surgeryCheck = (await pool.query(checkQ, checkParams)).rows[0];
        if (!surgeryCheck) return res.status(404).json({ error: 'Surgery not found' });

        const { status, operating_room, scheduled_date, scheduled_time, actual_start, actual_end, post_op_notes, preop_status } = req.body;
        const fields = []; const params = []; let idx = 1;
        if (status !== undefined) { fields.push(`status=$${idx++}`); params.push(status); }
        if (operating_room !== undefined) { fields.push(`operating_room=$${idx++}`); params.push(operating_room); }
        if (scheduled_date !== undefined) { fields.push(`scheduled_date=$${idx++}`); params.push(scheduled_date); }
        if (scheduled_time !== undefined) { fields.push(`scheduled_time=$${idx++}`); params.push(scheduled_time); }
        if (actual_start !== undefined) { fields.push(`actual_start=$${idx++}`); params.push(actual_start); }
        if (actual_end !== undefined) { fields.push(`actual_end=$${idx++}`); params.push(actual_end); }
        if (post_op_notes !== undefined) { fields.push(`post_op_notes=$${idx++}`); params.push(post_op_notes); }
        if (preop_status !== undefined) { fields.push(`preop_status=$${idx++}`); params.push(preop_status); }
        if (fields.length) {
            params.push(req.params.id);
            const whereClause = tenantId ? `WHERE id=$${idx} AND tenant_id=$${idx+1}` : `WHERE id=$${idx}`;
            if (tenantId) params.push(tenantId);
            await pool.query(`UPDATE surgeries SET ${fields.join(',')} ${whereClause}`, params);
        }

        const selectQ = tenantId
            ? 'SELECT * FROM surgeries WHERE id = $1 AND tenant_id = $2'
            : 'SELECT * FROM surgeries WHERE id = $1';
        const selectParams = tenantId ? [req.params.id, tenantId] : [req.params.id];

        logAudit(req.session.user?.id, req.session.user?.display_name || '', 'UPDATE_SURGERY', 'Surgery', `Updated surgery ${req.params.id}`, req.ip);
        res.json((await pool.query(selectQ, selectParams)).rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.delete('/api/surgeries/:id', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const { tenantId } = getRequestTenantContext(req);

        // Verify surgery ownership first
        const checkQ = tenantId
            ? 'SELECT id FROM surgeries WHERE id = $1 AND tenant_id = $2'
            : 'SELECT id FROM surgeries WHERE id = $1';
        const checkParams = tenantId ? [req.params.id, tenantId] : [req.params.id];
        const surgeryCheck = (await pool.query(checkQ, checkParams)).rows[0];
        if (!surgeryCheck) return res.status(404).json({ error: 'Surgery not found' });

        const deleteParams1 = tenantId ? [req.params.id, tenantId] : [req.params.id];
        const tenantFilter = tenantId ? ' AND tenant_id=$2' : '';

        await pool.query(`DELETE FROM surgery_preop_tests WHERE surgery_id=$1${tenantFilter}`, deleteParams1);
        await pool.query(`DELETE FROM surgery_preop_assessments WHERE surgery_id=$1${tenantFilter}`, deleteParams1);
        await pool.query(`DELETE FROM surgery_anesthesia_records WHERE surgery_id=$1${tenantFilter}`, deleteParams1);
        await pool.query(`DELETE FROM consent_forms WHERE surgery_id=$1${tenantFilter}`, deleteParams1);
        await pool.query(`DELETE FROM surgeries WHERE id=$1${tenantFilter}`, deleteParams1);

        logAudit(req.session.user?.id, req.session.user?.display_name || '', 'DELETE_SURGERY', 'Surgery', `Deleted/cancelled surgery ${req.params.id}`, req.ip);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// Pre-op Assessment
app.get('/api/surgeries/:id/preop', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const { tenantId } = getRequestTenantContext(req);

        // Verify surgery ownership first
        const checkQ = tenantId
            ? 'SELECT id FROM surgeries WHERE id = $1 AND tenant_id = $2'
            : 'SELECT id FROM surgeries WHERE id = $1';
        const checkParams = tenantId ? [req.params.id, tenantId] : [req.params.id];
        const surgeryCheck = (await pool.query(checkQ, checkParams)).rows[0];
        if (!surgeryCheck) return res.status(404).json({ error: 'Surgery not found' });

        const queryText = tenantId
            ? 'SELECT * FROM surgery_preop_assessments WHERE surgery_id=$1 AND tenant_id=$2'
            : 'SELECT * FROM surgery_preop_assessments WHERE surgery_id=$1';
        const queryParams = tenantId ? [req.params.id, tenantId] : [req.params.id];

        res.json((await pool.query(queryText, queryParams)).rows[0] || null);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/surgeries/:id/preop', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const { tenantId, facilityId } = getRequestTenantContext(req);

        // Verify surgery ownership first
        const checkQ = tenantId
            ? 'SELECT id, patient_id FROM surgeries WHERE id = $1 AND tenant_id = $2'
            : 'SELECT id, patient_id FROM surgeries WHERE id = $1';
        const checkParams = tenantId ? [req.params.id, tenantId] : [req.params.id];
        const surgery = (await pool.query(checkQ, checkParams)).rows[0];
        if (!surgery) return res.status(404).json({ error: 'Surgery not found' });

        const pid = surgery.patient_id || 0;
        const s = req.body;

        const existingQ = tenantId
            ? 'SELECT id FROM surgery_preop_assessments WHERE surgery_id=$1 AND tenant_id=$2'
            : 'SELECT id FROM surgery_preop_assessments WHERE surgery_id=$1';
        const existingParams = tenantId ? [req.params.id, tenantId] : [req.params.id];
        const existing = (await pool.query(existingQ, existingParams)).rows[0];

        // Calculate overall status
        const checkItems = [s.npo_confirmed, s.allergies_reviewed, s.medications_reviewed, s.labs_reviewed,
        s.imaging_reviewed, s.blood_type_confirmed, s.consent_signed, s.anesthesia_clearance, s.nursing_assessment];
        const completedCount = checkItems.filter(x => x).length;
        const overall = completedCount === checkItems.length ? 'Complete' : completedCount > 0 ? 'In Progress' : 'Incomplete';

        if (existing) {
            const updateQ = tenantId
                ? `UPDATE surgery_preop_assessments SET npo_confirmed=$1, allergies_reviewed=$2, allergies_notes=$3,
                    medications_reviewed=$4, medications_notes=$5, labs_reviewed=$6, labs_notes=$7, imaging_reviewed=$8, imaging_notes=$9,
                    blood_type_confirmed=$10, blood_reserved=$11, consent_signed=$12, anesthesia_clearance=$13,
                    nursing_assessment=$14, nursing_notes=$15, cardiac_clearance=$16, cardiac_notes=$17,
                    pulmonary_clearance=$18, infection_screening=$19, dvt_prophylaxis=$20, overall_status=$21, assessed_by=$22
                    WHERE surgery_id=$23 AND tenant_id=$24`
                : `UPDATE surgery_preop_assessments SET npo_confirmed=$1, allergies_reviewed=$2, allergies_notes=$3,
                    medications_reviewed=$4, medications_notes=$5, labs_reviewed=$6, labs_notes=$7, imaging_reviewed=$8, imaging_notes=$9,
                    blood_type_confirmed=$10, blood_reserved=$11, consent_signed=$12, anesthesia_clearance=$13,
                    nursing_assessment=$14, nursing_notes=$15, cardiac_clearance=$16, cardiac_notes=$17,
                    pulmonary_clearance=$18, infection_screening=$19, dvt_prophylaxis=$20, overall_status=$21, assessed_by=$22
                    WHERE surgery_id=$23`;
            const updateParams = [s.npo_confirmed ? 1 : 0, s.allergies_reviewed ? 1 : 0, s.allergies_notes || '',
                s.medications_reviewed ? 1 : 0, s.medications_notes || '', s.labs_reviewed ? 1 : 0, s.labs_notes || '',
                s.imaging_reviewed ? 1 : 0, s.imaging_notes || '', s.blood_type_confirmed ? 1 : 0, s.blood_reserved ? 1 : 0,
                s.consent_signed ? 1 : 0, s.anesthesia_clearance ? 1 : 0, s.nursing_assessment ? 1 : 0, s.nursing_notes || '',
                s.cardiac_clearance ? 1 : 0, s.cardiac_notes || '', s.pulmonary_clearance ? 1 : 0,
                s.infection_screening ? 1 : 0, s.dvt_prophylaxis ? 1 : 0, overall, req.session.user?.display_name || req.session.user?.name || '', req.params.id];
            if (tenantId) updateParams.push(tenantId);
            await pool.query(updateQ, updateParams);
        } else {
            await pool.query(`INSERT INTO surgery_preop_assessments (surgery_id, patient_id, npo_confirmed, allergies_reviewed, allergies_notes,
                medications_reviewed, medications_notes, labs_reviewed, labs_notes, imaging_reviewed, imaging_notes,
                blood_type_confirmed, blood_reserved, consent_signed, anesthesia_clearance,
                nursing_assessment, nursing_notes, cardiac_clearance, cardiac_notes,
                pulmonary_clearance, infection_screening, dvt_prophylaxis, overall_status, assessed_by, tenant_id, facility_id)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)`,
                [req.params.id, pid, s.npo_confirmed ? 1 : 0, s.allergies_reviewed ? 1 : 0, s.allergies_notes || '',
                s.medications_reviewed ? 1 : 0, s.medications_notes || '', s.labs_reviewed ? 1 : 0, s.labs_notes || '',
                s.imaging_reviewed ? 1 : 0, s.imaging_notes || '', s.blood_type_confirmed ? 1 : 0, s.blood_reserved ? 1 : 0,
                s.consent_signed ? 1 : 0, s.anesthesia_clearance ? 1 : 0, s.nursing_assessment ? 1 : 0, s.nursing_notes || '',
                s.cardiac_clearance ? 1 : 0, s.cardiac_notes || '', s.pulmonary_clearance ? 1 : 0,
                s.infection_screening ? 1 : 0, s.dvt_prophylaxis ? 1 : 0, overall, req.session.user?.display_name || req.session.user?.name || '', tenantId, facilityId]);
        }

        // Update surgery preop_status
        const updateSurgeryQ = tenantId
            ? 'UPDATE surgeries SET preop_status=$1 WHERE id=$2 AND tenant_id=$3'
            : 'UPDATE surgeries SET preop_status=$1 WHERE id=$2';
        const updateSurgeryParams = tenantId ? [overall, req.params.id, tenantId] : [overall, req.params.id];
        await pool.query(updateSurgeryQ, updateSurgeryParams);

        logAudit(req.session.user?.id, req.session.user?.display_name || '', 'UPDATE_PREOP_ASSESSMENT', 'Surgery', `Updated preop assessment for surgery ${req.params.id}`, req.ip);

        const returnQ = tenantId
            ? 'SELECT * FROM surgery_preop_assessments WHERE surgery_id=$1 AND tenant_id=$2'
            : 'SELECT * FROM surgery_preop_assessments WHERE surgery_id=$1';
        const returnParams = tenantId ? [req.params.id, tenantId] : [req.params.id];
        res.json((await pool.query(returnQ, returnParams)).rows[0]);
    } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

// Pre-op Tests
app.get('/api/surgeries/:id/preop-tests', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const { tenantId } = getRequestTenantContext(req);

        // Verify surgery ownership first
        const checkQ = tenantId
            ? 'SELECT id FROM surgeries WHERE id = $1 AND tenant_id = $2'
            : 'SELECT id FROM surgeries WHERE id = $1';
        const checkParams = tenantId ? [req.params.id, tenantId] : [req.params.id];
        const surgeryCheck = (await pool.query(checkQ, checkParams)).rows[0];
        if (!surgeryCheck) return res.status(404).json({ error: 'Surgery not found' });

        const q = tenantId
            ? 'SELECT * FROM surgery_preop_tests WHERE surgery_id=$1 AND tenant_id=$2 ORDER BY id'
            : 'SELECT * FROM surgery_preop_tests WHERE surgery_id=$1 ORDER BY id';
        const params = tenantId ? [req.params.id, tenantId] : [req.params.id];
        res.json((await pool.query(q, params)).rows);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/surgeries/:id/preop-tests', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const { tenantId, facilityId } = getRequestTenantContext(req);

        // Verify surgery ownership first
        const checkQ = tenantId
            ? 'SELECT id, patient_id FROM surgeries WHERE id = $1 AND tenant_id = $2'
            : 'SELECT id, patient_id FROM surgeries WHERE id = $1';
        const checkParams = tenantId ? [req.params.id, tenantId] : [req.params.id];
        const surgery = (await pool.query(checkQ, checkParams)).rows[0];
        if (!surgery) return res.status(404).json({ error: 'Surgery not found' });

        const { test_type, test_name, notes } = req.body;
        const result = await pool.query(
            'INSERT INTO surgery_preop_tests (surgery_id, patient_id, test_type, test_name, notes, tenant_id, facility_id) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
            [req.params.id, surgery.patient_id || 0, test_type || 'Lab', test_name || '', notes || '', tenantId, facilityId]);

        const returnQ = tenantId
            ? 'SELECT * FROM surgery_preop_tests WHERE id=$1 AND tenant_id=$2'
            : 'SELECT * FROM surgery_preop_tests WHERE id=$1';
        const returnParams = tenantId ? [result.rows[0].id, tenantId] : [result.rows[0].id];

        logAudit(req.session.user?.id, req.session.user?.display_name || '', 'CREATE_PREOP_TEST', 'Surgery', `Created preop test for surgery ${req.params.id}`, req.ip);
        res.json((await pool.query(returnQ, returnParams)).rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.put('/api/surgery-preop-tests/:id', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const { tenantId } = getRequestTenantContext(req);

        // Verify test ownership first
        const checkQ = tenantId
            ? 'SELECT id FROM surgery_preop_tests WHERE id = $1 AND tenant_id = $2'
            : 'SELECT id FROM surgery_preop_tests WHERE id = $1';
        const checkParams = tenantId ? [req.params.id, tenantId] : [req.params.id];
        const testCheck = (await pool.query(checkQ, checkParams)).rows[0];
        if (!testCheck) return res.status(404).json({ error: 'Pre-op test not found' });

        const { is_completed, result_summary } = req.body;
        if (is_completed !== undefined) {
            const updateQ = tenantId
                ? 'UPDATE surgery_preop_tests SET is_completed=$1 WHERE id=$2 AND tenant_id=$3'
                : 'UPDATE surgery_preop_tests SET is_completed=$1 WHERE id=$2';
            const updateParams = tenantId ? [is_completed ? 1 : 0, req.params.id, tenantId] : [is_completed ? 1 : 0, req.params.id];
            await pool.query(updateQ, updateParams);
        }
        if (result_summary !== undefined) {
            const updateQ = tenantId
                ? 'UPDATE surgery_preop_tests SET result_summary=$1 WHERE id=$2 AND tenant_id=$3'
                : 'UPDATE surgery_preop_tests SET result_summary=$1 WHERE id=$2';
            const updateParams = tenantId ? [result_summary, req.params.id, tenantId] : [result_summary, req.params.id];
            await pool.query(updateQ, updateParams);
        }

        const returnQ = tenantId
            ? 'SELECT * FROM surgery_preop_tests WHERE id=$1 AND tenant_id=$2'
            : 'SELECT * FROM surgery_preop_tests WHERE id=$1';
        const returnParams = tenantId ? [req.params.id, tenantId] : [req.params.id];

        logAudit(req.session.user?.id, req.session.user?.display_name || '', 'UPDATE_PREOP_TEST', 'Surgery', `Updated preop test result ${req.params.id}`, req.ip);
        res.json((await pool.query(returnQ, returnParams)).rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// Anesthesia Records
app.get('/api/surgeries/:id/anesthesia', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const { tenantId } = getRequestTenantContext(req);

        // Verify surgery ownership first
        const checkQ = tenantId
            ? 'SELECT id FROM surgeries WHERE id = $1 AND tenant_id = $2'
            : 'SELECT id FROM surgeries WHERE id = $1';
        const checkParams = tenantId ? [req.params.id, tenantId] : [req.params.id];
        const surgeryCheck = (await pool.query(checkQ, checkParams)).rows[0];
        if (!surgeryCheck) return res.status(404).json({ error: 'Surgery not found' });

        const q = tenantId
            ? 'SELECT * FROM surgery_anesthesia_records WHERE surgery_id=$1 AND tenant_id=$2'
            : 'SELECT * FROM surgery_anesthesia_records WHERE surgery_id=$1';
        const params = tenantId ? [req.params.id, tenantId] : [req.params.id];
        res.json((await pool.query(q, params)).rows[0] || null);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/surgeries/:id/anesthesia', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const { tenantId, facilityId } = getRequestTenantContext(req);

        // Verify surgery ownership first
        const checkQ = tenantId
            ? 'SELECT id, patient_id FROM surgeries WHERE id = $1 AND tenant_id = $2'
            : 'SELECT id, patient_id FROM surgeries WHERE id = $1';
        const checkParams = tenantId ? [req.params.id, tenantId] : [req.params.id];
        const surgery = (await pool.query(checkQ, checkParams)).rows[0];
        if (!surgery) return res.status(404).json({ error: 'Surgery not found' });

        const a = req.body;
        const existingQ = tenantId
            ? 'SELECT id FROM surgery_anesthesia_records WHERE surgery_id=$1 AND tenant_id=$2'
            : 'SELECT id FROM surgery_anesthesia_records WHERE surgery_id=$1';
        const existingParams = tenantId ? [req.params.id, tenantId] : [req.params.id];
        const existing = (await pool.query(existingQ, existingParams)).rows[0];

        if (existing) {
            const updateQ = tenantId
                ? `UPDATE surgery_anesthesia_records SET anesthetist_name=$1, asa_class=$2, anesthesia_type=$3,
                    airway_assessment=$4, mallampati_score=$5, premedication=$6, induction_agents=$7, maintenance_agents=$8,
                    muscle_relaxants=$9, monitors_used=$10, iv_access=$11, fluid_given=$12, blood_loss_ml=$13,
                    complications=$14, recovery_notes=$15, notes=$16 WHERE surgery_id=$17 AND tenant_id=$18`
                : `UPDATE surgery_anesthesia_records SET anesthetist_name=$1, asa_class=$2, anesthesia_type=$3,
                    airway_assessment=$4, mallampati_score=$5, premedication=$6, induction_agents=$7, maintenance_agents=$8,
                    muscle_relaxants=$9, monitors_used=$10, iv_access=$11, fluid_given=$12, blood_loss_ml=$13,
                    complications=$14, recovery_notes=$15, notes=$16 WHERE surgery_id=$17`;
            const updateParams = [a.anesthetist_name || '', a.asa_class || 'ASA I', a.anesthesia_type || 'General',
                a.airway_assessment || '', a.mallampati_score || '', a.premedication || '', a.induction_agents || '',
                a.maintenance_agents || '', a.muscle_relaxants || '', a.monitors_used || '', a.iv_access || '',
                a.fluid_given || '', a.blood_loss_ml || 0, a.complications || '', a.recovery_notes || '', a.notes || '', req.params.id];
            if (tenantId) updateParams.push(tenantId);
            await pool.query(updateQ, updateParams);
        } else {
            await pool.query(`INSERT INTO surgery_anesthesia_records (surgery_id, patient_id, anesthetist_name, asa_class, anesthesia_type,
                airway_assessment, mallampati_score, premedication, induction_agents, maintenance_agents,
                muscle_relaxants, monitors_used, iv_access, fluid_given, blood_loss_ml,
                complications, recovery_notes, notes, tenant_id, facility_id)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
                [req.params.id, surgery.patient_id || 0, a.anesthetist_name || '', a.asa_class || 'ASA I', a.anesthesia_type || 'General',
                a.airway_assessment || '', a.mallampati_score || '', a.premedication || '', a.induction_agents || '',
                a.maintenance_agents || '', a.muscle_relaxants || '', a.monitors_used || '', a.iv_access || '',
                a.fluid_given || '', a.blood_loss_ml || 0, a.complications || '', a.recovery_notes || '', a.notes || '', tenantId, facilityId]);
        }

        logAudit(req.session.user?.id, req.session.user?.display_name || '', 'UPDATE_ANESTHESIA_RECORD', 'Surgery', `Updated anesthesia record for surgery ${req.params.id}`, req.ip);

        const returnQ = tenantId
            ? 'SELECT * FROM surgery_anesthesia_records WHERE surgery_id=$1 AND tenant_id=$2'
            : 'SELECT * FROM surgery_anesthesia_records WHERE surgery_id=$1';
        const returnParams = tenantId ? [req.params.id, tenantId] : [req.params.id];
        res.json((await pool.query(returnQ, returnParams)).rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// Operating Rooms
app.get('/api/operating-rooms', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const { tenantId } = getRequestTenantContext(req);
        const q = tenantId
            ? 'SELECT * FROM operating_rooms WHERE tenant_id = $1 ORDER BY id'
            : 'SELECT * FROM operating_rooms ORDER BY id';
        const params = tenantId ? [tenantId] : [];
        res.json((await pool.query(q, params)).rows);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/operating-rooms', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const { tenantId, facilityId } = getRequestTenantContext(req);
        const { room_name, room_name_ar, location, equipment } = req.body;

        const result = await pool.query(
            'INSERT INTO operating_rooms (room_name, room_name_ar, location, equipment, tenant_id, branch_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
            [room_name || '', room_name_ar || '', location || '', equipment || '', tenantId, facilityId]);

        const returnQ = tenantId
            ? 'SELECT * FROM operating_rooms WHERE id=$1 AND tenant_id=$2'
            : 'SELECT * FROM operating_rooms WHERE id=$1';
        const returnParams = tenantId ? [result.rows[0].id, tenantId] : [result.rows[0].id];

        logAudit(req.session.user?.id, req.session.user?.display_name || '', 'CREATE_OPERATING_ROOM', 'Surgery', `Created operating room ${room_name}`, req.ip);
        res.json((await pool.query(returnQ, returnParams)).rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== BLOOD BANK =====
app.get('/api/blood-bank/units', requireAuth, async (req, res) => {
    try {
        const { status, blood_type } = req.query;
        let q = 'SELECT * FROM blood_bank_units'; const params = []; const conds = [];
        if (status) { params.push(status); conds.push(`status=$${params.length}`); }
        if (blood_type) { params.push(blood_type); conds.push(`blood_type=$${params.length}`); }
        if (conds.length) q += ' WHERE ' + conds.join(' AND ');
        q += ' ORDER BY id DESC';
        res.json((await pool.query(q, params)).rows);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/blood-bank/units', requireAuth, async (req, res) => {
    try {
        const { bag_number, blood_type, rh_factor, component, donor_id, collection_date, expiry_date, volume_ml, storage_location, notes } = req.body;
        const result = await pool.query(
            'INSERT INTO blood_bank_units (bag_number, blood_type, rh_factor, component, donor_id, collection_date, expiry_date, volume_ml, storage_location, notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id',
            [bag_number || '', blood_type || '', rh_factor || '+', component || 'Whole Blood', donor_id || 0, collection_date || '', expiry_date || '', volume_ml || 450, storage_location || '', notes || '']);
        res.json((await pool.query('SELECT * FROM blood_bank_units WHERE id=$1', [result.rows[0].id])).rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.put('/api/blood-bank/units/:id', requireAuth, async (req, res) => {
    try {
        const { status } = req.body;
        if (status) await pool.query('UPDATE blood_bank_units SET status=$1 WHERE id=$2', [status, req.params.id]);
        res.json((await pool.query('SELECT * FROM blood_bank_units WHERE id=$1', [req.params.id])).rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/blood-bank/donors', requireAuth, async (req, res) => {
    try { res.json((await pool.query('SELECT * FROM blood_bank_donors ORDER BY id DESC')).rows); }
    catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/blood-bank/donors', requireAuth, async (req, res) => {
    try {
        const { donor_name, donor_name_ar, national_id, phone, blood_type, rh_factor, age, gender, medical_history, notes } = req.body;
        const result = await pool.query(
            'INSERT INTO blood_bank_donors (donor_name, donor_name_ar, national_id, phone, blood_type, rh_factor, age, gender, last_donation_date, medical_history, notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,CURRENT_DATE::TEXT,$9,$10) RETURNING id',
            [donor_name || '', donor_name_ar || '', national_id || '', phone || '', blood_type || '', rh_factor || '+', age || 0, gender || '', medical_history || '', notes || '']);
        res.json((await pool.query('SELECT * FROM blood_bank_donors WHERE id=$1', [result.rows[0].id])).rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/blood-bank/crossmatch', requireAuth, async (req, res) => {
    try {
        const { patient_id, patient_name, patient_blood_type, units_needed, unit_id, surgery_id, notes } = req.body;
        const result = await pool.query(
            'INSERT INTO blood_bank_crossmatch (patient_id, patient_name, patient_blood_type, units_needed, unit_id, lab_technician, surgery_id, notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
            [patient_id || 0, patient_name || '', patient_blood_type || '', units_needed || 1, unit_id || 0, req.session.user.name || '', surgery_id || 0, notes || '']);
        res.json((await pool.query('SELECT * FROM blood_bank_crossmatch WHERE id=$1', [result.rows[0].id])).rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/blood-bank/crossmatch', requireAuth, async (req, res) => {
    try { res.json((await pool.query('SELECT * FROM blood_bank_crossmatch ORDER BY id DESC')).rows); }
    catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.put('/api/blood-bank/crossmatch/:id', requireAuth, async (req, res) => {
    try {
        const { result: matchResult } = req.body;
        if (matchResult) await pool.query('UPDATE blood_bank_crossmatch SET result=$1 WHERE id=$2', [matchResult, req.params.id]);
        res.json((await pool.query('SELECT * FROM blood_bank_crossmatch WHERE id=$1', [req.params.id])).rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/blood-bank/transfusions', requireAuth, async (req, res) => {
    try { res.json((await pool.query('SELECT * FROM blood_bank_transfusions ORDER BY id DESC')).rows); }
    catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/blood-bank/transfusions', requireAuth, async (req, res) => {
    try {
        const { patient_id, patient_name, unit_id, bag_number, blood_type, component, administered_by, start_time, volume_ml, notes } = req.body;
        // Mark unit as Used
        if (unit_id) await pool.query("UPDATE blood_bank_units SET status='Used' WHERE id=$1", [unit_id]);
        const result = await pool.query(
            'INSERT INTO blood_bank_transfusions (patient_id, patient_name, unit_id, bag_number, blood_type, component, administered_by, start_time, volume_ml, notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id',
            [patient_id || 0, patient_name || '', unit_id || 0, bag_number || '', blood_type || '', component || '', administered_by || req.session.user.name || '', start_time || new Date().toISOString(), volume_ml || 0, notes || '']);
        res.json((await pool.query('SELECT * FROM blood_bank_transfusions WHERE id=$1', [result.rows[0].id])).rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/blood-bank/stats', requireAuth, async (req, res) => {
    try {
        const total = (await pool.query("SELECT COUNT(*) as cnt FROM blood_bank_units WHERE status='Available'")).rows[0].cnt;
        const expiring = (await pool.query("SELECT COUNT(*) as cnt FROM blood_bank_units WHERE status='Available' AND expiry_date != '' AND expiry_date <= (CURRENT_DATE + INTERVAL '7 days')::TEXT")).rows[0].cnt;
        const todayTransfusions = (await pool.query("SELECT COUNT(*) as cnt FROM blood_bank_transfusions WHERE created_at::date = CURRENT_DATE")).rows[0].cnt;
        const byType = (await pool.query("SELECT blood_type, rh_factor, COUNT(*) as cnt FROM blood_bank_units WHERE status='Available' GROUP BY blood_type, rh_factor ORDER BY blood_type")).rows;
        const totalDonors = (await pool.query('SELECT COUNT(*) as cnt FROM blood_bank_donors')).rows[0].cnt;
        const pendingCrossmatch = (await pool.query("SELECT COUNT(*) as cnt FROM blood_bank_crossmatch WHERE result='Pending'")).rows[0].cnt;
        res.json({ total, expiring, todayTransfusions, byType, totalDonors, pendingCrossmatch });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== CONSENT FORMS =====
app.get('/api/consent-forms', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const { tenantId } = getRequestTenantContext(req);
        const { patient_id } = req.query;
        if (patient_id) {
            // Verify patient belongs to tenant
            const patientCheck = (await pool.query('SELECT id FROM patients WHERE id=$1 AND tenant_id=$2', [patient_id, tenantId])).rows[0];
            if (!patientCheck) {
                return res.status(404).json({ error: 'Patient not found or access denied' });
            }
            const { rows } = await pool.query('SELECT * FROM consent_forms WHERE patient_id=$1 AND tenant_id=$2 ORDER BY id DESC', [patient_id, tenantId]);
            res.json(rows);
        } else {
            const { rows } = await pool.query('SELECT * FROM consent_forms WHERE tenant_id=$1 ORDER BY id DESC', [tenantId]);
            res.json(rows);
        }
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/consent-forms', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const { tenantId, facilityId } = getRequestTenantContext(req);
        const { patient_id, patient_name, form_type, form_title, form_title_ar, content, doctor_name, surgery_id, notes } = req.body;

        // Verify patient belongs to tenant
        if (patient_id) {
            const patientCheck = (await pool.query('SELECT id FROM patients WHERE id=$1 AND tenant_id=$2', [patient_id, tenantId])).rows[0];
            if (!patientCheck) {
                return res.status(404).json({ error: 'Patient not found or access denied' });
            }
        }

        // Verify surgery belongs to tenant
        if (surgery_id && parseInt(surgery_id) !== 0) {
            const surgeryCheck = (await pool.query('SELECT id FROM surgeries WHERE id=$1 AND tenant_id=$2', [surgery_id, tenantId])).rows[0];
            if (!surgeryCheck) {
                return res.status(404).json({ error: 'Surgery not found or access denied' });
            }
        }

        const result = await pool.query(
            'INSERT INTO consent_forms (patient_id, patient_name, form_type, form_title, form_title_ar, content, doctor_name, surgery_id, notes, tenant_id, facility_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id',
            [patient_id || 0, patient_name || '', form_type || 'general', form_title || '', form_title_ar || '', content || '', doctor_name || req.session.user.display_name || req.session.user.name || '', surgery_id || 0, notes || '', tenantId, facilityId]
        );
        const row = (await pool.query('SELECT * FROM consent_forms WHERE id=$1 AND tenant_id=$2', [result.rows[0].id, tenantId])).rows[0];
        res.json(row);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/consent-forms/:id', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const { tenantId } = getRequestTenantContext(req);
        const row = (await pool.query('SELECT * FROM consent_forms WHERE id=$1 AND tenant_id=$2', [req.params.id, tenantId])).rows[0];
        if (!row) return res.status(404).json({ error: 'Consent form not found' });
        res.json(row);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.put('/api/consent-forms/:id/sign', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const { tenantId } = getRequestTenantContext(req);
        const consentCheck = (await pool.query('SELECT id FROM consent_forms WHERE id=$1 AND tenant_id=$2', [req.params.id, tenantId])).rows[0];
        if (!consentCheck) return res.status(404).json({ error: 'Consent form not found' });

        const { patient_signature, witness_name, witness_signature } = req.body;
        await pool.query(
            "UPDATE consent_forms SET patient_signature=$1, witness_name=$2, witness_signature=$3, signed_at=NOW()::TEXT, status='Signed' WHERE id=$4 AND tenant_id=$5",
            [patient_signature || '', witness_name || '', witness_signature || '', req.params.id, tenantId]
        );
        const row = (await pool.query('SELECT * FROM consent_forms WHERE id=$1 AND tenant_id=$2', [req.params.id, tenantId])).rows[0];
        res.json(row);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/consent-forms/templates/list', requireAuth, requireTenantScope, async (req, res) => {
    try {
        res.json([
            { type: 'surgical', title: 'Surgical Consent', title_ar: 'إقرار عملية جراحية', file: '25_إقرار_عملية_جراحية_عامة_Surgical_Consent.html', content: 'أقر أنا الموقع أدناه بموافقتي على إجراء العملية الجراحية الموضحة في هذا النموذج، وقد تم شرح طبيعة العملية والمضاعفات المحتملة والبدائل العلاجية المتاحة لي بالتفصيل.' },
            { type: 'anesthesia', title: 'Anesthesia Consent', title_ar: 'إقرار تخدير', file: '26_إقرار_تخدير_Anesthesia_Consent.html', content: 'أقر بموافقتي على إجراء التخدير اللازم للعملية، وقد تم إبلاغي بنوع التخدير المقترح والمخاطر المحتملة بما في ذلك الحساسية وصعوبة التنفس.' },
            { type: 'admission', title: 'Admission Consent', title_ar: 'إقرار قبول ودخول', file: '27_إقرار_قبول_ودخول_Admission_Consent.html', content: 'أقر بموافقتي على الدخول للمستشفى وتلقي العلاج اللازم، وأوافق على اتباع التعليمات واللوائح الداخلية للمستشفى.' },
            { type: 'blood_transfusion', title: 'Blood Transfusion Consent', title_ar: 'إقرار نقل دم', file: '28_إقرار_نقل_دم_Blood_Transfusion_Consent.html', content: 'أقر بموافقتي على إجراء نقل الدم أو مشتقاته حسب الحالة الطبية، وقد تم إعلامي بالمخاطر المحتملة بما في ذلك ردود الفعل التحسسية.' },
            { type: 'treatment_refusal', title: 'Treatment Refusal', title_ar: 'إقرار رفض علاج', file: '29_إقرار_رفض_علاج_Treatment_Refusal.html', content: 'أقر أنني قررت رفض العلاج/الإجراء الطبي الموصى به رغم شرح الطبيب للمخاطر المترتبة على ذلك، وأتحمل كامل المسؤولية.' },
            { type: 'medical_photography', title: 'Medical Photography Consent', title_ar: 'إقرار تصوير طبي', file: '19_إقرار_نشر_الصور_Social_Media_Photo_Consent.html', content: 'أوافق على التقاط صور/فيديو للحالة الطبية لأغراض التوثيق الطبي والتعليم والبحث العلمي، مع الحفاظ على السرية.' },
            { type: 'ama_discharge', title: 'Discharge Against Medical Advice', title_ar: 'إقرار خروج ضد المشورة الطبية', file: '30_إقرار_خروج_ضد_المشورة_AMA_Discharge.html', content: 'أقر بأنني أرغب بالخروج من المستشفى ضد المشورة الطبية، وقد تم إعلامي بالمخاطر المحتملة، وأتحمل كامل المسؤولية.' },
            { type: 'privacy', title: 'Privacy Policy Consent', title_ar: 'إقرار سياسة الخصوصية', file: '31_إقرار_سياسة_الخصوصية_Privacy_Policy_Consent.html', content: 'أوافق على سياسة الخصوصية وحماية البيانات الشخصية، وأجيز للمستشفى استخدام بياناتي الطبية وفقاً للأنظمة واللوائح المعمول بها.' },
            // ===== COSMETIC / DERMATOLOGY CONSENT TEMPLATES =====
            { type: 'cosmetic_general', title: 'General Cosmetic Surgery Consent', title_ar: 'إقرار جراحة تجميلية عام', file: '01_إقرار_جراحة_تجميلية_عام_General_Cosmetic_Consent.html', content: 'أقر أنا الموقع أدناه بموافقتي على إجراء العملية التجميلية الموضحة.' },
            { type: 'rhinoplasty', title: 'Rhinoplasty Consent', title_ar: 'إقرار تجميل الأنف', file: '02_إقرار_تجميل_الأنف_Rhinoplasty_Consent.html', content: 'أقر بموافقتي على عملية تجميل الأنف.' },
            { type: 'botox_filler', title: 'Botox & Filler Consent', title_ar: 'إقرار بوتوكس وفيلر', file: '03_إقرار_بوتوكس_وفيلر_Botox_Filler_Consent.html', content: 'أقر بموافقتي على حقن البوتوكس/الفيلر.' },
            { type: 'liposuction', title: 'Liposuction / Body Contouring Consent', title_ar: 'إقرار شفط الدهون وشد البطن', file: '04_إقرار_شفط_دهون_وشد_بطن_Liposuction_Consent.html', content: 'أقر بموافقتي على عملية نحت الجسم.' },
            { type: 'laser_treatment', title: 'Laser Treatment Consent', title_ar: 'إقرار علاج ليزر', file: '05_إقرار_علاج_ليزر_Laser_Treatment_Consent.html', content: 'أقر بموافقتي على العلاج بالليزر.' },
            { type: 'hair_transplant', title: 'Hair Transplant Consent', title_ar: 'إقرار زراعة الشعر', file: '06_إقرار_زراعة_شعر_Hair_Transplant_Consent.html', content: 'أقر بموافقتي على زراعة الشعر.' },
            { type: 'chemical_peeling', title: 'Chemical Peeling Consent', title_ar: 'إقرار التقشير الكيميائي', file: '07_إقرار_التقشير_الكيميائي_Chemical_Peeling_Consent.html', content: 'أقر بموافقتي على التقشير الكيميائي.' },
            { type: 'hair_bleaching', title: 'Hair Bleaching Consent', title_ar: 'إقرار تشقير الشعر', file: '08_إقرار_تشقير_الشعر_Hair_Bleaching_Consent.html', content: 'أقر بموافقتي على تشقير الشعر.' },
            { type: 'hyaluronidase', title: 'Hyaluronidase (Filler Dissolution) Consent', title_ar: 'إقرار إذابة الفيلر', file: '09_إقرار_إذابة_الفيلر_Hyaluronidase_Consent.html', content: 'أقر بموافقتي على إذابة الفيلر بالهيالورونيداز.' },
            { type: 'steroid_injection', title: 'Steroid Injection Consent', title_ar: 'إقرار حقن الكورتيزون', file: '10_إقرار_حقن_الكورتيزون_Steroid_Injection_Consent.html', content: 'أقر بموافقتي على حقن الكورتيزون.' },
            { type: 'lip_rejuvenation', title: 'Lip Rejuvenation Consent', title_ar: 'إقرار توريد الشفايف', file: '11_إقرار_توريد_الشفايف_Lip_Rejuvenation_Consent.html', content: 'أقر بموافقتي على توريد الشفايف.' },
            { type: 'q_switched_laser', title: 'Q-Switched / Carbon Laser Consent', title_ar: 'إقرار الليزر الكربوني', file: '12_إقرار_الليزر_الكربوني_Q_Switched_Laser_Consent.html', content: 'أقر بموافقتي على الليزر الكربوني (Q-Switched).' },
            { type: 'sculptra', title: 'Sculptra (PLLA) Consent', title_ar: 'إقرار سكلبترا', file: '13_إقرار_سكلبترا_Sculptra_Consent.html', content: 'أقر بموافقتي على حقن سكلبترا.' },
            { type: 'skin_tags_removal', title: 'Skin Tags / Moles Removal Consent', title_ar: 'إقرار إزالة الزوائد الجلدية', file: '14_إقرار_إزالة_الزوائد_الجلدية_Skin_Tags_Removal_Consent.html', content: 'أقر بموافقتي على إزالة الزوائد الجلدية.' },
            { type: 'tattoo_removal', title: 'Tattoo Removal Consent', title_ar: 'إقرار إزالة الوشم', file: '15_إقرار_إزالة_الوشم_Tattoo_Removal_Consent.html', content: 'أقر بموافقتي على إزالة الوشم بالليزر.' },
            { type: 'fractional_laser', title: 'Fractional Laser Consent', title_ar: 'إقرار ليزر الفراكشنال', file: '16_إقرار_ليزر_الفراكشنال_Fractional_Laser_Consent.html', content: 'أقر بموافقتي على ليزر الفراكشنال.' },
            { type: 'dermapen_scarlet', title: 'Dermapen / Scarlet RF + PRP Consent', title_ar: 'إقرار الديرمابن / سكارليت مع البلازما', file: '17_إقرار_الديرمابن_سكارليت_Dermapen_Scarlet_Consent.html', content: 'أقر بموافقتي على الميكرونيدلينغ.' },
            { type: 'roaccutane', title: 'Roaccutane (Isotretinoin) Consent', title_ar: 'إقرار الرواكتان', file: '18_إقرار_الرواكتان_Roaccutane_Consent.html', content: 'أقر بموافقتي على علاج الآيزوتريتينوين.' },
            { type: 'social_media_photo', title: 'Social Media Photo/Video Consent', title_ar: 'إقرار نشر الصور على التواصل الاجتماعي', file: '19_إقرار_نشر_الصور_Social_Media_Photo_Consent.html', content: 'أوافق طوعياً على التصوير والنشر على التواصل الاجتماعي.' },
            { type: 'glow_sessions', title: 'Glow / Rejuvenation Sessions Consent', title_ar: 'إقرار جلسات النضارة', file: '20_إقرار_جلسات_النضارة_Glow_Sessions_Consent.html', content: 'أقر بموافقتي على جلسة النضارة.' },
            { type: 'general_medical', title: 'General Medical Procedure Consent', title_ar: 'إقرار إجراء طبي عام', file: '21_إقرار_إجراء_طبي_عام_General_Medical_Procedure_Consent.html', content: 'أقر بموافقتي على الإجراء الطبي.' },
            { type: 'injection_info', title: 'Injection Info Card', title_ar: 'بطاقة معلومات الحقن', file: '22_بطاقة_معلومات_الحقن_Injection_Info_Card.html', content: 'بطاقة معلومات الحقن.' },
            { type: 'mesotherapy', title: 'General Mesotherapy Consent', title_ar: 'إقرار الميزوثيرابي', file: '23_إقرار_الميزوثيرابي_General_Mesotherapy_Consent.html', content: 'أقر بموافقتي على الميزوثيرابي.' },
            { type: 'cosmetic_info_card', title: 'Cosmetic Procedures Info Card', title_ar: 'بطاقة معلومات إجراءات التجميل', file: '24_نموذج_بطاقة_معلومات_إجراءات_التجميل_Cosmetic_Info_Card.html', content: 'بطاقة معلومات إجراءات التجميل.' }
        ]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== CONSENT FORM HTML RENDERER (Auto-fill patient data) =====
app.get('/api/consent-forms/render/:type', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const { tenantId } = getRequestTenantContext(req);
        const { patient_id, doctor_name } = req.query;
        // Get template file mapping
        const templatesResp = await new Promise((resolve) => {
            const templates = [
                { type: 'surgical', file: '25_إقرار_عملية_جراحية_عامة_Surgical_Consent.html' },
                { type: 'anesthesia', file: '26_إقرار_تخدير_Anesthesia_Consent.html' },
                { type: 'admission', file: '27_إقرار_قبول_ودخول_Admission_Consent.html' },
                { type: 'blood_transfusion', file: '28_إقرار_نقل_دم_Blood_Transfusion_Consent.html' },
                { type: 'treatment_refusal', file: '29_إقرار_رفض_علاج_Treatment_Refusal.html' },
                { type: 'medical_photography', file: '19_إقرار_نشر_الصور_Social_Media_Photo_Consent.html' },
                { type: 'ama_discharge', file: '30_إقرار_خروج_ضد_المشورة_AMA_Discharge.html' },
                { type: 'privacy', file: '31_إقرار_سياسة_الخصوصية_Privacy_Policy_Consent.html' },
                { type: 'cosmetic_general', file: '01_إقرار_جراحة_تجميلية_عام_General_Cosmetic_Consent.html' },
                { type: 'rhinoplasty', file: '02_إقرار_تجميل_الأنف_Rhinoplasty_Consent.html' },
                { type: 'botox_filler', file: '03_إقرار_بوتوكس_وفيلر_Botox_Filler_Consent.html' },
                { type: 'liposuction', file: '04_إقرار_شفط_دهون_وشد_بطن_Liposuction_Consent.html' },
                { type: 'laser_treatment', file: '05_إقرار_علاج_ليزر_Laser_Treatment_Consent.html' },
                { type: 'hair_transplant', file: '06_إقرار_زراعة_شعر_Hair_Transplant_Consent.html' },
                { type: 'chemical_peeling', file: '07_إقرار_التقشير_الكيميائي_Chemical_Peeling_Consent.html' },
                { type: 'hair_bleaching', file: '08_إقرار_تشقير_الشعر_Hair_Bleaching_Consent.html' },
                { type: 'hyaluronidase', file: '09_إقرار_إذابة_الفيلر_Hyaluronidase_Consent.html' },
                { type: 'steroid_injection', file: '10_إقرار_حقن_الكورتيزون_Steroid_Injection_Consent.html' },
                { type: 'lip_rejuvenation', file: '11_إقرار_توريد_الشفايف_Lip_Rejuvenation_Consent.html' },
                { type: 'q_switched_laser', file: '12_إقرار_الليزر_الكربوني_Q_Switched_Laser_Consent.html' },
                { type: 'sculptra', file: '13_إقرار_سكلبترا_Sculptra_Consent.html' },
                { type: 'skin_tags_removal', file: '14_إقرار_إزالة_الزوائد_الجلدية_Skin_Tags_Removal_Consent.html' },
                { type: 'tattoo_removal', file: '15_إقرار_إزالة_الوشم_Tattoo_Removal_Consent.html' },
                { type: 'fractional_laser', file: '16_إقرار_ليزر_الفراكشنال_Fractional_Laser_Consent.html' },
                { type: 'dermapen_scarlet', file: '17_إقرار_الديرمابن_سكارليت_Dermapen_Scarlet_Consent.html' },
                { type: 'roaccutane', file: '18_إقرار_الرواكتان_Roaccutane_Consent.html' },
                { type: 'social_media_photo', file: '19_إقرار_نشر_الصور_Social_Media_Photo_Consent.html' },
                { type: 'glow_sessions', file: '20_إقرار_جلسات_النضارة_Glow_Sessions_Consent.html' },
                { type: 'general_medical', file: '21_إقرار_إجراء_طبي_عام_General_Medical_Procedure_Consent.html' },
                { type: 'injection_info', file: '22_بطاقة_معلومات_الحقن_Injection_Info_Card.html' },
                { type: 'mesotherapy', file: '23_إقرار_الميزوثيرابي_General_Mesotherapy_Consent.html' },
                { type: 'cosmetic_info_card', file: '24_نموذج_بطاقة_معلومات_إجراءات_التجميل_Cosmetic_Info_Card.html' }
            ];
            resolve(templates.find(t => t.type === req.params.type));
        });
        if (!templatesResp) return res.status(404).json({ error: 'Template not found' });
        const filePath = path.join(__dirname, 'public', 'consent-forms', templatesResp.file);
        if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'HTML file not found' });
        let html = fs.readFileSync(filePath, 'utf8');
        // Auto-fill patient data if patient_id provided
        if (patient_id) {
            const patient = (await pool.query('SELECT * FROM patients WHERE id=$1 AND tenant_id=$2', [patient_id, tenantId])).rows[0];
            if (!patient) {
                return res.status(404).json({ error: 'Patient not found or access denied' });
            }
            const now = new Date();
            const dateStr = now.toISOString().split('T')[0];
            const timeStr = now.toTimeString().split(' ')[0].substring(0, 5);
            // Calculate age
            let age = '';
            if (patient.dob) {
                const dob = new Date(patient.dob);
                age = Math.floor((now - dob) / (365.25 * 24 * 60 * 60 * 1000));
            }
            // Inject auto-fill script at end of body
            const fillScript = `<script>
                document.addEventListener('DOMContentLoaded', function() {
                    const data = {
                        name: '${(patient.name_ar || patient.name_en || '').replace(/'/g, "\\'")}',
                        fileNo: '${patient.file_number || ''}',
                        idNo: '${patient.national_id || ''}',
                        age: '${age}',
                        phone: '${patient.phone || ''}',
                        date: '${dateStr}',
                        time: '${timeStr}',
                        gender: '${patient.gender || ''}',
                        doctor: '${(doctor_name || '').replace(/'/g, "\\'")}'
                    };
                    // Fill all .line spans after label fields
                    const fields = document.querySelectorAll('.field');
                    fields.forEach(f => {
                        const label = f.querySelector('label');
                        const line = f.querySelector('.line');
                        if (!label || !line) return;
                        const txt = label.textContent;
                        if (txt.includes('اسم المريض') || txt.includes('Name:')) line.textContent = data.name;
                        else if (txt.includes('رقم الملف') || txt.includes('File')) line.textContent = data.fileNo;
                        else if (txt.includes('رقم الهوية') || txt.includes('ID #')) line.textContent = data.idNo;
                        else if (txt.includes('العمر') || txt.includes('Age')) line.textContent = data.age;
                        else if (txt.includes('الجوال') || txt.includes('Phone')) line.textContent = data.phone;
                        else if (txt.includes('التاريخ') || txt.includes('Date:')) line.textContent = data.date;
                        else if (txt.includes('الوقت') || txt.includes('Time:')) line.textContent = data.time;
                        else if ((txt.includes('الجراح') || txt.includes('Surgeon') || txt.includes('الطبيب المعالج') || txt.includes('طبيب التخدير')) && data.doctor) line.textContent = data.doctor;
                    });
                });
            </script>`;
            html = html.replace('</body>', fillScript + '\n</body>');
        }
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(html);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});


// ===== LAB & RADIOLOGY ORDERS (Payment-First Workflow) =====
// Doctor creates order → status='Pending Payment' → Reception pays → status='Requested' → Lab/Rad processes

// Get lab orders (only paid/approved ones visible to lab)
app.get('/api/lab/orders', requireAuth, async (req, res) => {
    try {
        // --- TENANT SCOPE: filter lab orders by current tenant_id ---
        const { tenantId } = getRequestTenantContext(req);
        const tenantFilter = tenantId ? ' AND o.tenant_id=$1' : '';
        const queryParams = tenantId ? [tenantId] : [];
        const rows = (await pool.query(`SELECT o.*, p.name_ar as patient_name, p.file_number, p.phone, su.display_name as doctor
            FROM lab_radiology_orders o LEFT JOIN patients p ON o.patient_id = p.id
            LEFT JOIN system_users su ON o.doctor_id = su.id
            WHERE o.is_radiology = 0 AND o.approval_status IN ('Approved', 'Paid')${tenantFilter}
            ORDER BY o.id DESC`, queryParams)).rows;
        res.json(rows);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// Get radiology orders (only paid/approved ones visible to radiology)
app.get('/api/radiology/orders', requireAuth, async (req, res) => {
    try {
        // --- TENANT SCOPE: filter radiology orders by current tenant_id ---
        const { tenantId } = getRequestTenantContext(req);
        const tenantFilter = tenantId ? ' AND o.tenant_id=$1' : '';
        const queryParams = tenantId ? [tenantId] : [];
        const rows = (await pool.query(`SELECT o.*, p.name_ar as patient_name, p.file_number, p.phone, su.display_name as doctor
            FROM lab_radiology_orders o LEFT JOIN patients p ON o.patient_id = p.id
            LEFT JOIN system_users su ON o.doctor_id = su.id
            WHERE o.is_radiology = 1 AND o.approval_status IN ('Approved', 'Paid')${tenantFilter}
            ORDER BY o.id DESC`, queryParams)).rows;
        res.json(rows);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// Get ALL pending payment orders (for reception)
app.get('/api/orders/pending-payment', requireAuth, async (req, res) => {
    try {
        // --- TENANT SCOPE: filter pending orders by current tenant_id ---
        const { tenantId } = getRequestTenantContext(req);
        const tenantFilter = tenantId ? ' AND o.tenant_id=$1' : '';
        const queryParams = tenantId ? [tenantId] : [];
        const rows = (await pool.query(`SELECT o.*, p.name_ar as patient_name, p.name_en, p.file_number, p.phone, p.nationality
            FROM lab_radiology_orders o LEFT JOIN patients p ON o.patient_id = p.id
            WHERE o.approval_status = 'Pending Approval'${tenantFilter}
            ORDER BY o.id DESC`, queryParams)).rows;
        res.json(rows);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// Doctor creates lab order (goes to reception first)
app.post('/api/lab/orders', requireAuth, async (req, res) => {
    try {
        const { patient_id, order_type, description } = req.body;
        // --- TENANT SCOPE: stamp tenant_id from session + validate patient belongs to same tenant ---
        const { tenantId, facilityId } = getRequestTenantContext(req);
        if (tenantId && patient_id) {
            const patientCheck = (await pool.query('SELECT id FROM patients WHERE id=$1 AND tenant_id=$2', [patient_id, tenantId])).rows[0];
            if (!patientCheck) return res.status(404).json({ error: 'Patient not found' });
        }
        const pName = (await pool.query('SELECT name_ar, name_en FROM patients WHERE id=$1', [patient_id])).rows[0];
        const r = await pool.query(
            `INSERT INTO lab_radiology_orders (patient_id, doctor_id, order_type, description, status, is_radiology, approval_status, tenant_id, facility_id)
             VALUES ($1, $2, $3, $4, 'Pending Payment', 0, 'Pending Approval', $5, $6) RETURNING *`,
            [patient_id, req.session.user?.id || 0, order_type || '', description || '', tenantId || null, facilityId || null]
        );
        r.rows[0].patient_name = pName?.name_ar || pName?.name_en || '';
        logAudit(req.session.user?.id, req.session.user?.display_name, 'CREATE_LAB_ORDER', 'Lab',
            `Lab order: ${order_type} for patient #${patient_id}`, req.ip);
        res.json(r.rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// Doctor creates radiology order (goes to reception first)
app.post('/api/radiology/orders', requireAuth, async (req, res) => {
    try {
        const { patient_id, order_type, description } = req.body;
        // --- TENANT SCOPE: stamp tenant_id from session + validate patient belongs to same tenant ---
        const { tenantId, facilityId } = getRequestTenantContext(req);
        if (tenantId && patient_id) {
            const patientCheck = (await pool.query('SELECT id FROM patients WHERE id=$1 AND tenant_id=$2', [patient_id, tenantId])).rows[0];
            if (!patientCheck) return res.status(404).json({ error: 'Patient not found' });
        }
        const pName = (await pool.query('SELECT name_ar, name_en FROM patients WHERE id=$1', [patient_id])).rows[0];
        const r = await pool.query(
            `INSERT INTO lab_radiology_orders (patient_id, doctor_id, order_type, description, status, is_radiology, approval_status, tenant_id, facility_id)
             VALUES ($1, $2, $3, $4, 'Pending Payment', 1, 'Pending Approval', $5, $6) RETURNING *`,
            [patient_id, req.session.user?.id || 0, order_type || '', description || '', tenantId || null, facilityId || null]
        );
        r.rows[0].patient_name = pName?.name_ar || pName?.name_en || '';
        logAudit(req.session.user?.id, req.session.user?.display_name, 'CREATE_RADIOLOGY_ORDER', 'Radiology',
            `Radiology order: ${order_type} for patient #${patient_id}`, req.ip);
        res.json(r.rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// Direct lab order (from lab page - auto approved)
app.post('/api/lab/orders/direct', requireAuth, async (req, res) => {
    try {
        const { patient_id, order_type, description } = req.body;
        // --- TENANT SCOPE: stamp tenant_id from session ---
        const { tenantId, facilityId } = getRequestTenantContext(req);
        if (tenantId && patient_id) {
            const patientCheck = (await pool.query('SELECT id FROM patients WHERE id=$1 AND tenant_id=$2', [patient_id, tenantId])).rows[0];
            if (!patientCheck) return res.status(404).json({ error: 'Patient not found' });
        }
        const pName = patient_id ? (await pool.query('SELECT name_ar, name_en FROM patients WHERE id=$1', [patient_id])).rows[0] : null;
        const r = await pool.query(
            `INSERT INTO lab_radiology_orders (patient_id, doctor_id, order_type, description, status, is_radiology, approval_status, tenant_id, facility_id)
             VALUES ($1, $2, $3, $4, 'Requested', 0, 'Paid', $5, $6) RETURNING *`,
            [patient_id || 0, req.session.user?.id || 0, order_type || '', description || '', tenantId || null, facilityId || null]
        );
        r.rows[0].patient_name = pName?.name_ar || pName?.name_en || '';
        logAudit(req.session.user?.id, req.session.user?.display_name, 'CREATE_LAB_ORDER_DIRECT', 'Lab',
            `Direct lab order: ${order_type} for patient #${patient_id}`, req.ip);
        res.json(r.rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// Reception approves payment → order goes to Lab/Radiology
app.put('/api/orders/:id/approve-payment', requireAuth, async (req, res) => {
    try {
        const { payment_method, price } = req.body;
        // --- TENANT SCOPE: verify order belongs to current tenant before approve (IDOR prevention) ---
        const { tenantId, facilityId } = getRequestTenantContext(req);
        const tenantCheck = tenantId ? ' AND tenant_id=$2' : '';
        const tenantParams = tenantId ? [req.params.id, tenantId] : [req.params.id];
        const orderPre = (await pool.query(`SELECT id FROM lab_radiology_orders WHERE id=$1${tenantCheck}`, tenantParams)).rows[0];
        if (!orderPre) return res.status(404).json({ error: 'Order not found' });
        // Update order status
        await pool.query(
            `UPDATE lab_radiology_orders SET status='Requested', approval_status='Paid', approved_by=$1, price=$2 WHERE id=$3`,
            [req.session.user?.display_name || 'Reception', price || 0, req.params.id]
        );
        // Get order details for invoice
        const order = (await pool.query(`SELECT o.*, p.name_ar, p.name_en, p.nationality
            FROM lab_radiology_orders o LEFT JOIN patients p ON o.patient_id = p.id WHERE o.id=$1`, [req.params.id])).rows[0];
        if (order && price > 0) {
            // Calculate VAT for non-Saudi patients
            const vat = await calcVAT(order.patient_id);
            const { total: finalTotal, vatAmount } = addVAT(price, vat.rate);
            const serviceType = order.is_radiology ? 'Radiology' : 'Laboratory';
            const desc = `${serviceType}: ${order.order_type}`;
            await pool.query(
                `INSERT INTO invoices (patient_id, patient_name, total, amount, vat_amount, description, service_type, paid, payment_method, order_id, tenant_id, facility_id)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, 1, $8, $9, $10, $11)`,
                [order.patient_id, order.name_ar || order.name_en || '', finalTotal, price, vatAmount, desc, serviceType, payment_method || 'Cash', order.id, tenantId || null, facilityId || null]
            );
        }
        logAudit(req.session.user?.id, req.session.user?.display_name, 'APPROVE_ORDER_PAYMENT', 'Lab/Radiology',
            `Approved payment for order #${req.params.id} amount:${price}`, req.ip);
        res.json({ success: true, order });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// Update lab/radiology order status (In Progress, Done)
app.put('/api/lab/orders/:id', requireAuth, async (req, res) => {
    try {
        const { status, results } = req.body;
        // --- TENANT SCOPE: verify order belongs to current tenant before update (IDOR prevention) ---
        const { tenantId } = getRequestTenantContext(req);
        const tenantCheck = tenantId ? ' AND tenant_id=$2' : '';
        const tenantParams = tenantId ? [req.params.id, tenantId] : [req.params.id];
        const orderCheck = (await pool.query(`SELECT id FROM lab_radiology_orders WHERE id=$1${tenantCheck}`, tenantParams)).rows[0];
        if (!orderCheck) return res.status(404).json({ error: 'Order not found' });
        const sets = []; const vals = []; let i = 1;
        if (status) { sets.push(`status=$${i++}`); vals.push(status); }
        if (results !== undefined) { sets.push(`results=$${i++}`); vals.push(results); }
        if (status === 'Done') { sets.push(`result_date=$${i++}`); vals.push(new Date().toISOString()); }
        if (sets.length > 0) {
            vals.push(req.params.id);
            await pool.query(`UPDATE lab_radiology_orders SET ${sets.join(',')} WHERE id=$${i}`, vals);
        }
        logAudit(req.session.user?.id, req.session.user?.display_name, 'UPDATE_LAB_ORDER', 'Lab',
            `Updated lab order #${req.params.id} status:${status || '-'} results:${results !== undefined ? 'yes' : 'no'}`, req.ip);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// Get single order
app.get('/api/lab/orders/:id', requireAuth, async (req, res) => {
    try {
        // --- TENANT SCOPE: verify order belongs to current tenant (IDOR prevention) ---
        const { tenantId } = getRequestTenantContext(req);
        const tenantCheck = tenantId ? ' AND o.tenant_id=$2' : '';
        const tenantParams = tenantId ? [req.params.id, tenantId] : [req.params.id];
        const r = (await pool.query(`SELECT o.*, p.name_ar as patient_name, p.file_number
            FROM lab_radiology_orders o LEFT JOIN patients p ON o.patient_id = p.id WHERE o.id=$1${tenantCheck}`, tenantParams)).rows[0];
        if (!r) return res.status(404).json({ error: 'Order not found' });
        res.json(r);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// Get patient's lab/radiology results
app.get('/api/patient/:pid/results', requireAuth, async (req, res) => {
    try {
        // --- TENANT SCOPE: verify patient belongs to current tenant + filter results ---
        const { tenantId } = getRequestTenantContext(req);
        const patientCheck = tenantId ?
            (await pool.query('SELECT id FROM patients WHERE id=$1 AND tenant_id=$2', [req.params.pid, tenantId])).rows[0] :
            (await pool.query('SELECT id FROM patients WHERE id=$1', [req.params.pid])).rows[0];
        if (!patientCheck) return res.status(404).json({ error: 'Patient not found' });
        const tenantFilter = tenantId ? ' AND tenant_id=$2' : '';
        const filterParams = tenantId ? [req.params.pid, tenantId] : [req.params.pid];
        const rows = (await pool.query(`SELECT * FROM lab_radiology_orders WHERE patient_id=$1 AND approval_status IN ('Approved','Paid')${tenantFilter} ORDER BY id DESC`, filterParams)).rows;
        res.json(rows);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== EMERGENCY DEPARTMENT =====
app.get('/api/emergency/visits', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const { tenantId } = getRequestTenantContext(req);
        const q = tenantId
            ? 'SELECT * FROM emergency_visits WHERE tenant_id = $1 ORDER BY arrival_time DESC'
            : 'SELECT * FROM emergency_visits ORDER BY arrival_time DESC';
        const params = tenantId ? [tenantId] : [];
        res.json((await pool.query(q, params)).rows);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/emergency/visits/:id', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const { tenantId } = getRequestTenantContext(req);
        const q = tenantId
            ? 'SELECT * FROM emergency_visits WHERE id = $1 AND tenant_id = $2'
            : 'SELECT * FROM emergency_visits WHERE id = $1';
        const params = tenantId ? [req.params.id, tenantId] : [req.params.id];
        const row = (await pool.query(q, params)).rows[0];
        if (!row) return res.status(404).json({ error: 'Emergency visit not found' });
        res.json(row);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/emergency/visits', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const { patient_id, patient_name, arrival_mode, chief_complaint, chief_complaint_ar, triage_level, triage_color, triage_nurse, triage_vitals, assigned_doctor, assigned_bed, acuity_notes } = req.body;
        const { tenantId, facilityId } = getRequestTenantContext(req);

        // Validate patient context to prevent IDOR / illegal references
        if (patient_id && tenantId) {
            const patientCheck = (await pool.query('SELECT id FROM patients WHERE id = $1 AND tenant_id = $2', [patient_id, tenantId])).rows[0];
            if (!patientCheck) {
                return res.status(403).json({ error: 'Invalid patient context or access denied' });
            }
        }

        // Validate bed context to prevent IDOR / illegal references
        if (assigned_bed && tenantId) {
            const bedCheck = (await pool.query('SELECT id FROM emergency_beds WHERE bed_name = $1 AND tenant_id = $2', [assigned_bed, tenantId])).rows[0];
            if (!bedCheck) {
                return res.status(403).json({ error: 'Invalid bed context or access denied' });
            }
        }

        const r = await pool.query(
            `INSERT INTO emergency_visits (patient_id,patient_name,arrival_mode,chief_complaint,chief_complaint_ar,triage_level,triage_color,triage_nurse,triage_vitals,assigned_doctor,assigned_bed,acuity_notes,tenant_id,facility_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
            [patient_id, patient_name, arrival_mode || 'Walk-in', chief_complaint, chief_complaint_ar, triage_level || 3, triage_color || 'Yellow', triage_nurse, triage_vitals, assigned_doctor, assigned_bed, acuity_notes, tenantId, facilityId]);

        if (assigned_bed) {
            const updateBedQ = tenantId
                ? "UPDATE emergency_beds SET status='Occupied', current_patient_id=$1 WHERE bed_name=$2 AND tenant_id=$3"
                : "UPDATE emergency_beds SET status='Occupied', current_patient_id=$1 WHERE bed_name=$2";
            const updateBedParams = tenantId ? [patient_id, assigned_bed, tenantId] : [patient_id, assigned_bed];
            await pool.query(updateBedQ, updateBedParams);
        }

        logAudit(req.session.user?.id, req.session.user?.display_name, 'CREATE_EMERGENCY_VISIT', 'Emergency', `Created emergency visit for patient #${patient_id}`, req.ip);
        res.json(r.rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.put('/api/emergency/visits/:id', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const { tenantId } = getRequestTenantContext(req);

        // Verify visit ownership first
        const checkQ = tenantId
            ? 'SELECT id, assigned_bed, patient_id FROM emergency_visits WHERE id = $1 AND tenant_id = $2'
            : 'SELECT id, assigned_bed, patient_id FROM emergency_visits WHERE id = $1';
        const checkParams = tenantId ? [req.params.id, tenantId] : [req.params.id];
        const visit = (await pool.query(checkQ, checkParams)).rows[0];
        if (!visit) return res.status(404).json({ error: 'Emergency visit not found' });

        const { status, disposition, assigned_doctor, assigned_bed, triage_level, triage_color,
            discharge_diagnosis, discharge_instructions, discharge_medications, followup_date } = req.body;

        // If assigned_bed is changed, verify it belongs to tenant
        if (assigned_bed && tenantId) {
            const bedCheck = (await pool.query('SELECT id FROM emergency_beds WHERE bed_name = $1 AND tenant_id = $2', [assigned_bed, tenantId])).rows[0];
            if (!bedCheck) {
                return res.status(403).json({ error: 'Invalid bed context or access denied' });
            }
        }

        const sets = []; const vals = []; let i = 1;
        if (status) { sets.push(`status=$${i++}`); vals.push(status); }
        if (disposition) { sets.push(`disposition=$${i++}`); vals.push(disposition); sets.push(`disposition_time=$${i++}`); vals.push(new Date().toISOString()); }
        if (assigned_doctor) { sets.push(`assigned_doctor=$${i++}`); vals.push(assigned_doctor); }
        if (assigned_bed) { sets.push(`assigned_bed=$${i++}`); vals.push(assigned_bed); }
        if (triage_level) { sets.push(`triage_level=$${i++}`); vals.push(triage_level); }
        if (triage_color) { sets.push(`triage_color=$${i++}`); vals.push(triage_color); }
        if (discharge_diagnosis) { sets.push(`discharge_diagnosis=$${i++}`); vals.push(discharge_diagnosis); }
        if (discharge_instructions) { sets.push(`discharge_instructions=$${i++}`); vals.push(discharge_instructions); }
        if (discharge_medications) { sets.push(`discharge_medications=$${i++}`); vals.push(discharge_medications); }
        if (followup_date) { sets.push(`followup_date=$${i++}`); vals.push(followup_date); }
        if (status === 'Discharged') { sets.push(`discharge_time=$${i++}`); vals.push(new Date().toISOString()); }

        vals.push(req.params.id);

        const updateQ = tenantId
            ? `UPDATE emergency_visits SET ${sets.join(',')} WHERE id=$${i} AND tenant_id=$${i+1}`
            : `UPDATE emergency_visits SET ${sets.join(',')} WHERE id=$${i}`;
        if (tenantId) vals.push(tenantId);

        await pool.query(updateQ, vals);

        if (status === 'Discharged' || status === 'Admitted') {
            const v = visit;
            if (v?.assigned_bed) {
                const updateBedQ = tenantId
                    ? "UPDATE emergency_beds SET status='Available', current_patient_id=0 WHERE bed_name=$1 AND tenant_id=$2"
                    : "UPDATE emergency_beds SET status='Available', current_patient_id=0 WHERE bed_name=$1";
                const updateBedParams = tenantId ? [v.assigned_bed, tenantId] : [v.assigned_bed];
                await pool.query(updateBedQ, updateBedParams);
            }
        }

        logAudit(req.session.user?.id, req.session.user?.display_name, 'UPDATE_EMERGENCY_VISIT', 'Emergency', `Updated emergency visit #${req.params.id} (Status: ${status || 'N/A'})`, req.ip);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/emergency/beds', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const { tenantId } = getRequestTenantContext(req);
        const q = tenantId
            ? 'SELECT * FROM emergency_beds WHERE tenant_id = $1 ORDER BY id'
            : 'SELECT * FROM emergency_beds ORDER BY id';
        const params = tenantId ? [tenantId] : [];
        res.json((await pool.query(q, params)).rows);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/emergency/stats', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const { tenantId } = getRequestTenantContext(req);

        const activeQ = tenantId
            ? "SELECT COUNT(*) as cnt FROM emergency_visits WHERE status='Active' AND tenant_id=$1"
            : "SELECT COUNT(*) as cnt FROM emergency_visits WHERE status='Active'";

        const todayQ = tenantId
            ? "SELECT COUNT(*) as cnt FROM emergency_visits WHERE DATE(arrival_time)=CURRENT_DATE AND tenant_id=$1"
            : "SELECT COUNT(*) as cnt FROM emergency_visits WHERE DATE(arrival_time)=CURRENT_DATE";

        const criticalQ = tenantId
            ? "SELECT COUNT(*) as cnt FROM emergency_visits WHERE status='Active' AND triage_level<=2 AND tenant_id=$1"
            : "SELECT COUNT(*) as cnt FROM emergency_visits WHERE status='Active' AND triage_level<=2";

        const bedsQ = tenantId
            ? "SELECT COUNT(*) as total, COUNT(*) FILTER(WHERE status='Available') as available FROM emergency_beds WHERE tenant_id=$1"
            : "SELECT COUNT(*) as total, COUNT(*) FILTER(WHERE status='Available') as available FROM emergency_beds";

        const byTriageQ = tenantId
            ? "SELECT triage_color, COUNT(*) as cnt FROM emergency_visits WHERE status='Active' AND tenant_id=$1 GROUP BY triage_color"
            : "SELECT triage_color, COUNT(*) as cnt FROM emergency_visits WHERE status='Active' GROUP BY triage_color";

        const params = tenantId ? [tenantId] : [];

        const active = (await pool.query(activeQ, params)).rows[0].cnt;
        const today = (await pool.query(todayQ, params)).rows[0].cnt;
        const critical = (await pool.query(criticalQ, params)).rows[0].cnt;
        const beds = (await pool.query(bedsQ, params)).rows[0];
        const byTriage = (await pool.query(byTriageQ, params)).rows;

        res.json({ active, today, critical, totalBeds: beds.total, availableBeds: beds.available, byTriage });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/emergency/trauma/:visitId', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const { tenantId, facilityId } = getRequestTenantContext(req);

        // Verify visit ownership first
        const visitCheckQ = tenantId
            ? 'SELECT id, patient_id FROM emergency_visits WHERE id = $1 AND tenant_id = $2'
            : 'SELECT id, patient_id FROM emergency_visits WHERE id = $1';
        const visitCheckParams = tenantId ? [req.params.visitId, tenantId] : [req.params.visitId];
        const visit = (await pool.query(visitCheckQ, visitCheckParams)).rows[0];
        if (!visit) return res.status(404).json({ error: 'Emergency visit not found or access denied' });

        const { patient_id, airway, breathing, circulation, disability, exposure, gcs_eye, gcs_verbal, gcs_motor, mechanism_of_injury, trauma_team_activated, assessed_by } = req.body;

        // Verify patient ownership
        if (patient_id && tenantId) {
            const patientCheck = (await pool.query('SELECT id FROM patients WHERE id = $1 AND tenant_id = $2', [patient_id, tenantId])).rows[0];
            if (!patientCheck) return res.status(403).json({ error: 'Invalid patient context or access denied' });
        }

        const gcs_total = (parseInt(gcs_eye) || 4) + (parseInt(gcs_verbal) || 5) + (parseInt(gcs_motor) || 6);
        const r = await pool.query(
            `INSERT INTO emergency_trauma_assessments (visit_id,patient_id,airway,breathing,circulation,disability,exposure,gcs_eye,gcs_verbal,gcs_motor,gcs_total,mechanism_of_injury,trauma_team_activated,assessed_by,tenant_id,facility_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
            [req.params.visitId, patient_id, airway, breathing, circulation, disability, exposure, gcs_eye || 4, gcs_verbal || 5, gcs_motor || 6, gcs_total, mechanism_of_injury, trauma_team_activated ? 1 : 0, assessed_by, tenantId, facilityId]);

        logAudit(req.session.user?.id, req.session.user?.display_name, 'CREATE_TRAUMA_ASSESSMENT', 'Emergency', `Created trauma assessment for visit #${req.params.visitId}`, req.ip);
        res.json(r.rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== INPATIENT ADT =====
app.get('/api/wards', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const { tenantId } = getRequestTenantContext(req);
        const q = tenantId
            ? 'SELECT * FROM wards WHERE tenant_id = $1 ORDER BY id'
            : 'SELECT * FROM wards ORDER BY id';
        const params = tenantId ? [tenantId] : [];
        res.json((await pool.query(q, params)).rows);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/beds', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const { ward_id } = req.query;
        const { tenantId } = getRequestTenantContext(req);

        // If ward_id is provided, verify ward belongs to tenant
        if (ward_id && tenantId) {
            const wardCheck = (await pool.query('SELECT id FROM wards WHERE id=$1 AND tenant_id=$2', [ward_id, tenantId])).rows[0];
            if (!wardCheck) {
                return res.status(403).json({ error: 'Invalid ward context or access denied' });
            }
        }

        let qText = '';
        let params = [];
        if (ward_id) {
            qText = tenantId
                ? 'SELECT b.*, w.ward_name, w.ward_name_ar FROM beds b JOIN wards w ON b.ward_id=w.id WHERE b.ward_id=$1 AND b.tenant_id=$2 ORDER BY b.bed_number'
                : 'SELECT b.*, w.ward_name, w.ward_name_ar FROM beds b JOIN wards w ON b.ward_id=w.id WHERE b.ward_id=$1 ORDER BY b.bed_number';
            params = tenantId ? [ward_id, tenantId] : [ward_id];
        } else {
            qText = tenantId
                ? 'SELECT b.*, w.ward_name, w.ward_name_ar FROM beds b JOIN wards w ON b.ward_id=w.id WHERE b.tenant_id=$1 ORDER BY w.id, b.bed_number'
                : 'SELECT b.*, w.ward_name, w.ward_name_ar FROM beds b JOIN wards w ON b.ward_id=w.id ORDER BY w.id, b.bed_number';
            params = tenantId ? [tenantId] : [];
        }

        const q = await pool.query(qText, params);
        res.json(q.rows);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/beds/census', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const { tenantId } = getRequestTenantContext(req);

        const wardsQ = tenantId
            ? 'SELECT * FROM wards WHERE tenant_id = $1 ORDER BY id'
            : 'SELECT * FROM wards ORDER BY id';
        const wardsParams = tenantId ? [tenantId] : [];
        const wards = (await pool.query(wardsQ, wardsParams)).rows;

        const bedsQ = tenantId
            ? `SELECT b.*, w.ward_name, w.ward_name_ar, a.patient_name, a.diagnosis, a.admission_date, a.attending_doctor
               FROM beds b JOIN wards w ON b.ward_id=w.id
               LEFT JOIN admissions a ON b.current_admission_id=a.id AND a.status='Active' AND a.tenant_id=$1
               WHERE b.tenant_id=$1
               ORDER BY w.id, b.bed_number`
            : `SELECT b.*, w.ward_name, w.ward_name_ar, a.patient_name, a.diagnosis, a.admission_date, a.attending_doctor
               FROM beds b JOIN wards w ON b.ward_id=w.id
               LEFT JOIN admissions a ON b.current_admission_id=a.id AND a.status='Active'
               ORDER BY w.id, b.bed_number`;
        const bedsParams = tenantId ? [tenantId] : [];
        const beds = (await pool.query(bedsQ, bedsParams)).rows;

        const total = beds.length;
        const occupied = beds.filter(b => b.status === 'Occupied').length;
        res.json({ wards, beds, total, occupied, available: total - occupied, occupancyRate: total > 0 ? Math.round(occupied / total * 100) : 0 });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/admissions', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const { status } = req.query;
        const { tenantId } = getRequestTenantContext(req);
        let qText = '';
        let params = [];
        if (status) {
            qText = tenantId
                ? 'SELECT * FROM admissions WHERE status=$1 AND tenant_id=$2 ORDER BY admission_date DESC'
                : 'SELECT * FROM admissions WHERE status=$1 ORDER BY admission_date DESC';
            params = tenantId ? [status, tenantId] : [status];
        } else {
            qText = tenantId
                ? 'SELECT * FROM admissions WHERE tenant_id=$1 ORDER BY admission_date DESC'
                : 'SELECT * FROM admissions WHERE tenant_id=$1 ORDER BY admission_date DESC';
            params = tenantId ? [tenantId] : [];
        }
        const q = await pool.query(qText, params);
        res.json(q.rows);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// Added to allow secure fetch of single admission record and prevent IDOR
app.get('/api/admissions/:id', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const { tenantId } = getRequestTenantContext(req);
        const q = tenantId
            ? 'SELECT * FROM admissions WHERE id = $1 AND tenant_id = $2'
            : 'SELECT * FROM admissions WHERE id = $1';
        const params = tenantId ? [req.params.id, tenantId] : [req.params.id];
        const row = (await pool.query(q, params)).rows[0];
        if (!row) return res.status(404).json({ error: 'Admission not found' });
        res.json(row);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/admissions', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const { patient_id, patient_name, admission_type, admitting_doctor, attending_doctor, department, ward_id, bed_id, diagnosis, icd10_code, admission_orders, diet_order, activity_level, dvt_prophylaxis, expected_los, insurance_auth } = req.body;
        const { tenantId, facilityId } = getRequestTenantContext(req);

        // Validate patient context to prevent IDOR / illegal references
        if (patient_id) {
            const patientCheckQ = tenantId
                ? 'SELECT id FROM patients WHERE id = $1 AND tenant_id = $2'
                : 'SELECT id FROM patients WHERE id = $1';
            const patientCheckParams = tenantId ? [patient_id, tenantId] : [patient_id];
            const patientCheck = (await pool.query(patientCheckQ, patientCheckParams)).rows[0];
            if (!patientCheck) {
                return res.status(403).json({ error: 'Invalid patient context or access denied' });
            }
        }

        // Validate ward / bed context to prevent IDOR / illegal references
        if (bed_id) {
            const bedCheckQ = tenantId
                ? 'SELECT id FROM beds WHERE id = $1 AND tenant_id = $2'
                : 'SELECT id FROM beds WHERE id = $1';
            const bedCheckParams = tenantId ? [bed_id, tenantId] : [bed_id];
            const bedCheck = (await pool.query(bedCheckQ, bedCheckParams)).rows[0];
            if (!bedCheck) {
                return res.status(403).json({ error: 'Invalid bed context or access denied' });
            }
        }

        if (ward_id) {
            const wardCheckQ = tenantId
                ? 'SELECT id FROM wards WHERE id = $1 AND tenant_id = $2'
                : 'SELECT id FROM wards WHERE id = $1';
            const wardCheckParams = tenantId ? [ward_id, tenantId] : [ward_id];
            const wardCheck = (await pool.query(wardCheckQ, wardCheckParams)).rows[0];
            if (!wardCheck) {
                return res.status(403).json({ error: 'Invalid ward context or access denied' });
            }
        }

        const r = await pool.query(
            `INSERT INTO admissions (patient_id,patient_name,admission_type,admitting_doctor,attending_doctor,department,ward_id,bed_id,diagnosis,icd10_code,admission_orders,diet_order,activity_level,dvt_prophylaxis,expected_los,insurance_auth,tenant_id,facility_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`,
            [patient_id, patient_name, admission_type || 'Regular', admitting_doctor, attending_doctor, department, ward_id, bed_id, diagnosis, icd10_code, admission_orders, diet_order || 'Regular', activity_level || 'Bed Rest', dvt_prophylaxis, expected_los || 3, insurance_auth, tenantId, facilityId]);

        if (bed_id) {
            const updateBedQ = tenantId
                ? "UPDATE beds SET status='Occupied', current_patient_id=$1, current_admission_id=$2 WHERE id=$3 AND tenant_id=$4"
                : "UPDATE beds SET status='Occupied', current_patient_id=$1, current_admission_id=$2 WHERE id=$3";
            const updateBedParams = tenantId ? [patient_id, r.rows[0].id, bed_id, tenantId] : [patient_id, r.rows[0].id, bed_id];
            await pool.query(updateBedQ, updateBedParams);
        }

        const updatePatientQ = tenantId
            ? "UPDATE patients SET status='Admitted' WHERE id=$1 AND tenant_id=$2"
            : "UPDATE patients SET status='Admitted' WHERE id=$1";
        const updatePatientParams = tenantId ? [patient_id, tenantId] : [patient_id];
        await pool.query(updatePatientQ, updatePatientParams);

        logAudit(req.session.user?.id, req.session.user?.display_name, 'CREATE_ADMISSION', 'Inpatient', `Created admission for patient #${patient_id}`, req.ip);
        res.json(r.rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.put('/api/admissions/:id/discharge', requireAuth, requireTenantScope, async (req, res) => {
    const client = await pool.connect();
    try {
        const { tenantId } = getRequestTenantContext(req);

        await client.query('BEGIN');

        // Verify admission ownership first
        const checkQ = tenantId
            ? 'SELECT id, bed_id, patient_id FROM admissions WHERE id = $1 AND tenant_id = $2 FOR UPDATE'
            : 'SELECT id, bed_id, patient_id FROM admissions WHERE id = $1 FOR UPDATE';
        const checkParams = tenantId ? [req.params.id, tenantId] : [req.params.id];
        const checkRes = await client.query(checkQ, checkParams);
        const adm = checkRes.rows[0];
        if (!adm) {
            await client.query('ROLLBACK');
            client.release();
            return res.status(404).json({ error: 'Admission not found' });
        }

        const { discharge_type, discharge_summary, discharge_instructions, discharge_medications, followup_date, followup_doctor } = req.body;

        const updateQ = tenantId
            ? 'UPDATE admissions SET status=$1, discharge_date=$2, discharge_type=$3, discharge_summary=$4, discharge_instructions=$5, discharge_medications=$6, followup_date=$7, followup_doctor=$8 WHERE id=$9 AND tenant_id=$10'
            : 'UPDATE admissions SET status=$1, discharge_date=$2, discharge_type=$3, discharge_summary=$4, discharge_instructions=$5, discharge_medications=$6, followup_date=$7, followup_doctor=$8 WHERE id=$9';
        const updateParams = [
            'Discharged',
            new Date().toISOString(),
            discharge_type || 'Regular',
            discharge_summary,
            discharge_instructions,
            discharge_medications,
            followup_date,
            followup_doctor,
            req.params.id
        ];
        if (tenantId) updateParams.push(tenantId);
        await client.query(updateQ, updateParams);

        if (adm.bed_id) {
            const updateBedQ = tenantId
                ? "UPDATE beds SET status='Available', current_patient_id=0, current_admission_id=0 WHERE id=$1 AND tenant_id=$2"
                : "UPDATE beds SET status='Available', current_patient_id=0, current_admission_id=0 WHERE id=$1";
            const updateBedParams = tenantId ? [adm.bed_id, tenantId] : [adm.bed_id];
            await client.query(updateBedQ, updateBedParams);
        }
        if (adm.patient_id) {
            const updatePatientQ = tenantId
                ? "UPDATE patients SET status='Discharged' WHERE id=$1 AND tenant_id=$2"
                : "UPDATE patients SET status='Discharged' WHERE id=$1";
            const updatePatientParams = tenantId ? [adm.patient_id, tenantId] : [adm.patient_id];
            await client.query(updatePatientQ, updatePatientParams);
        }

        await client.query('COMMIT');
        client.release();

        logAudit(req.session.user?.id, req.session.user?.display_name, 'DISCHARGE_PATIENT', 'Inpatient', `Discharged patient from admission #${req.params.id}`, req.ip);
        res.json({ success: true });
    } catch (e) {
        try {
            await client.query('ROLLBACK');
        } catch (rollbackError) {}
        client.release();
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/admissions/:id/rounds', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const { tenantId, facilityId } = getRequestTenantContext(req);

        // Verify admission ownership first
        const checkQ = tenantId
            ? 'SELECT id FROM admissions WHERE id = $1 AND tenant_id = $2'
            : 'SELECT id FROM admissions WHERE id = $1';
        const checkParams = tenantId ? [req.params.id, tenantId] : [req.params.id];
        const adm = (await pool.query(checkQ, checkParams)).rows[0];
        if (!adm) return res.status(404).json({ error: 'Admission not found' });

        const { patient_id, doctor_name, subjective, objective, assessment, plan, vitals_summary, orders, diet_changes } = req.body;

        // Verify patient ownership
        if (patient_id && tenantId) {
            const patientCheck = (await pool.query('SELECT id FROM patients WHERE id=$1 AND tenant_id=$2', [patient_id, tenantId])).rows[0];
            if (!patientCheck) {
                return res.status(403).json({ error: 'Invalid patient context or access denied' });
            }
        }

        const r = await pool.query(
            `INSERT INTO admission_daily_rounds (admission_id,patient_id,round_date,round_time,doctor_name,subjective,objective,assessment,plan,vitals_summary,orders,diet_changes,tenant_id,facility_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
            [req.params.id, patient_id, new Date().toISOString().split('T')[0], new Date().toTimeString().split(' ')[0], doctor_name, subjective, objective, assessment, plan, vitals_summary, orders, diet_changes, tenantId, facilityId]);

        logAudit(req.session.user?.id, req.session.user?.display_name, 'CREATE_DAILY_ROUND', 'Inpatient', `Added daily round for admission #${req.params.id}`, req.ip);
        res.json(r.rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/admissions/:id/rounds', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const { tenantId } = getRequestTenantContext(req);

        // Verify admission ownership first
        const checkQ = tenantId
            ? 'SELECT id FROM admissions WHERE id = $1 AND tenant_id = $2'
            : 'SELECT id FROM admissions WHERE id = $1';
        const checkParams = tenantId ? [req.params.id, tenantId] : [req.params.id];
        const adm = (await pool.query(checkQ, checkParams)).rows[0];
        if (!adm) return res.status(404).json({ error: 'Admission not found' });

        const roundsQ = tenantId
            ? 'SELECT * FROM admission_daily_rounds WHERE admission_id=$1 AND tenant_id=$2 ORDER BY id DESC'
            : 'SELECT * FROM admission_daily_rounds WHERE admission_id=$1 ORDER BY id DESC';
        const roundsParams = tenantId ? [req.params.id, tenantId] : [req.params.id];
        res.json((await pool.query(roundsQ, roundsParams)).rows);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/bed-transfers', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const { admission_id, patient_id, from_ward, from_bed, to_ward, to_bed, transfer_reason, transferred_by } = req.body;
        const { tenantId, facilityId } = getRequestTenantContext(req);

        // Verify admission ownership first
        if (admission_id && tenantId) {
            const checkQ = 'SELECT id FROM admissions WHERE id = $1 AND tenant_id = $2';
            const adm = (await pool.query(checkQ, [admission_id, tenantId])).rows[0];
            if (!adm) return res.status(403).json({ error: 'Invalid admission context or access denied' });
        }

        // Verify patient ownership
        if (patient_id && tenantId) {
            const patientCheck = (await pool.query('SELECT id FROM patients WHERE id=$1 AND tenant_id=$2', [patient_id, tenantId])).rows[0];
            if (!patientCheck) return res.status(403).json({ error: 'Invalid patient context or access denied' });
        }

        // Verify beds ownership
        if (from_bed && tenantId) {
            const fromBedCheck = (await pool.query('SELECT id FROM beds WHERE id=$1 AND tenant_id=$2', [from_bed, tenantId])).rows[0];
            if (!fromBedCheck) return res.status(403).json({ error: 'Invalid source bed context or access denied' });
        }
        if (to_bed && tenantId) {
            const toBedCheck = (await pool.query('SELECT id FROM beds WHERE id=$1 AND tenant_id=$2', [to_bed, tenantId])).rows[0];
            if (!toBedCheck) return res.status(403).json({ error: 'Invalid destination bed context or access denied' });
        }

        await pool.query(
            `INSERT INTO bed_transfers (admission_id,patient_id,from_ward,from_bed,to_ward,to_bed,transfer_reason,transferred_by,tenant_id,branch_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
            [admission_id, patient_id, from_ward, from_bed, to_ward, to_bed, transfer_reason, transferred_by, tenantId, facilityId]);

        if (from_bed) {
            const updateOldBedQ = tenantId
                ? "UPDATE beds SET status='Available', current_patient_id=0, current_admission_id=0 WHERE id=$1 AND tenant_id=$2"
                : "UPDATE beds SET status='Available', current_patient_id=0, current_admission_id=0 WHERE id=$1";
            const updateOldBedParams = tenantId ? [from_bed, tenantId] : [from_bed];
            await pool.query(updateOldBedQ, updateOldBedParams);
        }
        if (to_bed) {
            const updateNewBedQ = tenantId
                ? "UPDATE beds SET status='Occupied', current_patient_id=$1, current_admission_id=$2 WHERE id=$3 AND tenant_id=$4"
                : "UPDATE beds SET status='Occupied', current_patient_id=$1, current_admission_id=$2 WHERE id=$3";
            const updateNewBedParams = tenantId ? [patient_id, admission_id, to_bed, tenantId] : [patient_id, admission_id, to_bed];
            await pool.query(updateNewBedQ, updateNewBedParams);
        }

        const updateAdmissionQ = tenantId
            ? 'UPDATE admissions SET ward_id=$1, bed_id=$2 WHERE id=$3 AND tenant_id=$4'
            : 'UPDATE admissions SET ward_id=$1, bed_id=$2 WHERE id=$3';
        const updateAdmissionParams = tenantId ? [to_ward, to_bed, admission_id, tenantId] : [to_ward, to_bed, admission_id];
        await pool.query(updateAdmissionQ, updateAdmissionParams);

        logAudit(req.session.user?.id, req.session.user?.display_name, 'BED_TRANSFER', 'Inpatient', `Transferred patient #${patient_id} to bed #${to_bed}`, req.ip);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== ICU =====
app.get('/api/icu/patients', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const { tenantId } = getRequestTenantContext(req);
        let q = "SELECT a.*, b.bed_number, w.ward_name, w.ward_name_ar FROM admissions a JOIN beds b ON a.bed_id=b.id JOIN wards w ON a.ward_id=w.id WHERE a.status='Active' AND w.ward_type IN ('ICU','NICU','CCU')";
        let params = [];
        if (tenantId) {
            q += " AND a.tenant_id=$1";
            params.push(tenantId);
        }
        q += " ORDER BY a.admission_date DESC";
        res.json((await pool.query(q, params)).rows);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.post('/api/icu/monitoring', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const { admission_id, patient_id, hr, sbp, dbp, map, rr, spo2, temp, etco2, cvp, fio2, peep, urine_output, notes, recorded_by } = req.body;
        const { tenantId, facilityId } = getRequestTenantContext(req);
        if (tenantId) {
            const admCheck = await pool.query('SELECT id FROM admissions WHERE id=$1 AND tenant_id=$2', [admission_id, tenantId]);
            if (admCheck.rows.length === 0) return res.status(404).json({ error: 'Admission not found' });
            const ptCheck = await pool.query('SELECT id FROM patients WHERE id=$1 AND tenant_id=$2', [patient_id, tenantId]);
            if (ptCheck.rows.length === 0) return res.status(404).json({ error: 'Patient not found' });
        }
        const r = await pool.query('INSERT INTO icu_monitoring (admission_id,patient_id,hr,sbp,dbp,map,rr,spo2,temp,etco2,cvp,fio2,peep,urine_output,notes,recorded_by,tenant_id,facility_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *',
            [admission_id, patient_id, hr, sbp, dbp, map, rr, spo2, temp, etco2, cvp, fio2, peep, urine_output, notes, recorded_by, tenantId || null, facilityId || null]);
        res.json(r.rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.get('/api/icu/monitoring/:admissionId', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const { tenantId } = getRequestTenantContext(req);
        if (tenantId) {
            const admCheck = await pool.query('SELECT id FROM admissions WHERE id=$1 AND tenant_id=$2', [req.params.admissionId, tenantId]);
            if (admCheck.rows.length === 0) return res.status(404).json({ error: 'Admission not found' });
        }
        let q = 'SELECT * FROM icu_monitoring WHERE admission_id=$1';
        let params = [req.params.admissionId];
        if (tenantId) {
            q += ' AND tenant_id=$2';
            params.push(tenantId);
        }
        q += ' ORDER BY monitor_time DESC LIMIT 50';
        res.json((await pool.query(q, params)).rows);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.post('/api/icu/ventilator', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const { admission_id, patient_id, vent_mode, fio2, tidal_volume, respiratory_rate, peep, pip, ie_ratio, ps, ett_size, ett_position, cuff_pressure, notes, recorded_by } = req.body;
        const { tenantId, facilityId } = getRequestTenantContext(req);
        if (tenantId) {
            const admCheck = await pool.query('SELECT id FROM admissions WHERE id=$1 AND tenant_id=$2', [admission_id, tenantId]);
            if (admCheck.rows.length === 0) return res.status(404).json({ error: 'Admission not found' });
            const ptCheck = await pool.query('SELECT id FROM patients WHERE id=$1 AND tenant_id=$2', [patient_id, tenantId]);
            if (ptCheck.rows.length === 0) return res.status(404).json({ error: 'Patient not found' });
        }
        const r = await pool.query('INSERT INTO icu_ventilator (admission_id,patient_id,vent_mode,fio2,tidal_volume,respiratory_rate,peep,pip,ie_ratio,ps,ett_size,ett_position,cuff_pressure,notes,recorded_by,tenant_id,facility_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *',
            [admission_id, patient_id, vent_mode, fio2 || 21, tidal_volume, respiratory_rate, peep, pip, ie_ratio || '1:2', ps, ett_size, ett_position, cuff_pressure, notes, recorded_by, tenantId || null, facilityId || null]);
        res.json(r.rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.get('/api/icu/ventilator/:admissionId', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const { tenantId } = getRequestTenantContext(req);
        if (tenantId) {
            const admCheck = await pool.query('SELECT id FROM admissions WHERE id=$1 AND tenant_id=$2', [req.params.admissionId, tenantId]);
            if (admCheck.rows.length === 0) return res.status(404).json({ error: 'Admission not found' });
        }
        let q = 'SELECT * FROM icu_ventilator WHERE admission_id=$1';
        let params = [req.params.admissionId];
        if (tenantId) {
            q += ' AND tenant_id=$2';
            params.push(tenantId);
        }
        q += ' ORDER BY created_at DESC LIMIT 20';
        res.json((await pool.query(q, params)).rows);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.post('/api/icu/scores', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const { admission_id, patient_id, apache_ii, sofa, gcs, rass, cam_icu, braden, morse_fall, pain_score, calculated_by } = req.body;
        const { tenantId, facilityId } = getRequestTenantContext(req);
        if (tenantId) {
            const admCheck = await pool.query('SELECT id FROM admissions WHERE id=$1 AND tenant_id=$2', [admission_id, tenantId]);
            if (admCheck.rows.length === 0) return res.status(404).json({ error: 'Admission not found' });
            const ptCheck = await pool.query('SELECT id FROM patients WHERE id=$1 AND tenant_id=$2', [patient_id, tenantId]);
            if (ptCheck.rows.length === 0) return res.status(404).json({ error: 'Patient not found' });
        }
        const r = await pool.query('INSERT INTO icu_scores (admission_id,patient_id,score_date,apache_ii,sofa,gcs,rass,cam_icu,braden,morse_fall,pain_score,calculated_by,tenant_id,facility_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *',
            [admission_id, patient_id, new Date().toISOString().split('T')[0], apache_ii || 0, sofa || 0, gcs || 15, rass || 0, cam_icu || 0, braden || 23, morse_fall || 0, pain_score || 0, calculated_by, tenantId || null, facilityId || null]);
        res.json(r.rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.get('/api/icu/scores/:admissionId', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const { tenantId } = getRequestTenantContext(req);
        if (tenantId) {
            const admCheck = await pool.query('SELECT id FROM admissions WHERE id=$1 AND tenant_id=$2', [req.params.admissionId, tenantId]);
            if (admCheck.rows.length === 0) return res.status(404).json({ error: 'Admission not found' });
        }
        let q = 'SELECT * FROM icu_scores WHERE admission_id=$1';
        let params = [req.params.admissionId];
        if (tenantId) {
            q += ' AND tenant_id=$2';
            params.push(tenantId);
        }
        q += ' ORDER BY created_at DESC';
        res.json((await pool.query(q, params)).rows);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.post('/api/icu/fluid-balance', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const { admission_id, patient_id, shift, iv_fluids, oral_intake, blood_products, medications_iv, urine, drains, ngt_output, stool, vomit, insensible, recorded_by } = req.body;
        const { tenantId, facilityId } = getRequestTenantContext(req);
        if (tenantId) {
            const admCheck = await pool.query('SELECT id FROM admissions WHERE id=$1 AND tenant_id=$2', [admission_id, tenantId]);
            if (admCheck.rows.length === 0) return res.status(404).json({ error: 'Admission not found' });
            const ptCheck = await pool.query('SELECT id FROM patients WHERE id=$1 AND tenant_id=$2', [patient_id, tenantId]);
            if (ptCheck.rows.length === 0) return res.status(404).json({ error: 'Patient not found' });
        }
        const ti = (parseInt(iv_fluids) || 0) + (parseInt(oral_intake) || 0) + (parseInt(blood_products) || 0) + (parseInt(medications_iv) || 0);
        const to = (parseInt(urine) || 0) + (parseInt(drains) || 0) + (parseInt(ngt_output) || 0) + (parseInt(stool) || 0) + (parseInt(vomit) || 0) + (parseInt(insensible) || 0);
        const r = await pool.query('INSERT INTO icu_fluid_balance (admission_id,patient_id,balance_date,shift,iv_fluids,oral_intake,blood_products,medications_iv,total_intake,urine,drains,ngt_output,stool,vomit,insensible,total_output,net_balance,recorded_by,tenant_id,facility_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING *',
            [admission_id, patient_id, new Date().toISOString().split('T')[0], shift || 'Day', iv_fluids || 0, oral_intake || 0, blood_products || 0, medications_iv || 0, ti, urine || 0, drains || 0, ngt_output || 0, stool || 0, vomit || 0, insensible || 0, to, ti - to, recorded_by, tenantId || null, facilityId || null]);
        res.json(r.rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.get('/api/icu/fluid-balance/:admissionId', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const { tenantId } = getRequestTenantContext(req);
        if (tenantId) {
            const admCheck = await pool.query('SELECT id FROM admissions WHERE id=$1 AND tenant_id=$2', [req.params.admissionId, tenantId]);
            if (admCheck.rows.length === 0) return res.status(404).json({ error: 'Admission not found' });
        }
        let q = 'SELECT * FROM icu_fluid_balance WHERE admission_id=$1';
        let params = [req.params.admissionId];
        if (tenantId) {
            q += ' AND tenant_id=$2';
            params.push(tenantId);
        }
        q += ' ORDER BY created_at DESC';
        res.json((await pool.query(q, params)).rows);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== CSSD =====
app.get('/api/cssd/instruments', requireAuth, async (req, res) => {
    try { res.json((await pool.query('SELECT * FROM cssd_instrument_sets ORDER BY id')).rows); }
    catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.post('/api/cssd/instruments', requireAuth, async (req, res) => {
    try {
        const { set_name, set_name_ar, set_code, category, instrument_count, instruments_list, department } = req.body;
        const r = await pool.query('INSERT INTO cssd_instrument_sets (set_name,set_name_ar,set_code,category,instrument_count,instruments_list,department) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
            [set_name, set_name_ar, set_code, category, instrument_count || 0, instruments_list, department]);
        res.json(r.rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.get('/api/cssd/cycles', requireAuth, async (req, res) => {
    try { res.json((await pool.query('SELECT * FROM cssd_sterilization_cycles ORDER BY start_time DESC')).rows); }
    catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.post('/api/cssd/cycles', requireAuth, async (req, res) => {
    try {
        const { cycle_number, machine_name, cycle_type, temperature, pressure, duration_minutes, operator } = req.body;
        const r = await pool.query('INSERT INTO cssd_sterilization_cycles (cycle_number,machine_name,cycle_type,temperature,pressure,duration_minutes,operator) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
            [cycle_number, machine_name, cycle_type || 'Steam Autoclave', temperature, pressure, duration_minutes, operator]);
        res.json(r.rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.put('/api/cssd/cycles/:id', requireAuth, async (req, res) => {
    try {
        const { status, bi_test_result, ci_result } = req.body;
        const sets = []; const vals = []; let i = 1;
        if (status) { sets.push(`status=$${i++}`); vals.push(status); if (status === 'Completed') { sets.push(`end_time=$${i++}`); vals.push(new Date().toISOString()); } }
        if (bi_test_result) { sets.push(`bi_test_result=$${i++}`); vals.push(bi_test_result); }
        if (ci_result) { sets.push(`ci_result=$${i++}`); vals.push(ci_result); }
        vals.push(req.params.id);
        await pool.query(`UPDATE cssd_sterilization_cycles SET ${sets.join(',')} WHERE id=$${i}`, vals);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.post('/api/cssd/load-items', requireAuth, async (req, res) => {
    try {
        const { cycle_id, set_id, set_name, barcode } = req.body;
        const r = await pool.query('INSERT INTO cssd_load_items (cycle_id,set_id,set_name,barcode) VALUES ($1,$2,$3,$4) RETURNING *', [cycle_id, set_id, set_name, barcode]);
        if (set_id) await pool.query("UPDATE cssd_instrument_sets SET status='In Sterilization' WHERE id=$1", [set_id]);
        res.json(r.rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.get('/api/cssd/load-items/:cycleId', requireAuth, async (req, res) => {
    try { res.json((await pool.query('SELECT * FROM cssd_load_items WHERE cycle_id=$1', [req.params.cycleId])).rows); }
    catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== DIETARY =====
app.get('/api/dietary/orders', requireAuth, async (req, res) => {
    try { res.json((await pool.query("SELECT * FROM diet_orders WHERE status='Active' ORDER BY id DESC")).rows); }
    catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.post('/api/dietary/orders', requireAuth, async (req, res) => {
    try {
        const { admission_id, patient_id, patient_name, diet_type, diet_type_ar, texture, fluid, allergies, restrictions, supplements, ordered_by, meal_preferences, notes } = req.body;
        const r = await pool.query('INSERT INTO diet_orders (admission_id,patient_id,patient_name,diet_type,diet_type_ar,texture,fluid,allergies,restrictions,supplements,ordered_by,meal_preferences,start_date,notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *',
            [admission_id, patient_id, patient_name, diet_type || 'Regular', diet_type_ar || 'عادي', texture || 'Normal', fluid || 'Normal', allergies, restrictions, supplements, ordered_by, meal_preferences, new Date().toISOString().split('T')[0], notes]);
        res.json(r.rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.put('/api/dietary/orders/:id', requireAuth, async (req, res) => {
    try {
        const { diet_type, diet_type_ar, texture, fluid, restrictions, status } = req.body;
        const sets = []; const vals = []; let i = 1;
        if (diet_type) { sets.push(`diet_type=$${i++}`); vals.push(diet_type); }
        if (diet_type_ar) { sets.push(`diet_type_ar=$${i++}`); vals.push(diet_type_ar); }
        if (texture) { sets.push(`texture=$${i++}`); vals.push(texture); }
        if (fluid) { sets.push(`fluid=$${i++}`); vals.push(fluid); }
        if (restrictions) { sets.push(`restrictions=$${i++}`); vals.push(restrictions); }
        if (status) { sets.push(`status=$${i++}`); vals.push(status); }
        vals.push(req.params.id);
        await pool.query(`UPDATE diet_orders SET ${sets.join(',')} WHERE id=$${i}`, vals);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.post('/api/dietary/meals', requireAuth, async (req, res) => {
    try {
        const { order_id, patient_id, meal_type, meal_date, items, calories } = req.body;
        const r = await pool.query('INSERT INTO diet_meals (order_id,patient_id,meal_type,meal_date,items,calories) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
            [order_id, patient_id, meal_type, meal_date || new Date().toISOString().split('T')[0], items, calories || 0]);
        res.json(r.rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.put('/api/dietary/meals/:id/deliver', requireAuth, async (req, res) => {
    try {
        await pool.query('UPDATE diet_meals SET delivered=1, delivered_by=$1 WHERE id=$2', [req.body.delivered_by || '', req.params.id]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.get('/api/nutrition/assessments', requireAuth, async (req, res) => {
    try { res.json((await pool.query('SELECT * FROM nutrition_assessments ORDER BY id DESC')).rows); }
    catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.post('/api/nutrition/assessments', requireAuth, async (req, res) => {
    try {
        const { patient_id, patient_name, height_cm, weight_kg, caloric_needs, protein_needs, screening_score, malnutrition_risk, plan, assessed_by } = req.body;
        const bmi = height_cm && weight_kg ? parseFloat((weight_kg / ((height_cm / 100) ** 2)).toFixed(1)) : 0;
        const cat = bmi < 18.5 ? 'Underweight' : bmi < 25 ? 'Normal' : bmi < 30 ? 'Overweight' : 'Obese';
        const r = await pool.query('INSERT INTO nutrition_assessments (patient_id,patient_name,assessment_date,height_cm,weight_kg,bmi,bmi_category,caloric_needs,protein_needs,screening_score,malnutrition_risk,plan,assessed_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *',
            [patient_id, patient_name, new Date().toISOString().split('T')[0], height_cm || 0, weight_kg || 0, bmi, cat, caloric_needs || 0, protein_needs || 0, screening_score || 0, malnutrition_risk || 'Low', plan, assessed_by]);
        res.json(r.rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== INFECTION CONTROL =====
app.get('/api/infection/surveillance', requireAuth, async (req, res) => {
    try { res.json((await pool.query('SELECT * FROM infection_surveillance ORDER BY id DESC')).rows); }
    catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.post('/api/infection/surveillance', requireAuth, async (req, res) => {
    try {
        const { patient_id, patient_name, infection_type, infection_site, organism, sensitivity, hai_category, device_related, device_type, ward, bed, isolation_type, reported_by, notes } = req.body;
        const r = await pool.query('INSERT INTO infection_surveillance (patient_id,patient_name,infection_type,infection_site,organism,sensitivity,detection_date,hai_category,device_related,device_type,ward,bed,isolation_type,reported_by,notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *',
            [patient_id, patient_name, infection_type, infection_site, organism, sensitivity, new Date().toISOString().split('T')[0], hai_category, device_related ? 1 : 0, device_type, ward, bed, isolation_type, reported_by, notes]);
        res.json(r.rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.get('/api/infection/outbreaks', requireAuth, async (req, res) => {
    try { res.json((await pool.query('SELECT * FROM infection_outbreaks ORDER BY id DESC')).rows); }
    catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.post('/api/infection/outbreaks', requireAuth, async (req, res) => {
    try {
        const { outbreak_name, organism, affected_ward, investigation_notes, control_measures, reported_by } = req.body;
        const r = await pool.query('INSERT INTO infection_outbreaks (outbreak_name,organism,start_date,affected_ward,investigation_notes,control_measures,reported_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
            [outbreak_name, organism, new Date().toISOString().split('T')[0], affected_ward, investigation_notes, control_measures, reported_by]);
        res.json(r.rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.put('/api/infection/outbreaks/:id', requireAuth, async (req, res) => {
    try {
        const { status, total_cases, control_measures } = req.body;
        const sets = []; const vals = []; let i = 1;
        if (status) { sets.push(`status=$${i++}`); vals.push(status); if (status === 'Resolved') { sets.push(`end_date=$${i++}`); vals.push(new Date().toISOString().split('T')[0]); } }
        if (total_cases !== undefined) { sets.push(`total_cases=$${i++}`); vals.push(total_cases); }
        if (control_measures) { sets.push(`control_measures=$${i++}`); vals.push(control_measures); }
        vals.push(req.params.id);
        await pool.query(`UPDATE infection_outbreaks SET ${sets.join(',')} WHERE id=$${i}`, vals);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.post('/api/infection/exposures', requireAuth, async (req, res) => {
    try {
        const { employee_id, employee_name, exposure_type, source_patient, body_fluid, ppe_worn, action_taken, followup_date, reported_by } = req.body;
        const r = await pool.query('INSERT INTO employee_exposures (employee_id,employee_name,exposure_type,exposure_date,source_patient,body_fluid,ppe_worn,action_taken,followup_date,reported_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *',
            [employee_id, employee_name, exposure_type, new Date().toISOString().split('T')[0], source_patient, body_fluid, ppe_worn, action_taken, followup_date, reported_by]);
        res.json(r.rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.get('/api/infection/exposures', requireAuth, async (req, res) => {
    try { res.json((await pool.query('SELECT * FROM employee_exposures ORDER BY id DESC')).rows); }
    catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.post('/api/infection/hand-hygiene', requireAuth, async (req, res) => {
    try {
        const { auditor, department, moments_observed, moments_compliant, notes } = req.body;
        const rate = moments_observed > 0 ? parseFloat((moments_compliant / moments_observed * 100).toFixed(1)) : 0;
        const r = await pool.query('INSERT INTO hand_hygiene_audits (audit_date,auditor,department,moments_observed,moments_compliant,compliance_rate,notes) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
            [new Date().toISOString().split('T')[0], auditor, department, moments_observed, moments_compliant, rate, notes]);
        res.json(r.rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.get('/api/infection/hand-hygiene', requireAuth, async (req, res) => {
    try { res.json((await pool.query('SELECT * FROM hand_hygiene_audits ORDER BY id DESC')).rows); }
    catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.get('/api/infection/stats', requireAuth, async (req, res) => {
    try {
        const total = (await pool.query('SELECT COUNT(*) as cnt FROM infection_surveillance')).rows[0].cnt;
        const active = (await pool.query("SELECT COUNT(*) as cnt FROM infection_outbreaks WHERE status='Active'")).rows[0].cnt;
        const hai = (await pool.query("SELECT COUNT(*) as cnt FROM infection_surveillance WHERE hai_category != ''")).rows[0].cnt;
        const avgHH = (await pool.query('SELECT COALESCE(AVG(compliance_rate),0) as avg FROM hand_hygiene_audits')).rows[0].avg;
        res.json({ totalInfections: total, activeOutbreaks: active, haiCount: hai, avgHandHygiene: parseFloat(parseFloat(avgHH).toFixed(1)) });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== QUALITY & PATIENT SAFETY =====
app.get('/api/quality/incidents', requireAuth, async (req, res) => {
    try { res.json((await pool.query('SELECT * FROM quality_incidents ORDER BY id DESC')).rows); }
    catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.post('/api/quality/incidents', requireAuth, async (req, res) => {
    try {
        const { incident_type, severity, incident_date, incident_time, department, location, patient_id, patient_name, description, immediate_action, reported_by } = req.body;
        const r = await pool.query('INSERT INTO quality_incidents (incident_type,severity,incident_date,incident_time,department,location,patient_id,patient_name,description,immediate_action,reported_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *',
            [incident_type, severity || 'Minor', incident_date || new Date().toISOString().split('T')[0], incident_time, department, location, patient_id || 0, patient_name, description, immediate_action, reported_by]);
        res.json(r.rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.put('/api/quality/incidents/:id', requireAuth, async (req, res) => {
    try {
        const { status, assigned_to, root_cause, corrective_action, preventive_action } = req.body;
        const sets = []; const vals = []; let i = 1;
        if (status) { sets.push(`status=$${i++}`); vals.push(status); if (status === 'Closed') { sets.push(`closed_date=$${i++}`); vals.push(new Date().toISOString().split('T')[0]); } }
        if (assigned_to) { sets.push(`assigned_to=$${i++}`); vals.push(assigned_to); }
        if (root_cause) { sets.push(`root_cause=$${i++}`); vals.push(root_cause); }
        if (corrective_action) { sets.push(`corrective_action=$${i++}`); vals.push(corrective_action); }
        if (preventive_action) { sets.push(`preventive_action=$${i++}`); vals.push(preventive_action); }
        vals.push(req.params.id);
        await pool.query(`UPDATE quality_incidents SET ${sets.join(',')} WHERE id=$${i}`, vals);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.get('/api/quality/satisfaction', requireAuth, async (req, res) => {
    try { res.json((await pool.query('SELECT * FROM quality_patient_satisfaction ORDER BY id DESC')).rows); }
    catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.post('/api/quality/satisfaction', requireAuth, async (req, res) => {
    try {
        const { patient_id, patient_name, department, overall_rating, cleanliness, staff_courtesy, wait_time, communication, pain_management, food_quality, comments, would_recommend } = req.body;
        const r = await pool.query('INSERT INTO quality_patient_satisfaction (patient_id,patient_name,department,survey_date,overall_rating,cleanliness,staff_courtesy,wait_time,communication,pain_management,food_quality,comments,would_recommend) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *',
            [patient_id || 0, patient_name, department, new Date().toISOString().split('T')[0], overall_rating, cleanliness, staff_courtesy, wait_time, communication, pain_management, food_quality, comments, would_recommend ? 1 : 0]);
        res.json(r.rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.get('/api/quality/kpis', requireAuth, async (req, res) => {
    try { res.json((await pool.query('SELECT * FROM quality_kpis ORDER BY id DESC')).rows); }
    catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.post('/api/quality/kpis', requireAuth, async (req, res) => {
    try {
        const { kpi_name, kpi_name_ar, category, target_value, actual_value, unit, period, department } = req.body;
        const status = actual_value >= target_value ? 'On Track' : actual_value >= target_value * 0.8 ? 'At Risk' : 'Below Target';
        const r = await pool.query('INSERT INTO quality_kpis (kpi_name,kpi_name_ar,category,target_value,actual_value,unit,period,department,status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',
            [kpi_name, kpi_name_ar, category, target_value, actual_value, unit || '%', period, department, status]);
        res.json(r.rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.get('/api/quality/stats', requireAuth, async (req, res) => {
    try {
        const open = (await pool.query("SELECT COUNT(*) as cnt FROM quality_incidents WHERE status='Open'")).rows[0].cnt;
        const total = (await pool.query('SELECT COUNT(*) as cnt FROM quality_incidents')).rows[0].cnt;
        const avgSat = (await pool.query('SELECT COALESCE(AVG(overall_rating),0) as avg FROM quality_patient_satisfaction')).rows[0].avg;
        const kpiOnTrack = (await pool.query("SELECT COUNT(*) as cnt FROM quality_kpis WHERE status='On Track'")).rows[0].cnt;
        const kpiTotal = (await pool.query('SELECT COUNT(*) as cnt FROM quality_kpis')).rows[0].cnt;
        res.json({ openIncidents: open, totalIncidents: total, avgSatisfaction: parseFloat(parseFloat(avgSat).toFixed(1)), kpiOnTrack, kpiTotal });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== MAINTENANCE =====
app.get('/api/maintenance/work-orders', requireAuth, async (req, res) => {
    try { res.json((await pool.query('SELECT * FROM maintenance_work_orders ORDER BY id DESC')).rows); }
    catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.post('/api/maintenance/work-orders', requireAuth, async (req, res) => {
    try {
        const { wo_number, request_type, priority, department, location, equipment_id, description, description_ar, requested_by, assigned_to, scheduled_date } = req.body;
        const num = wo_number || `WO-${Date.now().toString().slice(-6)}`;
        const r = await pool.query('INSERT INTO maintenance_work_orders (wo_number,request_type,priority,department,location,equipment_id,description,description_ar,requested_by,assigned_to,scheduled_date) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *',
            [num, request_type || 'Corrective', priority || 'Normal', department, location, equipment_id || 0, description, description_ar, requested_by, assigned_to, scheduled_date]);
        res.json(r.rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.put('/api/maintenance/work-orders/:id', requireAuth, async (req, res) => {
    try {
        const { status, assigned_to, resolution, cost } = req.body;
        const sets = []; const vals = []; let i = 1;
        if (status) { sets.push(`status=$${i++}`); vals.push(status); if (status === 'Completed') { sets.push(`completed_date=$${i++}`); vals.push(new Date().toISOString().split('T')[0]); } }
        if (assigned_to) { sets.push(`assigned_to=$${i++}`); vals.push(assigned_to); }
        if (resolution) { sets.push(`resolution=$${i++}`); vals.push(resolution); }
        if (cost !== undefined) { sets.push(`cost=$${i++}`); vals.push(cost); }
        vals.push(req.params.id);
        await pool.query(`UPDATE maintenance_work_orders SET ${sets.join(',')} WHERE id=$${i}`, vals);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.get('/api/maintenance/equipment', requireAuth, async (req, res) => {
    try { res.json((await pool.query('SELECT * FROM maintenance_equipment ORDER BY id')).rows); }
    catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.post('/api/maintenance/equipment', requireAuth, async (req, res) => {
    try {
        const { equipment_name, equipment_name_ar, equipment_code, category, manufacturer, model, serial_number, department, location, purchase_date, warranty_end } = req.body;
        const r = await pool.query('INSERT INTO maintenance_equipment (equipment_name,equipment_name_ar,equipment_code,category,manufacturer,model,serial_number,department,location,purchase_date,warranty_end) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *',
            [equipment_name, equipment_name_ar, equipment_code, category, manufacturer, model, serial_number, department, location, purchase_date, warranty_end]);
        res.json(r.rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.get('/api/maintenance/pm-schedules', requireAuth, async (req, res) => {
    try { res.json((await pool.query('SELECT p.*, e.equipment_name, e.equipment_name_ar FROM maintenance_pm_schedules p LEFT JOIN maintenance_equipment e ON p.equipment_id=e.id ORDER BY p.next_due')).rows); }
    catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.post('/api/maintenance/pm-schedules', requireAuth, async (req, res) => {
    try {
        const { equipment_id, pm_type, frequency, next_due, checklist } = req.body;
        const r = await pool.query('INSERT INTO maintenance_pm_schedules (equipment_id,pm_type,frequency,next_due,checklist) VALUES ($1,$2,$3,$4,$5) RETURNING *',
            [equipment_id, pm_type, frequency || 'Monthly', next_due, checklist]);
        res.json(r.rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.get('/api/maintenance/stats', requireAuth, async (req, res) => {
    try {
        const open = (await pool.query("SELECT COUNT(*) as cnt FROM maintenance_work_orders WHERE status='Open'")).rows[0].cnt;
        const inProg = (await pool.query("SELECT COUNT(*) as cnt FROM maintenance_work_orders WHERE status='In Progress'")).rows[0].cnt;
        const overdue = (await pool.query("SELECT COUNT(*) as cnt FROM maintenance_pm_schedules WHERE next_due < CURRENT_DATE::text AND status='Pending'")).rows[0].cnt;
        const totalEquip = (await pool.query("SELECT COUNT(*) as cnt FROM maintenance_equipment WHERE status='Active'")).rows[0].cnt;
        res.json({ openWO: open, inProgressWO: inProg, overduePM: overdue, totalEquipment: totalEquip });
    } catch (e) {
        console.error('Maintenance stats error:', e);
        res.status(500).json({ error: 'Server error' });
    }
});

// ===== PATIENT TRANSPORT =====
app.get('/api/transport/requests', requireAuth, async (req, res) => {
    try { res.json((await pool.query('SELECT * FROM transport_requests ORDER BY request_time DESC')).rows); }
    catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.post('/api/transport/requests', requireAuth, async (req, res) => {
    try {
        const { patient_id, patient_name, from_location, to_location, transport_type, priority, requested_by, special_needs } = req.body;
        const r = await pool.query('INSERT INTO transport_requests (patient_id,patient_name,from_location,to_location,transport_type,priority,requested_by,special_needs) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
            [patient_id, patient_name, from_location, to_location, transport_type || 'Wheelchair', priority || 'Routine', requested_by, special_needs]);
        res.json(r.rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.put('/api/transport/requests/:id', requireAuth, async (req, res) => {
    try {
        const { status, assigned_porter, pickup_time, dropoff_time } = req.body;
        const sets = []; const vals = []; let i = 1;
        if (status) { sets.push(`status=$${i++}`); vals.push(status); }
        if (assigned_porter) { sets.push(`assigned_porter=$${i++}`); vals.push(assigned_porter); }
        if (pickup_time) { sets.push(`pickup_time=$${i++}`); vals.push(pickup_time); }
        if (dropoff_time) { sets.push(`dropoff_time=$${i++}`); vals.push(dropoff_time); }
        vals.push(req.params.id);
        await pool.query(`UPDATE transport_requests SET ${sets.join(',')} WHERE id=$${i}`, vals);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== COSMETIC / PLASTIC SURGERY =====
app.get('/api/cosmetic/procedures', requireAuth, async (req, res) => {
    try { res.json((await pool.query('SELECT * FROM cosmetic_procedures WHERE is_active=1 ORDER BY category, name_en')).rows); }
    catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.get('/api/cosmetic/cases', requireAuth, async (req, res) => {
    try { res.json((await pool.query('SELECT * FROM cosmetic_cases ORDER BY created_at DESC')).rows); }
    catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.post('/api/cosmetic/cases', requireAuth, async (req, res) => {
    try {
        const { patient_id, patient_name, procedure_id, procedure_name, surgery_date, surgery_time, anesthesia_type, operating_room, total_cost, pre_op_notes } = req.body;
        const result = await pool.query('INSERT INTO cosmetic_cases (patient_id, patient_name, procedure_id, procedure_name, surgeon, surgery_date, surgery_time, anesthesia_type, operating_room, total_cost, pre_op_notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *',
            [patient_id, patient_name || '', procedure_id || 0, procedure_name || '', req.session.user.name, surgery_date || '', surgery_time || '', anesthesia_type || 'Local', operating_room || '', total_cost || 0, pre_op_notes || '']);
        logAudit(req.session.user.id, req.session.user.name, 'COSMETIC_CASE', 'Cosmetic Surgery', `New case: ${procedure_name} for ${patient_name}`, req.ip);
        res.json(result.rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.put('/api/cosmetic/cases/:id', requireAuth, async (req, res) => {
    try {
        const { status, operative_notes, post_op_notes, complications, duration_minutes } = req.body;
        await pool.query('UPDATE cosmetic_cases SET status=$1, operative_notes=$2, post_op_notes=$3, complications=$4, duration_minutes=$5 WHERE id=$6',
            [status || 'Completed', operative_notes || '', post_op_notes || '', complications || '', duration_minutes || 0, req.params.id]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});
// Consent Forms
app.get('/api/cosmetic/consents', requireAuth, async (req, res) => {
    try {
        const { case_id } = req.query;
        if (case_id) res.json((await pool.query('SELECT * FROM cosmetic_consents WHERE case_id=$1 ORDER BY created_at DESC', [case_id])).rows);
        else res.json((await pool.query('SELECT * FROM cosmetic_consents ORDER BY created_at DESC')).rows);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.post('/api/cosmetic/consents', requireAuth, async (req, res) => {
    try {
        const { case_id, patient_id, patient_name, procedure_name, consent_type, risks_explained, alternatives_explained, expected_results, limitations, patient_questions, is_photography_consent, is_anesthesia_consent, is_blood_transfusion_consent, witness_name } = req.body;
        const now = new Date();
        const result = await pool.query('INSERT INTO cosmetic_consents (case_id, patient_id, patient_name, procedure_name, consent_type, surgeon, risks_explained, alternatives_explained, expected_results, limitations, patient_questions, is_photography_consent, is_anesthesia_consent, is_blood_transfusion_consent, witness_name, consent_date, consent_time, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *',
            [case_id || 0, patient_id, patient_name || '', procedure_name || '', consent_type || 'Surgery', req.session.user.name, risks_explained || '', alternatives_explained || '', expected_results || '', limitations || '', patient_questions || '', is_photography_consent ? 1 : 0, is_anesthesia_consent ? 1 : 0, is_blood_transfusion_consent ? 1 : 0, witness_name || '', now.toISOString().split('T')[0], now.toTimeString().substring(0, 5), 'Signed']);
        logAudit(req.session.user.id, req.session.user.name, 'CONSENT_SIGNED', 'Cosmetic Surgery', `Consent for ${procedure_name} - patient ${patient_name}`, req.ip);
        res.json(result.rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});
// Follow-ups
app.get('/api/cosmetic/followups', requireAuth, async (req, res) => {
    try {
        const { case_id } = req.query;
        if (case_id) res.json((await pool.query('SELECT * FROM cosmetic_followups WHERE case_id=$1 ORDER BY followup_date DESC', [case_id])).rows);
        else res.json((await pool.query('SELECT * FROM cosmetic_followups ORDER BY followup_date DESC')).rows);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.post('/api/cosmetic/followups', requireAuth, async (req, res) => {
    try {
        const { case_id, patient_id, patient_name, followup_date, days_post_op, healing_status, pain_level, swelling, complications, patient_satisfaction, surgeon_notes, next_followup } = req.body;
        const result = await pool.query('INSERT INTO cosmetic_followups (case_id, patient_id, patient_name, followup_date, days_post_op, healing_status, pain_level, swelling, complications, patient_satisfaction, surgeon_notes, next_followup, surgeon) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *',
            [case_id || 0, patient_id, patient_name || '', followup_date || new Date().toISOString().split('T')[0], days_post_op || 0, healing_status || 'Good', pain_level || 0, swelling || 'Mild', complications || '', patient_satisfaction || 0, surgeon_notes || '', next_followup || '', req.session.user.name]);
        res.json(result.rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== PATIENT PORTAL =====
app.get('/api/portal/users', requireAuth, async (req, res) => {
    try { res.json((await pool.query('SELECT pu.*, p.name_ar, p.name_en, p.file_number FROM portal_users pu LEFT JOIN patients p ON pu.patient_id=p.id ORDER BY pu.id DESC')).rows); }
    catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.post('/api/portal/users', requireAuth, async (req, res) => {
    try {
        const { patient_id, username, password, email, phone } = req.body;
        const bcrypt = require('bcryptjs');
        const hash = await bcrypt.hash(password || '123456', 10);
        const result = await pool.query('INSERT INTO portal_users (patient_id, username, password_hash, email, phone) VALUES ($1,$2,$3,$4,$5) RETURNING *',
            [patient_id, username || '', hash, email || '', phone || '']);
        res.json(result.rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.get('/api/portal/appointments', requireAuth, async (req, res) => {
    try { res.json((await pool.query('SELECT * FROM portal_appointments ORDER BY created_at DESC')).rows); }
    catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.put('/api/portal/appointments/:id', requireAuth, async (req, res) => {
    try {
        const { status } = req.body;
        await pool.query('UPDATE portal_appointments SET status=$1 WHERE id=$2', [status, req.params.id]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== ZATCA E-INVOICING =====
app.get('/api/zatca/invoices', requireAuth, async (req, res) => {
    try { res.json((await pool.query('SELECT * FROM zatca_invoices ORDER BY created_at DESC')).rows); }
    catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.post('/api/zatca/generate', requireAuth, async (req, res) => {
    try {
        const { invoice_id } = req.body;
        const inv = (await pool.query('SELECT i.*, p.name_ar, p.name_en, p.national_id FROM invoices i LEFT JOIN patients p ON i.patient_id=p.id WHERE i.id=$1', [invoice_id])).rows[0];
        if (!inv) return res.status(404).json({ error: 'Invoice not found' });
        const company = (await pool.query("SELECT setting_value FROM company_settings WHERE setting_key='company_name'")).rows[0];
        const vat = (await pool.query("SELECT setting_value FROM company_settings WHERE setting_key='vat_number'")).rows[0];
        const totalBeforeVat = Number(inv.total) / 1.15;
        const vatAmount = Number(inv.total) - totalBeforeVat;
        const qrData = Buffer.from(JSON.stringify({ seller: company?.setting_value || 'Nama Medical', vat: vat?.setting_value || '', date: new Date().toISOString(), total: inv.total, vatAmount: vatAmount.toFixed(2) })).toString('base64');
        const result = await pool.query('INSERT INTO zatca_invoices (invoice_id, invoice_number, seller_name, seller_vat, buyer_name, total_before_vat, vat_amount, total_with_vat, qr_code, submission_status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *',
            [invoice_id, 'INV-' + String(invoice_id).padStart(8, '0'), company?.setting_value || '', vat?.setting_value || '', inv.name_ar || inv.name_en || '', totalBeforeVat.toFixed(2), vatAmount.toFixed(2), inv.total, qrData, 'Generated']);
        logAudit(req.session.user.id, req.session.user.name, 'ZATCA_GENERATE', 'ZATCA', `E-invoice for INV-${invoice_id}`, req.ip);
        res.json(result.rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== TELEMEDICINE =====
app.get('/api/telemedicine/sessions', requireAuth, async (req, res) => {
    try { res.json((await pool.query('SELECT * FROM telemedicine_sessions ORDER BY scheduled_date DESC, scheduled_time DESC')).rows); }
    catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.post('/api/telemedicine/sessions', requireAuth, async (req, res) => {
    try {
        const { patient_id, patient_name, speciality, session_type, scheduled_date, scheduled_time, duration_minutes, notes } = req.body;
        const link = 'https://meet.nama.sa/' + Math.random().toString(36).substring(7);
        const result = await pool.query('INSERT INTO telemedicine_sessions (patient_id, patient_name, doctor, speciality, session_type, scheduled_date, scheduled_time, duration_minutes, meeting_link, notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *',
            [patient_id, patient_name || '', req.session.user.name, speciality || '', session_type || 'Video', scheduled_date || '', scheduled_time || '', duration_minutes || 15, link, notes || '']);
        res.json(result.rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.put('/api/telemedicine/sessions/:id', requireAuth, async (req, res) => {
    try {
        const { status, diagnosis, prescription } = req.body;
        await pool.query('UPDATE telemedicine_sessions SET status=$1, diagnosis=$2, prescription=$3 WHERE id=$4', [status || 'Completed', diagnosis || '', prescription || '', req.params.id]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== PATHOLOGY =====
app.get('/api/pathology/cases', requireAuth, async (req, res) => {
    try { res.json((await pool.query('SELECT * FROM pathology_cases ORDER BY created_at DESC')).rows); }
    catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.post('/api/pathology/cases', requireAuth, async (req, res) => {
    try {
        const { patient_id, patient_name, specimen_type, collection_date, gross_description, notes } = req.body;
        const result = await pool.query('INSERT INTO pathology_cases (patient_id, patient_name, specimen_type, collection_date, received_date, status) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
            [patient_id, patient_name || '', specimen_type || '', collection_date || new Date().toISOString().split('T')[0], new Date().toISOString().split('T')[0], 'Received']);
        res.json(result.rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.put('/api/pathology/cases/:id', requireAuth, async (req, res) => {
    try {
        const { gross_description, microscopic_findings, diagnosis, icd_code, stage, grade, status } = req.body;
        await pool.query('UPDATE pathology_cases SET gross_description=$1, microscopic_findings=$2, diagnosis=$3, icd_code=$4, stage=$5, grade=$6, status=$7, pathologist=$8, report_date=$9 WHERE id=$10',
            [gross_description || '', microscopic_findings || '', diagnosis || '', icd_code || '', stage || '', grade || '', status || 'Reported', req.session.user.name, new Date().toISOString().split('T')[0], req.params.id]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== SOCIAL WORK =====
app.get('/api/social-work/cases', requireAuth, async (req, res) => {
    try { res.json((await pool.query('SELECT * FROM social_work_cases ORDER BY created_at DESC')).rows); }
    catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.post('/api/social-work/cases', requireAuth, async (req, res) => {
    try {
        const { patient_id, patient_name, case_type, assessment, plan, priority } = req.body;
        const result = await pool.query('INSERT INTO social_work_cases (patient_id, patient_name, case_type, social_worker, assessment, plan, priority) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
            [patient_id, patient_name || '', case_type || 'General', req.session.user.name, assessment || '', plan || '', priority || 'Medium']);
        res.json(result.rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.put('/api/social-work/cases/:id', requireAuth, async (req, res) => {
    try {
        const { status, interventions, referrals, follow_up_date } = req.body;
        await pool.query('UPDATE social_work_cases SET status=$1, interventions=$2, referrals=$3, follow_up_date=$4 WHERE id=$5',
            [status || 'Open', interventions || '', referrals || '', follow_up_date || '', req.params.id]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== MORTUARY =====
app.get('/api/mortuary/cases', requireAuth, async (req, res) => {
    try { res.json((await pool.query('SELECT * FROM mortuary_cases ORDER BY created_at DESC')).rows); }
    catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.post('/api/mortuary/cases', requireAuth, async (req, res) => {
    try {
        const { patient_id, deceased_name, date_of_death, time_of_death, cause_of_death, attending_physician, next_of_kin, next_of_kin_phone, notes } = req.body;
        const result = await pool.query('INSERT INTO mortuary_cases (patient_id, deceased_name, date_of_death, time_of_death, cause_of_death, attending_physician, next_of_kin, next_of_kin_phone, notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',
            [patient_id || 0, deceased_name || '', date_of_death || new Date().toISOString().split('T')[0], time_of_death || '', cause_of_death || '', attending_physician || '', next_of_kin || '', next_of_kin_phone || '', notes || '']);
        logAudit(req.session.user.id, req.session.user.name, 'DEATH_RECORD', 'Mortuary', `Death record for ${deceased_name}`, req.ip);
        res.json(result.rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.put('/api/mortuary/cases/:id', requireAuth, async (req, res) => {
    try {
        const { release_status, released_to, death_certificate_number } = req.body;
        await pool.query('UPDATE mortuary_cases SET release_status=$1, released_to=$2, released_date=$3, death_certificate_number=$4 WHERE id=$5',
            [release_status || 'Released', released_to || '', new Date().toISOString().split('T')[0], death_certificate_number || '', req.params.id]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== CME =====
app.get('/api/cme/activities', requireAuth, async (req, res) => {
    try { res.json((await pool.query('SELECT * FROM cme_activities ORDER BY activity_date DESC')).rows); }
    catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.post('/api/cme/activities', requireAuth, async (req, res) => {
    try {
        const { title, category, provider, credit_hours, activity_date, location, max_participants, description } = req.body;
        const result = await pool.query('INSERT INTO cme_activities (title, category, provider, credit_hours, activity_date, location, max_participants, description) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
            [title || '', category || 'Conference', provider || '', credit_hours || 0, activity_date || '', location || '', max_participants || 50, description || '']);
        res.json(result.rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.get('/api/cme/registrations', requireAuth, async (req, res) => {
    try {
        const { activity_id } = req.query;
        if (activity_id) res.json((await pool.query('SELECT * FROM cme_registrations WHERE activity_id=$1', [activity_id])).rows);
        else res.json((await pool.query('SELECT * FROM cme_registrations ORDER BY id DESC')).rows);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.post('/api/cme/registrations', requireAuth, async (req, res) => {
    try {
        const { activity_id, employee_name } = req.body;
        const result = await pool.query('INSERT INTO cme_registrations (activity_id, employee_name, registration_date) VALUES ($1,$2,$3) RETURNING *',
            [activity_id, employee_name || req.session.user.name, new Date().toISOString().split('T')[0]]);
        await pool.query('UPDATE cme_activities SET registered=registered+1 WHERE id=$1', [activity_id]);
        res.json(result.rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== eMAR =====
app.get('/api/emar/orders', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const { patient_id } = req.query;
        const { tenantId } = getRequestTenantContext(req);
        if (patient_id) {
            if (tenantId) {
                // Verify patient belongs to tenant
                const patientCheck = await pool.query('SELECT id FROM patients WHERE id=$1 AND tenant_id=$2', [patient_id, tenantId]);
                if (patientCheck.rows.length === 0) return res.status(404).json({ error: 'Patient not found' });
            }
            let q = 'SELECT * FROM emar_orders WHERE patient_id=$1';
            let params = [patient_id];
            if (tenantId) {
                q += ' AND tenant_id=$2';
                params.push(tenantId);
            }
            q += ' ORDER BY created_at DESC';
            res.json((await pool.query(q, params)).rows);
        } else {
            let q = 'SELECT * FROM emar_orders WHERE status=$1';
            let params = ['Active'];
            if (tenantId) {
                q += ' AND tenant_id=$2';
                params.push(tenantId);
            }
            q += ' ORDER BY created_at DESC';
            res.json((await pool.query(q, params)).rows);
        }
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.post('/api/emar/orders', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const { patient_id, patient_name, medication, dose, route, frequency, start_date } = req.body;
        const { tenantId, facilityId } = getRequestTenantContext(req);
        if (tenantId) {
            const patientCheck = await pool.query('SELECT id FROM patients WHERE id=$1 AND tenant_id=$2', [patient_id, tenantId]);
            if (patientCheck.rows.length === 0) return res.status(404).json({ error: 'Patient not found' });
        }
        const result = await pool.query('INSERT INTO emar_orders (patient_id, patient_name, medication, dose, route, frequency, start_date, prescriber, tenant_id, facility_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *',
            [patient_id, patient_name || '', medication || '', dose || '', route || 'Oral', frequency || 'TID', start_date || new Date().toISOString().split('T')[0], req.session.user.name, tenantId || null, facilityId || null]);
        res.json(result.rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.get('/api/emar/administrations', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const { order_id } = req.query;
        const { tenantId } = getRequestTenantContext(req);
        if (order_id) {
            if (tenantId) {
                // Verify order belongs to tenant
                const orderCheck = await pool.query('SELECT id FROM emar_orders WHERE id=$1 AND tenant_id=$2', [order_id, tenantId]);
                if (orderCheck.rows.length === 0) return res.status(404).json({ error: 'Order not found' });
            }
            let q = 'SELECT * FROM emar_administrations WHERE emar_order_id=$1';
            let params = [order_id];
            if (tenantId) {
                q += ' AND tenant_id=$2';
                params.push(tenantId);
            }
            q += ' ORDER BY created_at DESC';
            res.json((await pool.query(q, params)).rows);
        } else {
            let q = 'SELECT * FROM emar_administrations';
            let params = [];
            if (tenantId) {
                q += ' WHERE tenant_id=$1';
                params.push(tenantId);
            }
            q += ' ORDER BY created_at DESC LIMIT 50';
            res.json((await pool.query(q, params)).rows);
        }
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.post('/api/emar/administrations', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const { emar_order_id, patient_id, medication, dose, scheduled_time, status, reason_not_given, notes } = req.body;
        const { tenantId, facilityId } = getRequestTenantContext(req);
        if (tenantId) {
            const orderCheck = await pool.query('SELECT id FROM emar_orders WHERE id=$1 AND tenant_id=$2', [emar_order_id, tenantId]);
            if (orderCheck.rows.length === 0) return res.status(404).json({ error: 'Order not found' });
            const patientCheck = await pool.query('SELECT id FROM patients WHERE id=$1 AND tenant_id=$2', [patient_id, tenantId]);
            if (patientCheck.rows.length === 0) return res.status(404).json({ error: 'Patient not found' });
        }
        const result = await pool.query('INSERT INTO emar_administrations (emar_order_id, patient_id, medication, dose, scheduled_time, actual_time, administered_by, status, reason_not_given, notes, tenant_id, facility_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *',
            [emar_order_id, patient_id || 0, medication || '', dose || '', scheduled_time || '', new Date().toISOString(), req.session.user.name, status || 'Given', reason_not_given || '', notes || '', tenantId || null, facilityId || null]);
        res.json(result.rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== NURSING CARE PLANS =====
app.get('/api/nursing/care-plans', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const { tenantId } = getRequestTenantContext(req);
        let q = 'SELECT * FROM nursing_care_plans';
        let params = [];
        if (tenantId) {
            q += ' WHERE tenant_id=$1';
            params.push(tenantId);
        }
        q += ' ORDER BY created_at DESC';
        res.json((await pool.query(q, params)).rows);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.post('/api/nursing/care-plans', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const { patient_id, patient_name, diagnosis, priority, goals, interventions, expected_outcomes } = req.body;
        const { tenantId, facilityId } = getRequestTenantContext(req);
        if (tenantId) {
            const patientCheck = await pool.query('SELECT id FROM patients WHERE id=$1 AND tenant_id=$2', [patient_id, tenantId]);
            if (patientCheck.rows.length === 0) return res.status(404).json({ error: 'Patient not found' });
        }
        const result = await pool.query('INSERT INTO nursing_care_plans (patient_id, patient_name, diagnosis, priority, goals, interventions, expected_outcomes, nurse, tenant_id, facility_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *',
            [patient_id, patient_name || '', diagnosis || '', priority || 'Medium', goals || '', interventions || '', expected_outcomes || '', req.session.user.name, tenantId || null, facilityId || null]);
        res.json(result.rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.get('/api/nursing/assessments', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const { tenantId } = getRequestTenantContext(req);
        let q;
        let params = [];
        if (tenantId) {
            q = 'SELECT * FROM nursing_assessments WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 50';
            params.push(tenantId);
        } else {
            q = 'SELECT * FROM nursing_assessments ORDER BY created_at DESC LIMIT 50';
        }
        res.json((await pool.query(q, params)).rows);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.post('/api/nursing/assessments', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const { patient_id, patient_name, assessment_type, fall_risk_score, braden_score, pain_score, gcs_score, shift, notes } = req.body;
        const { tenantId, facilityId } = getRequestTenantContext(req);
        if (tenantId) {
            const patientCheck = await pool.query('SELECT id FROM patients WHERE id=$1 AND tenant_id=$2', [patient_id, tenantId]);
            if (patientCheck.rows.length === 0) return res.status(404).json({ error: 'Patient not found' });
        }
        const result = await pool.query('INSERT INTO nursing_assessments (patient_id, patient_name, assessment_type, fall_risk_score, braden_score, pain_score, gcs_score, nurse, shift, notes, tenant_id, facility_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *',
            [patient_id, patient_name || '', assessment_type || 'General', fall_risk_score || 0, braden_score || 23, pain_score || 0, gcs_score || 15, req.session.user.name, shift || 'Morning', notes || '', tenantId || null, facilityId || null]);
        res.json(result.rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== FINANCIAL DAILY CLOSE =====
app.get('/api/finance/daily-close', requireAuth, requireRole('finance', 'accounts', 'invoices'), async (req, res) => {
    try { res.json((await pool.query('SELECT * FROM daily_close ORDER BY created_at DESC LIMIT 30')).rows); }
    catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.post('/api/finance/daily-close', requireAuth, requireRole('finance', 'accounts', 'invoices'), async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        // Aggregate today's transactions
        const cash = (await pool.query("SELECT COALESCE(SUM(total),0) as t, COUNT(*) as c FROM invoices WHERE created_at::date=CURRENT_DATE AND payment_method='Cash'")).rows[0];
        const card = (await pool.query("SELECT COALESCE(SUM(total),0) as t FROM invoices WHERE created_at::date=CURRENT_DATE AND payment_method='Card'")).rows[0];
        const ins = (await pool.query("SELECT COALESCE(SUM(total),0) as t FROM invoices WHERE created_at::date=CURRENT_DATE AND payment_method='Insurance'")).rows[0];
        const totalTx = (await pool.query("SELECT COUNT(*) as c FROM invoices WHERE created_at::date=CURRENT_DATE")).rows[0];
        const { opening_balance, closing_balance, notes } = req.body;
        const totalCash = Number(cash.t); const totalCard = Number(card.t); const totalIns = Number(ins.t);
        const variance = Number(closing_balance || 0) - (Number(opening_balance || 0) + totalCash);
        const result = await pool.query('INSERT INTO daily_close (close_date, cashier, total_cash, total_card, total_insurance, total_transactions, opening_balance, closing_balance, variance, notes, status, closed_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *',
            [today, req.session.user.name, totalCash, totalCard, totalIns, Number(totalTx.c), Number(opening_balance || 0), Number(closing_balance || 0), variance, notes || '', 'Closed', req.session.user.name]);
        logAudit(req.session.user.id, req.session.user.name, 'DAILY_CLOSE', 'Finance', `Daily close for ${today}: Cash=${totalCash}, Card=${totalCard}`, req.ip);
        res.json(result.rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== MEDICAL RECORDS / HIM =====
app.get('/api/medical-records/files', requireAuth, async (req, res) => {
    try { res.json((await pool.query('SELECT * FROM medical_records_files ORDER BY id DESC')).rows); }
    catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.get('/api/medical-records/requests', requireAuth, async (req, res) => {
    try { res.json((await pool.query('SELECT * FROM medical_records_requests ORDER BY requested_at DESC')).rows); }
    catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.post('/api/medical-records/requests', requireAuth, async (req, res) => {
    try {
        const { patient_id, file_number, department, purpose, notes } = req.body;
        const result = await pool.query('INSERT INTO medical_records_requests (patient_id, file_number, requested_by, department, purpose, notes) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
            [patient_id, file_number, req.session.user.name, department || '', purpose || 'Clinic Visit', notes || '']);
        logAudit(req.session.user.id, req.session.user.name, 'REQUEST_FILE', 'Medical Records', `File ${file_number} requested`, req.ip);
        res.json(result.rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.put('/api/medical-records/requests/:id', requireAuth, async (req, res) => {
    try {
        const { status } = req.body;
        const now = new Date().toISOString();
        if (status === 'Delivered') await pool.query('UPDATE medical_records_requests SET status=$1, delivered_at=$2 WHERE id=$3', [status, now, req.params.id]);
        else if (status === 'Returned') await pool.query('UPDATE medical_records_requests SET status=$1, returned_at=$2 WHERE id=$3', [status, now, req.params.id]);
        else await pool.query('UPDATE medical_records_requests SET status=$1 WHERE id=$2', [status, req.params.id]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.get('/api/medical-records/coding', requireAuth, async (req, res) => {
    try { res.json((await pool.query('SELECT * FROM medical_records_coding ORDER BY id DESC')).rows); }
    catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.post('/api/medical-records/coding', requireAuth, async (req, res) => {
    try {
        const { patient_id, visit_id, primary_diagnosis, primary_icd10, secondary_diagnoses, drg_code, notes } = req.body;
        const result = await pool.query('INSERT INTO medical_records_coding (patient_id, visit_id, primary_diagnosis, primary_icd10, secondary_diagnoses, drg_code, coder, coding_date, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',
            [patient_id, visit_id || 0, primary_diagnosis || '', primary_icd10 || '', secondary_diagnoses || '', drg_code || '', req.session.user.name, new Date().toISOString().split('T')[0], 'Coded']);
        res.json(result.rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== CLINICAL PHARMACY =====
app.get('/api/clinical-pharmacy/reviews', requireAuth, async (req, res) => {
    try { res.json((await pool.query('SELECT * FROM clinical_pharmacy_reviews ORDER BY created_at DESC')).rows); }
    catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.post('/api/clinical-pharmacy/reviews', requireAuth, async (req, res) => {
    try {
        const { patient_id, patient_name, prescription_id, review_type, findings, recommendations, interventions, severity } = req.body;
        const result = await pool.query('INSERT INTO clinical_pharmacy_reviews (patient_id, patient_name, prescription_id, review_type, pharmacist, findings, recommendations, interventions, severity) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',
            [patient_id, patient_name || '', prescription_id || 0, review_type || 'Medication Review', req.session.user.name, findings || '', recommendations || '', interventions || '', severity || 'Low']);
        logAudit(req.session.user.id, req.session.user.name, 'CLINICAL_REVIEW', 'Clinical Pharmacy', `Review for patient ${patient_name}`, req.ip);
        res.json(result.rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.put('/api/clinical-pharmacy/reviews/:id', requireAuth, async (req, res) => {
    try {
        const { outcome, status } = req.body;
        await pool.query('UPDATE clinical_pharmacy_reviews SET outcome=$1, status=$2 WHERE id=$3', [outcome || 'Resolved', status || 'Closed', req.params.id]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.get('/api/clinical-pharmacy/interactions', requireAuth, async (req, res) => {
    try { res.json((await pool.query('SELECT * FROM drug_interactions ORDER BY severity DESC')).rows); }
    catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.get('/api/clinical-pharmacy/education', requireAuth, async (req, res) => {
    try { res.json((await pool.query('SELECT * FROM patient_drug_education ORDER BY created_at DESC')).rows); }
    catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.post('/api/clinical-pharmacy/education', requireAuth, async (req, res) => {
    try {
        const { patient_id, patient_name, medication, instructions, side_effects, precautions } = req.body;
        const result = await pool.query('INSERT INTO patient_drug_education (patient_id, patient_name, medication, instructions, side_effects, precautions, educated_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
            [patient_id, patient_name || '', medication || '', instructions || '', side_effects || '', precautions || '', req.session.user.name]);
        res.json(result.rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== REHABILITATION / PT =====
app.get('/api/rehab/patients', requireAuth, async (req, res) => {
    try { res.json((await pool.query('SELECT * FROM rehab_patients ORDER BY created_at DESC')).rows); }
    catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.post('/api/rehab/patients', requireAuth, async (req, res) => {
    try {
        const { patient_id, patient_name, diagnosis, referral_source, therapist, therapy_type, start_date, target_end_date, notes } = req.body;
        const result = await pool.query('INSERT INTO rehab_patients (patient_id, patient_name, diagnosis, referral_source, therapist, therapy_type, start_date, target_end_date, notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',
            [patient_id, patient_name || '', diagnosis || '', referral_source || '', therapist || '', therapy_type || 'Physical Therapy', start_date || new Date().toISOString().split('T')[0], target_end_date || '', notes || '']);
        res.json(result.rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.get('/api/rehab/sessions', requireAuth, async (req, res) => {
    try {
        const { patient_id } = req.query;
        if (patient_id) res.json((await pool.query('SELECT * FROM rehab_sessions WHERE rehab_patient_id=$1 ORDER BY session_number DESC', [patient_id])).rows);
        else res.json((await pool.query('SELECT * FROM rehab_sessions ORDER BY created_at DESC LIMIT 100')).rows);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.post('/api/rehab/sessions', requireAuth, async (req, res) => {
    try {
        const { rehab_patient_id, patient_id, session_number, therapist, session_type, exercises, duration_minutes, pain_before, pain_after, progress_notes } = req.body;
        const result = await pool.query('INSERT INTO rehab_sessions (rehab_patient_id, patient_id, session_date, session_number, therapist, session_type, exercises, duration_minutes, pain_before, pain_after, progress_notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *',
            [rehab_patient_id, patient_id || 0, new Date().toISOString().split('T')[0], session_number || 1, therapist || req.session.user.name, session_type || 'Individual', exercises || '', duration_minutes || 30, pain_before || 0, pain_after || 0, progress_notes || '']);
        res.json(result.rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.get('/api/rehab/goals', requireAuth, async (req, res) => {
    try {
        const { patient_id } = req.query;
        if (patient_id) res.json((await pool.query('SELECT * FROM rehab_goals WHERE rehab_patient_id=$1 ORDER BY id', [patient_id])).rows);
        else res.json((await pool.query('SELECT * FROM rehab_goals ORDER BY id DESC')).rows);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.post('/api/rehab/goals', requireAuth, async (req, res) => {
    try {
        const { rehab_patient_id, goal_description, target_date } = req.body;
        const result = await pool.query('INSERT INTO rehab_goals (rehab_patient_id, goal_description, target_date) VALUES ($1,$2,$3) RETURNING *',
            [rehab_patient_id, goal_description || '', target_date || '']);
        res.json(result.rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.put('/api/rehab/goals/:id', requireAuth, async (req, res) => {
    try {
        const { progress, status } = req.body;
        await pool.query('UPDATE rehab_goals SET progress=$1, status=$2 WHERE id=$3', [progress || 0, status || 'In Progress', req.params.id]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== MESSAGING =====
app.get('/api/messages', requireAuth, async (req, res) => {
    try {
        const userId = req.session.user.id;
        res.json((await pool.query(`SELECT m.*, su.display_name as sender_name FROM internal_messages m LEFT JOIN system_users su ON m.sender_id=su.id WHERE m.receiver_id=$1 ORDER BY m.created_at DESC`, [userId])).rows);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.get('/api/messages/sent', requireAuth, async (req, res) => {
    try {
        const userId = req.session.user.id;
        res.json((await pool.query(`SELECT m.*, su.display_name as receiver_name FROM internal_messages m LEFT JOIN system_users su ON m.receiver_id=su.id WHERE m.sender_id=$1 ORDER BY m.created_at DESC`, [userId])).rows);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.post('/api/messages', requireAuth, async (req, res) => {
    try {
        const { receiver_id, subject, body, priority } = req.body;
        const senderId = req.session.user.id;
        const result = await pool.query('INSERT INTO internal_messages (sender_id, receiver_id, subject, body, priority) VALUES ($1,$2,$3,$4,$5) RETURNING id',
            [senderId, receiver_id, subject || '', body || '', priority || 'Normal']);
        logAudit(senderId, req.session.user.name, 'SEND_MESSAGE', 'Messaging', `Message to user ${receiver_id}: ${subject}`, req.ip);
        res.json({ success: true, id: result.rows[0].id });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.put('/api/messages/:id/read', requireAuth, async (req, res) => {
    try {
        await pool.query('UPDATE internal_messages SET is_read=1 WHERE id=$1', [req.params.id]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.delete('/api/messages/:id', requireAuth, async (req, res) => {
    try {
        await pool.query('DELETE FROM internal_messages WHERE id=$1', [req.params.id]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== AUDIT TRAIL =====
app.get('/api/audit-trail', requireAuth, async (req, res) => {
    try {
        const { limit = 100 } = req.query;
        res.json((await pool.query('SELECT * FROM audit_trail ORDER BY created_at DESC LIMIT $1', [parseInt(limit)])).rows);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== PRINT API =====
app.get('/api/print/invoice/:id', requireAuth, async (req, res) => {
    try {
        const inv = (await pool.query('SELECT * FROM invoices WHERE id=$1', [req.params.id])).rows[0];
        if (!inv) return res.status(404).json({ error: 'Not found' });
        const settings = {};
        const settingsRows = (await pool.query('SELECT * FROM company_settings')).rows;
        settingsRows.forEach(s => settings[s.setting_key] = s.setting_value);
        res.json({ invoice: inv, company: settings });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/print/prescription/:id', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const { tenantId } = getRequestTenantContext(req);
        const tenantCheck = tenantId ? ' AND p.tenant_id=$2' : '';
        const params = tenantId ? [req.params.id, tenantId] : [req.params.id];
        const rx = (await pool.query(`SELECT p.*, m.name as med_name FROM prescriptions p LEFT JOIN medications m ON p.medication_id=m.id WHERE p.id=$1${tenantCheck}`, params)).rows[0];
        if (!rx) return res.status(404).json({ error: 'Not found' });
        const patientQuery = tenantId ?
            'SELECT * FROM patients WHERE id=$1 AND tenant_id=$2' :
            'SELECT * FROM patients WHERE id=$1';
        const patientParams = tenantId ? [rx.patient_id, tenantId] : [rx.patient_id];
        const patient = (await pool.query(patientQuery, patientParams)).rows[0];
        res.json({ prescription: rx, patient });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/print/lab-report/:id', requireAuth, async (req, res) => {
    try {
        // --- TENANT SCOPE: verify order belongs to current tenant (IDOR prevention) ---
        const { tenantId } = getRequestTenantContext(req);
        const tenantCheck = tenantId ? ' AND tenant_id=$2' : '';
        const params = tenantId ? [req.params.id, tenantId] : [req.params.id];
        const order = (await pool.query(`SELECT * FROM lab_radiology_orders WHERE id=$1${tenantCheck}`, params)).rows[0];
        if (!order) return res.status(404).json({ error: 'Not found' });
        const results = (await pool.query('SELECT lr.*, lt.test_name, lt.normal_range FROM lab_results lr LEFT JOIN lab_tests_catalog lt ON lr.test_id=lt.id WHERE lr.order_id=$1', [req.params.id])).rows;
        const patient = (await pool.query('SELECT * FROM patients WHERE id=$1', [order.patient_id])).rows[0];
        res.json({ order, results, patient });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// SPA fallback
// [MOVED] catch-all to end of routes

// ===== INIT & START =====
async function startServer() {
    try {
        console.log('\n  🐘 Connecting to PostgreSQL...');
        await initDatabase();
        // Boot-time demo seed + catalog population run ONLY outside production. In production the
        // schema/catalogs already exist and the app runs as a non-superuser (nama_medical_app) that
        // lacks CREATE/seed rights, so running these here crashed the app ("permission denied for
        // schema public" / patients RLS violation). Production seed/schema is managed out-of-band
        // (see docs/sql/boot_time_schema_cleanup_candidate_*). Tenant binding is unaffected.
        if (process.env.NODE_ENV !== 'production') {
            await insertSampleData();
            await populateLabCatalog();
            await populateRadiologyCatalog();
            await addExtraLabTests();
            await addExtraRadiology();
            await populateMedicalServices();
            await populateBaseDrugs();
        } else {
            console.log('[DB INFO] Production: skipping demo seed + catalog population (managed out-of-band).');
        }
        app.listen(PORT, () => {
            console.log(`\n  ✅ Nama Medical Web is running!`);
            console.log(`  🌐 Open: http://localhost:${PORT}`);
            console.log(`  📦 Database: PostgreSQL (nama_medical_web)\n`);
        });
    } catch (err) {
        console.error('  ❌ Failed to start:', err.message);
        process.exit(1);
    }
}

// ===== PHARMACY & PRESCRIPTIONS =====
// Doctor sends prescription → Pharmacy queue
app.post('/api/prescriptions', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const { patient_id, medication_name, dosage, quantity_per_day, frequency, duration } = req.body;
        const { tenantId, facilityId } = getRequestTenantContext(req);
        if (tenantId && patient_id) {
            const patientCheck = (await pool.query('SELECT id FROM patients WHERE id=$1 AND tenant_id=$2', [patient_id, tenantId])).rows[0];
            if (!patientCheck) return res.status(404).json({ error: 'Patient not found' });
        }
        const rxText = `${medication_name || ''} | ${dosage || ''}${quantity_per_day && quantity_per_day !== '1' ? ' (×' + quantity_per_day + ')' : ''} | ${frequency || ''} | ${duration || ''}`;
        // pharmacy_prescriptions_queue columns provisioned out-of-band (route_level_ddl_batch_c); no DDL in handler
        const r = await pool.query(
            `INSERT INTO pharmacy_prescriptions_queue (patient_id, doctor_id, prescription_text, medication_name, dosage, quantity_per_day, frequency, duration, status, tenant_id, branch_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'Pending', $9, $10) RETURNING *`,
            [patient_id, req.session.user?.id || 0, rxText, medication_name || '', dosage || '', quantity_per_day || '1', frequency || '', duration || '', tenantId || null, facilityId || null]
        );
        logAudit(req.session.user?.id, req.session.user?.display_name, 'CREATE_PRESCRIPTION_QUEUE', 'Pharmacy',
            `Sent prescription to queue for patient #${patient_id}: ${medication_name}`, req.ip);
        res.json(r.rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// Get pharmacy prescriptions queue
app.get('/api/pharmacy/queue', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const { tenantId } = getRequestTenantContext(req);
        const query = tenantId ?
            `SELECT q.*, p.name_ar as patient_name, p.file_number, p.phone, p.age, p.department, q.doctor
             FROM pharmacy_prescriptions_queue q
             LEFT JOIN patients p ON q.patient_id = p.id
             WHERE q.tenant_id=$1
             ORDER BY q.id DESC` :
            `SELECT q.*, p.name_ar as patient_name, p.file_number, p.phone, p.age, p.department, q.doctor
             FROM pharmacy_prescriptions_queue q
             LEFT JOIN patients p ON q.patient_id = p.id
             ORDER BY q.id DESC`;
        const params = tenantId ? [tenantId] : [];
        const rows = (await pool.query(query, params)).rows;
        res.json(rows);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// Update prescription status (Dispense with sale)
app.put('/api/pharmacy/queue/:id', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const { status, price, payment_method, patient_id } = req.body;
        const { tenantId, facilityId } = getRequestTenantContext(req);
        const tenantCheck = tenantId ? ' AND tenant_id=$2' : '';
        const checkParams = tenantId ? [req.params.id, tenantId] : [req.params.id];
        const rxCheck = (await pool.query(`SELECT id FROM pharmacy_prescriptions_queue WHERE id=$1${tenantCheck}`, checkParams)).rows[0];
        if (!rxCheck) return res.status(404).json({ error: 'Queue item not found' });

        if (tenantId && patient_id) {
            const patientCheck = (await pool.query('SELECT id FROM patients WHERE id=$1 AND tenant_id=$2', [patient_id, tenantId])).rows[0];
            if (!patientCheck) return res.status(404).json({ error: 'Patient not found' });
        }

        // Ensure columns exist
        // pharmacy_prescriptions_queue price/payment_method columns provisioned out-of-band (route_level_ddl_batch_c); no DDL in handler
        const updateQuery = tenantId ?
            `UPDATE pharmacy_prescriptions_queue SET status=$1, dispensed_by=$2, dispensed_at=CURRENT_TIMESTAMP, price=$3, payment_method=$4 WHERE id=$5 AND tenant_id=$6` :
            `UPDATE pharmacy_prescriptions_queue SET status=$1, dispensed_by=$2, dispensed_at=CURRENT_TIMESTAMP, price=$3, payment_method=$4 WHERE id=$5`;
        const updateParams = tenantId ?
            [status || 'Dispensed', req.session.user?.display_name || '', price || 0, payment_method || 'Cash', req.params.id, tenantId] :
            [status || 'Dispensed', req.session.user?.display_name || '', price || 0, payment_method || 'Cash', req.params.id];
        await pool.query(updateQuery, updateParams);

        // Create invoice if price > 0
        if (price && price > 0 && patient_id) {
            const rxQuery = tenantId ?
                'SELECT * FROM pharmacy_prescriptions_queue WHERE id=$1 AND tenant_id=$2' :
                'SELECT * FROM pharmacy_prescriptions_queue WHERE id=$1';
            const rxParams = tenantId ? [req.params.id, tenantId] : [req.params.id];
            const rx = (await pool.query(rxQuery, rxParams)).rows[0];

            const patientQuery = tenantId ?
                'SELECT name_ar, name_en, nationality FROM patients WHERE id=$1 AND tenant_id=$2' :
                'SELECT name_ar, name_en, nationality FROM patients WHERE id=$1';
            const patientParams = tenantId ? [patient_id, tenantId] : [patient_id];
            const patient = (await pool.query(patientQuery, patientParams)).rows[0];

            const vat = await calcVAT(patient_id);
            const { total: finalTotal, vatAmount } = addVAT(price, vat.rate);
            await pool.query(
                `INSERT INTO invoices (patient_id, patient_name, total, amount, vat_amount, description, service_type, paid, payment_method, tenant_id, facility_id)
                 VALUES ($1, $2, $3, $4, $5, $6, 'Pharmacy', 1, $7, $8, $9)`,
                [patient_id, patient?.name_ar || patient?.name_en || '', finalTotal, price, vatAmount,
                    `Pharmacy: ${rx?.prescription_text || ''}`, payment_method || 'Cash', tenantId || null, facilityId || null]
            );
        }
        logAudit(req.session.user?.id, req.session.user?.display_name, 'DISPENSE_MEDICATION', 'Pharmacy',
            `Dispensed queue item #${req.params.id} status:${status} price:${price}`, req.ip);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// Get drug catalog
app.get('/api/pharmacy/drugs', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const { tenantId } = getRequestTenantContext(req);
        const query = tenantId ?
            'SELECT * FROM pharmacy_drug_catalog WHERE tenant_id=$1 ORDER BY drug_name' :
            'SELECT * FROM pharmacy_drug_catalog ORDER BY drug_name';
        const params = tenantId ? [tenantId] : [];
        const rows = (await pool.query(query, params)).rows;
        res.json(rows);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// Add drug to catalog
app.post('/api/pharmacy/drugs', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const { drug_name, selling_price, stock_qty, category, active_ingredient } = req.body;
        const { tenantId, facilityId } = getRequestTenantContext(req);
        const r = await pool.query(
            `INSERT INTO pharmacy_drug_catalog (drug_name, selling_price, stock_qty, category, active_ingredient, tenant_id, branch_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
            [drug_name || '', selling_price || 0, stock_qty || 0, category || '', active_ingredient || '', tenantId || null, facilityId || null]
        );
        logAudit(req.session.user?.id, req.session.user?.display_name, 'ADD_DRUG', 'Pharmacy',
            `Added drug ${drug_name} to catalog`, req.ip);
        res.json(r.rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== P&L REPORT =====
app.get('/api/reports/pnl', requireAuth, requireRole('finance'), requireTenantScope, async (req, res) => {
    try {
        const { tenantId } = getRequestTenantContext(req);
        const { from, to } = req.query;

        let dateFilter = '';
        let params = [];
        if (from && to && /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to)) {
            dateFilter = 'created_at BETWEEN $1 AND $2';
            params = [from, to + ' 23:59:59'];
        }

        let whereClause = '';
        if (dateFilter) {
            whereClause = 'WHERE ' + dateFilter;
            if (tenantId) {
                whereClause += ' AND tenant_id = $' + (params.length + 1);
                params.push(tenantId);
            }
        } else {
            if (tenantId) {
                whereClause = 'WHERE tenant_id = $1';
                params.push(tenantId);
            }
        }

        const revenue = (await pool.query(`SELECT COALESCE(SUM(total),0) as total, COALESCE(SUM(CASE WHEN paid=1 THEN total ELSE 0 END),0) as collected, COALESCE(SUM(discount),0) as discounts FROM invoices ${whereClause}`, params)).rows[0];
        const byType = (await pool.query(`SELECT service_type, COUNT(*) as cnt, COALESCE(SUM(total),0) as total FROM invoices ${whereClause} GROUP BY service_type ORDER BY total DESC`, params)).rows;

        const expensesQuery = tenantId ?
            'SELECT COALESCE(SUM(cost_price * stock_qty),0) as drug_cost FROM pharmacy_drug_catalog WHERE is_active=1 AND tenant_id=$1' :
            'SELECT COALESCE(SUM(cost_price * stock_qty),0) as drug_cost FROM pharmacy_drug_catalog WHERE is_active=1';
        const expensesParams = tenantId ? [tenantId] : [];
        const expenses = (await pool.query(expensesQuery, expensesParams)).rows[0];

        res.json({
            totalRevenue: parseFloat(revenue.total),
            totalCollected: parseFloat(revenue.collected),
            totalDiscounts: parseFloat(revenue.discounts),
            totalUncollected: parseFloat(revenue.total) - parseFloat(revenue.collected),
            estimatedCosts: parseFloat(expenses.drug_cost),
            netProfit: parseFloat(revenue.collected) - parseFloat(expenses.drug_cost),
            byType
        });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== COMPREHENSIVE DIAGNOSIS TEMPLATES (80+ diagnoses, 12 specialties) =====
app.get('/api/diagnosis-templates', requireAuth, async (req, res) => {
    try {
        const templates = {
            'General / عام': [
                { name: 'Upper Respiratory Tract Infection', name_ar: 'التهاب الجهاز التنفسي العلوي', icd: 'J06.9', symptoms: 'Cough, runny nose, sore throat, fever', treatment: 'Paracetamol 500mg QID, rest, fluids, saline nasal spray' },
                { name: 'Acute Gastroenteritis', name_ar: 'التهاب المعدة والأمعاء الحاد', icd: 'K52.9', symptoms: 'Nausea, vomiting, diarrhea, abdominal cramps', treatment: 'ORS, Ondansetron 4mg, Loperamide if needed, probiotics' },
                { name: 'Urinary Tract Infection', name_ar: 'التهاب المسالك البولية', icd: 'N39.0', symptoms: 'Dysuria, frequency, urgency, suprapubic pain, cloudy urine', treatment: 'Ciprofloxacin 500mg BID x7d or Nitrofurantoin 100mg BID x5d' },
                { name: 'Tension Headache', name_ar: 'صداع توتري', icd: 'G44.2', symptoms: 'Bilateral pressure-like headache, no nausea, no photophobia', treatment: 'Paracetamol 1g, Ibuprofen 400mg, stress management, adequate sleep' },
                { name: 'Essential Hypertension', name_ar: 'ارتفاع ضغط الدم الأساسي', icd: 'I10', symptoms: 'Usually asymptomatic, headache, dizziness if severe', treatment: 'Amlodipine 5mg daily, lifestyle modification, low salt diet, follow-up 2 weeks' },
                { name: 'Type 2 Diabetes Mellitus', name_ar: 'السكري النوع الثاني', icd: 'E11.9', symptoms: 'Polyuria, polydipsia, fatigue, blurred vision, weight loss', treatment: 'Metformin 500mg BID, diet control, exercise 30min/day, HbA1c in 3 months' },
                { name: 'Acute Bronchitis', name_ar: 'التهاب الشعب الهوائية الحاد', icd: 'J20.9', symptoms: 'Productive cough, chest discomfort, wheezing, low-grade fever', treatment: 'Ambroxol 30mg TID, Salbutamol inhaler PRN, fluids, no antibiotics if viral' },
                { name: 'Allergic Rhinitis', name_ar: 'التهاب الأنف التحسسي', icd: 'J30.4', symptoms: 'Sneezing, nasal congestion, watery rhinorrhea, itchy eyes', treatment: 'Cetirizine 10mg daily, Fluticasone nasal spray BID, avoid allergens' },
                { name: 'Iron Deficiency Anemia', name_ar: 'فقر الدم بنقص الحديد', icd: 'D50.9', symptoms: 'Fatigue, pallor, dyspnea on exertion, brittle nails, pica', treatment: 'Ferrous sulfate 325mg BID on empty stomach with vitamin C, CBC in 4 weeks' },
                { name: 'Low Back Pain (Mechanical)', name_ar: 'ألم أسفل الظهر الميكانيكي', icd: 'M54.5', symptoms: 'Lower back pain, muscle spasm, limited range of motion, no radiation', treatment: 'Diclofenac 75mg BID, Cyclobenzaprine 10mg HS, hot packs, physiotherapy referral' },
                { name: 'Vitamin D Deficiency', name_ar: 'نقص فيتامين د', icd: 'E55.9', symptoms: 'Bone pain, muscle weakness, fatigue, depression, frequent infections', treatment: 'Cholecalciferol 50,000IU weekly x8 weeks then 2,000IU daily maintenance' },
                { name: 'Dyslipidemia', name_ar: 'اضطراب الدهون', icd: 'E78.5', symptoms: 'Usually asymptomatic, discovered on routine labs', treatment: 'Atorvastatin 20mg HS, low-fat diet, exercise, lipid panel in 6 weeks' },
                { name: 'Hypothyroidism', name_ar: 'قصور الغدة الدرقية', icd: 'E03.9', symptoms: 'Fatigue, weight gain, cold intolerance, constipation, dry skin, hair loss', treatment: 'Levothyroxine 50mcg daily on empty stomach, TSH in 6 weeks' },
                { name: 'Gastroesophageal Reflux Disease', name_ar: 'ارتجاع المريء', icd: 'K21.0', symptoms: 'Heartburn, regurgitation, chest pain after eating, sour taste', treatment: 'Omeprazole 20mg daily before breakfast, avoid spicy food, elevate head of bed' },
                { name: 'Acute Sinusitis', name_ar: 'التهاب الجيوب الأنفية الحاد', icd: 'J01.9', symptoms: 'Facial pain/pressure, nasal congestion, purulent discharge, headache', treatment: 'Amoxicillin 500mg TID x10d, decongestant spray x3d max, saline irrigation' }
            ],
            'Internal Medicine / الباطنية': [
                { name: 'Community Acquired Pneumonia', name_ar: 'التهاب رئوي مكتسب من المجتمع', icd: 'J18.9', symptoms: 'Fever, productive cough, dyspnea, pleuritic chest pain, crackles', treatment: 'Azithromycin 500mg D1 then 250mg D2-5 + Amoxicillin-Clav 625mg TID, CXR follow-up' },
                { name: 'Acute Kidney Injury', name_ar: 'إصابة كلوية حادة', icd: 'N17.9', symptoms: 'Decreased urine output, edema, fatigue, nausea, confusion', treatment: 'IV fluids, stop nephrotoxic drugs, monitor I/O, BMP Q12h, nephrology consult' },
                { name: 'Congestive Heart Failure', name_ar: 'فشل القلب الاحتقاني', icd: 'I50.9', symptoms: 'Dyspnea, orthopnea, PND, leg edema, weight gain, crackles', treatment: 'Furosemide 40mg IV, fluid restriction <1.5L, daily weights, O2 PRN, cardiology consult' },
                { name: 'Diabetic Ketoacidosis', name_ar: 'حماض كيتوني سكري', icd: 'E10.1', symptoms: 'Polyuria, nausea/vomiting, abdominal pain, Kussmaul breathing, fruity breath', treatment: 'NS bolus, insulin drip 0.1U/kg/hr, K+ replacement, BMP Q2h, ICU admission' },
                { name: 'Deep Vein Thrombosis', name_ar: 'جلطة الأوردة العميقة', icd: 'I82.9', symptoms: 'Unilateral leg swelling, pain, warmth, redness, pitting edema', treatment: 'Enoxaparin 1mg/kg BID, Warfarin bridge, compression stockings, Doppler US' },
                { name: 'Chronic Kidney Disease', name_ar: 'مرض كلوي مزمن', icd: 'N18.9', symptoms: 'Fatigue, edema, decreased appetite, nocturia, pruritus', treatment: 'ACE inhibitor, low protein diet, phosphate binders, EPO if anemia, nephrology F/U' },
                { name: 'Peptic Ulcer Disease', name_ar: 'قرحة المعدة', icd: 'K27.9', symptoms: 'Epigastric pain, relation to meals, nausea, melena if bleeding', treatment: 'PPI high dose, H.pylori triple therapy if positive, avoid NSAIDs, EGD if alarm symptoms' },
                { name: 'Acute Pancreatitis', name_ar: 'التهاب البنكرياس الحاد', icd: 'K85.9', symptoms: 'Severe epigastric pain radiating to back, nausea/vomiting, elevated lipase', treatment: 'NPO, aggressive IV hydration, pain management (Morphine), monitor in hospital' }
            ],
            'Pediatrics / الأطفال': [
                { name: 'Acute Otitis Media', name_ar: 'التهاب الأذن الوسطى الحاد', icd: 'H66.9', symptoms: 'Ear pain, fever, irritability, pulling ear, decreased hearing', treatment: 'Amoxicillin 80-90mg/kg/day BID x10d, Paracetamol for pain, F/U 48h' },
                { name: 'Viral Pharyngitis', name_ar: 'التهاب البلعوم الفيروسي', icd: 'J02.9', symptoms: 'Sore throat, fever, redness, no exudate, rhinorrhea, cough', treatment: 'Supportive care, Paracetamol 15mg/kg Q6h, warm fluids, rest' },
                { name: 'Acute Gastroenteritis (Pediatric)', name_ar: 'نزلة معوية حادة للأطفال', icd: 'A09', symptoms: 'Vomiting, watery diarrhea, dehydration signs, irritability', treatment: 'ORS small frequent sips, Zinc 20mg daily x10-14d, Ondansetron if severe vomiting' },
                { name: 'Asthma Exacerbation', name_ar: 'نوبة ربو حادة', icd: 'J45.9', symptoms: 'Wheezing, dyspnea, cough worse at night, chest tightness, retractions', treatment: 'Salbutamol neb Q20min x3, Ipratropium neb, Prednisolone 1mg/kg x3-5d' },
                { name: 'Hand Foot and Mouth Disease', name_ar: 'مرض اليد والقدم والفم', icd: 'B08.4', symptoms: 'Fever, oral ulcers, vesicular rash on palms/soles/buttocks', treatment: 'Supportive care, Paracetamol, cold fluids, oral gel for ulcers' },
                { name: 'Febrile Seizure (Simple)', name_ar: 'نوبة حمية بسيطة', icd: 'R56.0', symptoms: 'Generalized seizure <15min with fever, age 6m-5y, no focal features', treatment: 'Reassure parents, antipyretics, identify fever source, no AEDs needed' },
                { name: 'Iron Deficiency Anemia (Pediatric)', name_ar: 'فقر الدم بنقص الحديد للأطفال', icd: 'D50.9', symptoms: 'Pallor, irritability, poor appetite, pica, fatigue', treatment: 'Ferrous sulfate 3-6mg/kg/day elemental iron, vitamin C, dietary counseling' },
                { name: 'Bronchiolitis', name_ar: 'التهاب القصيبات', icd: 'J21.9', symptoms: 'Rhinorrhea, cough, wheezing, tachypnea, retractions, poor feeding, age <2y', treatment: 'O2 if SpO2<92%, nasal suctioning, careful hydration, admit if respiratory distress' }
            ],
            'Dermatology / الجلدية': [
                { name: 'Eczema / Atopic Dermatitis', name_ar: 'الإكزيما', icd: 'L30.9', symptoms: 'Itchy dry red patches on flexures, lichenification in chronic', treatment: 'Moisturizers BID, Betamethasone 0.05% cream BID x2w, avoid triggers' },
                { name: 'Acne Vulgaris (Mild)', name_ar: 'حب الشباب الخفيف', icd: 'L70.0', symptoms: 'Comedones, few papules on face, no scarring', treatment: 'Benzoyl peroxide 5% gel HS, Adapalene 0.1% gel HS, gentle cleanser' },
                { name: 'Acne Vulgaris (Moderate-Severe)', name_ar: 'حب الشباب المتوسط-الشديد', icd: 'L70.0', symptoms: 'Papules, pustules, nodules on face/back, possible scarring', treatment: 'Doxycycline 100mg BID x3m, Adapalene-BPO gel, consider Isotretinoin' },
                { name: 'Tinea (Ringworm)', name_ar: 'فطريات جلدية (السعفة)', icd: 'B35.4', symptoms: 'Ring-shaped red patch, raised scaly border, central clearing', treatment: 'Clotrimazole 1% cream BID x2-4w, keep dry, avoid sharing towels' },
                { name: 'Psoriasis (Plaque)', name_ar: 'الصدفية', icd: 'L40.0', symptoms: 'Erythematous plaques with silvery scales, elbows/knees/scalp', treatment: 'Betamethasone cream BID, Calcipotriol ointment, coal tar shampoo' },
                { name: 'Urticaria', name_ar: 'الشرى (الأرتيكاريا)', icd: 'L50.9', symptoms: 'Itchy wheals, migratory, angioedema possible', treatment: 'Cetirizine 10mg BID, avoid triggers, Epinephrine IM if anaphylaxis' },
                { name: 'Contact Dermatitis', name_ar: 'التهاب الجلد التماسي', icd: 'L25.9', symptoms: 'Erythema, vesicles, pruritus at contact site', treatment: 'Remove causative agent, Hydrocortisone 1% cream BID, antihistamine' },
                { name: 'Vitiligo', name_ar: 'البهاق', icd: 'L80', symptoms: 'Depigmented macules/patches, symmetrical, no itching', treatment: 'Tacrolimus 0.1% ointment BID, phototherapy referral, sunscreen' },
                { name: 'Melasma', name_ar: 'الكلف', icd: 'L81.1', symptoms: 'Brown-gray patches on face, bilateral, worse with sun', treatment: 'Hydroquinone 4% cream HS, SPF 50+, Vitamin C serum' }
            ],
            'Orthopedics / العظام': [
                { name: 'Knee Osteoarthritis', name_ar: 'خشونة الركبة', icd: 'M17.9', symptoms: 'Knee pain worse with activity, stiffness <30min, crepitus', treatment: 'Paracetamol 1g TID, Glucosamine 1500mg, physiotherapy, weight loss' },
                { name: 'Lumbar Disc Herniation', name_ar: 'انزلاق غضروفي قطني', icd: 'M51.1', symptoms: 'Low back pain radiating to leg, numbness, positive SLR', treatment: 'NSAIDs, Gabapentin 300mg TID, physiotherapy, epidural if severe, MRI' },
                { name: 'Rotator Cuff Tendinitis', name_ar: 'التهاب وتر الكتف', icd: 'M75.1', symptoms: 'Shoulder pain with overhead activities, night pain, painful arc', treatment: 'NSAIDs, ice, physiotherapy, subacromial injection if persistent' },
                { name: 'Plantar Fasciitis', name_ar: 'التهاب اللفافة الأخمصية', icd: 'M72.2', symptoms: 'Heel pain worst with first steps in morning, point tenderness', treatment: 'Stretching, heel cups, NSAIDs, night splint, steroid injection if chronic' },
                { name: 'Carpal Tunnel Syndrome', name_ar: 'متلازمة النفق الرسغي', icd: 'G56.0', symptoms: 'Numbness in thumb-middle fingers, worse at night, weak grip', treatment: 'Wrist splint at night, NSAIDs, steroid injection, NCS/EMG, surgery if severe' },
                { name: 'Ankle Sprain', name_ar: 'التواء الكاحل', icd: 'S93.4', symptoms: 'Pain/swelling after inversion injury, ecchymosis', treatment: 'RICE protocol, ankle brace, Ibuprofen, gradual rehab, X-ray to rule out fracture' },
                { name: 'Cervical Spondylosis', name_ar: 'خشونة الرقبة', icd: 'M47.8', symptoms: 'Neck pain/stiffness, reduced ROM, referred pain to shoulders', treatment: 'NSAIDs, muscle relaxant, cervical collar short-term, physiotherapy' }
            ],
            'ENT / الأنف والأذن والحنجرة': [
                { name: 'Acute Tonsillitis', name_ar: 'التهاب اللوزتين الحاد', icd: 'J03.9', symptoms: 'Severe sore throat, odynophagia, fever, tonsillar exudate', treatment: 'Penicillin V 500mg QID x10d, Paracetamol, warm salt water gargle' },
                { name: 'Chronic Sinusitis', name_ar: 'التهاب الجيوب المزمن', icd: 'J32.9', symptoms: 'Nasal congestion >12w, facial pressure, post-nasal drip', treatment: 'Fluticasone nasal BID, saline irrigation, Augmentin 625mg TID x14d' },
                { name: 'Allergic Rhinitis', name_ar: 'حساسية الأنف', icd: 'J30.4', symptoms: 'Sneezing, rhinorrhea, itching, congestion, pale turbinates', treatment: 'Cetirizine 10mg daily, Fluticasone nasal BID, allergen avoidance' },
                { name: 'BPPV (Vertigo)', name_ar: 'دوار الوضعة الحميد', icd: 'H81.1', symptoms: 'Brief vertigo with head position change, positive Dix-Hallpike', treatment: 'Epley maneuver, Betahistine 16mg TID, vestibular rehab' },
                { name: 'Otitis Externa', name_ar: 'التهاب الأذن الخارجية', icd: 'H60.9', symptoms: 'Ear pain worse with tragal pressure, itching, discharge', treatment: 'Ciprofloxacin-Dexamethasone drops TID x7d, keep ear dry' },
                { name: 'Epistaxis (Anterior)', name_ar: 'رعاف أنفي أمامي', icd: 'R04.0', symptoms: 'Unilateral nasal bleeding, usually from Little area', treatment: 'Direct pressure 15min, Oxymetazoline, anterior packing if persistent' }
            ],
            'Ophthalmology / العيون': [
                { name: 'Allergic Conjunctivitis', name_ar: 'التهاب الملتحمة التحسسي', icd: 'H10.1', symptoms: 'Bilateral itchy eyes, tearing, redness, seasonal', treatment: 'Olopatadine 0.1% drops BID, cold compresses, oral antihistamine' },
                { name: 'Bacterial Conjunctivitis', name_ar: 'التهاب الملتحمة البكتيري', icd: 'H10.0', symptoms: 'Purulent discharge, crusting, redness, unilateral then bilateral', treatment: 'Moxifloxacin 0.5% drops QID x7d, warm compresses, hand hygiene' },
                { name: 'Dry Eye Syndrome', name_ar: 'جفاف العين', icd: 'H04.1', symptoms: 'Burning, grittiness, foreign body sensation, tearing', treatment: 'Artificial tears QID, warm compresses, omega-3, reduce screen time' },
                { name: 'Stye (Hordeolum)', name_ar: 'الدمل (الشحاذ)', icd: 'H00.0', symptoms: 'Painful red swelling at eyelid margin, tenderness', treatment: 'Warm compresses QID, Chloramphenicol ointment TID, do not squeeze' },
                { name: 'Refractive Error', name_ar: 'خطأ انكساري', icd: 'H52.7', symptoms: 'Blurred vision, headache, eye strain, squinting', treatment: 'Refraction test, prescribe glasses/contact lenses, annual follow-up' }
            ],
            'Dental / الأسنان': [
                { name: 'Dental Caries', name_ar: 'تسوس الأسنان', icd: 'K02.9', symptoms: 'Toothache, sensitivity to hot/cold/sweet, visible cavitation', treatment: 'Dental filling, oral hygiene instructions, fluoride treatment' },
                { name: 'Acute Pulpitis', name_ar: 'التهاب لب السن الحاد', icd: 'K04.0', symptoms: 'Severe spontaneous toothache, worse at night, lingering pain', treatment: 'Root canal or extraction, Ibuprofen 400mg TID, Amoxicillin if infection' },
                { name: 'Periodontal Disease', name_ar: 'أمراض اللثة', icd: 'K05.1', symptoms: 'Gum bleeding, redness, swelling, bad breath, loose teeth', treatment: 'Scaling and root planing, Chlorhexidine mouthwash BID, oral hygiene' },
                { name: 'Periapical Abscess', name_ar: 'خراج حول الذروة', icd: 'K04.7', symptoms: 'Severe pain, swelling, tender to percussion, pus, fever', treatment: 'I&D, Amoxicillin + Metronidazole, root canal or extraction' },
                { name: 'TMJ Disorder', name_ar: 'اضطراب المفصل الصدغي', icd: 'K07.6', symptoms: 'Jaw pain, clicking, limited opening, headache, ear pain', treatment: 'Soft diet, jaw exercises, night guard, NSAIDs, warm compresses' },
                { name: 'Wisdom Tooth Impaction', name_ar: 'ضرس العقل المطمور', icd: 'K01.1', symptoms: 'Pain at angle of jaw, swelling, difficulty opening', treatment: 'Surgical extraction, Amoxicillin, Ibuprofen, chlorhexidine rinse' }
            ],
            'Emergency / الطوارئ': [
                { name: 'Acute MI (STEMI)', name_ar: 'احتشاء عضلة القلب الحاد', icd: 'I21.9', symptoms: 'Crushing chest pain, radiation to jaw/arm, diaphoresis, ST elevation', treatment: 'MONA, Heparin, urgent PCI, cardiology STAT' },
                { name: 'Acute Appendicitis', name_ar: 'التهاب الزائدة الحاد', icd: 'K35.9', symptoms: 'RLQ pain, nausea, fever, McBurney tenderness, Rovsing +', treatment: 'NPO, IV antibiotics, surgical consult STAT, CT if unclear' },
                { name: 'Anaphylaxis', name_ar: 'صدمة حساسية', icd: 'T78.2', symptoms: 'Urticaria, angioedema, bronchospasm, hypotension, dyspnea', treatment: 'Epinephrine 0.3mg IM STAT, IV fluids, diphenhydramine, steroids' },
                { name: 'Acute Stroke', name_ar: 'سكتة دماغية حادة', icd: 'I63.9', symptoms: 'Sudden weakness one side, speech difficulty, facial droop', treatment: 'CT head STAT, tPA if <4.5h, Aspirin 325mg, admit stroke unit' },
                { name: 'Severe Asthma Attack', name_ar: 'نوبة ربو شديدة', icd: 'J46', symptoms: 'Severe dyspnea, unable to speak, SpO2<92%, accessory muscle use', treatment: 'O2, continuous Salbutamol neb, Ipratropium, Methylprednisolone 125mg IV' },
                { name: 'Pneumothorax', name_ar: 'استرواح الصدر', icd: 'J93.9', symptoms: 'Sudden pleuritic pain, dyspnea, decreased breath sounds', treatment: 'Needle decompression if tension, chest tube, CXR, O2, admit' },
                { name: 'Hypoglycemia', name_ar: 'انخفاض السكر', icd: 'E16.2', symptoms: 'Tremor, sweating, confusion, tachycardia, glucose <70', treatment: 'Conscious: 15g oral glucose. Unconscious: Dextrose 50% IV or Glucagon IM' }
            ],
            'Cardiology / القلب': [
                { name: 'Stable Angina', name_ar: 'ذبحة صدرية مستقرة', icd: 'I20.9', symptoms: 'Exertional chest pain, relieved by rest/nitroglycerin', treatment: 'Aspirin 81mg, Atenolol 50mg, Nitroglycerin SL PRN, stress test' },
                { name: 'Atrial Fibrillation', name_ar: 'رجفان أذيني', icd: 'I48.9', symptoms: 'Palpitations, irregular pulse, fatigue, dyspnea', treatment: 'Metoprolol 50mg BID, Rivaroxaban 20mg if CHA2DS2-VASc 2+, echo' },
                { name: 'Hypertensive Crisis', name_ar: 'نوبة ارتفاع ضغط حادة', icd: 'I16.0', symptoms: 'BP >180/120, headache, visual changes, chest pain', treatment: 'Nicardipine IV, lower BP 25% in first hour, ICU/CCU monitoring' },
                { name: 'Acute Coronary Syndrome - NSTEMI', name_ar: 'متلازمة شريانية حادة - احتشاء بدون ارتفاع ST', icd: 'I21.4', symptoms: 'Chest pain at rest, troponin elevated, ST depression/T-wave inversion, GRACE score', treatment: 'Aspirin 300mg + Clopidogrel 300mg, Enoxaparin, Atorvastatin 80mg, cardiology/cath within 72hrs' },
                { name: 'Acute MI - STEMI', name_ar: 'احتشاء حاد مع ارتفاع ST', icd: 'I21.9', symptoms: 'Severe crushing chest pain >20min, ST elevation ≥2 leads, troponin rising, diaphoresis', treatment: 'EMERGENCY: Aspirin+Clopidogrel+Heparin, primary PCI <90min or thrombolysis <30min, CCU admission' },
                { name: 'Heart Failure - Acute Decompensated', name_ar: 'فشل قلبي حاد', icd: 'I50.9', symptoms: 'Acute dyspnea, orthopnea, PND, bilateral crackles, elevated JVP, peripheral edema, BNP elevated', treatment: 'IV Furosemide 40-80mg, O2, Nitroglycerin if SBP>110, restrict fluids, ACEi, monitor UO, cardiology' },
                { name: 'Heart Failure - Chronic', name_ar: 'فشل قلبي مزمن', icd: 'I50.0', symptoms: 'Exertional dyspnea, fatigue, bilateral ankle edema, NYHA classification, reduced EF', treatment: 'ACEi/ARB, Bisoprolol, Spironolactone, Furosemide, SGLT2i (Dapagliflozin), fluid restriction, cardiac rehab' },
                { name: 'Atrial Fibrillation', name_ar: 'رجفان أذيني', icd: 'I48.9', symptoms: 'Irregular palpitations, dyspnea, dizziness, irregularly irregular pulse, absent P waves on ECG', treatment: 'Rate control: Bisoprolol/Diltiazem, CHA2DS2-VASc score, Rivaroxaban/Warfarin if ≥2, cardioversion if acute' },
                { name: 'Supraventricular Tachycardia', name_ar: 'تسارع فوق بطيني', icd: 'I47.1', symptoms: 'Sudden palpitations, regular tachycardia >150bpm, lightheadedness, narrow QRS, abrupt onset/offset', treatment: 'Vagal maneuvers first, Adenosine 6mg IV rapid push (12mg if no response), Verapamil, electrophysiology' },
                { name: 'Hypertensive Crisis', name_ar: 'أزمة ارتفاع ضغط الدم', icd: 'I16.1', symptoms: 'SBP>180 or DBP>120, headache, visual changes, chest pain, end-organ damage signs', treatment: 'IV Labetalol or Nicardipine if emergency, Amlodipine 10mg PO if urgency, gradual reduction, monitor q15min' },
                { name: 'Pericarditis - Acute', name_ar: 'التهاب التامور الحاد', icd: 'I30.9', symptoms: 'Sharp pleuritic chest pain worse supine/improved sitting forward, pericardial rub, diffuse ST elevation', treatment: 'Ibuprofen 600mg TID + Colchicine 0.5mg BD x3months, avoid exercise, Echo if effusion suspected' },
                { name: 'Valvular Heart Disease - Aortic Stenosis', name_ar: 'تضيق الصمام الأبهري', icd: 'I35.0', symptoms: 'Exertional dyspnea, angina, syncope, systolic ejection murmur radiating to carotids, narrow pulse pressure', treatment: 'Echo assessment, TAVR or surgical AVR if symptomatic/severe, avoid vasodilators, regular follow-up' }
            ],
            'Urology / المسالك البولية': [
                { name: 'Renal Colic', name_ar: 'مغص كلوي (حصوات)', icd: 'N20.0', symptoms: 'Severe colicky flank pain to groin, hematuria, nausea', treatment: 'Ketorolac 30mg IV, Tamsulosin 0.4mg, hydration, CT KUB, urology referral if >6mm' },
                { name: 'BPH', name_ar: 'تضخم البروستاتا', icd: 'N40.0', symptoms: 'Frequency, urgency, nocturia, weak stream, incomplete emptying', treatment: 'Tamsulosin 0.4mg HS, Finasteride 5mg, PSA, IPSS, urology F/U' },
                { name: 'Acute Pyelonephritis', name_ar: 'التهاب الكلى الحاد', icd: 'N10', symptoms: 'High fever, chills, flank pain, CVA tenderness, dysuria', treatment: 'Ciprofloxacin 500mg BID x14d, blood/urine cultures, hydration' },
                { name: 'Benign Prostatic Hyperplasia', name_ar: 'تضخم البروستات الحميد', icd: 'N40.0', symptoms: 'Frequency, urgency, weak stream, nocturia, incomplete emptying, IPSS score', treatment: 'Tamsulosin 0.4mg nocte, Finasteride 5mg if large, IPSS monitoring, TURP if severe, PSA screening' },
                { name: 'Prostatitis - Acute', name_ar: 'التهاب البروستات الحاد', icd: 'N41.0', symptoms: 'Fever, perineal pain, dysuria, frequency, tender boggy prostate on DRE, elevated WBC', treatment: 'Ciprofloxacin 500mg BD x4wks or TMP/SMX, Paracetamol, sitz baths, urine culture' },
                { name: 'Erectile Dysfunction', name_ar: 'ضعف الانتصاب', icd: 'N52.9', symptoms: 'Inability to achieve/maintain erection, associated with DM, HTN, smoking, medications', treatment: 'Sildenafil 50mg PRN (1hr before), lifestyle changes, testosterone if low, screen CVD, psychology' },
                { name: 'Testicular Torsion', name_ar: 'التواء الخصية', icd: 'N44.0', symptoms: 'EMERGENCY: Sudden severe testicular pain, nausea, high-riding testis, absent cremasteric reflex', treatment: 'EMERGENCY: Manual detorsion attempt, surgical exploration within 6hrs, US Doppler, urology stat' },
                { name: 'Hydrocele', name_ar: 'قيلة مائية', icd: 'N43.3', symptoms: 'Painless scrotal swelling, transilluminant, fluctuant, no tenderness usually', treatment: 'Observation if small/asymptomatic, surgical hydrocelectomy if large/symptomatic, US scrotum' },
                { name: 'Varicocele', name_ar: 'دوالي الخصية', icd: 'I86.1', symptoms: 'Scrotal heaviness/dull ache, "bag of worms" palpation, worse standing, may cause infertility', treatment: 'Observation if mild, surgical varicocelectomy if symptomatic/infertility, semen analysis' }
            ],
            'Psychiatry / الطب النفسي': [
                { name: 'Major Depressive Disorder', name_ar: 'اضطراب اكتئابي رئيسي', icd: 'F32.9', symptoms: 'Depressed mood >2w, anhedonia, sleep/appetite changes, hopelessness', treatment: 'Sertraline 50mg daily, CBT referral, safety assessment, F/U 2 weeks' },
                { name: 'Generalized Anxiety Disorder', name_ar: 'اضطراب القلق العام', icd: 'F41.1', symptoms: 'Excessive worry >6m, restlessness, muscle tension, insomnia', treatment: 'Escitalopram 10mg daily, CBT, relaxation, regular exercise' },
                { name: 'Insomnia', name_ar: 'اضطراب الأرق', icd: 'G47.0', symptoms: 'Difficulty initiating/maintaining sleep, daytime impairment', treatment: 'Sleep hygiene, CBT-I, Melatonin 3mg HS, Trazodone 50mg if persistent' },
                { name: 'Panic Disorder', name_ar: 'اضطراب الهلع', icd: 'F41.0', symptoms: 'Recurrent panic attacks: palpitations, sweating, trembling, SOB', treatment: 'Sertraline 25-100mg, Alprazolam 0.25mg PRN short-term, CBT' },
                { name: 'Major Depressive Disorder', name_ar: 'اكتئاب شديد', icd: 'F32.2', symptoms: 'Persistent low mood, anhedonia, sleep/appetite change, fatigue, worthlessness, suicidal ideation, PHQ-9>15', treatment: 'Sertraline 50mg or Escitalopram 10mg, CBT referral, safety plan, follow-up 2wks, PHQ-9 monitoring' },
                { name: 'Bipolar Disorder', name_ar: 'اضطراب ثنائي القطب', icd: 'F31.9', symptoms: 'Alternating mania (grandiosity, decreased sleep, pressured speech) and depression episodes', treatment: 'Lithium 300mg BD (monitor levels), Valproate, Quetiapine, mood charting, psychiatry referral' },
                { name: 'Panic Disorder', name_ar: 'اضطراب الهلع', icd: 'F41.0', symptoms: 'Recurrent unexpected panic attacks, palpitations, chest pain, SOB, dizziness, derealization, fear of dying', treatment: 'Sertraline 50mg, CBT with exposure, breathing retraining, Alprazolam 0.5mg PRN (short-term only)' },
                { name: 'PTSD', name_ar: 'اضطراب ما بعد الصدمة', icd: 'F43.1', symptoms: 'Flashbacks, nightmares, avoidance, hypervigilance, emotional numbing, after traumatic event', treatment: 'Trauma-focused CBT, EMDR, Sertraline 50-200mg, Prazosin for nightmares, psychology referral' },
                { name: 'ADHD', name_ar: 'اضطراب فرط الحركة وتشتت الانتباه', icd: 'F90.0', symptoms: 'Inattention, hyperactivity, impulsivity, onset before 12yo, symptoms in 2+ settings', treatment: 'Methylphenidate 10mg AM, behavioral strategies, school accommodation, parental training, monitor growth' },
                { name: 'Autism Spectrum Disorder', name_ar: 'اضطراب طيف التوحد', icd: 'F84.0', symptoms: 'Social communication deficits, restricted/repetitive behaviors, early onset, developmental delay', treatment: 'ABA therapy, speech therapy, OT, social skills training, special education, psychiatry if comorbid' },
                { name: 'Schizophrenia', name_ar: 'انفصام الشخصية', icd: 'F20.9', symptoms: 'Hallucinations, delusions, disorganized thinking/behavior, negative symptoms, onset 15-35yo', treatment: 'Risperidone 2mg daily or Olanzapine 10mg, CBT for psychosis, family psychoeducation, monitor metabolic' },
                { name: 'Eating Disorder - Anorexia', name_ar: 'فقدان الشهية العصبي', icd: 'F50.0', symptoms: 'BMI<17.5, fear of weight gain, body image distortion, amenorrhea, restrictive eating', treatment: 'Medical stabilization, nutritional rehabilitation, FBT (adolescents), CBT-E, psychiatry, monitor BMI/labs' }
            ],
            'OB/GYN / النساء والتوليد': [
                { name: 'Dysmenorrhea', name_ar: 'عسر الطمث', icd: 'N94.6', symptoms: 'Crampy lower abdominal pain with menses, backache, nausea', treatment: 'Ibuprofen 400mg TID before menses, heat pad, OCP if recurrent' },
                { name: 'Vaginal Candidiasis', name_ar: 'التهاب مهبلي فطري', icd: 'B37.3', symptoms: 'Vulvar itching, thick white discharge, erythema, dysuria', treatment: 'Fluconazole 150mg single dose PO, Clotrimazole vaginal cream x7d' },
                { name: 'PCOS', name_ar: 'تكيس المبايض', icd: 'E28.2', symptoms: 'Irregular menses, hirsutism, acne, obesity, infertility', treatment: 'Weight loss, Metformin 500mg BID, OCP for cycles, US pelvis' },
                { name: 'UTI in Pregnancy', name_ar: 'التهاب مسالك أثناء الحمل', icd: 'O23.1', symptoms: 'Dysuria, frequency, urgency in pregnant patient', treatment: 'Nitrofurantoin 100mg BID x7d (avoid 3rd trimester), urine culture' },
                { name: 'Normal Pregnancy (First Trimester)', name_ar: 'حمل طبيعي (الثلث الأول)', icd: 'Z34.0', symptoms: 'Amenorrhea, nausea, breast tenderness, fatigue, positive hCG', treatment: 'Folic acid 5mg daily, booking labs, dating US, avoid teratogens, next visit 4 weeks' },
                { name: 'Normal Pregnancy (Second Trimester)', name_ar: 'حمل طبيعي (الثلث الثاني)', icd: 'Z34.0', symptoms: 'Quickening, growing abdomen, decreased nausea', treatment: 'Iron+calcium supplements, anatomy scan 18-22w, GCT 24-28w, continue folic acid' },
                { name: 'Normal Pregnancy (Third Trimester)', name_ar: 'حمل طبيعي (الثلث الثالث)', icd: 'Z34.0', symptoms: 'Large abdomen, Braxton Hicks, backache, edema, fetal movement', treatment: 'Growth US, weekly NST from 36w, GBS screen 35-37w, birth plan, kick count' },
                { name: 'Hyperemesis Gravidarum', name_ar: 'القيء الحملي المفرط', icd: 'O21.0', symptoms: 'Severe persistent vomiting, weight loss >5%, dehydration, ketosis', treatment: 'IV fluids NS+KCl, Ondansetron 4mg IV, Thiamine 100mg, NPO then bland diet, admit if severe' },
                { name: 'Gestational Diabetes', name_ar: 'سكري الحمل', icd: 'O24.4', symptoms: 'Abnormal GCT/GTT, polyuria, polydipsia, macrosomia on US', treatment: 'Diet control, glucose monitoring QID, Insulin if FBS>95 or 2h PP>120, growth US Q4w' },
                { name: 'Preeclampsia (Mild)', name_ar: 'تسمم الحمل الخفيف', icd: 'O14.0', symptoms: 'BP >=140/90 after 20w, proteinuria, mild edema, no symptoms', treatment: 'BP monitoring BID, 24h urine protein, CBC/LFT/Cr weekly, Aspirin 150mg, NST 2x/week' },
                { name: 'Preeclampsia (Severe)', name_ar: 'تسمم الحمل الشديد', icd: 'O14.1', symptoms: 'BP >=160/110, proteinuria >5g/24h, headache, visual changes, epigastric pain, HELLP', treatment: 'MgSO4 loading+maintenance, Labetalol/Nifedipine, Dexamethasone if <34w, deliver if >=37w or worsening' },
                { name: 'Eclampsia', name_ar: 'الإرجاج (تشنجات الحمل)', icd: 'O15.0', symptoms: 'Seizures in preeclamptic patient, unresponsive, postictal', treatment: 'MgSO4 4g IV then 1g/hr, secure airway, O2, emergency delivery after stabilization' },
                { name: 'Placenta Previa', name_ar: 'المشيمة المنزاحة', icd: 'O44.1', symptoms: 'Painless vaginal bleeding 2nd/3rd trimester, low-lying placenta on US', treatment: 'Bedrest, avoid intercourse, steroids if <34w, type & screen, planned C/S at 37-38w' },
                { name: 'Placental Abruption', name_ar: 'انفصال المشيمة المبكر', icd: 'O45.9', symptoms: 'Painful vaginal bleeding, rigid abdomen, fetal distress, hypovolemia', treatment: 'Large bore IV, blood crossmatch, continuous CTG, emergency C/S if severe, manage DIC' },
                { name: 'Ectopic Pregnancy', name_ar: 'حمل خارج الرحم', icd: 'O00.9', symptoms: 'Amenorrhea, unilateral pelvic pain, vaginal bleeding, positive hCG, empty uterus on US', treatment: 'If stable: Methotrexate 50mg/m2 IM. If unstable: emergency laparoscopy, blood crossmatch' },
                { name: 'Threatened Abortion', name_ar: 'إجهاض منذر', icd: 'O20.0', symptoms: 'Vaginal bleeding <20w, closed cervix, viable fetus on US, mild cramps', treatment: 'Bedrest, Progesterone 400mg PV, avoid intercourse, repeat US in 1 week, Rh immunoglobulin if Rh-neg' },
                { name: 'Missed Abortion', name_ar: 'إجهاض فائت', icd: 'O02.1', symptoms: 'No fetal heartbeat on US, uterus smaller than dates, brown discharge', treatment: 'Options: expectant, Misoprostol 800mcg PV, or surgical evacuation (D&C), Rh immunoglobulin' },
                { name: 'Incomplete Abortion', name_ar: 'إجهاض ناقص', icd: 'O03.4', symptoms: 'Heavy bleeding, open cervix, retained products on US, cramping', treatment: 'Surgical evacuation (MVA/D&C), Oxytocin 20IU in NS, antibiotics if infected, CBC' },
                { name: 'Preterm Labor', name_ar: 'ولادة مبكرة', icd: 'O60.0', symptoms: 'Regular contractions <37w, cervical dilation/effacement, PPROM possible', treatment: 'Tocolysis (Nifedipine 20mg Q20min x3), Betamethasone 12mg IM x2 (24h apart), MgSO4 neuroprotection if <32w, antibiotics' },
                { name: 'PROM (Term)', name_ar: 'تمزق الأغشية المبكر', icd: 'O42.0', symptoms: 'Gush of fluid, positive pooling/ferning/Nitrazine, no contractions', treatment: 'GBS prophylaxis, induction with Oxytocin within 12-24h, continuous CTG, antibiotics if GBS+' },
                { name: 'PPROM (Preterm)', name_ar: 'تمزق الأغشية المبكر قبل الأوان', icd: 'O42.1', symptoms: 'Preterm fluid leak <37w, positive pooling, oligohydramnios on US', treatment: 'Latency antibiotics (Ampicillin+Azithromycin), steroids, no tocolysis, monitor for chorioamnionitis' },
                { name: 'IUGR / FGR', name_ar: 'تأخر نمو الجنين', icd: 'O36.5', symptoms: 'EFW <10th percentile, reduced AC, oligohydramnios, abnormal Dopplers', treatment: 'Serial growth US Q2w, umbilical artery Doppler, twice weekly NST, deliver 37-38w or earlier if abnormal' },
                { name: 'Postpartum Hemorrhage', name_ar: 'نزيف ما بعد الولادة', icd: 'O72.1', symptoms: 'Blood loss >500ml (NVD) or >1000ml (CS), tachycardia, hypotension, boggy uterus', treatment: 'Uterine massage, Oxytocin 40IU IV, Misoprostol 1000mcg PR, Tranexamic acid 1g IV, balloon tamponade' },
                { name: 'Puerperal Sepsis', name_ar: 'إنتان النفاس', icd: 'O85', symptoms: 'Fever >38°C postpartum, uterine tenderness, foul lochia, tachycardia', treatment: 'IV Ampicillin+Gentamicin+Metronidazole, blood cultures, fluid resuscitation, remove retained products' },
                { name: 'Mastitis', name_ar: 'التهاب الثدي', icd: 'O91.1', symptoms: 'Breast pain, redness, fever, flu-like symptoms, breastfeeding difficulties', treatment: 'Continue breastfeeding, Dicloxacillin 500mg QID x10d, warm compresses, I&D if abscess' },
                { name: 'Uterine Fibroids', name_ar: 'أورام ليفية رحمية', icd: 'D25.9', symptoms: 'Heavy menstrual bleeding, pelvic pressure, urinary frequency, enlarged uterus', treatment: 'NSAIDs for pain, OCP/Mirena IUD, GnRH agonist, myomectomy or hysterectomy if severe' },
                { name: 'Endometriosis', name_ar: 'بطانة الرحم المهاجرة', icd: 'N80.9', symptoms: 'Chronic pelvic pain, dysmenorrhea, dyspareunia, infertility, cyclical symptoms', treatment: 'NSAIDs, combined OCP continuous, GnRH agonist, laparoscopic excision, fertility treatment' },
                { name: 'Ovarian Cyst', name_ar: 'كيس المبيض', icd: 'N83.2', symptoms: 'Unilateral pelvic pain, fullness, irregular menses, US findings', treatment: 'If <5cm: follow-up US in 6-8 weeks. If >5cm or complex: tumor markers (CA-125), laparoscopy' },
                { name: 'PID (Pelvic Inflammatory Disease)', name_ar: 'التهاب الحوض', icd: 'N73.0', symptoms: 'Lower abdominal pain, fever, vaginal discharge, cervical motion tenderness', treatment: 'Ceftriaxone 250mg IM + Doxycycline 100mg BID x14d + Metronidazole 500mg BID x14d' },
                { name: 'Bacterial Vaginosis', name_ar: 'التهاب مهبلي بكتيري', icd: 'N76.0', symptoms: 'Thin grayish discharge, fishy odor, positive whiff test, clue cells', treatment: 'Metronidazole 500mg BID x7d or Metronidazole gel PV x5d' },
                { name: 'Menorrhagia', name_ar: 'غزارة الطمث', icd: 'N92.0', symptoms: 'Heavy menstrual bleeding >80ml/cycle, clots, anemia', treatment: 'Tranexamic acid 1g TID during menses, Mirena IUD, combined OCP, investigate cause (US, biopsy)' },
                { name: 'Amenorrhea', name_ar: 'انقطاع الطمث', icd: 'N91.2', symptoms: 'Absence of menses >3 months, rule out pregnancy, evaluate hormones', treatment: 'Check: pregnancy test, TSH, Prolactin, FSH/LH, US pelvis, Progesterone challenge test' },
                { name: 'Menopause', name_ar: 'سن اليأس', icd: 'N95.1', symptoms: 'Hot flashes, night sweats, vaginal dryness, mood changes, irregular menses >12m', treatment: 'HRT (if indicated), vaginal estrogen for atrophy, calcium+Vit D, DEXA scan, lifestyle modification' },
                { name: 'Cervical Dysplasia (CIN)', name_ar: 'خلل التنسج العنقي', icd: 'N87.9', symptoms: 'Abnormal Pap smear, HPV positive, usually asymptomatic', treatment: 'Colposcopy + biopsy, CIN1: follow-up, CIN2-3: LEEP/cone biopsy, HPV vaccination' },
                { name: 'Breast Lump Evaluation', name_ar: 'تقييم كتلة بالثدي', icd: 'N63', symptoms: 'Palpable breast mass, +/- pain, nipple discharge', treatment: 'Triple assessment: clinical exam + US/mammogram + FNA/core biopsy, refer if suspicious' }
            ],
            'Neurology / الأعصاب': [
                { name: 'Migraine without Aura', name_ar: 'صداع نصفي بدون هالة', icd: 'G43.0', symptoms: 'Unilateral throbbing headache, nausea, photophobia, phonophobia, 4-72hrs', treatment: 'Sumatriptan 50mg PRN, Paracetamol 1g, dark room, prophylaxis: Propranolol 40mg BD' },
                { name: 'Migraine with Aura', name_ar: 'صداع نصفي مع هالة', icd: 'G43.1', symptoms: 'Visual aura (zigzag lines, scotoma) 20-60min before headache, unilateral', treatment: 'Sumatriptan 50mg at aura onset, avoid triggers, prophylaxis: Topiramate 25mg' },
                { name: 'Tension-Type Headache', name_ar: 'صداع التوتر', icd: 'G44.2', symptoms: 'Bilateral pressing/tightening, mild-moderate, no nausea/vomiting', treatment: 'Paracetamol 1g or Ibuprofen 400mg, stress management, physiotherapy' },
                { name: 'Cluster Headache', name_ar: 'صداع عنقودي', icd: 'G44.0', symptoms: 'Severe unilateral orbital/temporal pain, lacrimation, rhinorrhea, 15-180min, clusters', treatment: 'O2 100% 12L/min via mask, Sumatriptan 6mg SC, Verapamil prophylaxis' },
                { name: 'Epilepsy - Generalized Tonic-Clonic', name_ar: 'صرع توتري رمعي معمم', icd: 'G40.3', symptoms: 'Loss of consciousness, tonic stiffening, clonic jerking, postictal confusion', treatment: 'Valproate 500mg BD or Levetiracetam 500mg BD, seizure precautions, EEG' },
                { name: 'Epilepsy - Absence Seizures', name_ar: 'صرع غيابي', icd: 'G40.0', symptoms: 'Brief staring episodes, eyelid fluttering, unresponsive 10-30sec, mainly children', treatment: 'Ethosuximide 250mg BD or Valproate, EEG with hyperventilation' },
                { name: 'Stroke - Ischemic', name_ar: 'سكتة دماغية إقفارية', icd: 'I63.9', symptoms: 'Sudden hemiparesis, facial droop, speech difficulty, FAST positive', treatment: 'EMERGENCY: tPA if <4.5hrs, Aspirin 300mg, CT head stat, admission, Neurology' },
                { name: 'Stroke - Hemorrhagic', name_ar: 'سكتة دماغية نزفية', icd: 'I61.9', symptoms: 'Sudden severe headache, vomiting, rapidly deteriorating consciousness, hypertension', treatment: 'EMERGENCY: CT stat, BP control, reverse anticoagulants, Neurosurgery consult' },
                { name: 'TIA - Transient Ischemic Attack', name_ar: 'نوبة إقفارية عابرة', icd: 'G45.9', symptoms: 'Transient neurological deficit <24hrs, hemiparesis, speech, vision, fully resolves', treatment: 'Aspirin 300mg, Clopidogrel 75mg, CT/MRI, carotid duplex, ABCD2 score' },
                { name: 'Bell Palsy', name_ar: 'شلل بل (شلل العصب الوجهي)', icd: 'G51.0', symptoms: 'Acute unilateral facial weakness, inability to close eye, drooling, taste loss', treatment: 'Prednisolone 50mg x 10 days, eye protection, artificial tears, Acyclovir if HSV' },
                { name: 'Carpal Tunnel Syndrome', name_ar: 'متلازمة النفق الرسغي', icd: 'G56.0', symptoms: 'Numbness/tingling in thumb, index, middle fingers, worse at night, Tinel/Phalen positive', treatment: 'Wrist splint at night, NSAIDs, steroid injection, NCS/EMG, surgery if severe' },
                { name: 'Parkinson Disease', name_ar: 'مرض باركنسون', icd: 'G20', symptoms: 'Resting tremor, bradykinesia, rigidity, postural instability, masked facies', treatment: 'Levodopa/Carbidopa 100/25 TID, Pramipexole, physiotherapy, OT referral' },
                { name: 'Multiple Sclerosis', name_ar: 'التصلب اللويحي المتعدد', icd: 'G35', symptoms: 'Optic neuritis, limb weakness, sensory changes, fatigue, Lhermitte sign, relapsing-remitting', treatment: 'IV Methylprednisolone for relapse, DMT: Interferon beta/Fingolimod, MRI monitoring' },
                { name: 'Trigeminal Neuralgia', name_ar: 'ألم العصب الثلاثي التوائم', icd: 'G50.0', symptoms: 'Electric shock-like facial pain, V2/V3 distribution, triggered by touch/eating/wind', treatment: 'Carbamazepine 100mg BD titrate up, Gabapentin, MRI brain, surgical options' },
                { name: 'Sciatica', name_ar: 'عرق النسا', icd: 'M54.3', symptoms: 'Radiating pain from lower back to leg, positive SLR, dermatomal distribution, weakness', treatment: 'NSAIDs, Pregabalin 75mg BD, physiotherapy, MRI if red flags, epidural injection' },
                { name: 'Meningitis - Bacterial', name_ar: 'التهاب السحايا الجرثومي', icd: 'G00.9', symptoms: 'Fever, severe headache, neck stiffness, photophobia, rash (Meningococcal), Kernig/Brudzinski', treatment: 'EMERGENCY: Ceftriaxone 2g IV stat, Dexamethasone, LP, blood cultures, admission ICU' },
                { name: 'Vertigo - BPPV', name_ar: 'دوار وضعي انتيابي حميد', icd: 'H81.1', symptoms: 'Brief spinning with head position change, positive Dix-Hallpike, nystagmus, no hearing loss', treatment: 'Epley maneuver, Brandt-Daroff exercises, Betahistine 16mg TID, avoid triggers' },
                { name: 'Myasthenia Gravis', name_ar: 'الوهن العضلي الوبيل', icd: 'G70.0', symptoms: 'Fluctuating weakness, ptosis, diplopia, dysphagia, worse with exertion, improves with rest', treatment: 'Pyridostigmine 60mg TID, Prednisolone, Azathioprine, CT chest (thymoma), crisis plan' }
            ],
            'Pulmonology / الصدرية': [
                { name: 'Asthma - Mild Intermittent', name_ar: 'ربو متقطع خفيف', icd: 'J45.0', symptoms: 'Wheeze <2x/week, night symptoms <2x/month, normal FEV1, no activity limitation', treatment: 'SABA PRN (Salbutamol 2 puffs), no controller needed, peak flow monitoring' },
                { name: 'Asthma - Moderate Persistent', name_ar: 'ربو مستمر متوسط', icd: 'J45.1', symptoms: 'Daily symptoms, night symptoms >1x/week, FEV1 60-80%, some activity limitation', treatment: 'ICS/LABA (Seretide 250/50 BD), SABA PRN, spacer device, action plan' },
                { name: 'Asthma - Acute Exacerbation', name_ar: 'نوبة ربو حادة', icd: 'J46', symptoms: 'Severe dyspnea, wheeze, unable to complete sentences, tachycardia, low O2 sat', treatment: 'Salbutamol nebulizer 5mg q20min x3, Ipratropium, Prednisolone 40mg, O2, admit if severe' },
                { name: 'COPD', name_ar: 'مرض الانسداد الرئوي المزمن', icd: 'J44.1', symptoms: 'Chronic cough, sputum, dyspnea on exertion, smoking history, barrel chest, decreased air entry', treatment: 'Tiotropium 18mcg daily, ICS/LABA, Salbutamol PRN, smoking cessation, pulmonary rehab' },
                { name: 'COPD Acute Exacerbation', name_ar: 'تفاقم حاد للانسداد الرئوي', icd: 'J44.0', symptoms: 'Increased dyspnea, increased sputum volume/purulence, wheeze, hypoxia', treatment: 'Nebulized bronchodilators, Prednisolone 40mg x5d, Antibiotics (Amoxicillin-Clav), O2 target 88-92%' },
                { name: 'Pneumonia - Community Acquired', name_ar: 'التهاب رئوي مكتسب من المجتمع', icd: 'J18.9', symptoms: 'Fever, productive cough, dyspnea, pleuritic pain, crackles, consolidation on CXR', treatment: 'Amoxicillin 1g TID + Azithromycin 500mg daily, or Levofloxacin 750mg daily, CXR, CBC' },
                { name: 'Pneumonia - Hospital Acquired', name_ar: 'التهاب رئوي مكتسب من المستشفى', icd: 'J18.1', symptoms: 'New fever/infiltrate >48hrs after admission, purulent sputum, hypoxia', treatment: 'Piperacillin-Tazobactam + Vancomycin, cultures before antibiotics, CXR, procalcitonin' },
                { name: 'Pulmonary Embolism', name_ar: 'انسداد رئوي (جلطة رئوية)', icd: 'I26.9', symptoms: 'Sudden dyspnea, pleuritic chest pain, tachycardia, hemoptysis, DVT risk factors, Wells score', treatment: 'EMERGENCY: CTPA, Heparin/Enoxaparin, Warfarin/DOAC, thrombolysis if massive, O2' },
                { name: 'Pleural Effusion', name_ar: 'انصباب جنبي', icd: 'J90', symptoms: 'Dyspnea, decreased breath sounds, dullness to percussion, CXR: meniscus sign', treatment: 'Diagnostic thoracentesis, treat underlying cause, therapeutic drainage if large, CT chest' },
                { name: 'Pneumothorax', name_ar: 'استرواح صدري', icd: 'J93.9', symptoms: 'Sudden pleuritic pain, dyspnea, decreased breath sounds, hyperresonant, tracheal deviation if tension', treatment: 'Small: observation + O2, Large: chest tube, Tension: needle decompression + chest tube stat' },
                { name: 'Tuberculosis - Pulmonary', name_ar: 'سل رئوي', icd: 'A15.0', symptoms: 'Chronic cough >2wks, hemoptysis, night sweats, weight loss, upper lobe infiltrates', treatment: 'RIPE: Rifampin+Isoniazid+Pyrazinamide+Ethambutol x2m then RI x4m, sputum AFB, isolation' },
                { name: 'Sleep Apnea - Obstructive', name_ar: 'انقطاع النفس الانسدادي أثناء النوم', icd: 'G47.33', symptoms: 'Snoring, witnessed apneas, daytime somnolence, morning headache, BMI>30, Epworth >10', treatment: 'CPAP therapy, weight loss, sleep hygiene, polysomnography, ENT evaluation' },
                { name: 'Bronchitis - Acute', name_ar: 'التهاب شعب هوائية حاد', icd: 'J20.9', symptoms: 'Cough with/without sputum, chest discomfort, low fever, no consolidation on CXR', treatment: 'Supportive: fluids, rest, honey, Dextromethorphan PRN, Albuterol if wheezing, NO antibiotics if viral' }
            ],
            'Gastroenterology / الجهاز الهضمي': [
                { name: 'GERD', name_ar: 'ارتجاع المريء', icd: 'K21.0', symptoms: 'Heartburn, acid regurgitation, worse postprandial/supine, dysphagia, chronic cough', treatment: 'Omeprazole 20mg before breakfast x8wks, lifestyle: elevate HOB, avoid triggers, weight loss' },
                { name: 'Peptic Ulcer - Gastric', name_ar: 'قرحة معدية', icd: 'K25.9', symptoms: 'Epigastric pain worse with meals, nausea, bloating, weight loss, NSAID/H.pylori history', treatment: 'Omeprazole 40mg BD x4wks, H.pylori triple therapy if positive, stop NSAIDs, endoscopy' },
                { name: 'Peptic Ulcer - Duodenal', name_ar: 'قرحة اثني عشرية', icd: 'K26.9', symptoms: 'Epigastric pain relieved by meals/antacids, nocturnal pain, H.pylori common', treatment: 'Omeprazole 20mg BD + Amoxicillin 1g BD + Clarithromycin 500mg BD x14d, then PPI x4wks' },
                { name: 'Acute Gastroenteritis', name_ar: 'التهاب معدي معوي حاد', icd: 'K52.9', symptoms: 'Diarrhea, vomiting, abdominal cramps, fever, dehydration', treatment: 'ORS, IV fluids if dehydrated, Ondansetron 4mg for vomiting, BRAT diet, stool culture if bloody' },
                { name: 'Irritable Bowel Syndrome', name_ar: 'القولون العصبي', icd: 'K58.9', symptoms: 'Recurrent abdominal pain, bloating, altered bowel habit (constipation/diarrhea), relief with defecation', treatment: 'Mebeverine 135mg TID, fiber supplement, low FODMAP diet, CBT, Amitriptyline 10mg nocte' },
                { name: 'Inflammatory Bowel Disease - Crohn', name_ar: 'داء كرون', icd: 'K50.9', symptoms: 'Chronic diarrhea, abdominal pain, weight loss, perianal disease, fistulae, skip lesions', treatment: 'Mesalazine, Prednisolone for flares, Azathioprine, Infliximab, colonoscopy, GI referral' },
                { name: 'Inflammatory Bowel Disease - UC', name_ar: 'التهاب القولون التقرحي', icd: 'K51.9', symptoms: 'Bloody diarrhea, urgency, tenesmus, LLQ pain, continuous from rectum, toxic megacolon risk', treatment: 'Mesalazine 2.4g daily, Prednisolone for flares, Azathioprine, colonoscopy, GI referral' },
                { name: 'Cholelithiasis / Biliary Colic', name_ar: 'حصوات المرارة / مغص مراري', icd: 'K80.2', symptoms: 'RUQ colicky pain after fatty meals, nausea, vomiting, Murphy sign, US gallstones', treatment: 'NSAIDs (Diclofenac 75mg IM), Hyoscine, elective cholecystectomy, US abdomen' },
                { name: 'Acute Cholecystitis', name_ar: 'التهاب مرارة حاد', icd: 'K81.0', symptoms: 'RUQ pain >6hrs, fever, positive Murphy, elevated WBC, US: wall thickening/pericholecystic fluid', treatment: 'NPO, IV fluids, Ceftriaxone + Metronidazole, Piperacillin-Tazobactam, urgent cholecystectomy' },
                { name: 'Acute Pancreatitis', name_ar: 'التهاب بنكرياس حاد', icd: 'K85.9', symptoms: 'Severe epigastric pain radiating to back, vomiting, elevated amylase/lipase >3x, Ranson criteria', treatment: 'NPO, aggressive IV fluids, pain control (Morphine), monitor organ failure, CT if no improvement 72hrs' },
                { name: 'Hemorrhoids', name_ar: 'بواسير', icd: 'K64.9', symptoms: 'Rectal bleeding, anal itching/pain, prolapsing mass, constipation history', treatment: 'Fiber 25g/day, sitz baths, Daflon 1g BD x2wks, topical Proctosedyl, rubber band ligation if grade 2-3' },
                { name: 'Hepatitis B - Chronic', name_ar: 'التهاب كبد بائي مزمن', icd: 'B18.1', symptoms: 'Often asymptomatic, fatigue, RUQ discomfort, HBsAg+, elevated ALT, fibrosis', treatment: 'Tenofovir 300mg daily or Entecavir 0.5mg daily, monitor HBV DNA, fibroscan, HCC screening' },
                { name: 'Hepatitis C - Chronic', name_ar: 'التهاب كبد جيمي مزمن', icd: 'B18.2', symptoms: 'Often asymptomatic, fatigue, elevated ALT, HCV Ab+, HCV RNA detectable', treatment: 'Sofosbuvir/Ledipasvir (Harvoni) 1 tab daily x12wks, SVR12 check, genotype, fibroscan' },
                { name: 'Liver Cirrhosis', name_ar: 'تليف الكبد', icd: 'K74.6', symptoms: 'Jaundice, ascites, spider angiomas, palmar erythema, hepatomegaly, varices, INR elevated', treatment: 'Treat cause, Spironolactone 100mg for ascites, Propranolol for varices, HCC screening q6m, transplant eval' },
                { name: 'Celiac Disease', name_ar: 'مرض حساسية القمح (السيلياك)', icd: 'K90.0', symptoms: 'Chronic diarrhea, bloating, malabsorption, iron deficiency, dermatitis herpetiformis, failure to thrive in children', treatment: 'Strict gluten-free diet lifelong, nutritional supplementation, anti-tTG monitoring, dietitian referral' }
            ],
            'Nephrology / الكلى': [
                { name: 'Acute Kidney Injury', name_ar: 'إصابة كلوية حادة', icd: 'N17.9', symptoms: 'Oliguria, elevated creatinine, fluid overload, hyperkalemia, metabolic acidosis', treatment: 'IV fluids (if prerenal), stop nephrotoxins, K+ management, monitor UO, dialysis if severe' },
                { name: 'Chronic Kidney Disease', name_ar: 'فشل كلوي مزمن', icd: 'N18.9', symptoms: 'Fatigue, nausea, edema, hypertension, anemia, elevated creatinine/BUN, proteinuria', treatment: 'ACEi/ARB, BP control <130/80, DM control, low protein diet, EPO if anemic, dialysis planning' },
                { name: 'Urinary Tract Infection - Lower', name_ar: 'التهاب مسالك بولية سفلي', icd: 'N39.0', symptoms: 'Dysuria, frequency, urgency, suprapubic pain, cloudy/malodorous urine, positive dip', treatment: 'Nitrofurantoin 100mg BD x5d or TMP/SMX DS BD x3d, fluids, urine culture' },
                { name: 'Pyelonephritis', name_ar: 'التهاب الحويضة والكلية', icd: 'N10', symptoms: 'Fever, flank pain, CVA tenderness, nausea/vomiting, UTI symptoms, elevated WBC', treatment: 'Ciprofloxacin 500mg BD x7d or Ceftriaxone 1g IV, urine/blood cultures, US renal, IV fluids' },
                { name: 'Nephrolithiasis (Renal Stone)', name_ar: 'حصوات الكلى', icd: 'N20.0', symptoms: 'Severe colicky flank pain radiating to groin, hematuria, nausea/vomiting, restless', treatment: 'Diclofenac 75mg IM, Tamsulosin 0.4mg daily (MET), CT KUB, strain urine, urology if >10mm' },
                { name: 'Nephrotic Syndrome', name_ar: 'المتلازمة الكلوية', icd: 'N04.9', symptoms: 'Periorbital/peripheral edema, massive proteinuria >3.5g/day, hypoalbuminemia, hyperlipidemia', treatment: 'Prednisolone 1mg/kg, Furosemide, ACEi, low salt diet, anticoagulation, renal biopsy' },
                { name: 'Diabetic Nephropathy', name_ar: 'اعتلال الكلى السكري', icd: 'E11.22', symptoms: 'Microalbuminuria progressing to proteinuria, declining GFR, hypertension, DM history', treatment: 'ACEi/ARB, HbA1c <7%, BP <130/80, SGLT2 inhibitor, low protein diet, monitor GFR/UACR' }
            ],
            'Endocrinology / الغدد الصماء': [
                { name: 'Type 2 Diabetes Mellitus', name_ar: 'سكري النوع الثاني', icd: 'E11.9', symptoms: 'Polyuria, polydipsia, fatigue, blurred vision, HbA1c >6.5%, FBG >126', treatment: 'Metformin 500mg BD titrate, SGLT2i (Empagliflozin), lifestyle, HbA1c q3m, foot/eye screening' },
                { name: 'Type 1 Diabetes Mellitus', name_ar: 'سكري النوع الأول', icd: 'E10.9', symptoms: 'Young onset, polyuria, polydipsia, weight loss, DKA, positive GAD/IA2 antibodies', treatment: 'Basal-bolus insulin (Lantus + NovoRapid), CGMS, carb counting, DKA education, HbA1c <7%' },
                { name: 'Diabetic Ketoacidosis', name_ar: 'حماض كيتوني سكري', icd: 'E10.10', symptoms: 'Hyperglycemia >250, metabolic acidosis pH<7.3, ketonuria/ketonemia, Kussmaul breathing, dehydration', treatment: 'EMERGENCY: IV NS 1L/hr, Insulin infusion 0.1U/kg/hr, K+ replacement, monitor q1h, ICU admission' },
                { name: 'Hypothyroidism', name_ar: 'قصور الغدة الدرقية', icd: 'E03.9', symptoms: 'Fatigue, weight gain, cold intolerance, constipation, dry skin, bradycardia, elevated TSH', treatment: 'Levothyroxine 50-100mcg AM empty stomach, TSH check q6-8wks, titrate dose' },
                { name: 'Hyperthyroidism - Graves', name_ar: 'فرط نشاط الدرقية (قريفز)', icd: 'E05.0', symptoms: 'Weight loss, tremor, heat intolerance, palpitations, exophthalmos, goiter, low TSH, high T3/T4', treatment: 'Carbimazole 20mg daily, Propranolol 40mg TID, TFTs q4-6wks, consider RAI or surgery' },
                { name: 'Thyroid Nodule', name_ar: 'عقدة درقية', icd: 'E04.1', symptoms: 'Palpable neck mass, usually asymptomatic, compression symptoms if large, TFTs usually normal', treatment: 'US thyroid, FNA if >1cm or suspicious, TFTs, monitor if benign, surgery if suspicious/large' },
                { name: 'Cushing Syndrome', name_ar: 'متلازمة كوشنق', icd: 'E24.9', symptoms: 'Central obesity, moon face, buffalo hump, striae, hypertension, DM, proximal myopathy', treatment: '24hr cortisol, dexamethasone suppression test, MRI pituitary, CT adrenals, surgical excision' },
                { name: 'Addison Disease', name_ar: 'قصور الغدة الكظرية (أديسون)', icd: 'E27.1', symptoms: 'Fatigue, weight loss, hyperpigmentation, hypotension, hyponatremia, hyperkalemia', treatment: 'Hydrocortisone 15-20mg AM + 5-10mg PM, Fludrocortisone 0.1mg, sick day rules, MedicAlert' },
                { name: 'Hyperprolactinemia', name_ar: 'ارتفاع هرمون الحليب', icd: 'E22.1', symptoms: 'Galactorrhea, amenorrhea, infertility, decreased libido, visual field defects if macroadenoma', treatment: 'Cabergoline 0.25mg twice weekly, MRI pituitary, visual fields, prolactin level monitoring' },
                { name: 'PCOS', name_ar: 'متلازمة تكيس المبايض', icd: 'E28.2', symptoms: 'Oligomenorrhea, hirsutism, acne, obesity, infertility, US: polycystic ovaries, elevated testosterone', treatment: 'OCP (Diane 35), Metformin 500mg BD, weight loss, Spironolactone for hirsutism, Clomiphene for fertility' },
                { name: 'Osteoporosis', name_ar: 'هشاشة العظام', icd: 'M81.0', symptoms: 'Often asymptomatic until fracture, height loss, kyphosis, DEXA T-score ≤-2.5, fragility fractures', treatment: 'Alendronate 70mg weekly, Ca 1200mg + Vit D 800IU daily, weight-bearing exercise, fall prevention' }
            ],
            'Hematology / أمراض الدم': [
                { name: 'Iron Deficiency Anemia', name_ar: 'فقر دم نقص الحديد', icd: 'D50.9', symptoms: 'Fatigue, pallor, dyspnea, pica, koilonychia, low MCV/MCH, low ferritin, low iron', treatment: 'Ferrous sulfate 200mg TID with Vit C, investigate cause (GI bleed, menorrhagia), CBC follow-up' },
                { name: 'B12 Deficiency Anemia', name_ar: 'فقر دم نقص فيتامين ب12', icd: 'D51.9', symptoms: 'Fatigue, glossitis, neurological symptoms (numbness, ataxia), macrocytic anemia, low B12', treatment: 'Hydroxocobalamin 1mg IM alternate days x2wks then q2-3 months, B12 level monitoring' },
                { name: 'Sickle Cell Disease', name_ar: 'مرض الخلايا المنجلية', icd: 'D57.1', symptoms: 'Painful crises, acute chest syndrome, splenomegaly (children), jaundice, chronic hemolysis', treatment: 'Hydroxyurea 15mg/kg, folic acid, pain management, transfusion for ACS, pneumococcal vaccine' },
                { name: 'Thalassemia - Beta Major', name_ar: 'ثلاسيميا كبرى', icd: 'D56.1', symptoms: 'Severe anemia from 6 months, hepatosplenomegaly, bone deformities, transfusion dependent', treatment: 'Regular transfusions q3-4wks, Deferasirox chelation, folic acid, splenectomy if hypersplenism, BMT' },
                { name: 'Thrombocytopenia - ITP', name_ar: 'نقص صفائح مناعي', icd: 'D69.3', symptoms: 'Petechiae, purpura, epistaxis, gum bleeding, platelets <100K, no splenomegaly', treatment: 'Observation if mild, Prednisolone 1mg/kg if <30K or bleeding, IVIG, Eltrombopag, splenectomy' },
                { name: 'Deep Vein Thrombosis', name_ar: 'جلطة وريدية عميقة', icd: 'I82.4', symptoms: 'Unilateral leg swelling, pain, warmth, erythema, positive Wells score, US Doppler positive', treatment: 'Enoxaparin 1mg/kg SC BD, Warfarin/Rivaroxaban, compression stockings, 3-6 months anticoagulation' },
                { name: 'G6PD Deficiency', name_ar: 'نقص إنزيم G6PD', icd: 'D55.0', symptoms: 'Episodic hemolysis triggered by fava beans/drugs, jaundice, dark urine, anemia, reticulocytosis', treatment: 'Avoid triggers (fava, sulfonamides, dapsone), transfusion if severe, list of prohibited drugs' },
                { name: 'Leukemia - ALL (Acute)', name_ar: 'ابيضاض الدم الليمفاوي الحاد', icd: 'C91.0', symptoms: 'Fatigue, fever, bleeding, bone pain, lymphadenopathy, hepatosplenomegaly, pancytopenia', treatment: 'Urgent: Hematology referral, bone marrow biopsy, chemotherapy protocol, supportive care, transplant eval' }
            ],
            'Rheumatology / الروماتيزم': [
                { name: 'Rheumatoid Arthritis', name_ar: 'التهاب المفاصل الروماتيزمي', icd: 'M05.9', symptoms: 'Symmetric polyarthritis, morning stiffness >1hr, MCP/PIP swelling, RF/Anti-CCP positive', treatment: 'Methotrexate 7.5-25mg weekly + Folic acid, Prednisolone bridge, Hydroxychloroquine, biologics' },
                { name: 'Systemic Lupus Erythematosus', name_ar: 'الذئبة الحمراء', icd: 'M32.9', symptoms: 'Malar rash, joint pain, photosensitivity, oral ulcers, serositis, nephritis, ANA positive', treatment: 'Hydroxychloroquine 200mg BD, Prednisolone for flares, Mycophenolate for nephritis, sun protection' },
                { name: 'Gout - Acute', name_ar: 'نقرس حاد', icd: 'M10.9', symptoms: 'Acute monoarthritis (1st MTP), severe pain, redness, swelling, elevated uric acid, tophi', treatment: 'Colchicine 0.5mg BD or Indomethacin 50mg TID, NOT allopurinol during acute, rest, ice' },
                { name: 'Gout - Chronic/Prophylaxis', name_ar: 'نقرس مزمن / وقائي', icd: 'M10.0', symptoms: 'Recurrent gout attacks, tophi, elevated uric acid, renal stones', treatment: 'Allopurinol 100mg daily titrate to target urate <6, Colchicine 0.5mg daily prophylaxis x6m, diet' },
                { name: 'Osteoarthritis', name_ar: 'خشونة المفاصل', icd: 'M15.9', symptoms: 'Joint pain worse with activity, morning stiffness <30min, crepitus, bony enlargement, Heberden nodes', treatment: 'Paracetamol 1g QID, Topical Diclofenac, physiotherapy, weight loss, IA steroid injection, joint replacement' },
                { name: 'Ankylosing Spondylitis', name_ar: 'التهاب الفقار المقسط', icd: 'M45.9', symptoms: 'Low back pain/stiffness worse AM and improving with exercise, <40yo onset, HLA-B27, sacroiliitis', treatment: 'NSAIDs (Indomethacin), physiotherapy, Anti-TNF (Adalimumab) if inadequate response, MRI sacroiliac' },
                { name: 'Fibromyalgia', name_ar: 'الفيبروميالجيا (ألم عضلي ليفي)', icd: 'M79.7', symptoms: 'Widespread pain >3months, fatigue, sleep disturbance, cognitive fog, tender points, normal labs', treatment: 'Pregabalin 75mg BD, Duloxetine 60mg, graded exercise, CBT, sleep hygiene, reassurance' },
                { name: 'Psoriatic Arthritis', name_ar: 'التهاب مفاصل صدفي', icd: 'L40.50', symptoms: 'Asymmetric oligoarthritis, dactylitis, nail changes, psoriasis rash, enthesitis, DIP involvement', treatment: 'Methotrexate 15mg weekly, NSAIDs, Anti-TNF if inadequate, Apremilast, Dermatology co-management' }
            ],
            'Infectious Disease / الأمراض المعدية': [
                { name: 'COVID-19', name_ar: 'كوفيد-19', icd: 'U07.1', symptoms: 'Fever, cough, dyspnea, anosmia, myalgia, fatigue, sore throat, GI symptoms', treatment: 'Supportive care, Paracetamol, O2 if SpO2<94%, Dexamethasone if severe, antivirals per protocol' },
                { name: 'Influenza', name_ar: 'الإنفلونزا', icd: 'J10.1', symptoms: 'Sudden fever, myalgia, headache, cough, sore throat, fatigue, 3-7 day course', treatment: 'Oseltamivir 75mg BD x5d if <48hrs, Paracetamol, fluids, rest, influenza rapid test' },
                { name: 'Dengue Fever', name_ar: 'حمى الضنك', icd: 'A90', symptoms: 'High fever, severe headache, retro-orbital pain, myalgia, rash, thrombocytopenia, hemoconcentration', treatment: 'Supportive: IV fluids, Paracetamol (NO NSAIDs), monitor platelets/hematocrit, warning signs education' },
                { name: 'Malaria', name_ar: 'الملاريا', icd: 'B54', symptoms: 'Cyclic fever/chills/sweats, headache, hepatosplenomegaly, anemia, travel to endemic area', treatment: 'ACT (Artemether-Lumefantrine) x3d, thin/thick smear, species identification, G6PD if Primaquine needed' },
                { name: 'Brucellosis', name_ar: 'الحمى المالطية (البروسيلا)', icd: 'A23.9', symptoms: 'Undulant fever, sweats, arthralgia, hepatosplenomegaly, exposure to livestock/unpasteurized dairy', treatment: 'Doxycycline 100mg BD + Rifampicin 600mg daily x6wks, or Doxy + Gentamicin x3wks, serology' },
                { name: 'Cellulitis', name_ar: 'التهاب النسيج الخلوي', icd: 'L03.9', symptoms: 'Erythema, warmth, swelling, pain, well-demarcated border, fever, elevated WBC', treatment: 'Amoxicillin-Clavulanate 625mg TID or Cephalexin 500mg QID, mark borders, elevate limb, IV if severe' },
                { name: 'Herpes Zoster (Shingles)', name_ar: 'الحزام الناري', icd: 'B02.9', symptoms: 'Painful vesicular rash in dermatomal distribution, prodromal pain, unilateral, postherpetic neuralgia risk', treatment: 'Acyclovir 800mg 5x/day x7d or Valacyclovir 1g TID, analgesics, Pregabalin if PHN, ophthalmology if V1' },
                { name: 'Infectious Mononucleosis', name_ar: 'داء كثرة الوحيدات العدوائية', icd: 'B27.0', symptoms: 'Fever, pharyngitis, lymphadenopathy, fatigue, splenomegaly, atypical lymphocytes, positive monospot', treatment: 'Supportive: rest, Paracetamol, avoid contact sports x4wks (splenic rupture risk), NO Amoxicillin' }
            ],
            'Allergy & Immunology / الحساسية والمناعة': [
                { name: 'Anaphylaxis', name_ar: 'صدمة تحسسية', icd: 'T78.2', symptoms: 'EMERGENCY: Urticaria, angioedema, bronchospasm, hypotension, airway compromise, rapid onset after exposure', treatment: 'IM Adrenaline 0.5mg (1:1000) mid-thigh, O2, IV fluids, Hydrocortisone 200mg IV, Chlorpheniramine, monitor 6hrs' },
                { name: 'Allergic Rhinitis', name_ar: 'التهاب الأنف التحسسي', icd: 'J30.4', symptoms: 'Sneezing, rhinorrhea, nasal congestion, itchy nose/eyes, allergic shiners, pale turbinates', treatment: 'Intranasal Fluticasone 2 sprays BD, Cetirizine 10mg daily, allergen avoidance, consider immunotherapy' },
                { name: 'Urticaria - Acute', name_ar: 'أرتيكاريا (شرى) حادة', icd: 'L50.9', symptoms: 'Pruritic wheals, migratory, resolve <24hrs each, may follow food/drug/infection trigger', treatment: 'Cetirizine 10mg or Loratadine 10mg, remove trigger, IM Adrenaline if anaphylaxis signs, short Prednisolone' },
                { name: 'Urticaria - Chronic', name_ar: 'أرتيكاريا مزمنة', icd: 'L50.8', symptoms: 'Recurrent wheals >6 weeks, no clear trigger, autoimmune association, severely impacts QoL', treatment: 'Non-sedating H1 up to 4x dose, add H2 blocker, Montelukast, Omalizumab if refractory, autoimmune screen' },
                { name: 'Drug Allergy', name_ar: 'حساسية دوائية', icd: 'T88.7', symptoms: 'Rash, urticaria, angioedema after drug exposure, may be immediate or delayed (7-14d), document drug', treatment: 'Stop offending drug, Cetirizine, Prednisolone if severe, allergy documentation in chart, MedicAlert, alternatives' },
                { name: 'Food Allergy', name_ar: 'حساسية غذائية', icd: 'T78.1', symptoms: 'Urticaria, GI symptoms, anaphylaxis after food ingestion, common: nuts, shellfish, eggs, milk', treatment: 'Strict avoidance, EpiPen prescription + training, emergency action plan, dietitian, specific IgE/skin prick' },
                { name: 'Angioedema', name_ar: 'وذمة وعائية', icd: 'T78.3', symptoms: 'Deep tissue swelling of face/lips/tongue/throat, non-pruritic, may compromise airway, ACEi-related or hereditary', treatment: 'Airway assessment FIRST, IM Adrenaline if airway risk, stop ACEi if culprit, ENT if stridor, C4/C1-INH if hereditary' }
            ]
        };
        res.json(templates);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== SAFE PATIENT DELETE (soft delete if has records) =====
app.delete('/api/patients/:id', requireAuth, async (req, res) => {
    try {
        if (req.session.user.role !== 'Admin') {
            return res.status(403).json({ error: 'Access denied. Only Admin can delete patients.' });
        }
        const pid = req.params.id;
        // --- TENANT SCOPE: verify patient belongs to current tenant before delete (IDOR prevention) ---
        const { tenantId } = getRequestTenantContext(req);
        const tenantCheck = tenantId ? ' AND tenant_id=$2' : '';
        const tenantParams = tenantId ? [pid, tenantId] : [pid];
        const patientCheck = (await pool.query(`SELECT id FROM patients WHERE id=$1${tenantCheck}`, tenantParams)).rows[0];
        if (!patientCheck) return res.status(404).json({ error: 'Patient not found' });
        const invoices = (await pool.query('SELECT COUNT(*) as cnt FROM invoices WHERE patient_id=$1 AND cancelled=0', [pid])).rows[0].cnt;
        const orders = (await pool.query('SELECT COUNT(*) as cnt FROM lab_radiology_orders WHERE patient_id=$1', [pid])).rows[0].cnt;
        const records = (await pool.query('SELECT COUNT(*) as cnt FROM medical_records WHERE patient_id=$1', [pid])).rows[0].cnt;
        if (parseInt(invoices) > 0 || parseInt(orders) > 0 || parseInt(records) > 0) {
            await pool.query('UPDATE patients SET is_deleted=1, deleted_at=NOW(), deleted_by=$1 WHERE id=$2', [req.session.user?.display_name || '', pid]);
            logAudit(req.session.user?.id, req.session.user?.display_name, 'SOFT_DELETE', 'Patients', 'Soft deleted patient #' + pid, req.ip);
            return res.json({ success: true, soft_deleted: true, message: 'Patient archived (has records)' });
        }
        await pool.query('DELETE FROM patients WHERE id=$1', [pid]);
        logAudit(req.session.user?.id, req.session.user?.display_name, 'DELETE', 'Patients', 'Deleted patient #' + pid, req.ip);
        res.json({ success: true, deleted: true });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== PHARMACY STOCK DEDUCTION ON DISPENSE =====
app.post('/api/pharmacy/deduct-stock', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const { drug_id, drug_name, quantity, patient_id, prescription_id, reason } = req.body;
        const { tenantId } = getRequestTenantContext(req);

        // IDOR Prevention: check if drug belongs to tenant
        const drugQuery = tenantId ?
            'SELECT * FROM pharmacy_drug_catalog WHERE id=$1 AND tenant_id=$2' :
            'SELECT * FROM pharmacy_drug_catalog WHERE id=$1';
        const drugParams = tenantId ? [drug_id, tenantId] : [drug_id];
        const drug = (await pool.query(drugQuery, drugParams)).rows[0];
        if (!drug) return res.status(404).json({ error: 'Drug not found' });

        // IDOR Prevention: check if patient belongs to tenant
        if (tenantId && patient_id) {
            const patientCheck = (await pool.query('SELECT id FROM patients WHERE id=$1 AND tenant_id=$2', [patient_id, tenantId])).rows[0];
            if (!patientCheck) return res.status(404).json({ error: 'Patient not found' });
        }

        // IDOR Prevention: check if prescription belongs to tenant
        if (tenantId && prescription_id) {
            const rxCheck = (await pool.query('SELECT id FROM prescriptions WHERE id=$1 AND tenant_id=$2', [prescription_id, tenantId])).rows[0];
            if (!rxCheck) return res.status(404).json({ error: 'Prescription not found' });
        }

        if (drug.stock_qty < quantity) return res.status(400).json({ error: 'Insufficient stock', available: drug.stock_qty });
        const newQty = drug.stock_qty - quantity;
        const updateQuery = tenantId ?
            'UPDATE pharmacy_drug_catalog SET stock_qty=$1 WHERE id=$2 AND tenant_id=$3' :
            'UPDATE pharmacy_drug_catalog SET stock_qty=$1 WHERE id=$2';
        const updateParams = tenantId ? [newQty, drug_id, tenantId] : [newQty, drug_id];
        await pool.query(updateQuery, updateParams);

        await pool.query('INSERT INTO pharmacy_stock_log (drug_id, drug_name, movement_type, quantity, previous_qty, new_qty, reason, patient_id, prescription_id, performed_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
            [drug_id, drug_name || drug.drug_name, 'OUT', quantity, drug.stock_qty, newQty, reason || 'Dispensed', patient_id, prescription_id, req.session.user?.display_name || '']);
        logAudit(req.session.user?.id, req.session.user?.display_name, 'STOCK_OUT', 'Pharmacy', drug_name + ': ' + drug.stock_qty + ' -> ' + newQty, req.ip);
        const isLow = newQty <= (drug.min_stock_level || 10);
        if (isLow) {
            await pool.query('INSERT INTO notifications (target_role, title, message, type, module) VALUES ($1,$2,$3,$4,$5)',
                ['Pharmacist', 'Low Stock Alert', drug_name + ' stock: ' + newQty, 'warning', 'Pharmacy']);
        }
        res.json({ success: true, previous_qty: drug.stock_qty, new_qty: newQty, is_low_stock: isLow });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== DRUG EXPIRY ALERTS =====
app.get('/api/pharmacy/expiring', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 90;
        const { tenantId } = getRequestTenantContext(req);
        const query = tenantId ?
            "SELECT * FROM pharmacy_drug_catalog WHERE is_active=1 AND tenant_id=$2 AND expiry_date IS NOT NULL AND expiry_date != '' AND expiry_date <= (CURRENT_DATE + INTERVAL '1 day' * $1)::text ORDER BY expiry_date ASC" :
            "SELECT * FROM pharmacy_drug_catalog WHERE is_active=1 AND expiry_date IS NOT NULL AND expiry_date != '' AND expiry_date <= (CURRENT_DATE + INTERVAL '1 day' * $1)::text ORDER BY expiry_date ASC";
        const params = tenantId ? [days, tenantId] : [days];
        const expiring = (await pool.query(query, params)).rows;
        res.json(expiring);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== INVOICE CANCEL (Credit Note) =====
app.post('/api/invoices/cancel/:id', requireAuth, requireRole('invoices', 'accounts'), async (req, res) => {
    try {
        const { reason } = req.body;
        // --- TENANT SCOPE: verify invoice belongs to current tenant before cancel (IDOR prevention) ---
        const { tenantId } = getRequestTenantContext(req);
        const tenantCheck = tenantId ? ' AND tenant_id=$2' : '';
        const tenantParams = tenantId ? [req.params.id, tenantId] : [req.params.id];
        const inv = (await pool.query(`SELECT * FROM invoices WHERE id=$1${tenantCheck}`, tenantParams)).rows[0];
        if (!inv) return res.status(404).json({ error: 'Invoice not found' });
        if (inv.cancelled) return res.status(400).json({ error: 'Already cancelled' });
        await pool.query('UPDATE invoices SET cancelled=1, cancel_reason=$1, cancelled_by=$2, cancelled_at=NOW() WHERE id=$3',
            [reason || '', req.session.user?.display_name || '', req.params.id]);
        logAudit(req.session.user?.id, req.session.user?.display_name, 'CANCEL_INVOICE', 'Finance', 'Cancelled ' + inv.invoice_number + ' (' + inv.total + ' SAR)', req.ip);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== APPOINTMENT CONFLICT CHECK =====
app.get('/api/appointments/check-conflict', requireAuth, requireRole('appointments'), async (req, res) => {
    try {
        const { doctor, date, time_slot, exclude_id } = req.query;
        let query = "SELECT * FROM appointments WHERE doctor=$1 AND appointment_date=$2 AND time_slot=$3 AND status != 'Cancelled'";
        let params = [doctor, date, time_slot];
        if (exclude_id) { query += ' AND id != $4'; params.push(exclude_id); }
        const conflicts = (await pool.query(query, params)).rows;
        res.json({ hasConflict: conflicts.length > 0, conflicts });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== NOTIFICATIONS =====
app.get('/api/notifications', requireAuth, async (req, res) => {
    try {
        const role = req.session.user?.role || '';
        const userId = req.session.user?.id;
        const notifs = (await pool.query("SELECT * FROM notifications WHERE (user_id=$1 OR target_role=$2 OR target_role='') ORDER BY created_at DESC LIMIT 50", [userId, role])).rows;
        res.json({ notifications: notifs, unread: notifs.filter(n => !n.is_read).length });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.put('/api/notifications/:id/read', requireAuth, async (req, res) => {
    try {
        await pool.query('UPDATE notifications SET is_read=1 WHERE id=$1', [req.params.id]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== VISIT TRACKING =====
app.post('/api/visits', requireAuth, async (req, res) => {
    try {
        const { patient_id, visit_type, department, doctor, chief_complaint } = req.body;
        const count = (await pool.query('SELECT COUNT(*) as cnt FROM patient_visits WHERE patient_id=$1', [patient_id])).rows[0].cnt;
        const visitNum = 'V-' + patient_id + '-' + (parseInt(count) + 1);
        const result = await pool.query('INSERT INTO patient_visits (patient_id, visit_number, visit_type, department, doctor, chief_complaint, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
            [patient_id, visitNum, visit_type || 'Walk-in', department || '', doctor || '', chief_complaint || '', req.session.user?.display_name || '']);
        await pool.query('UPDATE patients SET last_visit_at=NOW(), total_visits=total_visits+1 WHERE id=$1', [patient_id]);
        res.json(result.rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/visits/:patient_id', requireAuth, async (req, res) => {
    try {
        res.json((await pool.query('SELECT * FROM patient_visits WHERE patient_id=$1 ORDER BY created_at DESC', [req.params.patient_id])).rows);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== AUDIT TRAIL VIEWER =====
app.get('/api/admin/audit-trail', requireAuth, async (req, res) => {
    try {
        const { module, action, limit: lim } = req.query;
        let query = 'SELECT * FROM audit_trail';
        const conds = [], params = [];
        if (module) { conds.push('module=$' + (params.length + 1)); params.push(module); }
        if (action) { conds.push('action=$' + (params.length + 1)); params.push(action); }
        if (conds.length) query += ' WHERE ' + conds.join(' AND ');
        query += ' ORDER BY created_at DESC LIMIT $' + (params.length + 1);
        params.push(parseInt(lim) || 100);
        res.json((await pool.query(query, params)).rows);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== STOCK MOVEMENT LOG =====
app.get('/api/pharmacy/stock-log', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const { tenantId } = getRequestTenantContext(req);
        const query = tenantId ?
            `SELECT sl.* FROM pharmacy_stock_log sl
             JOIN pharmacy_drug_catalog dc ON sl.drug_id = dc.id
             WHERE dc.tenant_id = $1
             ORDER BY sl.created_at DESC LIMIT 200` :
            `SELECT * FROM pharmacy_stock_log ORDER BY created_at DESC LIMIT 200`;
        const params = tenantId ? [tenantId] : [];
        res.json((await pool.query(query, params)).rows);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== NURSING ASSESSMENT SCALES =====
app.post('/api/nursing/assessment', requireAuth, async (req, res) => {
    try {
        const { patient_id, pain_scale, fall_risk_score, braden_score, notes } = req.body;
        const vitals = (await pool.query('SELECT * FROM nursing_vitals WHERE patient_id=$1 ORDER BY id DESC LIMIT 1', [patient_id])).rows[0];
        if (vitals) {
            await pool.query('UPDATE nursing_vitals SET notes=$1 WHERE id=$2', [
                JSON.stringify({ pain_scale, fall_risk_score, braden_score, notes, assessed_at: new Date().toISOString() }),
                vitals.id
            ]);
        }
        res.json({ success: true, pain_scale, fall_risk_score, braden_score });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== BACKUP ENDPOINT =====
app.get('/api/admin/backup-info', requireAuth, async (req, res) => {
    try {
        const tables = (await pool.query("SELECT tablename, pg_total_relation_size(quote_ident(tablename)) as size FROM pg_tables WHERE schemaname='public' ORDER BY size DESC")).rows;
        const dbSize = (await pool.query("SELECT pg_database_size(current_database()) as size")).rows[0];
        res.json({
            database: process.env.DB_NAME || 'nama_medical_web',
            totalSize: dbSize.size,
            totalSizeMB: (dbSize.size / 1024 / 1024).toFixed(2),
            tables: tables.map(t => ({ name: t.tablename, sizeMB: (t.size / 1024 / 1024).toFixed(2) })),
            backupCommand: 'pg_dump -U ' + (process.env.DB_USER || 'postgres') + ' -h ' + (process.env.DB_HOST || 'localhost') + ' ' + (process.env.DB_NAME || 'nama_medical_web') + ' > backup.sql'
        });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});


// ===== OB/GYN DEPARTMENT =====
// Pregnancy Records
app.get('/api/obgyn/pregnancies', requireAuth, async (req, res) => {
    try {
        const { patient_id, status } = req.query;
        let q = 'SELECT * FROM obgyn_pregnancies';
        const conds = [], params = [];
        if (patient_id) { conds.push('patient_id=$' + (params.length + 1)); params.push(patient_id); }
        if (status) { conds.push('status=$' + (params.length + 1)); params.push(status); }
        if (conds.length) q += ' WHERE ' + conds.join(' AND ');
        q += ' ORDER BY created_at DESC';
        res.json((await pool.query(q, params)).rows);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/obgyn/pregnancies', requireAuth, async (req, res) => {
    try {
        const { patient_id, patient_name, lmp, gravida, para, abortions, living_children,
            blood_group, rh_factor, risk_level, pre_pregnancy_weight, height,
            allergies, chronic_conditions, previous_cs, previous_complications,
            husband_name, husband_blood_group, attending_doctor } = req.body;
        // Calculate EDD (Naegele's rule: LMP + 280 days)
        let edd = null;
        if (lmp) {
            const d = new Date(lmp);
            d.setDate(d.getDate() + 280);
            edd = d.toISOString().split('T')[0];
        }
        const result = await pool.query(
            `INSERT INTO obgyn_pregnancies (patient_id, patient_name, lmp, edd, gravida, para, abortions, living_children,
             blood_group, rh_factor, risk_level, pre_pregnancy_weight, height, allergies, chronic_conditions,
             previous_cs, previous_complications, husband_name, husband_blood_group, attending_doctor, created_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21) RETURNING *`,
            [patient_id, patient_name || '', lmp, edd, gravida || 1, para || 0, abortions || 0, living_children || 0,
                blood_group || '', rh_factor || '', risk_level || 'Low', pre_pregnancy_weight || 0, height || 0,
                allergies || '', chronic_conditions || '', previous_cs || 0, previous_complications || '',
                husband_name || '', husband_blood_group || '', attending_doctor || '', req.session.user?.display_name || '']);
        logAudit(req.session.user?.id, req.session.user?.display_name, 'CREATE_PREGNANCY', 'OB/GYN', 'Pregnancy record for ' + patient_name, req.ip);
        res.json(result.rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.put('/api/obgyn/pregnancies/:id', requireAuth, async (req, res) => {
    try {
        const fields = req.body;
        const sets = [], params = [];
        for (const [k, v] of Object.entries(fields)) {
            if (['id', 'created_at'].includes(k)) continue;
            params.push(v);
            sets.push(k + '=$' + params.length);
        }
        if (!sets.length) return res.json({ success: false });
        params.push(req.params.id);
        await pool.query('UPDATE obgyn_pregnancies SET ' + sets.join(',') + ',updated_at=NOW() WHERE id=$' + params.length, params);
        res.json((await pool.query('SELECT * FROM obgyn_pregnancies WHERE id=$1', [req.params.id])).rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// Antenatal Visits
app.get('/api/obgyn/antenatal/:pregnancy_id', requireAuth, async (req, res) => {
    try {
        res.json((await pool.query('SELECT * FROM obgyn_antenatal_visits WHERE pregnancy_id=$1 ORDER BY visit_number DESC', [req.params.pregnancy_id])).rows);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/obgyn/antenatal', requireAuth, async (req, res) => {
    try {
        const { pregnancy_id, patient_id, gestational_age, weight, blood_pressure,
            systolic, diastolic, fundal_height, fetal_heart_rate, fetal_presentation,
            fetal_movement, edema, proteinuria, glucose_urine, hemoglobin,
            complaints, examination_notes, plan, next_visit, risk_flags } = req.body;
        const count = (await pool.query('SELECT COUNT(*) as cnt FROM obgyn_antenatal_visits WHERE pregnancy_id=$1', [pregnancy_id])).rows[0].cnt;
        // Calculate weight gain from first visit
        const firstVisit = (await pool.query('SELECT weight FROM obgyn_antenatal_visits WHERE pregnancy_id=$1 ORDER BY visit_number LIMIT 1', [pregnancy_id])).rows[0];
        const wGain = firstVisit ? (weight - firstVisit.weight) : 0;
        const result = await pool.query(
            `INSERT INTO obgyn_antenatal_visits (pregnancy_id, patient_id, visit_number, gestational_age, weight, weight_gain,
             blood_pressure, systolic, diastolic, fundal_height, fetal_heart_rate, fetal_presentation,
             fetal_movement, edema, proteinuria, glucose_urine, hemoglobin, complaints, examination_notes,
             plan, next_visit, doctor, risk_flags) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23) RETURNING *`,
            [pregnancy_id, patient_id, parseInt(count) + 1, gestational_age || '', weight || 0, wGain,
                blood_pressure || '', systolic || 0, diastolic || 0, fundal_height || 0, fetal_heart_rate || 0,
                fetal_presentation || '', fetal_movement || 'Active', edema || 'None', proteinuria || 'Negative',
                glucose_urine || 'Negative', hemoglobin || 0, complaints || '', examination_notes || '',
                plan || '', next_visit || null, req.session.user?.display_name || '', risk_flags || '']);
        // Check for risk flags
        let flags = [];
        if (systolic >= 140 || diastolic >= 90) flags.push('Hypertension');
        if (proteinuria !== 'Negative' && (systolic >= 140 || diastolic >= 90)) flags.push('Pre-eclampsia risk');
        if (hemoglobin > 0 && hemoglobin < 10) flags.push('Anemia');
        if (fetal_heart_rate > 0 && (fetal_heart_rate < 110 || fetal_heart_rate > 160)) flags.push('Abnormal FHR');
        if (flags.length) {
            await pool.query('UPDATE obgyn_antenatal_visits SET risk_flags=$1 WHERE id=$2', [flags.join(', '), result.rows[0].id]);
            await pool.query('INSERT INTO notifications (target_role, title, message, type, module) VALUES ($1,$2,$3,$4,$5)',
                ['Doctor', 'OB/GYN Risk Alert', 'Patient #' + patient_id + ': ' + flags.join(', '), 'warning', 'OB/GYN']);
        }
        res.json(result.rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// Ultrasound Records
app.get('/api/obgyn/ultrasounds/:pregnancy_id', requireAuth, async (req, res) => {
    try {
        res.json((await pool.query('SELECT * FROM obgyn_ultrasounds WHERE pregnancy_id=$1 ORDER BY scan_date DESC', [req.params.pregnancy_id])).rows);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/obgyn/ultrasounds', requireAuth, async (req, res) => {
    try {
        const b = req.body;
        const result = await pool.query(
            `INSERT INTO obgyn_ultrasounds (pregnancy_id, patient_id, scan_type, gestational_age,
             bpd, hc, ac, fl, efw, amniotic_fluid_index, placenta_location, placenta_grade,
             fetal_heart_rate, fetal_presentation, fetal_gender, number_of_fetuses, cervical_length,
             anomalies, findings, impression, performed_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21) RETURNING *`,
            [b.pregnancy_id, b.patient_id, b.scan_type || 'Routine', b.gestational_age || '',
            b.bpd || 0, b.hc || 0, b.ac || 0, b.fl || 0, b.efw || 0, b.amniotic_fluid_index || 0,
            b.placenta_location || '', b.placenta_grade || '', b.fetal_heart_rate || 0,
            b.fetal_presentation || '', b.fetal_gender || 'Not determined', b.number_of_fetuses || 1,
            b.cervical_length || 0, b.anomalies || '', b.findings || '', b.impression || '',
            req.session.user?.display_name || '']);
        res.json(result.rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// Delivery Records
app.post('/api/obgyn/deliveries', requireAuth, async (req, res) => {
    try {
        const b = req.body;
        const result = await pool.query(
            `INSERT INTO obgyn_deliveries (pregnancy_id, patient_id, delivery_date, gestational_age_at_delivery,
             delivery_type, delivery_method, indication_for_cs, anesthesia_type, labor_duration_hours,
             episiotomy, perineal_tear, blood_loss_ml, placenta_delivery, complications,
             attending_doctor, assisting_nurse, anesthetist, pediatrician, notes,
             apgar_1min, apgar_5min, baby_weight, baby_length, baby_head_circumference,
             baby_gender, baby_status, baby_anomalies, nicu_admission, nicu_reason, breastfeeding_initiated)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30) RETURNING *`,
            [b.pregnancy_id, b.patient_id, b.delivery_date || new Date(), b.gestational_age_at_delivery || '',
            b.delivery_type || 'NVD', b.delivery_method || '', b.indication_for_cs || '', b.anesthesia_type || '',
            b.labor_duration_hours || 0, b.episiotomy || 0, b.perineal_tear || 'None', b.blood_loss_ml || 0,
            b.placenta_delivery || 'Complete', b.complications || '', b.attending_doctor || '',
            b.assisting_nurse || '', b.anesthetist || '', b.pediatrician || '', b.notes || '',
            b.apgar_1min || 0, b.apgar_5min || 0, b.baby_weight || 0, b.baby_length || 0,
            b.baby_head_circumference || 0, b.baby_gender || '', b.baby_status || 'Alive',
            b.baby_anomalies || '', b.nicu_admission || 0, b.nicu_reason || '', b.breastfeeding_initiated || 0]);
        // Update pregnancy status
        await pool.query('UPDATE obgyn_pregnancies SET status=$1, delivery_date=$2, delivery_type=$3, outcome=$4 WHERE id=$5',
            ['Delivered', b.delivery_date || new Date(), b.delivery_type || 'NVD', b.baby_status || 'Alive', b.pregnancy_id]);
        logAudit(req.session.user?.id, req.session.user?.display_name, 'DELIVERY', 'OB/GYN', 'Delivery recorded for pregnancy #' + b.pregnancy_id, req.ip);
        res.json(result.rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/obgyn/deliveries/:pregnancy_id', requireAuth, async (req, res) => {
    try {
        res.json((await pool.query('SELECT * FROM obgyn_deliveries WHERE pregnancy_id=$1', [req.params.pregnancy_id])).rows);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// NST Records
app.post('/api/obgyn/nst', requireAuth, async (req, res) => {
    try {
        const b = req.body;
        const result = await pool.query(
            `INSERT INTO obgyn_nst (pregnancy_id, patient_id, duration_minutes, baseline_fhr, variability,
             accelerations, decelerations, contractions, result, interpretation, action_taken, performed_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
            [b.pregnancy_id, b.patient_id, b.duration_minutes || 20, b.baseline_fhr || 0, b.variability || '',
            b.accelerations || 0, b.decelerations || 'None', b.contractions || 0, b.result || 'Reactive',
            b.interpretation || '', b.action_taken || '', req.session.user?.display_name || '']);
        // Alert if non-reactive
        if (b.result === 'Non-Reactive') {
            await pool.query('INSERT INTO notifications (target_role, title, message, type, module) VALUES ($1,$2,$3,$4,$5)',
                ['Doctor', 'Non-Reactive NST', 'Patient #' + b.patient_id + ' - Non-reactive NST: ' + (b.interpretation || ''), 'danger', 'OB/GYN']);
        }
        res.json(result.rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// OB/GYN Lab Panels
app.get('/api/obgyn/lab-panels', requireAuth, async (req, res) => {
    try {
        res.json((await pool.query('SELECT * FROM obgyn_lab_panels WHERE is_active=1 ORDER BY id')).rows);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// OB/GYN Dashboard Stats
app.get('/api/obgyn/stats', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const { tenantId } = getRequestTenantContext(req);

        // Schema for obgyn_pregnancies/obgyn_deliveries is provisioned out-of-band
        // (docs/sql/route_level_ddl_cleanup_candidate_*); no DDL in handler under restricted role.
        const params = tenantId ? [tenantId] : [];
        const tenantFilter = tenantId ? ' AND tenant_id=$1' : '';

        const active = (await pool.query(`SELECT COUNT(*) as cnt FROM obgyn_pregnancies WHERE status='Active'${tenantFilter}`, params)).rows[0].cnt;
        const highRisk = (await pool.query(`SELECT COUNT(*) as cnt FROM obgyn_pregnancies WHERE status='Active' AND risk_level='High'${tenantFilter}`, params)).rows[0].cnt;
        const dueThisWeek = (await pool.query(`SELECT COUNT(*) as cnt FROM obgyn_pregnancies WHERE status='Active' AND edd BETWEEN CURRENT_DATE AND CURRENT_DATE + 7${tenantFilter}`, params)).rows[0].cnt;
        const deliveredThisMonth = (await pool.query(`SELECT COUNT(*) as cnt FROM obgyn_deliveries WHERE delivery_date >= date_trunc('month', CURRENT_DATE)${tenantFilter}`, params)).rows[0].cnt;
        res.json({ activePregnancies: active, highRisk, dueThisWeek, deliveredThisMonth });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});


// ===== CONSENT FORMS =====
app.get('/api/consent/templates', requireAuth, async (req, res) => {
    try {
        const { category } = req.query;
        let q = 'SELECT * FROM consent_form_templates WHERE is_active=1';
        const params = [];
        if (category) { q += ' AND category=$1'; params.push(category); }
        q += ' ORDER BY category, id';
        res.json((await pool.query(q, params)).rows);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/consent/templates/:id', requireAuth, async (req, res) => {
    try {
        const t = (await pool.query('SELECT * FROM consent_form_templates WHERE id=$1', [req.params.id])).rows[0];
        if (!t) return res.status(404).json({ error: 'Not found' });
        res.json(t);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/consent/sign', requireAuth, async (req, res) => {
    try {
        const { template_id, patient_id, patient_name, signature_data, witness_name, witness_signature, doctor_name, procedure_details, notes } = req.body;
        if (!signature_data) return res.status(400).json({ error: 'Signature required' });
        const tmpl = (await pool.query('SELECT * FROM consent_form_templates WHERE id=$1', [template_id])).rows[0];
        if (!tmpl) return res.status(404).json({ error: 'Template not found' });
        const result = await pool.query(
            'INSERT INTO patient_consents (template_id, patient_id, patient_name, form_type, title, signature_data, witness_name, witness_signature, doctor_name, procedure_details, notes, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *',
            [template_id, patient_id, patient_name || '', tmpl.form_type, tmpl.title_ar, signature_data, witness_name || '', witness_signature || '', doctor_name || '', procedure_details || '', notes || '', req.session.user?.display_name || '']);
        logAudit(req.session.user?.id, req.session.user?.display_name, 'SIGN_CONSENT', 'Consent', tmpl.title_ar + ' - Patient: ' + patient_name, req.ip);
        res.json(result.rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/consent/patient/:patient_id', requireAuth, async (req, res) => {
    try {
        res.json((await pool.query('SELECT pc.*, cft.title_ar as template_title, cft.category FROM patient_consents pc LEFT JOIN consent_form_templates cft ON pc.template_id=cft.id WHERE pc.patient_id=$1 ORDER BY pc.created_at DESC', [req.params.patient_id])).rows);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/consent/recent', requireAuth, async (req, res) => {
    try {
        res.json((await pool.query('SELECT pc.*, cft.title_ar as template_title, cft.category FROM patient_consents pc LEFT JOIN consent_form_templates cft ON pc.template_id=cft.id ORDER BY pc.created_at DESC LIMIT 50')).rows);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});


// ===== DAILY CASH RECONCILIATION =====
app.get('/api/reports/daily-cash', requireAuth, requireRole('finance', 'accounts'), requireTenantScope, async (req, res) => {
    try {
        const { tenantId } = getRequestTenantContext(req);
        const date = req.query.date || new Date().toISOString().split('T')[0];
        const params = tenantId ? [date, tenantId] : [date];
        const tenantFilter = tenantId ? ' AND tenant_id=$2' : '';

        const byCash = (await pool.query(`SELECT COALESCE(SUM(total),0) as total FROM invoices WHERE payment_method='Cash' AND DATE(created_at)=$1 AND cancelled=0${tenantFilter}`, params)).rows[0].total;
        const byCard = (await pool.query(`SELECT COALESCE(SUM(total),0) as total FROM invoices WHERE payment_method IN ('Card','POS','شبكة') AND DATE(created_at)=$1 AND cancelled=0${tenantFilter}`, params)).rows[0].total;
        const byTransfer = (await pool.query(`SELECT COALESCE(SUM(total),0) as total FROM invoices WHERE payment_method IN ('Transfer','تحويل') AND DATE(created_at)=$1 AND cancelled=0${tenantFilter}`, params)).rows[0].total;
        const byInsurance = (await pool.query(`SELECT COALESCE(SUM(total),0) as total FROM invoices WHERE payment_method='Insurance' AND DATE(created_at)=$1 AND cancelled=0${tenantFilter}`, params)).rows[0].total;
        const total = (await pool.query(`SELECT COALESCE(SUM(total),0) as total, COUNT(*) as cnt FROM invoices WHERE DATE(created_at)=$1 AND cancelled=0${tenantFilter}`, params)).rows[0];
        const byCreator = (await pool.query(`SELECT COALESCE(created_by,'Unknown') as staff, COUNT(*) as cnt, COALESCE(SUM(total),0) as total FROM invoices WHERE DATE(created_at)=$1 AND cancelled=0${tenantFilter} GROUP BY created_by ORDER BY total DESC`, params)).rows;
        const byService = (await pool.query(`SELECT service_type, COUNT(*) as cnt, COALESCE(SUM(total),0) as total FROM invoices WHERE DATE(created_at)=$1 AND cancelled=0${tenantFilter} GROUP BY service_type ORDER BY total DESC`, params)).rows;

        res.json({ date, totalRevenue: parseFloat(total.total), invoiceCount: parseInt(total.cnt), cash: parseFloat(byCash), card: parseFloat(byCard), transfer: parseFloat(byTransfer), insurance: parseFloat(byInsurance), byStaff: byCreator, byService });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== DOCTOR REVENUE + COMMISSIONS =====
app.get('/api/reports/doctor-revenue', requireAuth, requireRole('finance', 'doctor'), requireTenantScope, async (req, res) => {
    try {
        const { tenantId } = getRequestTenantContext(req);
        const { from, to } = req.query;
        let dateFilter = '', params = [];

        if (from && to) {
            dateFilter = " AND i.created_at BETWEEN $1 AND ($2::text || ' 23:59:59')::timestamp";
            params = [from, to];
        }

        let tenantFilter = '';
        if (tenantId) {
            tenantFilter = ` AND i.tenant_id = $${params.length + 1}`;
            params.push(tenantId);
        }

        const queryStr = `SELECT su.id, su.display_name, su.speciality, su.commission_type, su.commission_value,
            COALESCE(COUNT(DISTINCT i.id),0) as invoice_count,
            COALESCE(SUM(i.total),0) as total_revenue
            FROM system_users su
            LEFT JOIN invoices i ON i.description LIKE '%' || su.display_name || '%' AND i.cancelled=0 ${dateFilter}${tenantFilter}
            WHERE su.role='Doctor' AND su.is_active=1
            GROUP BY su.id ORDER BY total_revenue DESC`;

        const doctors = (await pool.query(queryStr, params)).rows;
        doctors.forEach(d => {
            d.total_revenue = parseFloat(d.total_revenue);
            if (d.commission_type === 'percentage') d.commission = (d.total_revenue * (d.commission_value || 0) / 100);
            else d.commission = parseFloat(d.commission_value || 0) * parseInt(d.invoice_count || 0);
        });
        res.json(doctors);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== AGING REPORT (30/60/90/120 days) =====
app.get('/api/reports/aging', requireAuth, requireRole('finance'), requireTenantScope, async (req, res) => {
    try {
        const { tenantId } = getRequestTenantContext(req);
        const params = tenantId ? [tenantId] : [];
        const tenantFilter = tenantId ? ' AND tenant_id=$1' : '';

        const currentQuery = `SELECT patient_name, total, created_at, invoice_number FROM invoices WHERE paid=0 AND cancelled=0 AND created_at >= CURRENT_DATE - 30${tenantFilter} ORDER BY created_at DESC`;
        const d30Query = `SELECT patient_name, total, created_at, invoice_number FROM invoices WHERE paid=0 AND cancelled=0 AND created_at BETWEEN CURRENT_DATE - 60 AND CURRENT_DATE - 30${tenantFilter} ORDER BY created_at DESC`;
        const d60Query = `SELECT patient_name, total, created_at, invoice_number FROM invoices WHERE paid=0 AND cancelled=0 AND created_at BETWEEN CURRENT_DATE - 90 AND CURRENT_DATE - 60${tenantFilter} ORDER BY created_at DESC`;
        const d90Query = `SELECT patient_name, total, created_at, invoice_number FROM invoices WHERE paid=0 AND cancelled=0 AND created_at < CURRENT_DATE - 90${tenantFilter} ORDER BY created_at DESC`;

        const current = (await pool.query(currentQuery, params)).rows;
        const d30 = (await pool.query(d30Query, params)).rows;
        const d60 = (await pool.query(d60Query, params)).rows;
        const d90 = (await pool.query(d90Query, params)).rows;

        const sum = arr => arr.reduce((s, r) => s + parseFloat(r.total), 0);
        res.json({
            current: { items: current, total: sum(current), count: current.length },
            days30: { items: d30, total: sum(d30), count: d30.length },
            days60: { items: d60, total: sum(d60), count: d60.length },
            days90plus: { items: d90, total: sum(d90), count: d90.length },
            grandTotal: sum(current) + sum(d30) + sum(d60) + sum(d90)
        });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== REFERRAL SYSTEM =====
app.post('/api/referrals', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const { patient_id, patient_name, from_doctor, from_dept, to_dept, to_doctor, reason, urgency, notes } = req.body;
        const { tenantId } = getRequestTenantContext(req);

        // Verify patient context belongs to tenant
        if (tenantId && patient_id) {
            const patientCheck = await pool.query('SELECT id FROM patients WHERE id=$1 AND tenant_id=$2', [patient_id, tenantId]);
            if (patientCheck.rows.length === 0) {
                return res.status(403).json({ error: 'Unauthorized patient context' });
            }
        }

        // referrals schema provisioned out-of-band (route_level_ddl_cleanup_candidate_*); no DDL in handler.
        const result = await pool.query('INSERT INTO referrals (patient_id, patient_name, from_doctor, from_dept, to_dept, to_doctor, reason, urgency, notes, tenant_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *',
            [patient_id, patient_name || '', from_doctor || req.session.user?.display_name || '', from_dept || '', to_dept || '', to_doctor || '', reason || '', urgency || 'Routine', notes || '', tenantId]);
        await pool.query('INSERT INTO notifications (target_role, title, message, type, module) VALUES ($1,$2,$3,$4,$5)',
            ['Doctor', 'New Referral', 'Patient: ' + patient_name + ' referred to ' + to_dept + ' - ' + reason, 'info', 'Referrals']);
        logAudit(req.session.user?.id, req.session.user?.display_name, 'REFERRAL', 'Doctor', 'Referred ' + patient_name + ' to ' + to_dept, req.ip);
        res.json(result.rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/referrals', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const { tenantId } = getRequestTenantContext(req);

        // referrals schema provisioned out-of-band (route_level_ddl_cleanup_candidate_*); no DDL in handler.
        const { patient_id } = req.query;

        // Verify patient context belongs to tenant if patient_id is passed
        if (tenantId && patient_id) {
            const patientCheck = await pool.query('SELECT id FROM patients WHERE id=$1 AND tenant_id=$2', [patient_id, tenantId]);
            if (patientCheck.rows.length === 0) {
                return res.status(403).json({ error: 'Unauthorized patient context' });
            }
        }

        let query = 'SELECT * FROM referrals';
        let params = [];
        let conds = [];
        if (tenantId) {
            conds.push('tenant_id=$' + (params.length + 1));
            params.push(tenantId);
        }
        if (patient_id) {
            conds.push('patient_id=$' + (params.length + 1));
            params.push(patient_id);
        }
        if (conds.length) query += ' WHERE ' + conds.join(' AND ');
        query += ' ORDER BY created_at DESC LIMIT 100';

        res.json((await pool.query(query, params)).rows);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== ENHANCED DASHBOARD STATS (today KPIs) =====
app.get('/api/dashboard/today', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const { tenantId } = getRequestTenantContext(req);
        const params = tenantId ? [tenantId] : [];

        const todayRevQuery = tenantId ?
            "SELECT COALESCE(SUM(total),0) as total FROM invoices WHERE DATE(created_at)=CURRENT_DATE AND cancelled=0 AND tenant_id=$1" :
            "SELECT COALESCE(SUM(total),0) as total FROM invoices WHERE DATE(created_at)=CURRENT_DATE AND cancelled=0";

        const todayPatientsQuery = tenantId ?
            "SELECT COUNT(DISTINCT patient_id) as cnt FROM invoices WHERE DATE(created_at)=CURRENT_DATE AND tenant_id=$1" :
            "SELECT COUNT(DISTINCT patient_id) as cnt FROM invoices WHERE DATE(created_at)=CURRENT_DATE";

        const todayInvoicesQuery = tenantId ?
            "SELECT COUNT(*) as cnt FROM invoices WHERE DATE(created_at)=CURRENT_DATE AND cancelled=0 AND tenant_id=$1" :
            "SELECT COUNT(*) as cnt FROM invoices WHERE DATE(created_at)=CURRENT_DATE AND cancelled=0";

        const pendingLabQuery = tenantId ?
            "SELECT COUNT(*) as cnt FROM lab_radiology_orders WHERE status='Requested' AND is_radiology=0 AND tenant_id=$1" :
            "SELECT COUNT(*) as cnt FROM lab_radiology_orders WHERE status='Requested' AND is_radiology=0";

        const pendingRadQuery = tenantId ?
            "SELECT COUNT(*) as cnt FROM lab_radiology_orders WHERE status='Requested' AND is_radiology=1 AND tenant_id=$1" :
            "SELECT COUNT(*) as cnt FROM lab_radiology_orders WHERE status='Requested' AND is_radiology=1";

        const pendingRxQuery = tenantId ?
            "SELECT COUNT(*) as cnt FROM pharmacy_prescriptions_queue WHERE status='Pending' AND tenant_id=$1" :
            "SELECT COUNT(*) as cnt FROM pharmacy_prescriptions_queue WHERE status='Pending'";

        const waitingPatientsQuery = tenantId ?
            "SELECT COUNT(*) as cnt FROM patients WHERE status='Waiting' AND tenant_id=$1" :
            "SELECT COUNT(*) as cnt FROM patients WHERE status='Waiting'";

        const todayRev = (await pool.query(todayRevQuery, params)).rows[0].total;
        const todayPatients = (await pool.query(todayPatientsQuery, params)).rows[0].cnt;
        const todayInvoices = (await pool.query(todayInvoicesQuery, params)).rows[0].cnt;
        const pendingLab = (await pool.query(pendingLabQuery, params)).rows[0].cnt;
        const pendingRad = (await pool.query(pendingRadQuery, params)).rows[0].cnt;
        const pendingRx = (await pool.query(pendingRxQuery, params)).rows[0].cnt;
        const waitingPatients = (await pool.query(waitingPatientsQuery, params)).rows[0].cnt;

        res.json({ todayRevenue: parseFloat(todayRev), todayPatients: parseInt(todayPatients), todayInvoices: parseInt(todayInvoices), pendingLab: parseInt(pendingLab), pendingRad: parseInt(pendingRad), pendingRx: parseInt(pendingRx), waitingPatients: parseInt(waitingPatients) });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== PATIENT FULL SUMMARY (for Doctor) =====
app.get('/api/patients/:id/summary', requireAuth, requireRole('patients'), requireTenantScope, async (req, res) => {
    try {
        const pid = req.params.id;
        // --- TENANT SCOPE: verify patient belongs to current tenant ---
        const { tenantId } = getRequestTenantContext(req);
        const tenantCheck = tenantId ? ' AND tenant_id=$2' : '';
        const tenantParams = tenantId ? [pid, tenantId] : [pid];
        const patient = (await pool.query(`SELECT * FROM patients WHERE id=$1${tenantCheck}`, tenantParams)).rows[0];
        if (!patient) return res.status(404).json({ error: 'Not found' });
        const records = (await pool.query('SELECT * FROM medical_records WHERE patient_id=$1 ORDER BY created_at DESC LIMIT 10', [pid])).rows;
        const labs = (await pool.query("SELECT * FROM lab_radiology_orders WHERE patient_id=$1 AND is_radiology=0 ORDER BY created_at DESC LIMIT 10", [pid])).rows;
        const rads = (await pool.query("SELECT * FROM lab_radiology_orders WHERE patient_id=$1 AND is_radiology=1 ORDER BY created_at DESC LIMIT 5", [pid])).rows;
        const rxs = (await pool.query('SELECT * FROM prescriptions WHERE patient_id=$1 ORDER BY created_at DESC LIMIT 10', [pid])).rows;
        const invoices = (await pool.query('SELECT * FROM invoices WHERE patient_id=$1 AND cancelled=0 ORDER BY created_at DESC LIMIT 10', [pid])).rows;
        const visits = (await pool.query('SELECT * FROM patient_visits WHERE patient_id=$1 ORDER BY created_at DESC LIMIT 10', [pid])).rows;
        const consents = (await pool.query('SELECT pc.*, cft.title_ar FROM patient_consents pc LEFT JOIN consent_form_templates cft ON pc.template_id=cft.id WHERE pc.patient_id=$1 ORDER BY pc.created_at DESC LIMIT 5', [pid])).rows;
        res.json({ patient, records, labs, rads, prescriptions: rxs, invoices, visits, consents });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});


// ===== MEDICAL REPORTS & SICK LEAVE =====
app.post('/api/medical-reports', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const { patient_id, patient_name, report_type, diagnosis, icd_code, start_date, end_date, duration_days, notes, fitness_status } = req.body;
        const doctor = req.session.user?.display_name || '';
        const reportNum = 'MR-' + new Date().getFullYear() + '-' + String(Date.now()).slice(-6);
        const { tenantId } = getRequestTenantContext(req);

        // Verify patient context belongs to tenant
        if (tenantId && patient_id) {
            const patientCheck = await pool.query('SELECT id FROM patients WHERE id=$1 AND tenant_id=$2', [patient_id, tenantId]);
            if (patientCheck.rows.length === 0) {
                return res.status(403).json({ error: 'Unauthorized patient context' });
            }
        }

        // medical_reports schema provisioned out-of-band (route_level_ddl_cleanup_candidate_*); no DDL in handler.
        const result = await pool.query(
            'INSERT INTO medical_reports (report_number, patient_id, patient_name, report_type, diagnosis, icd_code, start_date, end_date, duration_days, notes, fitness_status, doctor, tenant_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *',
            [reportNum, patient_id, patient_name, report_type, diagnosis, icd_code, start_date, end_date, duration_days || 0, notes, fitness_status, doctor, tenantId]
        );

        logAudit(req.session.user?.id, doctor, 'CREATE_MEDICAL_REPORT', 'MedReport', reportNum + ' - ' + report_type, req.ip);
        res.json(result.rows[0]);
    } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/medical-reports', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const { patient_id } = req.query;
        const { tenantId } = getRequestTenantContext(req);

        // Verify patient context belongs to tenant if patient_id is passed
        if (tenantId && patient_id) {
            const patientCheck = await pool.query('SELECT id FROM patients WHERE id=$1 AND tenant_id=$2', [patient_id, tenantId]);
            if (patientCheck.rows.length === 0) {
                return res.status(403).json({ error: 'Unauthorized patient context' });
            }
        }

        let q = 'SELECT * FROM medical_reports';
        let p = [];
        const conds = [];
        if (tenantId) {
            conds.push('tenant_id=$' + (p.length + 1));
            p.push(tenantId);
        }
        if (patient_id) {
            conds.push('patient_id=$' + (p.length + 1));
            p.push(patient_id);
        }
        if (conds.length) q += ' WHERE ' + conds.join(' AND ');
        q += ' ORDER BY created_at DESC LIMIT 100';
        const rows = (await pool.query(q, p)).rows;
        res.json(rows);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/medical-reports/:id', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const { tenantId } = getRequestTenantContext(req);

        const q = tenantId ?
            'SELECT * FROM medical_reports WHERE id=$1 AND tenant_id=$2' :
            'SELECT * FROM medical_reports WHERE id=$1';
        const params = tenantId ? [req.params.id, tenantId] : [req.params.id];

        const row = (await pool.query(q, params)).rows[0];
        if (!row) return res.status(404).json({ error: 'Not found' });
        res.json(row);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});


// ===== DRUG INTERACTION CHECK =====
app.post('/api/drug-interactions/check', requireAuth, async (req, res) => {
    try {
        const { drugs } = req.body; // Array of drug names
        if (!drugs || !Array.isArray(drugs)) return res.json({ interactions: [] });

        // Common drug interaction database
        const INTERACTIONS = [
            { drugs: ['Warfarin', 'Aspirin'], severity: 'high', message_ar: 'خطر نزيف شديد', message_en: 'High bleeding risk' },
            { drugs: ['Warfarin', 'Ibuprofen'], severity: 'high', message_ar: 'خطر نزيف شديد', message_en: 'High bleeding risk' },
            { drugs: ['Warfarin', 'Diclofenac'], severity: 'high', message_ar: 'خطر نزيف', message_en: 'Bleeding risk' },
            { drugs: ['Warfarin', 'Omeprazole'], severity: 'moderate', message_ar: 'قد يزيد تأثير الوارفارين', message_en: 'May increase Warfarin effect' },
            { drugs: ['Warfarin', 'Ciprofloxacin'], severity: 'high', message_ar: 'يزيد INR بشكل خطير', message_en: 'Dangerously increases INR' },
            { drugs: ['Warfarin', 'Metronidazole'], severity: 'high', message_ar: 'يزيد تأثير الوارفارين', message_en: 'Increases Warfarin effect' },
            { drugs: ['Metformin', 'Contrast'], severity: 'high', message_ar: 'خطر حماض لاكتيكي', message_en: 'Lactic acidosis risk' },
            { drugs: ['ACE Inhibitor', 'Potassium'], severity: 'high', message_ar: 'خطر ارتفاع البوتاسيوم', message_en: 'Hyperkalemia risk' },
            { drugs: ['Enalapril', 'Spironolactone'], severity: 'high', message_ar: 'خطر ارتفاع البوتاسيوم', message_en: 'Hyperkalemia risk' },
            { drugs: ['Lisinopril', 'Spironolactone'], severity: 'high', message_ar: 'خطر ارتفاع البوتاسيوم', message_en: 'Hyperkalemia risk' },
            { drugs: ['Digoxin', 'Amiodarone'], severity: 'high', message_ar: 'سمية الديجوكسين', message_en: 'Digoxin toxicity' },
            { drugs: ['Digoxin', 'Verapamil'], severity: 'high', message_ar: 'سمية الديجوكسين', message_en: 'Digoxin toxicity' },
            { drugs: ['Methotrexate', 'TMP/SMX'], severity: 'high', message_ar: 'سمية الميثوتركسات', message_en: 'Methotrexate toxicity' },
            { drugs: ['Methotrexate', 'NSAIDs'], severity: 'high', message_ar: 'سمية كلوية', message_en: 'Renal toxicity' },
            { drugs: ['Simvastatin', 'Clarithromycin'], severity: 'high', message_ar: 'خطر انحلال العضلات', message_en: 'Rhabdomyolysis risk' },
            { drugs: ['Atorvastatin', 'Clarithromycin'], severity: 'moderate', message_ar: 'زيادة تأثير الستاتين', message_en: 'Increased statin effect' },
            { drugs: ['Clopidogrel', 'Omeprazole'], severity: 'moderate', message_ar: 'يقلل فعالية كلوبيدوقرل', message_en: 'Reduces Clopidogrel efficacy' },
            { drugs: ['Lithium', 'NSAIDs'], severity: 'high', message_ar: 'سمية الليثيوم', message_en: 'Lithium toxicity' },
            { drugs: ['Lithium', 'ACE Inhibitor'], severity: 'high', message_ar: 'سمية الليثيوم', message_en: 'Lithium toxicity' },
            { drugs: ['Ciprofloxacin', 'Theophylline'], severity: 'high', message_ar: 'سمية الثيوفيلين', message_en: 'Theophylline toxicity' },
            { drugs: ['MAO Inhibitor', 'SSRI'], severity: 'critical', message_ar: 'متلازمة السيروتونين - مميت', message_en: 'Serotonin syndrome - FATAL' },
            { drugs: ['Tramadol', 'SSRI'], severity: 'high', message_ar: 'خطر متلازمة السيروتونين', message_en: 'Serotonin syndrome risk' },
            { drugs: ['Tramadol', 'Sertraline'], severity: 'high', message_ar: 'خطر متلازمة السيروتونين', message_en: 'Serotonin syndrome risk' },
            { drugs: ['Sildenafil', 'Nitrate'], severity: 'critical', message_ar: 'انخفاض ضغط مميت', message_en: 'Fatal hypotension' },
            { drugs: ['Sildenafil', 'Nitroglycerin'], severity: 'critical', message_ar: 'انخفاض ضغط مميت', message_en: 'Fatal hypotension' },
            { drugs: ['Amlodipine', 'Simvastatin'], severity: 'moderate', message_ar: 'لا تتجاوز سيمفاستاتين 20مج', message_en: 'Do not exceed Simvastatin 20mg' },
            { drugs: ['Carbamazepine', 'OCP'], severity: 'high', message_ar: 'يقلل فعالية حبوب منع الحمل', message_en: 'Reduces OCP efficacy' },
            { drugs: ['Phenytoin', 'Warfarin'], severity: 'high', message_ar: 'تفاعل معقد - مراقبة', message_en: 'Complex interaction - monitor' },
            { drugs: ['Erythromycin', 'Simvastatin'], severity: 'high', message_ar: 'انحلال عضلات', message_en: 'Rhabdomyolysis' },
            { drugs: ['Fluconazole', 'Warfarin'], severity: 'high', message_ar: 'يزيد نزيف', message_en: 'Increases bleeding' },
            { drugs: ['Amiodarone', 'Warfarin'], severity: 'high', message_ar: 'يزيد INR', message_en: 'Increases INR' },
            { drugs: ['Aspirin', 'Ibuprofen'], severity: 'moderate', message_ar: 'يقلل تأثير الأسبرين القلبي', message_en: 'Reduces cardiac aspirin effect' },
            { drugs: ['Metformin', 'Alcohol'], severity: 'moderate', message_ar: 'خطر حماض لاكتيكي', message_en: 'Lactic acidosis risk' },
            { drugs: ['Insulin', 'Beta Blocker'], severity: 'moderate', message_ar: 'يخفي أعراض هبوط السكر', message_en: 'Masks hypoglycemia symptoms' },
            { drugs: ['Potassium', 'Spironolactone'], severity: 'high', message_ar: 'خطر ارتفاع بوتاسيوم شديد', message_en: 'Severe hyperkalemia risk' },
            { drugs: ['Azithromycin', 'Amiodarone'], severity: 'high', message_ar: 'إطالة QT', message_en: 'QT prolongation' },
            { drugs: ['Domperidone', 'Clarithromycin'], severity: 'high', message_ar: 'إطالة QT', message_en: 'QT prolongation' },
            { drugs: ['Metoclopramide', 'Haloperidol'], severity: 'moderate', message_ar: 'أعراض خارج هرمية', message_en: 'Extrapyramidal symptoms' },
            { drugs: ['Rifampin', 'OCP'], severity: 'high', message_ar: 'يلغي فعالية حبوب منع الحمل', message_en: 'Eliminates OCP efficacy' },
            { drugs: ['Rifampin', 'Warfarin'], severity: 'high', message_ar: 'يقلل فعالية الوارفارين بشدة', message_en: 'Greatly reduces Warfarin' },
            { drugs: ['Ciprofloxacin', 'Antacid'], severity: 'moderate', message_ar: 'يقلل امتصاص سيبرو', message_en: 'Reduces Cipro absorption' },
            { drugs: ['Tetracycline', 'Antacid'], severity: 'moderate', message_ar: 'يقلل الامتصاص', message_en: 'Reduces absorption' },
            { drugs: ['Levothyroxine', 'Calcium'], severity: 'moderate', message_ar: 'يقلل امتصاص الثايروكسين', message_en: 'Reduces thyroxine absorption' },
            { drugs: ['Levothyroxine', 'Iron'], severity: 'moderate', message_ar: 'يقلل امتصاص الثايروكسين', message_en: 'Reduces thyroxine absorption' },
            { drugs: ['Bisoprolol', 'Verapamil'], severity: 'high', message_ar: 'بطء قلب خطير', message_en: 'Dangerous bradycardia' },
            { drugs: ['Atenolol', 'Verapamil'], severity: 'high', message_ar: 'بطء قلب خطير', message_en: 'Dangerous bradycardia' },
            { drugs: ['Clonidine', 'Beta Blocker'], severity: 'high', message_ar: 'ارتداد ارتفاع ضغط', message_en: 'Rebound hypertension' },
            { drugs: ['Allopurinol', 'Azathioprine'], severity: 'critical', message_ar: 'سمية نخاع العظم', message_en: 'Bone marrow toxicity' },
            { drugs: ['Clarithromycin', 'Colchicine'], severity: 'high', message_ar: 'سمية الكولشيسين', message_en: 'Colchicine toxicity' },
        ];

        const found = [];
        const drugNamesLower = drugs.map(d => d.toLowerCase());

        for (const interaction of INTERACTIONS) {
            const [d1, d2] = interaction.drugs.map(d => d.toLowerCase());
            const match1 = drugNamesLower.some(dn => dn.includes(d1) || d1.includes(dn));
            const match2 = drugNamesLower.some(dn => dn.includes(d2) || d2.includes(dn));
            if (match1 && match2) {
                found.push(interaction);
            }
        }

        res.json({ interactions: found, total_checked: INTERACTIONS.length });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== ALLERGY CROSS-CHECK =====
app.post('/api/allergy-check', requireAuth, async (req, res) => {
    try {
        const { patient_id, drugs } = req.body;
        if (!patient_id || !drugs) return res.json({ alerts: [] });

        const patient = (await pool.query('SELECT allergies FROM patients WHERE id=$1', [patient_id])).rows[0];
        if (!patient || !patient.allergies) return res.json({ alerts: [] });

        const allergyGroups = {
            'penicillin': ['amoxicillin', 'ampicillin', 'augmentin', 'amoxicillin-clavulanate', 'piperacillin', 'flucloxacillin'],
            'sulfa': ['sulfamethoxazole', 'tmp/smx', 'co-trimoxazole', 'sulfasalazine', 'dapsone'],
            'nsaid': ['ibuprofen', 'diclofenac', 'naproxen', 'ketorolac', 'indomethacin', 'piroxicam', 'meloxicam', 'celecoxib'],
            'aspirin': ['aspirin', 'acetylsalicylic'],
            'cephalosporin': ['cephalexin', 'cefuroxime', 'ceftriaxone', 'cefazolin', 'cefixime', 'ceftazidime'],
            'macrolide': ['erythromycin', 'azithromycin', 'clarithromycin'],
            'quinolone': ['ciprofloxacin', 'levofloxacin', 'moxifloxacin', 'ofloxacin'],
            'tetracycline': ['doxycycline', 'tetracycline', 'minocycline'],
            'codeine': ['codeine', 'tramadol', 'morphine', 'oxycodone'],
            'contrast': ['iodine', 'contrast', 'gadolinium'],
        };

        const allergies = patient.allergies.toLowerCase();
        const alerts = [];

        for (const drug of drugs) {
            const drugLower = drug.toLowerCase();
            // Direct match
            if (allergies.includes(drugLower)) {
                alerts.push({ drug, severity: 'critical', message_ar: 'حساسية مباشرة مسجلة!', message_en: 'Direct allergy recorded!' });
                continue;
            }
            // Group match
            for (const [allergen, family] of Object.entries(allergyGroups)) {
                if (allergies.includes(allergen) && family.some(f => drugLower.includes(f))) {
                    alerts.push({ drug, severity: 'high', message_ar: 'ينتمي لعائلة ' + allergen + ' المسجل حساسية منها', message_en: 'Belongs to ' + allergen + ' family (allergy recorded)' });
                }
            }
        }

        res.json({ alerts, patient_allergies: patient.allergies });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== PARTIAL PAYMENT & REFUND =====
app.put('/api/invoices/:id/partial-pay', requireAuth, requireRole('invoices', 'accounts'), async (req, res) => {
    try {
        const { amount_paid, payment_method } = req.body;
        // --- TENANT SCOPE: verify invoice belongs to current tenant ---
        const { tenantId } = getRequestTenantContext(req);
        const tenantCheck = tenantId ? ' AND tenant_id=$2' : '';
        const tenantParams = tenantId ? [req.params.id, tenantId] : [req.params.id];
        const invoice = (await pool.query(`SELECT * FROM invoices WHERE id=$1${tenantCheck}`, tenantParams)).rows[0];
        if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

        const prevPaid = parseFloat(invoice.amount_paid || 0);
        const newPaid = prevPaid + parseFloat(amount_paid);
        const total = parseFloat(invoice.total);
        const balance = total - newPaid;
        const isPaid = balance <= 0 ? 1 : 0;

        await pool.query(
            'UPDATE invoices SET amount_paid=$1, balance_due=$2, paid=$3, payment_method=$4 WHERE id=$5',
            [newPaid, Math.max(0, balance), isPaid, payment_method || invoice.payment_method, req.params.id]
        );

        logAudit(req.session.user?.id, req.session.user?.display_name, 'PARTIAL_PAYMENT', 'Invoice',
            invoice.invoice_number + ' paid ' + amount_paid + ' (total paid: ' + newPaid + '/' + total + ')', req.ip);

        res.json({ success: true, amount_paid: newPaid, balance_due: Math.max(0, balance), fully_paid: isPaid });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/invoices/:id/refund', requireAuth, requireRole('invoices', 'accounts'), async (req, res) => {
    try {
        const { amount, reason } = req.body;
        const invoice = (await pool.query('SELECT * FROM invoices WHERE id=$1', [req.params.id])).rows[0];
        if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

        const refundNum = 'REF-' + new Date().getFullYear() + '-' + String(Date.now()).slice(-6);
        await pool.query(
            "INSERT INTO invoices (patient_id, patient_name, total, description, service_type, payment_method, invoice_number, created_by, discount_reason) VALUES ($1,$2,$3,$4,'Refund',$5,$6,$7,$8)",
            [invoice.patient_id, invoice.patient_name, -(parseFloat(amount)), 'Refund for ' + invoice.invoice_number + ': ' + reason, invoice.payment_method, refundNum, req.session.user?.display_name, reason]
        );

        logAudit(req.session.user?.id, req.session.user?.display_name, 'REFUND', 'Invoice', refundNum + ' amount: ' + amount + ' reason: ' + reason, req.ip);
        res.json({ success: true, refund_number: refundNum });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== CASH DRAWER =====
app.post('/api/cash-drawer/open', requireAuth, async (req, res) => {
    try {
        const { opening_balance } = req.body;
        // cash_drawer schema provisioned out-of-band (route_level_ddl_cleanup_candidate_*); no DDL in handler.
        // Check if already open
        const existing = (await pool.query("SELECT * FROM cash_drawer WHERE user_id=$1 AND status='open'", [req.session.user?.id])).rows[0];
        if (existing) return res.status(400).json({ error: 'Drawer already open. Close current session first.' });

        const result = await pool.query(
            'INSERT INTO cash_drawer (user_id, user_name, opening_balance) VALUES ($1,$2,$3) RETURNING *',
            [req.session.user?.id, req.session.user?.display_name, opening_balance || 0]
        );
        res.json(result.rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/cash-drawer/close', requireAuth, async (req, res) => {
    try {
        const { counted_cash, notes } = req.body;
        const drawer = (await pool.query("SELECT * FROM cash_drawer WHERE user_id=$1 AND status='open'", [req.session.user?.id])).rows[0];
        if (!drawer) return res.status(400).json({ error: 'No open drawer found' });

        // Calculate expected from invoices during session
        const cashInvoices = (await pool.query(
            "SELECT COALESCE(SUM(CASE WHEN total > 0 THEN total ELSE 0 END),0) as income, COALESCE(SUM(CASE WHEN total < 0 THEN ABS(total) ELSE 0 END),0) as refunds FROM invoices WHERE payment_method='Cash' AND created_at >= $1 AND created_by=$2",
            [drawer.opened_at, drawer.user_name]
        )).rows[0];

        const expected = parseFloat(drawer.opening_balance) + parseFloat(cashInvoices.income) - parseFloat(cashInvoices.refunds);
        const difference = parseFloat(counted_cash) - expected;

        await pool.query(
            "UPDATE cash_drawer SET closing_balance=$1, expected_balance=$2, difference=$3, status='closed', closed_at=CURRENT_TIMESTAMP, notes=$4 WHERE id=$5",
            [counted_cash, expected, difference, notes, drawer.id]
        );

        logAudit(req.session.user?.id, req.session.user?.display_name, 'CLOSE_CASH_DRAWER', 'Finance',
            'Expected: ' + expected.toFixed(2) + ' Counted: ' + counted_cash + ' Diff: ' + difference.toFixed(2), req.ip);

        res.json({ expected: expected.toFixed(2), counted: counted_cash, difference: difference.toFixed(2), income: cashInvoices.income, refunds: cashInvoices.refunds });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/cash-drawer/current', requireAuth, async (req, res) => {
    try {
        const drawer = (await pool.query("SELECT * FROM cash_drawer WHERE user_id=$1 AND status='open' ORDER BY id DESC LIMIT 1", [req.session.user?.id])).rows[0];
        if (!drawer) return res.json({ open: false });

        const cashInvoices = (await pool.query(
            "SELECT COALESCE(SUM(CASE WHEN total > 0 THEN total ELSE 0 END),0) as income, COUNT(CASE WHEN total > 0 THEN 1 END) as tx_count FROM invoices WHERE payment_method='Cash' AND created_at >= $1 AND created_by=$2",
            [drawer.opened_at, drawer.user_name]
        )).rows[0];

        res.json({ open: true, drawer, income: cashInvoices.income, tx_count: cashInvoices.tx_count });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});


// ===== VISIT LIFECYCLE TRACKING =====
app.post('/api/visits/lifecycle', requireAuth, async (req, res) => {
    try {
        // visit_lifecycle schema provisioned out-of-band (route_level_ddl_cleanup_candidate_*); no DDL in handler.
        const { patient_id, patient_name, appointment_id, doctor, department } = req.body;
        const result = await pool.query(
            'INSERT INTO visit_lifecycle (patient_id, patient_name, appointment_id, doctor, department, status, arrived_at) VALUES ($1,$2,$3,$4,$5,$6,CURRENT_TIMESTAMP) RETURNING *',
            [patient_id, patient_name, appointment_id, doctor, department, 'arrived']
        );
        res.json(result.rows[0]);
    } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

app.put('/api/visits/lifecycle/:id', requireAuth, async (req, res) => {
    try {
        const { status } = req.body;
        const visit = (await pool.query('SELECT * FROM visit_lifecycle WHERE id=$1', [req.params.id])).rows[0];
        if (!visit) return res.status(404).json({ error: 'Visit not found' });

        const timeFields = {
            'triage': 'triage_at', 'in_consultation': 'consult_start', 'consultation_done': 'consult_end',
            'lab_pending': 'lab_sent_at', 'lab_done': 'lab_done_at',
            'pharmacy_pending': 'pharmacy_sent_at', 'pharmacy_done': 'pharmacy_done_at',
            'payment': 'payment_at', 'completed': 'completed_at'
        };

        const field = timeFields[status];
        let extra = '';
        if (status === 'in_consultation' && visit.arrived_at) {
            const waitMs = Date.now() - new Date(visit.arrived_at).getTime();
            extra = ', wait_time_minutes=' + Math.round(waitMs / 60000);
        }
        if (status === 'consultation_done' && visit.consult_start) {
            const consultMs = Date.now() - new Date(visit.consult_start).getTime();
            extra = ', consult_duration_minutes=' + Math.round(consultMs / 60000);
        }
        if (status === 'completed' && visit.arrived_at) {
            const totalMs = Date.now() - new Date(visit.arrived_at).getTime();
            extra = ', total_duration_minutes=' + Math.round(totalMs / 60000);
        }

        await pool.query('UPDATE visit_lifecycle SET status=$1' + (field ? ', ' + field + '=CURRENT_TIMESTAMP' : '') + extra + ' WHERE id=$2', [status, req.params.id]);
        const updated = (await pool.query('SELECT * FROM visit_lifecycle WHERE id=$1', [req.params.id])).rows[0];
        res.json(updated);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/visits/lifecycle/today', requireAuth, async (req, res) => {
    try {
        // visit_lifecycle schema provisioned out-of-band; no DDL in handler.
        const { doctor } = req.query;
        let q = "SELECT * FROM visit_lifecycle WHERE created_at::date = CURRENT_DATE";
        let p = [];
        if (doctor) { q += " AND doctor=$1"; p = [doctor]; }
        q += " ORDER BY arrived_at DESC";
        const rows = (await pool.query(q, p)).rows;
        res.json(rows);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== APPOINTMENT CHECK-IN =====
app.put('/api/appointments/:id/checkin', requireAuth, requireRole('appointments'), async (req, res) => {
    try {
        // --- TENANT SCOPE: verify appointment belongs to current tenant ---
        const { tenantId } = getRequestTenantContext(req);
        const tenantCheck = tenantId ? ' AND tenant_id=$2' : '';
        const tenantParams = tenantId ? [req.params.id, tenantId] : [req.params.id];
        const appt = (await pool.query(`SELECT * FROM appointments WHERE id=$1${tenantCheck}`, tenantParams)).rows[0];
        if (!appt) return res.status(404).json({ error: 'Appointment not found' });

        // Update appointment status
        await pool.query("UPDATE appointments SET status='Checked-In', check_in_time=CURRENT_TIMESTAMP WHERE id=$1", [req.params.id]);

        // Create visit lifecycle entry (visit_lifecycle schema provisioned out-of-band; no DDL in handler)
        const visit = await pool.query(
            'INSERT INTO visit_lifecycle (patient_id, patient_name, appointment_id, doctor, department, status, arrived_at) VALUES ($1,$2,$3,$4,$5,$6,CURRENT_TIMESTAMP) RETURNING *',
            [appt.patient_id, appt.patient_name, appt.id, appt.doctor, appt.department || 'General', 'arrived']
        );

        // Auto-add to waiting queue
        await pool.query(
            "INSERT INTO waiting_queue (patient_id, patient_name, doctor, department, status, check_in_time) VALUES ($1,$2,$3,$4,'Waiting',CURRENT_TIMESTAMP)",
            [appt.patient_id, appt.patient_name, appt.doctor, appt.department || 'General']
        );

        logAudit(req.session.user?.id, req.session.user?.display_name, 'CHECK_IN', 'Appointments',
            'Patient ' + appt.patient_name + ' checked in for Dr. ' + appt.doctor, req.ip);

        res.json({ success: true, visit_id: visit.rows[0].id });
    } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

// ===== NO-SHOW MARKING =====
app.put('/api/appointments/:id/noshow', requireAuth, requireRole('appointments'), async (req, res) => {
    try {
        // --- TENANT SCOPE: verify appointment belongs to current tenant ---
        const { tenantId } = getRequestTenantContext(req);
        const tenantCheck = tenantId ? ' AND tenant_id=$2' : '';
        const tenantParams = tenantId ? [req.params.id, tenantId] : [req.params.id];
        const appt = (await pool.query(`SELECT * FROM appointments WHERE id=$1${tenantCheck}`, tenantParams)).rows[0];
        if (!appt) return res.status(404).json({ error: 'Appointment not found' });
        await pool.query("UPDATE appointments SET status='No-Show' WHERE id=$1", [req.params.id]);
        logAudit(req.session.user?.id, req.session.user?.display_name, 'NO_SHOW', 'Appointments',
            'Patient ' + (appt?.patient_name || '') + ' marked as No-Show', req.ip);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== DUPLICATE APPOINTMENT PREVENTION =====
app.post('/api/appointments/check-duplicate', requireAuth, requireRole('appointments'), async (req, res) => {
    try {
        const { patient_id, date, doctor } = req.body;
        const existing = (await pool.query(
            "SELECT * FROM appointments WHERE patient_id=$1 AND appt_date=$2 AND doctor_name=$3 AND status NOT IN ('Cancelled','No-Show')",
            [patient_id, date, doctor]
        )).rows;
        res.json({ duplicate: existing.length > 0, existing });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== LAB REFERENCE RANGES =====
app.get('/api/lab/reference-ranges', requireAuth, async (req, res) => {
    try {
        const ranges = {
            'CBC': {
                'WBC': { unit: '10^3/uL', male: '4.5-11.0', female: '4.5-11.0', low: 4.5, high: 11.0 },
                'RBC': { unit: '10^6/uL', male: '4.7-6.1', female: '4.2-5.4', low: 4.2, high: 6.1 },
                'Hemoglobin': { unit: 'g/dL', male: '13.5-17.5', female: '12.0-16.0', low: 12.0, high: 17.5 },
                'Hematocrit': { unit: '%', male: '38.3-48.6', female: '35.5-44.9', low: 35.5, high: 48.6 },
                'Platelets': { unit: '10^3/uL', male: '150-400', female: '150-400', low: 150, high: 400 },
                'MCV': { unit: 'fL', male: '80-100', female: '80-100', low: 80, high: 100 },
                'MCH': { unit: 'pg', male: '27-33', female: '27-33', low: 27, high: 33 },
                'MCHC': { unit: 'g/dL', male: '32-36', female: '32-36', low: 32, high: 36 },
                'RDW': { unit: '%', male: '11.5-14.5', female: '11.5-14.5', low: 11.5, high: 14.5 },
                'Neutrophils': { unit: '%', male: '40-70', female: '40-70', low: 40, high: 70 },
                'Lymphocytes': { unit: '%', male: '20-40', female: '20-40', low: 20, high: 40 },
                'Monocytes': { unit: '%', male: '2-8', female: '2-8', low: 2, high: 8 },
                'Eosinophils': { unit: '%', male: '1-4', female: '1-4', low: 1, high: 4 },
                'Basophils': { unit: '%', male: '0-1', female: '0-1', low: 0, high: 1 },
                'ESR': { unit: 'mm/hr', male: '0-15', female: '0-20', low: 0, high: 20 },
            },
            'Chemistry': {
                'Glucose (Fasting)': { unit: 'mg/dL', male: '70-100', female: '70-100', low: 70, high: 100 },
                'Glucose (Random)': { unit: 'mg/dL', male: '70-140', female: '70-140', low: 70, high: 140 },
                'HbA1c': { unit: '%', male: '4.0-5.6', female: '4.0-5.6', low: 4.0, high: 5.6 },
                'BUN': { unit: 'mg/dL', male: '7-20', female: '7-20', low: 7, high: 20 },
                'Creatinine': { unit: 'mg/dL', male: '0.7-1.3', female: '0.6-1.1', low: 0.6, high: 1.3 },
                'Uric Acid': { unit: 'mg/dL', male: '3.4-7.0', female: '2.4-6.0', low: 2.4, high: 7.0 },
                'Total Cholesterol': { unit: 'mg/dL', male: '<200', female: '<200', low: 0, high: 200 },
                'LDL': { unit: 'mg/dL', male: '<100', female: '<100', low: 0, high: 100 },
                'HDL': { unit: 'mg/dL', male: '>40', female: '>50', low: 40, high: 999 },
                'Triglycerides': { unit: 'mg/dL', male: '<150', female: '<150', low: 0, high: 150 },
                'AST (SGOT)': { unit: 'U/L', male: '10-40', female: '10-35', low: 10, high: 40 },
                'ALT (SGPT)': { unit: 'U/L', male: '7-56', female: '7-45', low: 7, high: 56 },
                'ALP': { unit: 'U/L', male: '44-147', female: '44-147', low: 44, high: 147 },
                'GGT': { unit: 'U/L', male: '9-48', female: '9-36', low: 9, high: 48 },
                'Total Bilirubin': { unit: 'mg/dL', male: '0.1-1.2', female: '0.1-1.2', low: 0.1, high: 1.2 },
                'Direct Bilirubin': { unit: 'mg/dL', male: '0-0.3', female: '0-0.3', low: 0, high: 0.3 },
                'Total Protein': { unit: 'g/dL', male: '6.0-8.3', female: '6.0-8.3', low: 6.0, high: 8.3 },
                'Albumin': { unit: 'g/dL', male: '3.5-5.5', female: '3.5-5.5', low: 3.5, high: 5.5 },
                'Calcium': { unit: 'mg/dL', male: '8.5-10.5', female: '8.5-10.5', low: 8.5, high: 10.5 },
                'Phosphorus': { unit: 'mg/dL', male: '2.5-4.5', female: '2.5-4.5', low: 2.5, high: 4.5 },
                'Magnesium': { unit: 'mg/dL', male: '1.7-2.2', female: '1.7-2.2', low: 1.7, high: 2.2 },
                'Sodium': { unit: 'mEq/L', male: '136-145', female: '136-145', low: 136, high: 145 },
                'Potassium': { unit: 'mEq/L', male: '3.5-5.0', female: '3.5-5.0', low: 3.5, high: 5.0 },
                'Chloride': { unit: 'mEq/L', male: '98-106', female: '98-106', low: 98, high: 106 },
                'Iron': { unit: 'ug/dL', male: '60-170', female: '50-170', low: 50, high: 170 },
                'Ferritin': { unit: 'ng/mL', male: '20-300', female: '10-150', low: 10, high: 300 },
                'TIBC': { unit: 'ug/dL', male: '250-370', female: '250-370', low: 250, high: 370 },
                'Vitamin D': { unit: 'ng/mL', male: '30-100', female: '30-100', low: 30, high: 100 },
                'Vitamin B12': { unit: 'pg/mL', male: '200-900', female: '200-900', low: 200, high: 900 },
                'Folate': { unit: 'ng/mL', male: '3-17', female: '3-17', low: 3, high: 17 },
                'LDH': { unit: 'U/L', male: '140-280', female: '140-280', low: 140, high: 280 },
                'CRP': { unit: 'mg/L', male: '<10', female: '<10', low: 0, high: 10 },
                'Amylase': { unit: 'U/L', male: '28-100', female: '28-100', low: 28, high: 100 },
                'Lipase': { unit: 'U/L', male: '0-160', female: '0-160', low: 0, high: 160 },
            },
            'Thyroid': {
                'TSH': { unit: 'mIU/L', male: '0.4-4.0', female: '0.4-4.0', low: 0.4, high: 4.0 },
                'Free T3': { unit: 'pg/mL', male: '2.0-4.4', female: '2.0-4.4', low: 2.0, high: 4.4 },
                'Free T4': { unit: 'ng/dL', male: '0.8-1.8', female: '0.8-1.8', low: 0.8, high: 1.8 },
            },
            'Coagulation': {
                'PT': { unit: 'seconds', male: '11-13.5', female: '11-13.5', low: 11, high: 13.5 },
                'INR': { unit: '', male: '0.9-1.1', female: '0.9-1.1', low: 0.9, high: 1.1 },
                'aPTT': { unit: 'seconds', male: '25-35', female: '25-35', low: 25, high: 35 },
                'D-Dimer': { unit: 'ng/mL', male: '<500', female: '<500', low: 0, high: 500 },
                'Fibrinogen': { unit: 'mg/dL', male: '200-400', female: '200-400', low: 200, high: 400 },
            },
            'Urinalysis': {
                'pH': { unit: '', male: '4.5-8.0', female: '4.5-8.0', low: 4.5, high: 8.0 },
                'Specific Gravity': { unit: '', male: '1.005-1.030', female: '1.005-1.030', low: 1.005, high: 1.030 },
                'Glucose': { unit: '', male: 'Negative', female: 'Negative', low: 0, high: 0 },
                'Protein': { unit: '', male: 'Negative', female: 'Negative', low: 0, high: 0 },
                'Blood': { unit: '', male: 'Negative', female: 'Negative', low: 0, high: 0 },
                'WBC': { unit: '/HPF', male: '0-5', female: '0-5', low: 0, high: 5 },
                'RBC': { unit: '/HPF', male: '0-2', female: '0-2', low: 0, high: 2 },
            },
            'Hormones': {
                'Prolactin': { unit: 'ng/mL', male: '2-18', female: '2-29', low: 2, high: 29 },
                'FSH': { unit: 'mIU/mL', male: '1.5-12.4', female: '3.5-12.5', low: 1.5, high: 12.5 },
                'LH': { unit: 'mIU/mL', male: '1.7-8.6', female: '2.4-12.6', low: 1.7, high: 12.6 },
                'Testosterone': { unit: 'ng/dL', male: '270-1070', female: '15-70', low: 15, high: 1070 },
                'Estradiol': { unit: 'pg/mL', male: '10-40', female: '15-350', low: 10, high: 350 },
                'Cortisol (AM)': { unit: 'ug/dL', male: '6-23', female: '6-23', low: 6, high: 23 },
                'PSA': { unit: 'ng/mL', male: '0-4.0', female: '-', low: 0, high: 4.0 },
                'HCG': { unit: 'mIU/mL', male: '<5', female: '<5 (non-pregnant)', low: 0, high: 5 },
            },
            'Cardiac': {
                'Troponin I': { unit: 'ng/mL', male: '<0.04', female: '<0.04', low: 0, high: 0.04 },
                'CK-MB': { unit: 'ng/mL', male: '0-5', female: '0-5', low: 0, high: 5 },
                'BNP': { unit: 'pg/mL', male: '<100', female: '<100', low: 0, high: 100 },
                'Procalcitonin': { unit: 'ng/mL', male: '<0.1', female: '<0.1', low: 0, high: 0.1 },
            },
        };
        res.json(ranges);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== NURSING: TRIAGE + PAIN SCORE =====
app.post('/api/nursing/triage', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const { patient_id, patient_name, triage_level, pain_score, chief_complaint, notes, visit_id } = req.body;
        const { tenantId } = getRequestTenantContext(req);

        // Verify patient ownership
        if (patient_id && tenantId) {
            const patientCheck = (await pool.query('SELECT id FROM patients WHERE id = $1 AND tenant_id = $2', [patient_id, tenantId])).rows[0];
            if (!patientCheck) return res.status(403).json({ error: 'Invalid patient context or access denied' });
        }

        // Verify visit ownership
        if (visit_id && tenantId) {
            const visitCheck = (await pool.query('SELECT id FROM emergency_visits WHERE id = $1 AND tenant_id = $2', [visit_id, tenantId])).rows[0];
            if (!visitCheck) return res.status(403).json({ error: 'Invalid visit context or access denied' });
        }

        // Update visit lifecycle if visit_id provided
        if (visit_id) {
            await pool.query(
                'UPDATE visit_lifecycle SET status=$1, triage_at=CURRENT_TIMESTAMP, triage_level=$2, pain_score=$3 WHERE id=$4',
                ['triage', triage_level, pain_score, visit_id]
            );
        }

        // Also store in nursing vitals if that table exists
        try {
            const updateVitalsQ = tenantId
                ? "UPDATE nursing_vitals SET triage_level=$1, pain_score=$2 WHERE patient_id=$3 AND tenant_id=$4 AND created_at::date = CURRENT_DATE"
                : "UPDATE nursing_vitals SET triage_level=$1, pain_score=$2 WHERE patient_id=$3 AND created_at::date = CURRENT_DATE";
            const updateVitalsParams = tenantId
                ? [triage_level, pain_score, patient_id, tenantId]
                : [triage_level, pain_score, patient_id];
            await pool.query(updateVitalsQ, updateVitalsParams);
        } catch (e) { /* table may not have these columns yet */ }

        logAudit(req.session.user?.id, req.session.user?.display_name, 'SUBMIT_TRIAGE', 'Nursing', `Submitted triage for patient #${patient_id} (Triage Level: ${triage_level})`, req.ip);
        res.json({ success: true, triage_level, pain_score });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== DOCTOR: NEXT PATIENT =====
app.get('/api/doctor/next-patient', requireAuth, async (req, res) => {
    try {
        const doctorName = req.session.user?.display_name || '';

        // Get next waiting patient for this doctor
        const next = (await pool.query(
            "SELECT * FROM waiting_queue WHERE doctor ILIKE $1 AND status='Waiting' ORDER BY check_in_time ASC LIMIT 1",
            ['%' + doctorName + '%']
        )).rows[0];

        if (!next) return res.json({ hasNext: false });

        // Update status to In-Progress
        await pool.query("UPDATE waiting_queue SET status='In Progress' WHERE id=$1", [next.id]);

        // Get patient details
        let patient = null;
        if (next.patient_id) {
            patient = (await pool.query('SELECT * FROM patients WHERE id=$1', [next.patient_id])).rows[0];
        }

        // Get visit lifecycle
        let visit = null;
        try {
            visit = (await pool.query(
                "SELECT * FROM visit_lifecycle WHERE patient_id=$1 AND created_at::date=CURRENT_DATE ORDER BY id DESC LIMIT 1",
                [next.patient_id]
            )).rows[0];
            if (visit) {
                await pool.query("UPDATE visit_lifecycle SET status='in_consultation', consult_start=CURRENT_TIMESTAMP WHERE id=$1", [visit.id]);
            }
        } catch (e) { }

        // Get recent vitals
        let vitals = null;
        try {
            vitals = (await pool.query(
                "SELECT * FROM nursing_vitals WHERE patient_id=$1 ORDER BY id DESC LIMIT 1",
                [next.patient_id]
            )).rows[0];
        } catch (e) { }

        // Get waiting count
        const waitingCount = (await pool.query(
            "SELECT COUNT(*) as cnt FROM waiting_queue WHERE doctor ILIKE $1 AND status='Waiting'",
            ['%' + doctorName + '%']
        )).rows[0].cnt;

        res.json({
            hasNext: true,
            queue: next,
            patient,
            vitals,
            visit,
            waiting_count: parseInt(waitingCount)
        });
    } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

// ===== DOCTOR: MY QUEUE =====
app.get('/api/doctor/my-queue', requireAuth, async (req, res) => {
    try {
        const doctorName = req.session.user?.display_name || '';
        const rows = (await pool.query(
            "SELECT * FROM waiting_queue WHERE doctor ILIKE $1 AND status IN ('Waiting','In Progress') ORDER BY CASE status WHEN 'In Progress' THEN 0 ELSE 1 END, check_in_time ASC",
            ['%' + doctorName + '%']
        )).rows;
        res.json(rows);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});


// ===== PASSWORD CHANGE =====
app.put('/api/auth/change-password', requireAuth, async (req, res) => {
    try {
        const { current_password, new_password } = req.body;
        if (!current_password || !new_password) return res.status(400).json({ error: 'Missing fields' });
        if (new_password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

        const user = (await pool.query('SELECT * FROM users WHERE id=$1', [req.session.user.id])).rows[0];
        if (!user) return res.status(404).json({ error: 'User not found' });

        // Verify current password
        const bcrypt = require('bcryptjs');
        const valid = await bcrypt.compare(current_password, user.password);
        if (!valid) return res.status(401).json({ error: 'Current password is incorrect', error_ar: 'كلمة المرور الحالية غير صحيحة' });

        // Hash and update
        const hashed = await bcrypt.hash(new_password, 10);
        await pool.query('UPDATE users SET password=$1 WHERE id=$2', [hashed, req.session.user.id]);

        logAudit(req.session.user.id, req.session.user.display_name, 'CHANGE_PASSWORD', 'Auth', 'Password changed', req.ip);
        res.json({ success: true });
    } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});


// ===== DASHBOARD CHARTS DATA =====
app.get('/api/dashboard/charts', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const { tenantId } = getRequestTenantContext(req);
        const params = tenantId ? [tenantId] : [];

        // Revenue trend (last 30 days)
        const revenueTrendQuery = tenantId ? `
            SELECT DATE(created_at) as day, COALESCE(SUM(total),0) as revenue, COUNT(*) as count
            FROM invoices WHERE created_at >= CURRENT_DATE - INTERVAL '30 days' AND total > 0 AND tenant_id = $1
            GROUP BY DATE(created_at) ORDER BY day
        ` : `
            SELECT DATE(created_at) as day, COALESCE(SUM(total),0) as revenue, COUNT(*) as count
            FROM invoices WHERE created_at >= CURRENT_DATE - INTERVAL '30 days' AND total > 0
            GROUP BY DATE(created_at) ORDER BY day
        `;
        const revenueTrend = (await pool.query(revenueTrendQuery, params)).rows;

        // Patients by department (this month)
        const byDepartmentQuery = tenantId ? `
            SELECT COALESCE(department,'General') as dept, COUNT(*) as count
            FROM appointments WHERE NULLIF(appt_date, '')::DATE >= DATE_TRUNC('month', CURRENT_DATE) AND tenant_id = $1
            GROUP BY department ORDER BY count DESC LIMIT 10
        ` : `
            SELECT COALESCE(department,'General') as dept, COUNT(*) as count
            FROM appointments WHERE NULLIF(appt_date, '')::DATE >= DATE_TRUNC('month', CURRENT_DATE)
            GROUP BY department ORDER BY count DESC LIMIT 10
        `;
        const byDepartment = (await pool.query(byDepartmentQuery, params)).rows;

        // Top doctors by patient count (this month)
        const topDoctorsQuery = tenantId ? `
            SELECT doctor_name as doctor, COUNT(*) as patients, COALESCE(SUM(i.total),0) as revenue
            FROM appointments a LEFT JOIN invoices i ON i.description ILIKE '%' || a.doctor_name || '%'
            AND i.created_at >= DATE_TRUNC('month', CURRENT_DATE) AND i.tenant_id = $1
            WHERE NULLIF(a.appt_date, '')::DATE >= DATE_TRUNC('month', CURRENT_DATE) AND a.tenant_id = $1
            GROUP BY a.doctor_name ORDER BY patients DESC LIMIT 8
        ` : `
            SELECT doctor_name as doctor, COUNT(*) as patients, COALESCE(SUM(i.total),0) as revenue
            FROM appointments a LEFT JOIN invoices i ON i.description ILIKE '%' || a.doctor_name || '%'
            AND i.created_at >= DATE_TRUNC('month', CURRENT_DATE)
            WHERE NULLIF(a.appt_date, '')::DATE >= DATE_TRUNC('month', CURRENT_DATE)
            GROUP BY a.doctor_name ORDER BY patients DESC LIMIT 8
        `;
        const topDoctors = (await pool.query(topDoctorsQuery, params)).rows;

        // Patient flow by hour (today)
        const hourlyFlowQuery = tenantId ? `
            SELECT EXTRACT(HOUR FROM created_at) as hour, COUNT(*) as count
            FROM appointments WHERE NULLIF(appt_date, '')::DATE = CURRENT_DATE AND tenant_id = $1
            GROUP BY hour ORDER BY hour
        ` : `
            SELECT EXTRACT(HOUR FROM created_at) as hour, COUNT(*) as count
            FROM appointments WHERE NULLIF(appt_date, '')::DATE = CURRENT_DATE
            GROUP BY hour ORDER BY hour
        `;
        const hourlyFlow = (await pool.query(hourlyFlowQuery, params)).rows;

        // Payment methods breakdown (this month)
        const paymentMethodsQuery = tenantId ? `
            SELECT COALESCE(payment_method,'Cash') as method, COUNT(*) as count, COALESCE(SUM(total),0) as total
            FROM invoices WHERE created_at >= DATE_TRUNC('month', CURRENT_DATE) AND total > 0 AND tenant_id = $1
            GROUP BY payment_method
        ` : `
            SELECT COALESCE(payment_method,'Cash') as method, COUNT(*) as count, COALESCE(SUM(total),0) as total
            FROM invoices WHERE created_at >= DATE_TRUNC('month', CURRENT_DATE) AND total > 0
            GROUP BY payment_method
        `;
        const paymentMethods = (await pool.query(paymentMethodsQuery, params)).rows;

        // Weekly comparison
        const thisWeekQuery = tenantId ?
            "SELECT COUNT(*) as patients, COALESCE(SUM(total),0) as revenue FROM invoices WHERE created_at >= DATE_TRUNC('week', CURRENT_DATE) AND total > 0 AND tenant_id = $1" :
            "SELECT COUNT(*) as patients, COALESCE(SUM(total),0) as revenue FROM invoices WHERE created_at >= DATE_TRUNC('week', CURRENT_DATE) AND total > 0";
        const lastWeekQuery = tenantId ?
            "SELECT COUNT(*) as patients, COALESCE(SUM(total),0) as revenue FROM invoices WHERE created_at >= DATE_TRUNC('week', CURRENT_DATE) - INTERVAL '7 days' AND created_at < DATE_TRUNC('week', CURRENT_DATE) AND total > 0 AND tenant_id = $1" :
            "SELECT COUNT(*) as patients, COALESCE(SUM(total),0) as revenue FROM invoices WHERE created_at >= DATE_TRUNC('week', CURRENT_DATE) - INTERVAL '7 days' AND created_at < DATE_TRUNC('week', CURRENT_DATE) AND total > 0";

        const thisWeek = (await pool.query(thisWeekQuery, params)).rows[0];
        const lastWeek = (await pool.query(lastWeekQuery, params)).rows[0];

        res.json({ revenueTrend, byDepartment, topDoctors, hourlyFlow, paymentMethods, thisWeek, lastWeek });
    } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});


// ===== DATABASE BACKUP (Admin only) =====
app.post('/api/admin/backup', requireAuth, async (req, res) => {
    try {
        if (req.session.user?.role !== 'Admin') return res.status(403).json({ error: 'Admin only' });

        const { execSync } = require('child_process');
        const backupDir = require('path').join(__dirname, 'backups');
        if (!require('fs').existsSync(backupDir)) require('fs').mkdirSync(backupDir, { recursive: true });

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
        const filename = 'nama_backup_' + timestamp + '.sql';
        const filepath = require('path').join(backupDir, filename);

        const dbUrl = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/nama_medical_web';
        execSync('pg_dump "' + dbUrl + '" > "' + filepath + '"', { timeout: 60000 });

        logAudit(req.session.user.id, req.session.user.display_name, 'DATABASE_BACKUP', 'Admin', filename, req.ip);

        res.download(filepath, filename, (err) => {
            if (err) res.status(500).json({ error: 'Download failed' });
        });
    } catch (e) { console.error(e); res.status(500).json({ error: 'Backup failed: ' + e.message }); }
});

app.get('/api/admin/backups', requireAuth, async (req, res) => {
    try {
        if (req.session.user?.role !== 'Admin') return res.status(403).json({ error: 'Admin only' });
        const backupDir = require('path').join(__dirname, 'backups');
        if (!require('fs').existsSync(backupDir)) return res.json([]);
        const files = require('fs').readdirSync(backupDir).filter(f => f.endsWith('.sql')).map(f => {
            const stat = require('fs').statSync(require('path').join(backupDir, f));
            return { name: f, size: (stat.size / 1024 / 1024).toFixed(2) + ' MB', date: stat.mtime };
        }).sort((a, b) => new Date(b.date) - new Date(a.date));
        res.json(files);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});


// ===== FINANCE SUMMARY =====
app.get('/api/finance/summary', requireAuth, requireRole('finance', 'accounts', 'invoices'), requireTenantScope, async (req, res) => {
    try {
        const { tenantId } = getRequestTenantContext(req);
        const { from, to } = req.query;
        let where = "WHERE total > 0";
        let p = [];
        if (from) { where += " AND created_at >= $" + (p.length + 1); p.push(from); }
        if (to) { where += " AND created_at <= $" + (p.length + 1); p.push(to + ' 23:59:59'); }
        if (tenantId) { where += " AND tenant_id = $" + (p.length + 1); p.push(tenantId); }

        const total = (await pool.query("SELECT COALESCE(SUM(total),0) as revenue, COUNT(*) as count FROM invoices " + where, p)).rows[0];
        const paid = (await pool.query("SELECT COALESCE(SUM(total),0) as paid FROM invoices " + where + " AND paid=1", p)).rows[0];
        const unpaid = (await pool.query("SELECT COALESCE(SUM(total),0) as unpaid FROM invoices " + where + " AND (paid=0 OR paid IS NULL)", p)).rows[0];
        const byMethod = (await pool.query("SELECT COALESCE(payment_method,'Cash') as method, SUM(total) as amount, COUNT(*) as cnt FROM invoices " + where + " AND paid=1 GROUP BY payment_method ORDER BY amount DESC", p)).rows;
        const byService = (await pool.query("SELECT COALESCE(service_type,description,'Other') as service, SUM(total) as amount, COUNT(*) as cnt FROM invoices " + where + " GROUP BY COALESCE(service_type,description,'Other') ORDER BY amount DESC LIMIT 10", p)).rows;
        const daily = (await pool.query("SELECT DATE(created_at) as day, SUM(total) as amount FROM invoices " + where + " GROUP BY DATE(created_at) ORDER BY day", p)).rows;

        res.json({ revenue: total.revenue, count: total.count, paid: paid.paid, unpaid: unpaid.unpaid, byMethod, byService, daily });
    } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

// ===== INVENTORY LOW STOCK =====
app.get('/api/inventory/low-stock', requireAuth, requireTenantScope, async (req, res) => {
    try {
        // inventory.tenant_id provisioned out-of-band (route_level_ddl_batch_b); no DDL in handler
        // inventory.facility_id provisioned out-of-band (route_level_ddl_batch_b); no DDL in handler
        const { tenantId } = getRequestTenantContext(req);
        const query = tenantId ?
            "SELECT * FROM inventory WHERE tenant_id=$1 AND CAST(quantity AS INTEGER) <= CAST(COALESCE(reorder_level,'10') AS INTEGER) ORDER BY CAST(quantity AS INTEGER) ASC" :
            "SELECT * FROM inventory WHERE CAST(quantity AS INTEGER) <= CAST(COALESCE(reorder_level,'10') AS INTEGER) ORDER BY CAST(quantity AS INTEGER) ASC";
        const params = tenantId ? [tenantId] : [];
        const items = (await pool.query(query, params)).rows;
        res.json(items);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== MEDICAL RECORDS BY PATIENT =====
app.get('/api/medical-records/patient/:patientId', requireAuth, async (req, res) => {
    try {
        const records = (await pool.query("SELECT * FROM medical_records WHERE patient_id=$1 ORDER BY created_at DESC", [req.params.patientId])).rows;
        res.json(records);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});



// ===== PATHOLOGY SPECIMENS =====
app.get('/api/pathology/specimens', requireAuth, async (req, res) => {
    try {
        // pathology_specimens schema provisioned out-of-band (route_level_ddl_batch_b); no DDL in handler
        res.json((await pool.query('SELECT * FROM pathology_specimens ORDER BY created_at DESC')).rows);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.post('/api/pathology/specimens', requireAuth, async (req, res) => {
    try {
        const { patient_name, specimen_type, site, doctor, clinical_details, priority, status } = req.body;
        const r = await pool.query('INSERT INTO pathology_specimens (patient_name,specimen_type,site,doctor,clinical_details,priority,status) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *', [patient_name, specimen_type, site, doctor, clinical_details, priority, status || 'received']);
        res.json(r.rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== CSSD BATCHES =====
app.get('/api/cssd/batches', requireAuth, async (req, res) => {
    try {
        // cssd_batches schema provisioned out-of-band (route_level_ddl_batch_b); no DDL in handler
        res.json((await pool.query('SELECT * FROM cssd_batches ORDER BY created_at DESC')).rows);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.post('/api/cssd/batches', requireAuth, async (req, res) => {
    try {
        const { batch_number, items, department, method, temperature, operator, status } = req.body;
        const r = await pool.query('INSERT INTO cssd_batches (batch_number,items,department,method,temperature,operator,status) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *', [batch_number, items, department, method, temperature, operator, status || 'processing']);
        res.json(r.rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.put('/api/cssd/batches/:id', requireAuth, async (req, res) => {
    try {
        const { status } = req.body;
        const r = await pool.query('UPDATE cssd_batches SET status=$1 WHERE id=$2 RETURNING *', [status, req.params.id]);
        res.json(r.rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== CME EVENTS =====
app.get('/api/cme/events', requireAuth, async (req, res) => {
    try {
        // cme_events schema provisioned out-of-band (route_level_ddl_batch_b); no DDL in handler
        res.json((await pool.query('SELECT * FROM cme_events ORDER BY event_date DESC')).rows);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.post('/api/cme/events', requireAuth, async (req, res) => {
    try {
        const { title, speaker, event_date, cme_hours, category, department, status } = req.body;
        const r = await pool.query('INSERT INTO cme_events (title,speaker,event_date,cme_hours,category,department,status) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *', [title, speaker, event_date, cme_hours || 0, category, department, status || 'upcoming']);
        res.json(r.rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== INFECTION CONTROL REPORTS =====
app.get('/api/infection-control/reports', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const { tenantId } = getRequestTenantContext(req);

        // infection_control_reports schema provisioned out-of-band (route_level_ddl_batch_b); no DDL in handler

        // infection_control_reports.tenant_id provisioned out-of-band (route_level_ddl_batch_b); no DDL in handler

        const q = tenantId ?
            'SELECT * FROM infection_control_reports WHERE tenant_id=$1 ORDER BY created_at DESC' :
            'SELECT * FROM infection_control_reports ORDER BY created_at DESC';
        const params = tenantId ? [tenantId] : [];

        res.json((await pool.query(q, params)).rows);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.post('/api/infection-control/reports', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const { patient_name, infection_type, ward, isolation_type, culture_results, action_taken, status } = req.body;
        const { tenantId } = getRequestTenantContext(req);

        // infection_control_reports.tenant_id provisioned out-of-band (route_level_ddl_batch_b); no DDL in handler

        const r = await pool.query(
            'INSERT INTO infection_control_reports (patient_name,infection_type,ward,isolation_type,culture_results,action_taken,status,tenant_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
            [patient_name, infection_type, ward, isolation_type, culture_results, action_taken, status || 'active', tenantId]
        );
        res.json(r.rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.put('/api/infection-control/reports/:id', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const { status } = req.body;
        const { tenantId } = getRequestTenantContext(req);

        // infection_control_reports.tenant_id provisioned out-of-band (route_level_ddl_batch_b); no DDL in handler

        const q = tenantId ?
            'UPDATE infection_control_reports SET status=$1 WHERE id=$2 AND tenant_id=$3 RETURNING *' :
            'UPDATE infection_control_reports SET status=$1 WHERE id=$2 RETURNING *';
        const params = tenantId ? [status, req.params.id, tenantId] : [status, req.params.id];

        const r = await pool.query(q, params);
        if (r.rows.length === 0) return res.status(404).json({ error: 'Not found or unauthorized' });
        res.json(r.rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== MAINTENANCE ORDERS =====
app.get('/api/maintenance/orders', requireAuth, async (req, res) => {
    try {
        // maintenance_orders schema provisioned out-of-band (route_level_ddl_batch_b); no DDL in handler
        res.json((await pool.query('SELECT * FROM maintenance_orders ORDER BY created_at DESC')).rows);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.post('/api/maintenance/orders', requireAuth, async (req, res) => {
    try {
        const { equipment, location, maintenance_type, priority, description, requested_by, status } = req.body;
        const r = await pool.query('INSERT INTO maintenance_orders (equipment,location,maintenance_type,priority,description,requested_by,status) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *', [equipment, location, maintenance_type, priority, description, requested_by, status || 'pending']);
        res.json(r.rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.put('/api/maintenance/orders/:id', requireAuth, async (req, res) => {
    try {
        const { status } = req.body;
        const r = await pool.query('UPDATE maintenance_orders SET status=$1 WHERE id=$2 RETURNING *', [status, req.params.id]);
        res.json(r.rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== INSURANCE POLICIES =====
app.get('/api/insurance/policies', requireAuth, requireRole('insurance'), async (req, res) => {
    try {
        // insurance_policies schema provisioned out-of-band (route_level_ddl_batch_b); no DDL in handler
        res.json((await pool.query('SELECT * FROM insurance_policies ORDER BY created_at DESC')).rows);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});


// ===== INVENTORY ITEMS =====
app.get('/api/inventory', requireAuth, requireTenantScope, async (req, res) => {
    try {
        // inventory schema provisioned out-of-band (route_level_ddl_batch_b); no DDL in handler
        // inventory.tenant_id provisioned out-of-band (route_level_ddl_batch_b); no DDL in handler
        // inventory.facility_id provisioned out-of-band (route_level_ddl_batch_b); no DDL in handler

        const { tenantId } = getRequestTenantContext(req);
        const query = tenantId ?
            'SELECT * FROM inventory WHERE tenant_id=$1 ORDER BY name ASC' :
            'SELECT * FROM inventory ORDER BY name ASC';
        const params = tenantId ? [tenantId] : [];
        res.json((await pool.query(query, params)).rows);
    } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});
app.post('/api/inventory', requireAuth, requireTenantScope, async (req, res) => {
    try {
        // inventory.tenant_id provisioned out-of-band (route_level_ddl_batch_b); no DDL in handler
        // inventory.facility_id provisioned out-of-band (route_level_ddl_batch_b); no DDL in handler

        const { tenantId, facilityId } = getRequestTenantContext(req);
        const { name, category, quantity, unit, reorder_level, location, supplier, cost, expiry_date } = req.body;
        const r = await pool.query('INSERT INTO inventory (name,category,quantity,unit,reorder_level,location,supplier,cost,expiry_date,tenant_id,facility_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *',
            [name, category, quantity || 0, unit, reorder_level || 10, location, supplier, cost, expiry_date, tenantId || null, facilityId || null]);

        logAudit(req.session.user?.id, req.session.user?.display_name, 'CREATE_INVENTORY_ITEM', 'Inventory', `Created item ${name} with initial stock ${quantity}`, req.ip);
        res.json(r.rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.put('/api/inventory/:id', requireAuth, requireTenantScope, async (req, res) => {
    try {
        // inventory.tenant_id provisioned out-of-band (route_level_ddl_batch_b); no DDL in handler
        const { tenantId } = getRequestTenantContext(req);
        if (tenantId) {
            const check = (await pool.query('SELECT id FROM inventory WHERE id=$1 AND tenant_id=$2', [req.params.id, tenantId])).rows[0];
            if (!check) return res.status(404).json({ error: 'Item not found' });
        }
        const { name, category, quantity, unit, reorder_level, location, supplier, cost, expiry_date } = req.body;
        const query = tenantId ?
            'UPDATE inventory SET name=$1,category=$2,quantity=$3,unit=$4,reorder_level=$5,location=$6,supplier=$7,cost=$8,expiry_date=$9 WHERE id=$10 AND tenant_id=$11 RETURNING *' :
            'UPDATE inventory SET name=$1,category=$2,quantity=$3,unit=$4,reorder_level=$5,location=$6,supplier=$7,cost=$8,expiry_date=$9 WHERE id=$10 RETURNING *';
        const params = tenantId ?
            [name, category, quantity, unit, reorder_level, location, supplier, cost, expiry_date, req.params.id, tenantId] :
            [name, category, quantity, unit, reorder_level, location, supplier, cost, expiry_date, req.params.id];
        const r = await pool.query(query, params);

        logAudit(req.session.user?.id, req.session.user?.display_name, 'UPDATE_INVENTORY_ITEM', 'Inventory', `Updated item #${req.params.id} (${name})`, req.ip);
        res.json(r.rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.delete('/api/inventory/:id', requireAuth, requireTenantScope, async (req, res) => {
    try {
        // inventory.tenant_id provisioned out-of-band (route_level_ddl_batch_b); no DDL in handler
        const { tenantId } = getRequestTenantContext(req);
        if (tenantId) {
            const check = (await pool.query('SELECT id FROM inventory WHERE id=$1 AND tenant_id=$2', [req.params.id, tenantId])).rows[0];
            if (!check) return res.status(404).json({ error: 'Item not found' });
        }
        const query = tenantId ? 'DELETE FROM inventory WHERE id=$1 AND tenant_id=$2' : 'DELETE FROM inventory WHERE id=$1';
        const params = tenantId ? [req.params.id, tenantId] : [req.params.id];
        await pool.query(query, params);

        logAudit(req.session.user?.id, req.session.user?.display_name, 'DELETE_INVENTORY_ITEM', 'Inventory', `Deleted item #${req.params.id}`, req.ip);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== PHARMACY PRESCRIPTIONS =====
app.get('/api/pharmacy/prescriptions', requireAuth, requireTenantScope, async (req, res) => {
    try {
        // pharmacy_prescriptions schema provisioned out-of-band (route_level_ddl_batch_b); no DDL in handler

        const { tenantId } = getRequestTenantContext(req);
        const query = tenantId ?
            'SELECT * FROM pharmacy_prescriptions WHERE tenant_id=$1 ORDER BY created_at DESC' :
            'SELECT * FROM pharmacy_prescriptions ORDER BY created_at DESC';
        const params = tenantId ? [tenantId] : [];
        res.json((await pool.query(query, params)).rows);
    } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});
app.post('/api/pharmacy/prescriptions', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const { patient_id, patient_name, medication, drug_name, dosage, frequency, duration, quantity, doctor, status, notes } = req.body;
        const { tenantId, facilityId } = getRequestTenantContext(req);
        if (tenantId && patient_id) {
            const patientCheck = (await pool.query('SELECT id FROM patients WHERE id=$1 AND tenant_id=$2', [patient_id, tenantId])).rows[0];
            if (!patientCheck) return res.status(404).json({ error: 'Patient not found' });
        }
        const r = await pool.query('INSERT INTO pharmacy_prescriptions (patient_id,patient_name,medication,drug_name,dosage,frequency,duration,quantity,doctor,status,notes,tenant_id,facility_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *',
            [patient_id, patient_name, medication || drug_name, drug_name || medication, dosage, frequency, duration, quantity, doctor, status || 'pending', notes, tenantId || null, facilityId || null]);
        logAudit(req.session.user?.id, req.session.user?.display_name, 'CREATE_PHARMACY_PRESCRIPTION', 'Pharmacy',
            `Created prescription for patient #${patient_id}: ${medication || drug_name}`, req.ip);
        res.json(r.rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.put('/api/pharmacy/prescriptions/:id', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const { status } = req.body;
        const { tenantId } = getRequestTenantContext(req);
        const tenantCheck = tenantId ? ' AND tenant_id=$2' : '';
        const params = tenantId ? [req.params.id, tenantId] : [req.params.id];
        const check = (await pool.query(`SELECT id FROM pharmacy_prescriptions WHERE id=$1${tenantCheck}`, params)).rows[0];
        if (!check) return res.status(404).json({ error: 'Prescription not found' });

        const updateQuery = tenantId ?
            'UPDATE pharmacy_prescriptions SET status=$1 WHERE id=$2 AND tenant_id=$3 RETURNING *' :
            'UPDATE pharmacy_prescriptions SET status=$1 WHERE id=$2 RETURNING *';
        const updateParams = tenantId ? [status, req.params.id, tenantId] : [status, req.params.id];
        const r = await pool.query(updateQuery, updateParams);
        logAudit(req.session.user?.id, req.session.user?.display_name, 'UPDATE_PHARMACY_PRESCRIPTION', 'Pharmacy',
            `Updated prescription #${req.params.id} status:${status}`, req.ip);
        res.json(r.rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== STITCH DESIGN SYSTEM: NEW MODULE MOCK APIs =====
app.get('/api/research/trials', requireAuth, requireRole('research'), (req, res) => {
    res.json([
        { id: 1, trial_name: 'دراسة اللقاح الخماسي المطوّر', phase: 'Phase III', sponsor: 'وزارة الصحة السعودية', status: 'Recruiting', start_date: '2026-01-10', enrolled_count: 342 },
        { id: 2, trial_name: 'علاج مناعي متقدم لأورام القولون', phase: 'Phase II', sponsor: 'الشركة الوطنية للصناعات الدوائية', status: 'Active', start_date: '2025-06-15', enrolled_count: 85 },
        { id: 3, trial_name: 'استخدام الذكاء الاصطناعي في الفحص المبكر لاعتلال الشبكية السكري', phase: 'Observational', sponsor: 'مستشفى الملك فيصل التخصصي', status: 'Active', start_date: '2025-09-01', enrolled_count: 1200 },
        { id: 4, trial_name: 'تقييم فاعلية بروتوكول الرعاية المنزلية لمرضى قصور القلب', phase: 'Phase IV', sponsor: 'نما الطبي للأبحاث', status: 'Completed', start_date: '2024-03-01', enrolled_count: 500 }
    ]);
});

app.get('/api/public-health/stats', requireAuth, requireRole('publichealth'), (req, res) => {
    res.json({
        vaccine_coverage: 94.8,
        chronic_prevalence: 12.3,
        active_outbreaks: 0,
        satisfaction_score: 96.5,
        recent_screenings: [
            { id: 1, type: 'فحص سرطان الثدي المبكر', target_population: 'النساء 40+ سنة', screened_count: 2450, target_count: 3000, compliance_rate: 81.6 },
            { id: 2, type: 'كشف ضغط الدم والسكري الميداني', target_population: 'سكان الأحياء المجاورة', screened_count: 5800, target_count: 5000, compliance_rate: 116.0 },
            { id: 3, type: 'تحصينات الأطفال الأساسية', target_population: 'الأطفال دون عمر السنتين', screened_count: 1230, target_count: 1250, compliance_rate: 98.4 }
        ],
        alerts: [
            { id: 1, level: 'info', title: 'حملة التطعيم ضد الإنفلونزا الموسمية', message: 'تبدأ الأسبوع القادم في جميع الفروع.' }
        ]
    });
});

app.get('/api/crisis/alerts', requireAuth, requireRole('crisis'), (req, res) => {
    res.json({
        status: 'Green - Stable',
        threat_level: 'Low',
        last_updated: new Date().toISOString(),
        active_resources: {
            ambulances: 12,
            icu_beds_available: 15,
            emergency_staff_on_duty: 45,
            decontamination_units: 4
        },
        incidents: [
            { id: 1, title: 'محاكاة خطة الإخلاء الافتراضية للكوارث', type: 'Drill', status: 'Completed', time: '2026-06-20' },
            { id: 2, title: 'جاهزية مهبط طائرات الإخلاء الطبي', type: 'Inspection', status: 'Passed', time: '2026-06-21' }
        ]
    });
});

app.get('/api/facility/iot', requireAuth, requireRole('iot'), (req, res) => {
    res.json([
        { id: 1, device_name: 'جهاز تنفس اصطناعي ذكي - ICU-A1', type: 'Ventilator', status: 'Normal', connectivity: 'Connected', battery: 98, metric: '14 bpm / 99% SpO2' },
        { id: 2, device_name: 'ثلاجة لقاحات الصيدلية المركزية - FR-09', type: 'Temperature Controller', status: 'Warning', connectivity: 'Connected', battery: 100, metric: '2.4°C (Target: 2.0-8.0)' },
        { id: 3, device_name: 'مراقبة علامات حيوية متنقل - Ward-304', type: 'Patient Monitor', status: 'Normal', connectivity: 'Connected', battery: 42, metric: 'HR: 76 bpm | Temp: 37.1°C' },
        { id: 4, device_name: 'جهاز غسيل الكلى ذكي - Dialysis-B4', type: 'Dialysis', status: 'Maintenance', connectivity: 'Disconnected', battery: 12, metric: 'Under preventive maintenance' }
    ]);
});

app.get('/api/legal/cases', requireAuth, requireRole('legal'), (req, res) => {
    res.json([
        { id: 1, case_number: 'ML-2026-004', subject: 'طلب إقرار طبي شرعي - قضية حادث مروري', risk_level: 'Low', status: 'Pending', date: '2026-06-18' },
        { id: 2, case_number: 'ML-2026-012', subject: 'مراجعة عقد توريد أجهزة أشعة PACS جديدة', risk_level: 'Medium', status: 'In Review', date: '2026-06-15' },
        { id: 3, case_number: 'ML-2025-098', subject: 'دعوى تعويض خطأ تشخيصي طبي (مغلقة)', risk_level: 'High', status: 'Settled', date: '2025-11-20' }
    ]);
});

app.get('/api/toxicology/incidents', requireAuth, requireRole('toxicology'), (req, res) => {
    res.json([
        { id: 1, date: '2026-06-22', substance: 'استنشاق غاز أول أكسيد الكربون (حالة حريق)', severity: 'Critical', treatment: 'أكسجين عالي الضغط وغرفة غسيل النيتروجين', status: 'In ICU' },
        { id: 2, date: '2026-06-21', substance: 'تسمم بمبيد حشري فوسفاتي عضوي', severity: 'Critical', treatment: 'حقن الأتروبين والتوكسوجونين الفوري', status: 'Recovered' },
        { id: 3, date: '2026-06-19', substance: 'ابتلاع جرعة دواء زائدة (تسمم دوائي بالباراسيتامول)', severity: 'Moderate', treatment: 'غسيل معدة فوري وإعطاء N-acetylcysteine', status: 'Discharged' }
    ]);
});

// ===== BOOT-TIME COLUMN MIGRATIONS (non-production only) =====
// These additive ALTERs ran on every boot and silently swallowed errors. They require
// table-owner/DDL rights the production app role (nama_medical_app) lacks. Disabled in
// production and managed out-of-band (see docs/sql/boot_time_schema_cleanup_candidate_*).
if (process.env.NODE_ENV !== 'production') {
    // MIGRATION: Add last_ip column to system_users
    (async () => { try { await pool.query(`DO $$ BEGIN ALTER TABLE system_users ADD COLUMN last_ip TEXT DEFAULT ''; EXCEPTION WHEN duplicate_column THEN NULL; END $$;`); } catch (e) { } })();
    // MIGRATION: Add doctor column to pharmacy_prescriptions_queue
    (async () => { try { await pool.query(`DO $$ BEGIN ALTER TABLE pharmacy_prescriptions_queue ADD COLUMN doctor TEXT DEFAULT ''; EXCEPTION WHEN duplicate_column THEN NULL; END $$;`); } catch (e) { } })();
    // MIGRATION: Fix audit_trail schema (add user_name and details columns)
    (async () => {
        try {
            await pool.query(`DO $$ BEGIN ALTER TABLE audit_trail ADD COLUMN user_name TEXT DEFAULT ''; EXCEPTION WHEN duplicate_column THEN NULL; END $$;`);
            await pool.query(`DO $$ BEGIN ALTER TABLE audit_trail ADD COLUMN details TEXT DEFAULT ''; EXCEPTION WHEN duplicate_column THEN NULL; END $$;`);
        } catch (e) { }
    })();
}


// ===== SPA CATCH-ALL (must be LAST route) =====
app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

startServer();
