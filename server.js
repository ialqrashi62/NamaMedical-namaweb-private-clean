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
const ce = require('./crypto_envelope'); // A3 at-rest envelope encryption (DPAPI KEK); graceful when not configured
const lis = require('./lis'); // E3 LIS clinical-safety core (autoVerify / isCritical / HL7 parse / QC) — pure functions
const fe = require('./finance_engine'); // E10 GL/ZATCA pure engine (balanced-entry, VAT, aging, UBL/QR)
const bbCompat = require('./bloodbank_compat'); // E13 blood-bank ABO/Rh compatibility engine (pure, fail-closed)
const obEngine = require('./ob_engine'); // E14 OB/Maternity server-side authority engine (EDD/GA/GPAL/APGAR/biometry/risk)
const { insertSampleData, populateLabCatalog, populateRadiologyCatalog } = require('./seed_data_pg');
const { populateMedicalServices, populateBaseDrugs } = require('./seed_services_pg');
const { addExtraLabTests, addExtraRadiology } = require('./seed_extra_catalog');
const { mountOrderRoutes } = require('./orders');           // E-X1 unified orders (additive)
const { makeRequirePermission } = require('./rbac');        // E-X3 RBAC matrix middleware (additive)
// E1 Doctor Station (additive): pure CDS engine + clinical routes (problems/SOAP/CPOE).
const cds = require('./cds');
const { mountClinicalRoutes } = require('./clinical_cpoe');
// E6 Nursing / MAR (additive): pure clinical-scoring engine (Morse/Braden/NEWS/Pain).
const nursingScores = require('./nursing_scores');
// E7 Emergency Department (additive): server-side ESI (Emergency Severity Index) triage engine.
const esiEngine = require('./esi_engine');
// E9 ICU / Critical Care (additive): server-side, anti-spoof SOFA / GCS / APACHE-II acuity engine.
const icuScoring = require('./icu_scoring');
const e11Engine = require('./e11_insurance_engine'); // E11 insurance/NPHIES pure engine (state machines + co-pay math)
const pathologyEngine = require('./pathology_engine'); // E15: pure state-machine + accession + flag engine
const e16 = require('./e16_inventory_engine'); // E16 inventory/CSSD pure engine (FEFO, no-negative, BI gate)
const e18 = require('./e18_hr_engine'); // E18 HR/Workforce pure engine (license expiry, leave SM, payroll, PII mask)
const { mountOnboardingRoutes } = require('./onboarding'); // E0 Facility Onboarding Wizard (super-admin provisioning)

// Multer setup for radiology image uploads — A3A: PHI vault OUTSIDE public webroot (no static/direct access)
const uploadsDir = path.join(__dirname, 'phi_vault', 'radiology');
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

// ===== Gate 3: HTTP perimeter hardening (CODE-ONLY; activates on next PM2 restart) =====
// CORS allowlist: the SPA is same-origin and needs NO cross-origin CORS. Same-origin requests
// carry no Origin (or a matching one) and never require ACAO. Set CORS_ALLOWED_ORIGINS
// (comma-separated) only if a trusted cross-origin client must call the API with credentials.
const corsAllowlist = (process.env.CORS_ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
// Extra headers not covered by helmet defaults: Permissions-Policy + CSP.
// CSP mode is controlled by CSP_ENFORCE (default unset -> Report-Only). Enforcing stays OFF until a
// separate approved deploy sets CSP_ENFORCE=true: the SPA still relies on inline handlers/styles + CDN
// assets, so observe report-uri violations first. img-src/media-src cover the login page's external
// avatar (googleusercontent) + promo video (cloudinary); report-uri points at the sanitized collector below.
const CSP_ENFORCE = process.env.CSP_ENFORCE === 'true';   // default false => Content-Security-Policy-Report-Only
const CSP_DIRECTIVES = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob: https://lh3.googleusercontent.com",
    "media-src 'self' https://res.cloudinary.com",
    "connect-src 'self'",
    "frame-ancestors 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "report-uri /api/csp-report"
].join('; ');
app.use((req, res, next) => {
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=(), payment=(), usb=(), magnetometer=(), gyroscope=()');
    res.setHeader(CSP_ENFORCE ? 'Content-Security-Policy' : 'Content-Security-Policy-Report-Only', CSP_DIRECTIVES);
    next();
});

// CSP violation report collector (sanitized, PHI-free, no DB). Registered BEFORE session/CSRF so the
// browser's unauthenticated report POST is always accepted. Logs a truncated summary only — never
// cookies, Authorization, body, or PHI. Rate-limited to bound log volume.
const cspReportLimiter = rateLimit({ windowMs: 60 * 1000, max: 60, standardHeaders: false, legacyHeaders: false });
app.post('/api/csp-report',
    cspReportLimiter,
    express.json({ type: ['application/csp-report', 'application/reports+json', 'application/json'], limit: '16kb' }),
    (req, res) => {
        try {
            const r = (req.body && (req.body['csp-report'] || req.body)) || {};
            const summary = {
                doc: String(r['document-uri'] || r.documentURL || '').slice(0, 200),
                directive: String(r['violated-directive'] || r['effective-directive'] || r.effectiveDirective || '').slice(0, 120),
                blocked: String(r['blocked-uri'] || r.blockedURL || '').slice(0, 200)
            };
            console.warn('[CSP-REPORT]', JSON.stringify(summary));
        } catch (e) { /* ignore malformed report */ }
        res.status(204).end();
    });

// Rate limiting for login endpoint
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: { error: 'Too many login attempts, please try again after 15 minutes' } });

// Middleware — CORS restricted to an allowlist (no more reflect-any-origin with credentials).
app.use(cors({
    origin: function (origin, cb) {
        if (!origin) return cb(null, true);             // same-origin / non-browser (no Origin header)
        if (corsAllowlist.includes(origin)) return cb(null, true);
        return cb(null, false);                         // disallowed cross-origin: no ACAO emitted -> browser blocks
    },
    credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
class FallbackSessionStore extends session.Store {
    constructor(redisStore) {
        super();
        this.redisStore = redisStore;
        this.memoryStore = new session.MemoryStore();
        
        if (typeof redisStore.on === 'function') {
            redisStore.on('disconnect', (...args) => this.emit('disconnect', ...args));
            redisStore.on('connect', (...args) => this.emit('connect', ...args));
        }
    }
    get(sid, cb) {
        if (this.redisStore.client.isReady) {
            this.redisStore.get(sid, (err, val) => {
                if (err) {
                    console.warn('[SESSION WARNING] Redis get failed, falling back to MemoryStore:', err.message);
                    return this.memoryStore.get(sid, cb);
                }
                cb(null, val);
            });
        } else {
            this.memoryStore.get(sid, cb);
        }
    }
    set(sid, val, cb) {
        if (this.redisStore.client.isReady) {
            this.redisStore.set(sid, val, (err) => {
                if (err) {
                    console.warn('[SESSION WARNING] Redis set failed, falling back to MemoryStore:', err.message);
                    return this.memoryStore.set(sid, val, cb);
                }
                cb(null);
            });
        } else {
            this.memoryStore.set(sid, val, cb);
        }
    }
    destroy(sid, cb) {
        if (this.redisStore.client.isReady) {
            this.redisStore.destroy(sid, (err) => {
                if (err) {
                    console.warn('[SESSION WARNING] Redis destroy failed, falling back to MemoryStore:', err.message);
                    return this.memoryStore.destroy(sid, cb);
                }
                cb(null);
            });
        } else {
            this.memoryStore.destroy(sid, cb);
        }
    }
    touch(sid, val, cb) {
        if (this.redisStore.client.isReady) {
            if (typeof this.redisStore.touch === 'function') {
                this.redisStore.touch(sid, val, (err) => {
                    if (err) return this.memoryStore.touch(sid, val, cb);
                    cb(null);
                });
            } else {
                cb(null);
            }
        } else {
            this.memoryStore.touch(sid, val, cb);
        }
    }
}

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
        const store = new RedisStore({ client: redisClient, prefix: "nama_session:" });
        sessionStore = new FallbackSessionStore(store);
    } catch (e) {
        console.warn('[SESSION WARNING] Redis dependencies or connection failed, falling back to MemoryStore:', e.message);
    }
} else {
    console.log('[SESSION INFO] No Redis configuration detected, using default MemoryStore for sessions.');
}

const sessionConfig = {
    secret: process.env.SESSION_SECRET || (process.env.NODE_ENV === 'production' ? (() => { throw new Error('SESSION_SECRET is required in production'); })() : 'dev-only-insecure-secret-change-me'),
    resave: true,
    saveUninitialized: false,
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

// ===== Gate 3: CSRF defense-in-depth — Origin/Referer check for state-changing requests =====
// Complements sameSite=lax cookies. Conservative & reversible: safe methods pass; missing Origin
// (non-browser clients, health checks) passes (auth + sameSite still apply); same-origin always
// passes; cross-origin mutations are blocked unless the Origin is in CORS_ALLOWED_ORIGINS.
const CSRF_SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
app.use((req, res, next) => {
    if (CSRF_SAFE_METHODS.has(req.method)) return next();
    const origin = req.get('origin');
    if (!origin) return next();
    try {
        if (new URL(origin).host === req.get('host')) return next();   // same-origin
    } catch (e) { /* malformed Origin -> fall through to block */ }
    if (corsAllowlist.includes(origin)) return next();                 // explicitly trusted cross-origin
    return res.status(403).json({ error: 'Cross-origin request blocked' });
});

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

// A3A: hard-deny legacy public PHI paths BEFORE static/SPA fallback (PHI now served only via /api/phi-files/:id)
app.all('/uploads/radiology/*', (req, res) => res.status(404).json({ error: 'Not found' }));

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

// ===== DISCOUNT LIMIT BY ROLE + server-side billing integrity (PHASE 1 C-2/C-3) =====
// Pure, unit-tested helpers live in ./billing_integrity.js (parseMoney / enforceDiscountCap fail closed).
const { MAX_DISCOUNT_BY_ROLE, parseMoney, enforceDiscountCap, parsePositiveMoneyToMinorUnits, toMinorUnits, assertAmountWithinCap } = require('./billing_integrity');

// sendBillingError: translate a thrown integrity error into its HTTP status (defaults to 500 for unexpected errors).
function sendBillingError(res, e) {
    if (e && e.statusCode) return res.status(e.statusCode).json({ error: e.message });
    console.error('Billing error:', e && e.message);
    return res.status(500).json({ error: 'Server error' });
}

// RBAC middleware - role-based access control
const ROLE_PERMISSIONS = {
    'Admin': '*',
    'Doctor': ['dashboard', 'patients', 'appointments', 'doctor', 'lab', 'radiology', 'pharmacy', 'nursing', 'waiting', 'reports', 'messaging', 'surgery', 'consent', 'icu', 'him', 'medical-records', 'emergency', 'inpatient', 'bloodbank', 'obgyn', 'antenatal', 'cssd', 'quality', 'infection'],
    'Nurse': ['dashboard', 'patients', 'nursing', 'waiting', 'vitals', 'icu', 'emergency', 'inpatient', 'transport', 'dietary', 'bloodbank', 'obgyn', 'antenatal', 'cssd', 'quality', 'infection'],
    'HIM': ['dashboard', 'patients', 'him', 'medical-records', 'reports', 'messaging'],
    'OB/GYN': ['dashboard', 'patients', 'doctor', 'lab', 'radiology', 'surgery', 'nursing', 'inpatient', 'obgyn', 'antenatal', 'messaging', 'reports'],
    'Midwife': ['dashboard', 'patients', 'nursing', 'obgyn', 'antenatal', 'messaging'],
    'Neonatologist': ['dashboard', 'patients', 'icu', 'nursing', 'obgyn', 'antenatal', 'messaging'],
    'Pharmacist': ['dashboard', 'pharmacy', 'inventory', 'messaging', 'infection'],
    'Lab Technician': ['dashboard', 'lab', 'messaging', 'bloodbank'],
    'Blood Bank': ['dashboard', 'bloodbank', 'messaging'],
    'CSSD Manager': ['dashboard', 'cssd', 'inventory', 'messaging'],
    'Inventory Manager': ['dashboard', 'inventory', 'messaging'],
    'Radiologist': ['dashboard', 'radiology', 'messaging'],
    'Pathologist': ['dashboard', 'pathology', 'lab', 'messaging'],
    'Reception': ['dashboard', 'patients', 'appointments', 'waiting', 'messaging', 'accounts'],
    'Finance': ['dashboard', 'finance', 'insurance', 'reports', 'accounts', 'invoices'],
    'Insurance': ['dashboard', 'insurance', 'reports'],
    'HR': ['dashboard', 'hr', 'messaging', 'reports'],
    'IT': ['dashboard', 'settings', 'messaging', 'maintenance'],
    'Quality Manager': ['dashboard', 'quality', 'infection', 'reports', 'messaging'],
    'Infection Control': ['dashboard', 'infection', 'quality', 'nursing', 'reports', 'messaging'],
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

// H-7: HR or Admin may see compensation fields; everyone else gets a safe staff-directory projection.
function isHrOrAdmin(user) {
    const r = user && user.role;
    if (r === 'Admin') return true;
    const perms = ROLE_PERMISSIONS[r];
    return Array.isArray(perms) && perms.includes('hr');
}
// directory-safe employee columns (excludes salary / commission_type / commission_value)
const EMPLOYEE_DIRECTORY_COLS = 'id, name, name_ar, name_en, role, department_ar, department_en, status, created_at';

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

// ===== EPIC E17 — Quality / Incidents / CAPA + Infection Control =====
// Fail-closed tenant guard for E17: returns integer tenantId or throws (caller -> 403).
function e17RequireTenant(req) {
    const { tenantId, isProduction } = getRequestTenantContext(req);
    const tid = parseInt(tenantId, 10);
    if (!Number.isInteger(tid) || tid <= 0) {
        const err = new Error('Tenant scope required');
        err.statusCode = 403;
        throw err;
    }
    return tid;
}

// Server-side authority enums (client may NOT invent values).
const E17_INCIDENT_SEVERITY = ['low', 'medium', 'high', 'critical'];
const E17_INCIDENT_HARM = ['None', 'Mild', 'Moderate', 'Severe', 'Death'];
const E17_INCIDENT_TYPES = ['medication_error', 'fall', 'infection', 'equipment', 'complaint', 'near_miss', 'other'];

// Incident workflow state machine (server-enforced).
const E17_INCIDENT_TRANSITIONS = {
    'Open': ['Investigating', 'Closed'],
    'Investigating': ['Action', 'Closed'],
    'Action': ['Closed'],
    'Closed': []
};
function e17IsValidIncidentTransition(from, to) {
    const allowed = E17_INCIDENT_TRANSITIONS[from];
    return Array.isArray(allowed) && allowed.includes(to);
}

// CAPA state machine (server-enforced; rejects invalid transitions with 409).
const E17_CAPA_TRANSITIONS = {
    'Pending': ['InProgress', 'Cancelled'],
    'InProgress': ['Completed', 'Cancelled'],
    'Completed': ['Verified'],
    'Verified': [],
    'Cancelled': []
};
function e17IsValidCapaTransition(from, to) {
    const allowed = E17_CAPA_TRANSITIONS[from];
    return Array.isArray(allowed) && allowed.includes(to);
}
const E17_CAPA_TYPES = ['Corrective', 'Preventive'];

// Risk register: server computes score + level (anti-spoof — never trusts client).
function e17ComputeRisk(likelihood, impact) {
    const L = Math.min(5, Math.max(1, parseInt(likelihood, 10) || 1));
    const I = Math.min(5, Math.max(1, parseInt(impact, 10) || 1));
    const score = L * I;
    let level = 'Low';
    if (score >= 15) level = 'Extreme';
    else if (score >= 10) level = 'High';
    else if (score >= 5) level = 'Medium';
    return { likelihood: L, impact: I, score, level };
}
const E17_PRECAUTION_TYPES = ['standard', 'contact', 'droplet', 'airborne', 'protective'];
const E17_AMS_SEVERITY = ['Advisory', 'Action Required', 'Critical'];


// ===== SINGLE SESSION ENFORCEMENT =====
// Track active session IDs per user to prevent concurrent logins
const activeUserSessions = new Map(); // userId -> sessionId

// ===== AUTH ROUTES =====
// A2: establish authenticated session — shared by password-only login and post-MFA completion
async function establishSession(req, user, clientIp) {
    // prevent session fixation: issue a fresh session id at successful authentication
    await new Promise((resolve, reject) => req.session.regenerate(err => (err ? reject(err) : resolve())));
    const previousSessionId = activeUserSessions.get(user.id);
    if (previousSessionId && previousSessionId !== req.sessionID) {
        req.sessionStore.destroy(previousSessionId, (err) => { if (err) console.error('Error destroying old session:', err); });
    }
    let userTenantId = null, userFacilityId = null;
    try {
        const tenantRow = (await pool.query('SELECT tenant_id FROM user_tenants WHERE user_id=$1 AND is_active=true LIMIT 1', [user.id])).rows[0];
        if (tenantRow) {
            userTenantId = tenantRow.tenant_id;
            const facRow = (await pool.query('SELECT facility_id FROM user_facilities WHERE user_id=$1 AND is_primary=true LIMIT 1', [user.id])).rows[0];
            if (facRow) userFacilityId = facRow.facility_id;
        }
    } catch (e) { console.error('Error fetching tenant/facility scope for user:', e); }
    if (!userTenantId && process.env.NODE_ENV !== 'production') { userTenantId = 1; userFacilityId = 1; }
    req.session.user = {
        id: user.id, name: user.display_name, display_name: user.display_name,
        role: user.role, speciality: user.speciality || '', permissions: user.permissions || '',
        tenantId: userTenantId, facilityId: userFacilityId
    };
    activeUserSessions.set(user.id, req.sessionID);
    await pool.query('UPDATE system_users SET last_ip=$1 WHERE id=$2', [clientIp, user.id]).catch(() => { });
    logAudit(user.id, user.display_name, 'LOGIN', 'Auth', `User logged in as ${user.role}`, clientIp);
}

// A2 MFA — RFC-6238 TOTP via built-in crypto (no external dependency); secrets are never logged
const MFA_B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function mfaB32Encode(buf) { let bits = 0, val = 0, out = ''; for (const b of buf) { val = (val << 8) | b; bits += 8; while (bits >= 5) { out += MFA_B32[(val >>> (bits - 5)) & 31]; bits -= 5; } } if (bits > 0) out += MFA_B32[(val << (5 - bits)) & 31]; return out; }
function mfaB32Decode(str) { let bits = 0, val = 0; const out = []; for (const c of String(str).replace(/=+$/, '').toUpperCase()) { const idx = MFA_B32.indexOf(c); if (idx < 0) continue; val = (val << 5) | idx; bits += 5; if (bits >= 8) { out.push((val >>> (bits - 8)) & 0xff); bits -= 8; } } return Buffer.from(out); }
function mfaGenSecret() { return mfaB32Encode(require('crypto').randomBytes(20)); }
function mfaCodeAt(secret, counter) { const key = mfaB32Decode(secret); const buf = Buffer.alloc(8); buf.writeBigUInt64BE(BigInt(counter)); const h = require('crypto').createHmac('sha1', key).update(buf).digest(); const o = h[h.length - 1] & 0xf; const n = ((h[o] & 0x7f) << 24) | ((h[o + 1] & 0xff) << 16) | ((h[o + 2] & 0xff) << 8) | (h[o + 3] & 0xff); return (n % 1000000).toString().padStart(6, '0'); }
function mfaVerify(secret, token, window = 1) { if (!secret || !token) return false; const t = Math.floor(Date.now() / 1000 / 30); const tok = String(token).trim(); for (let i = -window; i <= window; i++) { if (mfaCodeAt(secret, t + i) === tok) return true; } return false; }
function mfaMatchCounter(secret, token, window = 1) { if (!secret || !token) return null; const t = Math.floor(Date.now() / 1000 / 30); const tok = String(token).trim(); for (let i = -window; i <= window; i++) { if (mfaCodeAt(secret, t + i) === tok) return t + i; } return null; }
// TOTP replay guard: reject any code whose 30s counter was already consumed for this user (in-memory; codes expire in ~90s so this needs no persistence)
const mfaLastCounter = new Map();
function mfaConsume(uid, secret, token) {
    const ctr = mfaMatchCounter(secret, token);
    if (ctr === null) return false;
    const last = mfaLastCounter.get(uid);
    if (last !== undefined && ctr <= last) return false;   // replay
    mfaLastCounter.set(uid, ctr);
    return true;
}

app.post('/api/auth/login', loginLimiter, async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ error: 'Missing credentials' });
        const clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.ip;
        const { rows } = await pool.query('SELECT id, display_name, role, speciality, permissions, password_hash FROM system_users WHERE username=$1 AND is_active=1', [username]);
        if (!rows.length) {
            logAudit(null, String(username).slice(0, 64), 'FAILED_LOGIN', 'Auth', 'Failed login: unknown or inactive user', clientIp);
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        const user = rows[0];
        // Check bcrypt hash (Plaintext password fallback is disabled for security)
        let valid = false;
        if (user.password_hash && user.password_hash.startsWith('$2')) {
            valid = await bcrypt.compare(password, user.password_hash);
        }
        if (!valid) {
            logAudit(user.id, user.display_name, 'FAILED_LOGIN', 'Auth', 'Failed login: incorrect password', clientIp);
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // A2 MFA gate: if user opted into MFA, require a second factor before establishing the session.
        // Non-MFA users are unaffected (no row / mfa_enabled=false => normal login).
        const mfaRow = (await pool.query('SELECT mfa_enabled FROM user_mfa WHERE user_id=$1', [user.id])).rows[0];
        if (mfaRow && mfaRow.mfa_enabled) {
            req.session.pendingMfaUserId = user.id;
            req.session.pendingMfaAt = Date.now();
            logAudit(user.id, user.display_name, 'MFA_CHALLENGE', 'Auth', 'Password verified; awaiting second factor', clientIp);
            return res.json({ mfaRequired: true });
        }

        await establishSession(req, user, clientIp);
        res.json({ success: true, user: req.session.user });
    } catch (e) { console.error('LOGIN ERROR:', e); res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/auth/logout', (req, res) => {
    // Remove from single-session tracking
    if (req.session && req.session.user) {
        activeUserSessions.delete(req.session.user.id);
        logAudit(req.session.user.id, req.session.user.display_name, 'LOGOUT', 'Auth', 'User logged out', req.ip);
    }
    req.session.destroy();
    res.json({ success: true });
});

// ===== A2 MFA (TOTP) — opt-in; NO global enforcement (mfa_enabled per-user, default false) =====
app.get('/api/mfa/status', requireAuth, async (req, res) => {
    try {
        const r = (await pool.query('SELECT mfa_enabled FROM user_mfa WHERE user_id=$1', [req.session.user.id])).rows[0];
        res.json({ enabled: !!(r && r.mfa_enabled) });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// begin enrollment: issue a fresh secret (mfa stays disabled until /verify confirms a live code)
app.post('/api/mfa/enroll', requireAuth, async (req, res) => {
    try {
        const uid = req.session.user.id;
        const existing = (await pool.query('SELECT mfa_enabled FROM user_mfa WHERE user_id=$1', [uid])).rows[0];
        if (existing && existing.mfa_enabled) return res.status(409).json({ error: 'MFA already enabled' });
        const secret = mfaGenSecret();
        const storedSecret = ce.isEnabled() ? ce.encryptString(secret) : secret; // encrypt at-rest when KEK configured
        await pool.query('INSERT INTO user_mfa (user_id, mfa_secret, mfa_enabled) VALUES ($1,$2,false) ON CONFLICT (user_id) DO UPDATE SET mfa_secret=$2, mfa_enabled=false, enrolled_at=NULL', [uid, storedSecret]);
        const label = encodeURIComponent('NamaMedical:' + (req.session.user.display_name || uid));
        logAudit(uid, req.session.user.display_name, 'MFA_ENROLL_START', 'Auth', 'MFA enrollment started', req.ip);
        res.json({ otpauth_url: `otpauth://totp/${label}?secret=${secret}&issuer=NamaMedical&period=30&digits=6`, secret });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// confirm enrollment (or re-verify): on first enable, issue one-time recovery codes (returned once; only hashes stored)
app.post('/api/mfa/verify', requireAuth, async (req, res) => {
    try {
        const uid = req.session.user.id; const { token } = req.body;
        const row = (await pool.query('SELECT mfa_secret, mfa_enabled FROM user_mfa WHERE user_id=$1', [uid])).rows[0];
        if (!row || !row.mfa_secret) return res.status(400).json({ error: 'No enrollment in progress' });
        if (!mfaConsume(uid, ce.decryptString(row.mfa_secret), token)) return res.status(400).json({ error: 'Invalid code' }); // replay-guarded (was mfaVerify)
        const justEnabled = !row.mfa_enabled;
        await pool.query('UPDATE user_mfa SET mfa_enabled=true, enrolled_at=COALESCE(enrolled_at, now()), last_verified_at=now() WHERE user_id=$1', [uid]);
        let recovery = null;
        if (justEnabled) {
            await pool.query('DELETE FROM user_mfa_recovery_codes WHERE user_id=$1', [uid]);
            recovery = [];
            for (let i = 0; i < 8; i++) {
                const code = require('crypto').randomBytes(5).toString('hex');
                recovery.push(code);
                await pool.query('INSERT INTO user_mfa_recovery_codes (user_id, code_hash) VALUES ($1,$2)', [uid, await bcrypt.hash(code, 10)]);
            }
            logAudit(uid, req.session.user.display_name, 'MFA_ENABLED', 'Auth', 'MFA enabled (TOTP); recovery codes issued', req.ip);
        } else {
            logAudit(uid, req.session.user.display_name, 'MFA_VERIFY', 'Auth', 'MFA code verified', req.ip);
        }
        res.json({ success: true, ...(recovery ? { recovery_codes: recovery } : {}) });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// second factor at login — uses the pending challenge set by /api/auth/login; accepts TOTP or a one-time recovery code
app.post('/api/auth/mfa', async (req, res) => {
    try {
        const uid = req.session.pendingMfaUserId;
        if (!uid) return res.status(401).json({ error: 'No pending MFA challenge' });
        if (req.session.pendingMfaAt && (Date.now() - req.session.pendingMfaAt > 5 * 60 * 1000)) { delete req.session.pendingMfaUserId; return res.status(401).json({ error: 'Challenge expired' }); }
        const clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.ip;
        const { token, recoveryCode } = req.body;
        const u = (await pool.query('SELECT id, display_name, role, speciality, permissions FROM system_users WHERE id=$1 AND is_active=1', [uid])).rows[0];
        if (!u) { delete req.session.pendingMfaUserId; return res.status(401).json({ error: 'Invalid' }); }
        const mfa = (await pool.query('SELECT mfa_secret FROM user_mfa WHERE user_id=$1', [uid])).rows[0];
        let ok = false, via = '';
        if (token && mfa && mfaConsume(uid, ce.decryptString(mfa.mfa_secret), token)) { ok = true; via = 'totp'; }   // replay-guarded (decrypt at-rest secret)
        else if (recoveryCode) {
            const codes = (await pool.query('SELECT id, code_hash FROM user_mfa_recovery_codes WHERE user_id=$1 AND used=false', [uid])).rows;
            for (const c of codes) { if (await bcrypt.compare(String(recoveryCode).trim(), c.code_hash)) { ok = true; via = 'recovery'; await pool.query('UPDATE user_mfa_recovery_codes SET used=true WHERE id=$1', [c.id]); break; } }
        }
        if (!ok) {
            // brute-force guard: cap attempts per challenge, then force a fresh password step
            req.session.pendingMfaFails = (req.session.pendingMfaFails || 0) + 1;
            logAudit(uid, u.display_name, 'FAILED_MFA', 'Auth', 'Invalid second factor', clientIp);
            if (req.session.pendingMfaFails >= 5) { delete req.session.pendingMfaUserId; delete req.session.pendingMfaAt; delete req.session.pendingMfaFails; return res.status(429).json({ error: 'Too many attempts; please log in again' }); }
            return res.status(401).json({ error: 'Invalid code' });
        }
        delete req.session.pendingMfaUserId; delete req.session.pendingMfaAt; delete req.session.pendingMfaFails;
        await pool.query('UPDATE user_mfa SET last_verified_at=now() WHERE user_id=$1', [uid]);
        await establishSession(req, u, clientIp);
        logAudit(uid, u.display_name, 'MFA_LOGIN', 'Auth', `Second factor OK (${via})`, clientIp);
        res.json({ success: true, user: req.session.user });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// self-disable own MFA — requires a valid current TOTP
app.post('/api/mfa/disable', requireAuth, async (req, res) => {
    try {
        const uid = req.session.user.id; const { token, password } = req.body;
        const row = (await pool.query('SELECT mfa_secret, mfa_enabled FROM user_mfa WHERE user_id=$1', [uid])).rows[0];
        if (!row || !row.mfa_enabled) return res.status(400).json({ error: 'MFA not enabled' });
        // step-up: require current password (bcrypt) in addition to a valid TOTP for this security-sensitive action
        const pw = (await pool.query('SELECT password_hash FROM system_users WHERE id=$1', [uid])).rows[0];
        if (!pw || !pw.password_hash || !pw.password_hash.startsWith('$2') || !(await bcrypt.compare(String(password || ''), pw.password_hash))) return res.status(401).json({ error: 'Password required' });
        if (!mfaVerify(ce.decryptString(row.mfa_secret), token)) return res.status(400).json({ error: 'Invalid code' });
        await pool.query('UPDATE user_mfa SET mfa_enabled=false, mfa_secret=NULL WHERE user_id=$1', [uid]);
        await pool.query('DELETE FROM user_mfa_recovery_codes WHERE user_id=$1', [uid]);
        logAudit(uid, req.session.user.display_name, 'MFA_DISABLED_SELF', 'Auth', 'User disabled own MFA', req.ip);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// admin reset — Admin only; the recovery path so MFA can never permanently lock out any user (incl. the last admin)
app.post('/api/mfa/admin-reset', requireAuth, async (req, res) => {
    try {
        if (req.session.user.role !== 'Admin') return res.status(403).json({ error: 'Access denied' });
        const target = parseInt(req.body.userId, 10);
        if (!Number.isInteger(target)) return res.status(400).json({ error: 'userId required' });
        const tu = (await pool.query('SELECT id FROM system_users WHERE id=$1', [target])).rows[0];
        if (!tu) return res.status(404).json({ error: 'User not found' });
        await pool.query('UPDATE user_mfa SET mfa_enabled=false, mfa_secret=NULL WHERE user_id=$1', [target]);
        await pool.query('DELETE FROM user_mfa_recovery_codes WHERE user_id=$1', [target]);
        logAudit(req.session.user.id, req.session.user.display_name, 'MFA_ADMIN_RESET', 'Auth', `Admin reset MFA for user #${target}`, req.ip);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
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
// H-7 Option C: GET stays open for staff/doctor lists, but compensation fields (salary/commission)
// are projected out for non-HR/non-Admin callers. `cols` is a server-controlled constant (never client input).
app.get('/api/employees', requireAuth, async (req, res) => {
    try {
        const cols = isHrOrAdmin(req.session.user) ? '*' : EMPLOYEE_DIRECTORY_COLS;
        const { role } = req.query;
        if (role) { res.json((await pool.query(`SELECT ${cols} FROM employees WHERE role LIKE $1 ORDER BY name`, [`%${role}%`])).rows); }
        else { res.json((await pool.query(`SELECT ${cols} FROM employees ORDER BY id DESC`)).rows); }
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
        const { patient_id, patient_name, description, service_type, payment_method, discount_reason } = req.body;
        // --- C-2: money is validated & recomputed server-side; client total/discount are NOT trusted as opaque values ---
        const netTotal = parseMoney(req.body.total, { field: 'total' });          // net (post-discount) amount
        const discountAmt = parseMoney(req.body.discount, { field: 'discount' });  // absolute SAR discount
        const grossAmount = Math.round((netTotal + discountAmt) * 100) / 100;      // server-derived original amount
        // --- C-3: enforce per-role discount cap (throws 403 when exceeded) ---
        enforceDiscountCap(req.session.user?.role, discountAmt, grossAmount);
        // --- C-2: server-authoritative VAT (net treated as VAT-inclusive per KSA retail); client vat never trusted ---
        const vatInfo = fe.vatFromInclusive(netTotal);
        const vatAmount = vatInfo ? parseFloat(vatInfo.vat_amount) : 0;
        // Generate sequential invoice number
        const maxInv = (await pool.query("SELECT invoice_number FROM invoices WHERE invoice_number LIKE 'INV-%' ORDER BY id DESC LIMIT 1")).rows[0];
        let nextNum = 1;
        if (maxInv && maxInv.invoice_number) { const parts = maxInv.invoice_number.split('-'); nextNum = parseInt(parts[2]) + 1; }
        const invNumber = 'INV-' + new Date().getFullYear() + '-' + String(nextNum).padStart(5, '0');
        const createdBy = req.session.user?.display_name || '';
        // --- TENANT SCOPE: stamp tenant_id & facility_id from session (never from body) ---
        const { tenantId, facilityId } = getRequestTenantContext(req);
        const result = await pool.query(
            'INSERT INTO invoices (patient_id, patient_name, total, description, service_type, payment_method, discount, discount_reason, invoice_number, created_by, original_amount, vat_amount, tenant_id, facility_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id',
            [patient_id || null, patient_name, netTotal, description || '', service_type || '', payment_method || '', discountAmt, discount_reason || '', invNumber, createdBy, grossAmount, vatAmount, tenantId || null, facilityId || null]);
        logAudit(req.session.user?.id, createdBy, 'CREATE_INVOICE', 'Finance', invNumber + ' - ' + netTotal + ' SAR (VAT ' + vatAmount + ') for ' + patient_name, req.ip);
        if (discountAmt > 0) {
            logAudit(req.session.user?.id, createdBy, 'INVOICE_DISCOUNT', 'Finance',
                `${invNumber}: discount ${discountAmt} SAR (${((discountAmt / grossAmount) * 100).toFixed(1)}%) reason: ${String(discount_reason || '').slice(0, 120)}`, req.ip);
        }
        res.json((await pool.query('SELECT * FROM invoices WHERE id=$1', [result.rows[0].id])).rows[0]);
    } catch (e) { sendBillingError(res, e); }
});

// ===== E11 INSURANCE / NPHIES (eligibility, pre-auth, claims lifecycle, denials, payer pricing) =====
// Security model: every route requireAuth + requireRole(insurance/finance/admin) + requireTenantScope;
//   every query carries an explicit AND tenant_id=$N on top of FORCE RLS; e11RequireTenant fails CLOSED
//   (403, no unscoped fallback); claim status/adjudication are server-authoritative (client cannot set
//   approved/amounts); invalid lifecycle transitions are rejected 409; every mutation is audited.
const E11_INS_ROLES = ['insurance', 'finance'];

// fail-closed tenant resolver: null tenant => throw 403 (no unscoped fallback). Mirrors e7/e8/e9/e10.
function e11RequireTenant(req) {
    const { tenantId } = getRequestTenantContext(req);
    if (!tenantId) { const err = new Error('Tenant scope required'); err.e11Status = 403; throw err; }
    return tenantId;
}
// integer-id coercion guard: positive integer or null (no padded-string/float bypass — E6 lesson).
function e11IntId(v) {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    if (!Number.isInteger(n) || n <= 0) return null;
    return n;
}
function e11Money(v) {
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) return null;
    return e11Engine.round2(n);
}
function e11Err(res, e) {
    if (e && e.e11Status) return res.status(e.e11Status).json({ error: e.message });
    console.error('E11 insurance error:', e && e.message);
    return res.status(500).json({ error: 'Server error' });
}
// NPHIES external integration gate — default OFF (no real creds => never call NPHIES; intent-only stub).
function e11NphiesEnabled() {
    return /^(1|true|on|yes)$/i.test(String(process.env.NPHIES_ENABLED || '').trim());
}

// ----- Insurance companies (tenant-scoped) -----
app.get('/api/insurance/companies', requireAuth, requireRole(...E11_INS_ROLES), requireTenantScope, async (req, res) => {
    try {
        const tenantId = e11RequireTenant(req);
        res.json((await pool.query('SELECT * FROM insurance_companies WHERE tenant_id=$1 ORDER BY id DESC', [tenantId])).rows);
    } catch (e) { return e11Err(res, e); }
});

app.post('/api/insurance/companies', requireAuth, requireRole(...E11_INS_ROLES), requireTenantScope, async (req, res) => {
    try {
        const tenantId = e11RequireTenant(req);
        const { name_ar, name_en, contact_info } = req.body;
        const result = await pool.query(
            'INSERT INTO insurance_companies (tenant_id, name_ar, name_en, contact_info) VALUES ($1,$2,$3,$4) RETURNING id',
            [tenantId, name_ar || '', name_en || '', contact_info || '']);
        logAudit(req.session.user.id, req.session.user.display_name, 'CREATE_INSURANCE_COMPANY', 'Insurance', `Company #${result.rows[0].id}`, req.ip);
        res.json((await pool.query('SELECT * FROM insurance_companies WHERE id=$1 AND tenant_id=$2', [result.rows[0].id, tenantId])).rows[0]);
    } catch (e) { return e11Err(res, e); }
});

// ----- Insurance policies (tenant-scoped, read) -----
app.get('/api/insurance/policies', requireAuth, requireRole(...E11_INS_ROLES), requireTenantScope, async (req, res) => {
    try {
        const tenantId = e11RequireTenant(req);
        res.json((await pool.query('SELECT * FROM insurance_policies WHERE tenant_id=$1 ORDER BY id DESC', [tenantId])).rows);
    } catch (e) { return e11Err(res, e); }
});

// ----- Eligibility check (NPHIES GATED; intent-only stub when NPHIES_ENABLED off) -----
app.get('/api/insurance/eligibility', requireAuth, requireRole(...E11_INS_ROLES), requireTenantScope, async (req, res) => {
    try {
        const tenantId = e11RequireTenant(req);
        res.json((await pool.query('SELECT * FROM insurance_eligibility_checks WHERE tenant_id=$1 ORDER BY id DESC LIMIT 200', [tenantId])).rows);
    } catch (e) { return e11Err(res, e); }
});

app.post('/api/insurance/eligibility', requireAuth, requireRole(...E11_INS_ROLES), requireTenantScope, async (req, res) => {
    try {
        const tenantId = e11RequireTenant(req);
        const patientId = e11IntId(req.body.patient_id);
        const companyId = e11IntId(req.body.insurance_company_id);
        const policyNumber = String(req.body.policy_number || '');
        // verify referenced entities belong to this tenant (no cross-tenant linkage)
        if (patientId) {
            const p = await pool.query('SELECT id FROM patients WHERE id=$1 AND tenant_id=$2', [patientId, tenantId]);
            if (!p.rows.length) return res.status(404).json({ error: 'Patient not found' });
        }
        if (companyId) {
            const c = await pool.query('SELECT id FROM insurance_companies WHERE id=$1 AND tenant_id=$2', [companyId, tenantId]);
            if (!c.rows.length) return res.status(404).json({ error: 'Insurance company not found' });
        }
        const intent = JSON.stringify({ patient_id: patientId, insurance_company_id: companyId, policy_number: policyNumber, ts: new Date().toISOString() });
        // record the eligibility request (status='pending'); status is server-authoritative (never from client)
        const ins = await pool.query(
            `INSERT INTO insurance_eligibility_checks (tenant_id, patient_id, insurance_company_id, policy_number, status, nphies_request_json, checked_by)
             VALUES ($1,$2,$3,$4,'pending',$5,$6) RETURNING id`,
            [tenantId, patientId, companyId, policyNumber, intent, req.session.user.id]);
        const checkId = ins.rows[0].id;
        logAudit(req.session.user.id, req.session.user.display_name, 'INSURANCE_ELIGIBILITY_CHECK', 'Insurance', `Eligibility #${checkId} (patient ${patientId})`, req.ip);
        if (!e11NphiesEnabled()) {
            // GATED: no real NPHIES creds — return 503 + the recorded intent (do NOT fabricate eligibility)
            return res.status(503).json({ error: 'NPHIES integration disabled', gated: true, eligibility_id: checkId, status: 'pending' });
        }
        // (real NPHIES call would go here when creds are provisioned; status updated server-side from response)
        return res.json({ success: true, eligibility_id: checkId, status: 'pending' });
    } catch (e) { return e11Err(res, e); }
});

// ----- Pre-authorization workflow (request -> approved/denied/partial; server-authoritative) -----
app.get('/api/insurance/pre-auth', requireAuth, requireRole(...E11_INS_ROLES), requireTenantScope, async (req, res) => {
    try {
        const tenantId = e11RequireTenant(req);
        res.json((await pool.query('SELECT * FROM insurance_pre_authorizations WHERE tenant_id=$1 ORDER BY id DESC LIMIT 200', [tenantId])).rows);
    } catch (e) { return e11Err(res, e); }
});

app.post('/api/insurance/pre-auth', requireAuth, requireRole(...E11_INS_ROLES), requireTenantScope, async (req, res) => {
    try {
        const tenantId = e11RequireTenant(req);
        const patientId = e11IntId(req.body.patient_id);
        const admissionId = e11IntId(req.body.admission_id);
        const companyId = e11IntId(req.body.insurance_company_id);
        const requested = e11Money(req.body.requested_amount) || 0;
        const justification = String(req.body.clinical_justification || '');
        if (patientId) {
            const p = await pool.query('SELECT id FROM patients WHERE id=$1 AND tenant_id=$2', [patientId, tenantId]);
            if (!p.rows.length) return res.status(404).json({ error: 'Patient not found' });
        }
        if (admissionId) {
            const a = await pool.query('SELECT id FROM admissions WHERE id=$1 AND tenant_id=$2', [admissionId, tenantId]);
            if (!a.rows.length) return res.status(404).json({ error: 'Admission not found' });
        }
        if (companyId) {
            const c = await pool.query('SELECT id FROM insurance_companies WHERE id=$1 AND tenant_id=$2', [companyId, tenantId]);
            if (!c.rows.length) return res.status(404).json({ error: 'Insurance company not found' });
        }
        // always created in 'requested' state — client cannot pre-set approved (anti-spoof)
        const intent = JSON.stringify({ patient_id: patientId, admission_id: admissionId, insurance_company_id: companyId, requested_amount: requested, ts: new Date().toISOString() });
        const ins = await pool.query(
            `INSERT INTO insurance_pre_authorizations (tenant_id, patient_id, admission_id, insurance_company_id, requested_amount, auth_status, clinical_justification, nphies_request_json, requested_by)
             VALUES ($1,$2,$3,$4,$5,'requested',$6,$7,$8) RETURNING id`,
            [tenantId, patientId, admissionId, companyId, requested, justification, intent, req.session.user.id]);
        const paId = ins.rows[0].id;
        logAudit(req.session.user.id, req.session.user.display_name, 'INSURANCE_PREAUTH_REQUEST', 'Insurance', `PreAuth #${paId} (patient ${patientId})`, req.ip);
        if (!e11NphiesEnabled()) {
            return res.status(503).json({ error: 'NPHIES integration disabled', gated: true, pre_auth_id: paId, auth_status: 'requested' });
        }
        return res.json({ success: true, pre_auth_id: paId, auth_status: 'requested' });
    } catch (e) { return e11Err(res, e); }
});

// pre-auth decision — server-authoritative state machine (requested -> approved/denied/partial)
app.put('/api/insurance/pre-auth/:id/decision', requireAuth, requireRole(...E11_INS_ROLES), requireTenantScope, async (req, res) => {
    const client = await pool.connect();
    try {
        const tenantId = e11RequireTenant(req);
        const paId = e11IntId(req.params.id);
        if (!paId) return res.status(400).json({ error: 'Invalid pre-auth id' });
        const decision = String(req.body.decision || '');
        if (!['approved', 'denied', 'partial'].includes(decision)) return res.status(422).json({ error: 'Invalid decision' });
        const approvedAmount = e11Money(req.body.approved_amount) || 0;
        const authNumber = String(req.body.auth_number || '');
        await client.query('BEGIN');
        // lock the row before flipping state (race-safe)
        const cur = await client.query('SELECT id, auth_status FROM insurance_pre_authorizations WHERE id=$1 AND tenant_id=$2 FOR UPDATE', [paId, tenantId]);
        if (!cur.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Pre-auth not found' }); }
        if (!e11Engine.canTransitionPreAuth(cur.rows[0].auth_status, decision)) {
            await client.query('ROLLBACK');
            return res.status(409).json({ error: `Invalid transition ${cur.rows[0].auth_status} -> ${decision}` });
        }
        await client.query(
            'UPDATE insurance_pre_authorizations SET auth_status=$1, approved_amount=$2, auth_number=$3, decided_at=now() WHERE id=$4 AND tenant_id=$5',
            [decision, decision === 'denied' ? 0 : approvedAmount, authNumber, paId, tenantId]);
        await client.query('COMMIT');
        logAudit(req.session.user.id, req.session.user.display_name, 'INSURANCE_PREAUTH_DECISION', 'Insurance', `PreAuth #${paId} -> ${decision}`, req.ip);
        res.json({ success: true, pre_auth_id: paId, auth_status: decision });
    } catch (e) { try { await client.query('ROLLBACK'); } catch (_) {} return e11Err(res, e); }
    finally { client.release(); }
});

// ----- Claims (lifecycle: draft -> submitted -> adjudicated -> remittance_posted; denied/appealed) -----
app.get('/api/insurance/claims', requireAuth, requireRole(...E11_INS_ROLES), requireTenantScope, async (req, res) => {
    try {
        const tenantId = e11RequireTenant(req);
        res.json((await pool.query('SELECT * FROM insurance_claims WHERE tenant_id=$1 ORDER BY id DESC', [tenantId])).rows);
    } catch (e) { return e11Err(res, e); }
});

// create claim — always 'draft'/'Pending'; amounts requested only, adjudication is server-side later
app.post('/api/insurance/claims', requireAuth, requireRole(...E11_INS_ROLES), requireTenantScope, async (req, res) => {
    try {
        const tenantId = e11RequireTenant(req);
        const patientId = e11IntId(req.body.patient_id);
        const invoiceId = e11IntId(req.body.invoice_id);
        const companyId = e11IntId(req.body.insurance_company_id);
        const claimAmount = e11Money(req.body.claim_amount) || 0;
        const patientName = String(req.body.patient_name || '');
        // L3: insurance_company is a free-text denormalized name (legacy display convenience).
        // The authoritative FK link is insurance_company_id; that column is validated below.
        // If only a name is supplied without a companyId, it is stored as-is with no FK constraint.
        const companyName = String(req.body.insurance_company || '');
        // verify referenced entities belong to this tenant (block cross-tenant claim fabrication)
        if (patientId) {
            const p = await pool.query('SELECT id FROM patients WHERE id=$1 AND tenant_id=$2', [patientId, tenantId]);
            if (!p.rows.length) return res.status(404).json({ error: 'Patient not found' });
        }
        if (invoiceId) {
            const inv = await pool.query('SELECT id FROM invoices WHERE id=$1 AND tenant_id=$2', [invoiceId, tenantId]);
            if (!inv.rows.length) return res.status(404).json({ error: 'Invoice not found' });
        }
        if (companyId) {
            const c = await pool.query('SELECT id FROM insurance_companies WHERE id=$1 AND tenant_id=$2', [companyId, tenantId]);
            if (!c.rows.length) return res.status(404).json({ error: 'Insurance company not found' });
        }
        // lifecycle_status forced to 'draft' + legacy status 'Pending' — NEVER from client (anti-spoof)
        const result = await pool.query(
            `INSERT INTO insurance_claims (tenant_id, patient_id, invoice_id, insurance_company_id, patient_name, insurance_company, claim_amount, status, lifecycle_status, created_by, created_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,'Pending','draft',$8, now()) RETURNING id`,
            [tenantId, patientId, invoiceId, companyId, patientName, companyName, claimAmount, req.session.user.id]);
        const claimId = result.rows[0].id;
        logAudit(req.session.user.id, req.session.user.display_name, 'CREATE_INSURANCE_CLAIM', 'Insurance', `Claim #${claimId} (invoice ${invoiceId})`, req.ip);
        res.json((await pool.query('SELECT * FROM insurance_claims WHERE id=$1 AND tenant_id=$2', [claimId, tenantId])).rows[0]);
    } catch (e) { return e11Err(res, e); }
});

// claim state transition — single server-authoritative endpoint (replaces direct status PUT)
app.put('/api/insurance/claims/:id/transition', requireAuth, requireRole(...E11_INS_ROLES), requireTenantScope, async (req, res) => {
    const client = await pool.connect();
    try {
        const tenantId = e11RequireTenant(req);
        const claimId = e11IntId(req.params.id);
        if (!claimId) return res.status(400).json({ error: 'Invalid claim id' });
        const target = String(req.body.target || '');
        if (!e11Engine.isValidClaimState(target)) return res.status(422).json({ error: 'Invalid target state' });
        // submission to NPHIES is gated; block the submitted transition unless gate explicitly allows recording
        const approvedAmount = e11Money(req.body.approved_amount);
        const paidAmount = e11Money(req.body.paid_amount);
        const patientShare = e11Money(req.body.patient_share);
        const denialReason = String(req.body.denial_reason || '');

        await client.query('BEGIN');
        const cur = await client.query('SELECT id, lifecycle_status, claim_amount, policy_id FROM insurance_claims WHERE id=$1 AND tenant_id=$2 FOR UPDATE', [claimId, tenantId]);
        if (!cur.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Claim not found' }); }
        const from = cur.rows[0].lifecycle_status || 'draft';
        if (!e11Engine.canTransitionClaim(from, target)) {
            await client.query('ROLLBACK');
            return res.status(409).json({ error: `Invalid transition ${from} -> ${target}` });
        }
        // map legacy status field + stamp server-authoritative amounts/timestamps per target
        let legacyStatus = null, sets = ['lifecycle_status=$1'], params = [target];
        if (target === 'submitted') { sets.push('submitted_at=now()'); }
        if (target === 'adjudicated') {
            // --- Finding 1 fix: server-side adjudication amount enforcement ---
            const claimAmount = Number(cur.rows[0].claim_amount) || 0;
            // Prefer engine-computed split from policy if resolvable
            let finalApproved = approvedAmount != null ? approvedAmount : 0;
            let finalPatientShare = patientShare != null ? patientShare : 0;
            const policyId = cur.rows[0].policy_id ? Number(cur.rows[0].policy_id) : null;
            if (policyId) {
                const pol = await client.query('SELECT co_pay_percent, co_pay_max, max_limit FROM insurance_policies WHERE id=$1', [policyId]);
                if (pol.rows.length) {
                    const engineResult = e11Engine.computePatientShare(finalApproved > 0 ? finalApproved : claimAmount, pol.rows[0]);
                    if (engineResult.status === 'OK') {
                        finalApproved = finalApproved > 0 ? finalApproved : claimAmount;
                        finalPatientShare = engineResult.patientShare;
                    }
                }
            }
            // Mandatory guards: reject client-supplied amounts that violate business invariants
            if (finalApproved < 0 || finalPatientShare < 0) {
                await client.query('ROLLBACK');
                return res.status(422).json({ error: 'Adjudication amounts must not be negative' });
            }
            if (finalApproved > claimAmount) {
                await client.query('ROLLBACK');
                return res.status(422).json({ error: `approved_amount (${finalApproved}) cannot exceed claim_amount (${claimAmount})` });
            }
            if (finalPatientShare > finalApproved) {
                await client.query('ROLLBACK');
                return res.status(422).json({ error: `patient_share (${finalPatientShare}) cannot exceed approved_amount (${finalApproved})` });
            }
            legacyStatus = 'Approved'; sets.push('adjudicated_at=now()');
            sets.push(`approved_amount=$${params.length + 1}`); params.push(finalApproved);
            sets.push(`patient_share=$${params.length + 1}`); params.push(finalPatientShare);
        }
        if (target === 'remittance_posted') {
            sets.push(`paid_amount=$${params.length + 1}`); params.push(paidAmount != null ? paidAmount : 0);
        }
        if (target === 'denied') { legacyStatus = 'Rejected'; }
        if (legacyStatus) { sets.push(`status=$${params.length + 1}`); params.push(legacyStatus); }
        params.push(claimId); params.push(tenantId);
        await client.query(
            `UPDATE insurance_claims SET ${sets.join(', ')} WHERE id=$${params.length - 1} AND tenant_id=$${params.length}`, params);
        // record denial row on transition to denied (appeal lifecycle starts 'open')
        if (target === 'denied') {
            await client.query(
                'INSERT INTO insurance_claim_denials (tenant_id, claim_id, denial_reason, appeal_status, created_by) VALUES ($1,$2,$3,$4,$5)',
                [tenantId, claimId, denialReason, 'open', req.session.user.id]);
        }
        await client.query('COMMIT');
        logAudit(req.session.user.id, req.session.user.display_name, 'INSURANCE_CLAIM_TRANSITION', 'Insurance', `Claim #${claimId} ${from} -> ${target}`, req.ip);
        res.json((await pool.query('SELECT * FROM insurance_claims WHERE id=$1 AND tenant_id=$2', [claimId, tenantId])).rows[0]);
    } catch (e) { try { await client.query('ROLLBACK'); } catch (_) {} return e11Err(res, e); }
    finally { client.release(); }
});

// LEGACY status PUT — HARDENED: route the old client {status} payload through the state machine (409 on invalid).
// Pre-existing window.updateClaim still calls PUT /api/insurance/claims/:id with {status:'Approved'|'Rejected'}.
app.put('/api/insurance/claims/:id', requireAuth, requireRole(...E11_INS_ROLES), requireTenantScope, async (req, res) => {
    const client = await pool.connect();
    try {
        const tenantId = e11RequireTenant(req);
        const claimId = e11IntId(req.params.id);
        if (!claimId) return res.status(400).json({ error: 'Invalid claim id' });
        const status = String(req.body.status || '');
        // translate legacy status into a lifecycle target; reject anything else
        const target = status === 'Approved' ? 'adjudicated' : status === 'Rejected' ? 'denied' : null;
        if (!target) return res.status(422).json({ error: 'Unsupported status (use /transition)' });
        await client.query('BEGIN');
        const cur = await client.query('SELECT id, lifecycle_status FROM insurance_claims WHERE id=$1 AND tenant_id=$2 FOR UPDATE', [claimId, tenantId]);
        if (!cur.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Claim not found' }); }
        let from = cur.rows[0].lifecycle_status || 'draft';
        // legacy decision from a draft claim implies submit-then-decide; advance draft->submitted first
        if (from === 'draft' && e11Engine.canTransitionClaim('draft', 'submitted')) {
            await client.query('UPDATE insurance_claims SET lifecycle_status=$1, submitted_at=now() WHERE id=$2 AND tenant_id=$3', ['submitted', claimId, tenantId]);
            from = 'submitted';
        }
        if (!e11Engine.canTransitionClaim(from, target)) {
            await client.query('ROLLBACK');
            return res.status(409).json({ error: `Invalid transition ${from} -> ${target}` });
        }
        const legacyStatus = target === 'adjudicated' ? 'Approved' : 'Rejected';
        await client.query(
            `UPDATE insurance_claims SET lifecycle_status=$1, status=$2, ${target === 'adjudicated' ? 'adjudicated_at=now()' : 'adjudicated_at=adjudicated_at'} WHERE id=$3 AND tenant_id=$4`,
            [target, legacyStatus, claimId, tenantId]);
        if (target === 'denied') {
            await client.query('INSERT INTO insurance_claim_denials (tenant_id, claim_id, denial_reason, appeal_status, created_by) VALUES ($1,$2,$3,$4,$5)',
                [tenantId, claimId, '', 'open', req.session.user.id]);
        }
        await client.query('COMMIT');
        logAudit(req.session.user.id, req.session.user.display_name, 'INSURANCE_CLAIM_TRANSITION', 'Insurance', `Claim #${claimId} ${from} -> ${target} (legacy)`, req.ip);
        res.json((await pool.query('SELECT * FROM insurance_claims WHERE id=$1 AND tenant_id=$2', [claimId, tenantId])).rows[0]);
    } catch (e) { try { await client.query('ROLLBACK'); } catch (_) {} return e11Err(res, e); }
    finally { client.release(); }
});

// ----- Claim lines (link claim -> medical_services chargemaster) -----
app.get('/api/insurance/claims/:id/lines', requireAuth, requireRole(...E11_INS_ROLES), requireTenantScope, async (req, res) => {
    try {
        const tenantId = e11RequireTenant(req);
        const claimId = e11IntId(req.params.id);
        if (!claimId) return res.status(400).json({ error: 'Invalid claim id' });
        // ownership check via tenant-scoped claim lookup
        const c = await pool.query('SELECT id FROM insurance_claims WHERE id=$1 AND tenant_id=$2', [claimId, tenantId]);
        if (!c.rows.length) return res.status(404).json({ error: 'Claim not found' });
        res.json((await pool.query('SELECT * FROM insurance_claim_lines WHERE claim_id=$1 AND tenant_id=$2 ORDER BY id', [claimId, tenantId])).rows);
    } catch (e) { return e11Err(res, e); }
});

app.post('/api/insurance/claims/:id/lines', requireAuth, requireRole(...E11_INS_ROLES), requireTenantScope, async (req, res) => {
    try {
        const tenantId = e11RequireTenant(req);
        const claimId = e11IntId(req.params.id);
        if (!claimId) return res.status(400).json({ error: 'Invalid claim id' });
        const c = await pool.query('SELECT id, lifecycle_status FROM insurance_claims WHERE id=$1 AND tenant_id=$2', [claimId, tenantId]);
        if (!c.rows.length) return res.status(404).json({ error: 'Claim not found' });
        if (c.rows[0].lifecycle_status !== 'draft') return res.status(409).json({ error: 'Lines can only be added to a draft claim' });
        const serviceId = e11IntId(req.body.service_id);
        if (serviceId) {
            // Finding 3: medical_services has no tenant_id column — it is an intentionally shared/global
            // chargemaster catalog. Tenant isolation for claim lines is enforced by claim ownership above.
            const s = await pool.query('SELECT id FROM medical_services WHERE id=$1', [serviceId]);
            if (!s.rows.length) return res.status(404).json({ error: 'Service not found' });
        }
        // L2: quantity must be a positive integer (>=1); e11Money would silently coerce 0/-ve to a valid number.
        const qty = (() => { const n = Math.floor(Number(req.body.quantity)); return (Number.isFinite(n) && n >= 1) ? n : 1; })();
        const unitPrice = e11Money(req.body.unit_price) || 0;
        const lineAmount = e11Engine.round2(qty * unitPrice);
        const description = String(req.body.description || '');
        const ins = await pool.query(
            `INSERT INTO insurance_claim_lines (tenant_id, claim_id, service_id, description, quantity, unit_price, line_amount)
             VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
            [tenantId, claimId, serviceId, description, qty, unitPrice, lineAmount]);
        logAudit(req.session.user.id, req.session.user.display_name, 'INSURANCE_CLAIM_LINE_ADD', 'Insurance', `Claim #${claimId} line #${ins.rows[0].id}`, req.ip);
        res.json({ success: true, id: ins.rows[0].id, line_amount: lineAmount });
    } catch (e) { return e11Err(res, e); }
});

// ----- Denials + appeals -----
app.get('/api/insurance/denials', requireAuth, requireRole(...E11_INS_ROLES), requireTenantScope, async (req, res) => {
    try {
        const tenantId = e11RequireTenant(req);
        res.json((await pool.query('SELECT * FROM insurance_claim_denials WHERE tenant_id=$1 ORDER BY id DESC LIMIT 200', [tenantId])).rows);
    } catch (e) { return e11Err(res, e); }
});

app.put('/api/insurance/denials/:id/appeal', requireAuth, requireRole(...E11_INS_ROLES), requireTenantScope, async (req, res) => {
    const client = await pool.connect();
    try {
        const tenantId = e11RequireTenant(req);
        const denialId = e11IntId(req.params.id);
        if (!denialId) return res.status(400).json({ error: 'Invalid denial id' });
        const appealStatus = String(req.body.appeal_status || '');
        if (!['appealed', 'upheld', 'overturned', 'closed'].includes(appealStatus)) return res.status(422).json({ error: 'Invalid appeal status' });
        const notes = String(req.body.appeal_notes || '');
        await client.query('BEGIN');
        const cur = await client.query('SELECT id, claim_id, appeal_status FROM insurance_claim_denials WHERE id=$1 AND tenant_id=$2 FOR UPDATE', [denialId, tenantId]);
        if (!cur.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Denial not found' }); }
        await client.query('UPDATE insurance_claim_denials SET appeal_status=$1, appeal_notes=$2 WHERE id=$3 AND tenant_id=$4',
            [appealStatus, notes, denialId, tenantId]);
        // Finding 2 fix: 'appealed' (appeal filed) AND 'overturned' both move the claim denied->appealed.
        // 'appealed' = appeal submitted by the provider; 'overturned' = payer reverses the denial.
        if (appealStatus === 'appealed' || appealStatus === 'overturned') {
            const claimId = cur.rows[0].claim_id;
            const claim = await client.query('SELECT lifecycle_status FROM insurance_claims WHERE id=$1 AND tenant_id=$2 FOR UPDATE', [claimId, tenantId]);
            if (claim.rows.length && e11Engine.canTransitionClaim(claim.rows[0].lifecycle_status, 'appealed')) {
                await client.query('UPDATE insurance_claims SET lifecycle_status=$1 WHERE id=$2 AND tenant_id=$3', ['appealed', claimId, tenantId]);
            }
        }
        await client.query('COMMIT');
        logAudit(req.session.user.id, req.session.user.display_name, 'INSURANCE_DENIAL_APPEAL', 'Insurance', `Denial #${denialId} -> ${appealStatus}`, req.ip);
        res.json({ success: true, denial_id: denialId, appeal_status: appealStatus });
    } catch (e) { try { await client.query('ROLLBACK'); } catch (_) {} return e11Err(res, e); }
    finally { client.release(); }
});

// ----- Payer pricing tiers (per-payer chargemaster) -----
app.get('/api/insurance/payer-pricing', requireAuth, requireRole(...E11_INS_ROLES), requireTenantScope, async (req, res) => {
    try {
        const tenantId = e11RequireTenant(req);
        res.json((await pool.query('SELECT * FROM insurance_payer_pricing WHERE tenant_id=$1 ORDER BY id DESC LIMIT 500', [tenantId])).rows);
    } catch (e) { return e11Err(res, e); }
});

app.post('/api/insurance/payer-pricing', requireAuth, requireRole(...E11_INS_ROLES), requireTenantScope, async (req, res) => {
    try {
        const tenantId = e11RequireTenant(req);
        const companyId = e11IntId(req.body.insurance_company_id);
        const serviceId = e11IntId(req.body.service_id);
        const payerPrice = e11Money(req.body.payer_price);
        if (!companyId || !serviceId || payerPrice === null) return res.status(400).json({ error: 'company, service and payer_price required' });
        const c = await pool.query('SELECT id FROM insurance_companies WHERE id=$1 AND tenant_id=$2', [companyId, tenantId]);
        if (!c.rows.length) return res.status(404).json({ error: 'Insurance company not found' });
        // Finding 3: medical_services has no tenant_id column — intentionally shared/global chargemaster catalog.
        const s = await pool.query('SELECT id FROM medical_services WHERE id=$1', [serviceId]);
        if (!s.rows.length) return res.status(404).json({ error: 'Service not found' });
        const ins = await pool.query(
            `INSERT INTO insurance_payer_pricing (tenant_id, insurance_company_id, service_id, payer_price, created_by)
             VALUES ($1,$2,$3,$4,$5)
             ON CONFLICT (tenant_id, insurance_company_id, service_id)
             DO UPDATE SET payer_price=EXCLUDED.payer_price, is_active=1
             RETURNING id`,
            [tenantId, companyId, serviceId, payerPrice, req.session.user.id]);
        logAudit(req.session.user.id, req.session.user.display_name, 'INSURANCE_PAYER_PRICE_SET', 'Insurance', `Company #${companyId} service #${serviceId} -> ${payerPrice}`, req.ip);
        res.json({ success: true, id: ins.rows[0].id, payer_price: payerPrice });
    } catch (e) { return e11Err(res, e); }
});

// ----- NPHIES submission (GATED — 503 stub when NPHIES_ENABLED off; records submission intent) -----
app.post('/api/nphies/submit-claim/:id', requireAuth, requireRole(...E11_INS_ROLES), requireTenantScope, async (req, res) => {
    const client = await pool.connect();
    try {
        const tenantId = e11RequireTenant(req);
        const claimId = e11IntId(req.params.id);
        if (!claimId) return res.status(400).json({ error: 'Invalid claim id' });
        await client.query('BEGIN');
        const cur = await client.query('SELECT id, lifecycle_status FROM insurance_claims WHERE id=$1 AND tenant_id=$2 FOR UPDATE', [claimId, tenantId]);
        if (!cur.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Claim not found' }); }
        if (!e11Engine.canTransitionClaim(cur.rows[0].lifecycle_status, 'submitted')) {
            await client.query('ROLLBACK');
            return res.status(409).json({ error: `Cannot submit from ${cur.rows[0].lifecycle_status}` });
        }
        const intent = JSON.stringify({ claim_id: claimId, ts: new Date().toISOString() });
        await client.query('UPDATE insurance_claims SET nphies_request_json=$1 WHERE id=$2 AND tenant_id=$3', [intent, claimId, tenantId]);
        if (!e11NphiesEnabled()) {
            // GATED: do not flip to submitted without a real NPHIES acknowledgement; record intent only
            await client.query('COMMIT');
            logAudit(req.session.user.id, req.session.user.display_name, 'NPHIES_SUBMIT_GATED', 'Insurance', `Claim #${claimId} submit intent (NPHIES off)`, req.ip);
            return res.status(503).json({ error: 'NPHIES integration disabled', gated: true, claim_id: claimId });
        }
        // real submission path (when creds present): flip to submitted on acknowledged send
        await client.query('UPDATE insurance_claims SET lifecycle_status=$1, submitted_at=now() WHERE id=$2 AND tenant_id=$3', ['submitted', claimId, tenantId]);
        await client.query('COMMIT');
        logAudit(req.session.user.id, req.session.user.display_name, 'NPHIES_SUBMIT_CLAIM', 'Insurance', `Claim #${claimId} submitted to NPHIES`, req.ip);
        res.json({ success: true, claim_id: claimId, lifecycle_status: 'submitted' });
    } catch (e) { try { await client.query('ROLLBACK'); } catch (_) {} return e11Err(res, e); }
    finally { client.release(); }
});
// ===== end E11 INSURANCE / NPHIES =====

app.get('/api/medical/records', requireAuth, requireRole('doctor', 'nursing'), requireTenantScope, async (req, res) => {
    try {
        const { tenantId } = getRequestTenantContext(req);
        const { patient_id } = req.query;
        if (patient_id) {
            res.json((await pool.query('SELECT mr.*, p.name_en as patient_name FROM medical_records mr LEFT JOIN patients p ON mr.patient_id=p.id AND p.tenant_id=$2 WHERE mr.patient_id=$1 AND mr.tenant_id=$2 ORDER BY mr.id DESC', [patient_id, tenantId])).rows);
        } else {
            res.json((await pool.query('SELECT mr.*, p.name_en as patient_name FROM medical_records mr LEFT JOIN patients p ON mr.patient_id=p.id AND p.tenant_id=$1 WHERE mr.tenant_id=$1 ORDER BY mr.id DESC', [tenantId])).rows);
        }
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/medical/records', requireAuth, requireRole('doctor', 'nursing'), requireTenantScope, async (req, res) => {
    try {
        const { tenantId } = getRequestTenantContext(req);
        const { patient_id, doctor_id, diagnosis, symptoms, icd10_codes, notes } = req.body;
        // Verify patient belongs to tenant
        const p = (await pool.query('SELECT id FROM patients WHERE id=$1 AND tenant_id=$2', [patient_id, tenantId])).rows[0];
        if (!p) return res.status(404).json({ error: 'Patient not found' });

        const result = await pool.query('INSERT INTO medical_records (patient_id, doctor_id, diagnosis, symptoms, icd10_codes, notes, tenant_id) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
            [patient_id, doctor_id || 0, diagnosis || '', symptoms || '', icd10_codes || '', notes || '', tenantId]);
        res.json((await pool.query('SELECT * FROM medical_records WHERE id=$1 AND tenant_id=$2', [result.rows[0].id, tenantId])).rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== EMR LOCK / SIGNATURE (Phase A1) — sign+lock, amend (no silent edit after lock); tenant-scoped via RLS =====
app.post('/api/medical-records/:id/sign', requireAuth, requireRole('doctor', 'nursing'), requireTenantScope, async (req, res) => {
    try {
        const crypto = require('crypto');
        const id = parseInt(req.params.id, 10);
        const { tenantId } = getRequestTenantContext(req);
        const actor = req.session.user;
        const cur = (await pool.query('SELECT diagnosis, symptoms, notes, emr_status FROM medical_records WHERE id=$1 AND tenant_id=$2', [id, tenantId])).rows[0];
        if (!cur) return res.status(404).json({ error: 'Record not found' });
        if (cur.emr_status === 'locked') return res.status(409).json({ error: 'Record already locked' });
        const hash = crypto.createHash('sha256').update(`${cur.diagnosis || ''}|${cur.symptoms || ''}|${cur.notes || ''}`).digest('hex');
        const r = await pool.query("UPDATE medical_records SET emr_status='locked', signed_by_user_id=$1, signed_at=now(), locked_at=now(), integrity_hash=$2 WHERE id=$3 AND tenant_id=$4 AND emr_status<>'locked'",
            [actor.id, hash, id, tenantId]);
        if (r.rowCount === 0) return res.status(409).json({ error: 'Record already locked or not found' });
        logAudit(actor.id, actor.display_name, 'SIGN_LOCK_RECORD', 'EMR', `Signed+locked medical_record #${id}`, req.ip);
        res.json({ success: true, id, emr_status: 'locked' });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/medical-records/:id/amend', requireAuth, requireRole('doctor', 'nursing'), requireTenantScope, async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const { tenantId } = getRequestTenantContext(req);
        const actor = req.session.user;
        const { reason, new_values_summary } = req.body;
        if (!reason || !String(reason).trim()) return res.status(400).json({ error: 'Amendment reason required' });
        const cur = (await pool.query('SELECT integrity_hash, emr_status FROM medical_records WHERE id=$1 AND tenant_id=$2', [id, tenantId])).rows[0];
        if (!cur) return res.status(404).json({ error: 'Record not found' });
        if (cur.emr_status !== 'locked') return res.status(409).json({ error: 'Amendment applies only to locked records' });
        await pool.query('INSERT INTO emr_amendments (record_type, record_id, amended_by_user_id, reason, previous_integrity_hash, new_values_summary) VALUES ($1,$2,$3,$4,$5,$6)',
            ['medical_records', id, actor.id, String(reason), cur.integrity_hash, new_values_summary || '']);
        logAudit(actor.id, actor.display_name, 'AMEND_RECORD', 'EMR', `Amended locked medical_record #${id}: ${String(reason).slice(0, 120)}`, req.ip);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/medical-records/:id/amendments', requireAuth, requireRole('doctor', 'nursing'), requireTenantScope, async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const { tenantId } = getRequestTenantContext(req);
        // Verify parent record belongs to tenant
        const cur = (await pool.query('SELECT id FROM medical_records WHERE id=$1 AND tenant_id=$2', [id, tenantId])).rows[0];
        if (!cur) return res.status(404).json({ error: 'Record not found' });
        res.json((await pool.query('SELECT * FROM emr_amendments WHERE record_type=$1 AND record_id=$2 ORDER BY id DESC',
            ['medical_records', id])).rows);
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

// ============================================================================
// ===== E3 LABORATORY / LIS — sample lifecycle, structured results, =====
// =====    auto-verification, critical call-back, HL7 ingest, QC      =====
// ----------------------------------------------------------------------------
// CLINICAL SAFETY + TENANT SECURITY rules enforced on EVERY endpoint below:
//   * requireAuth + requireTenantScope (lab routes historically only had requireAuth).
//   * Explicit `tenant_id = $N` predicate on EVERY query (defense-in-depth) ON TOP of FORCE RLS.
//   * FAIL-CLOSED: a null tenant in production is rejected by requireTenantScope (403); the
//     handlers additionally refuse to run unscoped writes (no tenantId -> 400).
//   * FAIL-SAFE auto-verify (lis.autoVerify): any uncertainty -> HOLD, never silent verify.
//   * A CRITICAL result CANNOT transition to 'Reported' until a documented call-back exists.
// ----------------------------------------------------------------------------

// Helper: hard tenant gate for LIS writes (fail-closed). Returns tenantId or sends 400 and returns null.
function lisRequireTenant(req, res) {
    const { tenantId, facilityId } = getRequestTenantContext(req);
    if (!tenantId) { res.status(400).json({ error: 'Missing tenant context' }); return null; }
    return { tenantId, facilityId };
}

// ---- SAMPLES: list ----
app.get('/api/lab/samples', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const ctx = lisRequireTenant(req, res); if (!ctx) return;
        const rows = (await pool.query(
            `SELECT s.*, p.name_en AS patient_name
             FROM lab_samples s LEFT JOIN patients p ON s.patient_id = p.id
             WHERE s.tenant_id = $1 ORDER BY s.id DESC`, [ctx.tenantId])).rows;
        res.json(rows);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ---- SAMPLES: collect (create specimen, server-generated barcode) ----
app.post('/api/lab/samples', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const ctx = lisRequireTenant(req, res); if (!ctx) return;
        const { lab_order_id, patient_id, notes } = req.body;
        // IDOR: if a lab order is referenced, it must belong to this tenant.
        if (lab_order_id) {
            const ord = (await pool.query('SELECT id, patient_id FROM lab_radiology_orders WHERE id=$1 AND tenant_id=$2', [lab_order_id, ctx.tenantId])).rows[0];
            if (!ord) return res.status(404).json({ error: 'Lab order not found' });
        }
        // IDOR: if a patient is referenced, it must belong to this tenant.
        if (patient_id) {
            const pt = (await pool.query('SELECT id FROM patients WHERE id=$1 AND tenant_id=$2', [patient_id, ctx.tenantId])).rows[0];
            if (!pt) return res.status(404).json({ error: 'Patient not found' });
        }
        // Server-generated barcode: LAB-{order||0}-{epoch}{rand} — unique per tenant.
        const barcode = `LAB-${lab_order_id || 0}-${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
        const ins = await pool.query(
            `INSERT INTO lab_samples (tenant_id, facility_id, lab_order_id, patient_id, barcode, state, collected_by, notes)
             VALUES ($1,$2,$3,$4,$5,'Collected',$6,$7) RETURNING *`,
            [ctx.tenantId, ctx.facilityId || null, lab_order_id || null, patient_id || null, barcode, req.session.user?.id || null, notes || '']);
        logAudit(req.session.user?.id, req.session.user?.display_name, 'LAB_SAMPLE_COLLECT', 'Lab',
            `Sample ${barcode} collected for order #${lab_order_id || '-'}`, req.ip);
        res.json(ins.rows[0]);
    } catch (e) {
        if (e && e.code === '23505') return res.status(409).json({ error: 'Duplicate barcode' });
        res.status(500).json({ error: 'Server error' });
    }
});

// ---- SAMPLES: state transition (receive / in-process / reject) ----
app.put('/api/lab/samples/:id', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const ctx = lisRequireTenant(req, res); if (!ctx) return;
        const { action, rejected_reason } = req.body;
        // explicit tenant predicate (defense-in-depth) before any mutation.
        const sample = (await pool.query('SELECT * FROM lab_samples WHERE id=$1 AND tenant_id=$2', [req.params.id, ctx.tenantId])).rows[0];
        if (!sample) return res.status(404).json({ error: 'Sample not found' });

        // Allowed forward transitions (Verified/Reported are driven by result verification, not here).
        const transitions = {
            receive: { from: ['Collected'], to: 'Received' },
            process: { from: ['Received'], to: 'InProcess' },
            reject: { from: ['Collected', 'Received', 'InProcess'], to: 'Rejected' },
        };
        const t = transitions[action];
        if (!t) return res.status(400).json({ error: 'Invalid action' });
        if (!t.from.includes(sample.state)) return res.status(409).json({ error: `Cannot ${action} a sample in state ${sample.state}` });
        if (action === 'reject' && !rejected_reason) return res.status(400).json({ error: 'rejected_reason required' });

        if (action === 'receive') {
            await pool.query('UPDATE lab_samples SET state=$1, received_by=$2, received_at=CURRENT_TIMESTAMP WHERE id=$3 AND tenant_id=$4',
                [t.to, req.session.user?.id || null, req.params.id, ctx.tenantId]);
        } else if (action === 'reject') {
            await pool.query('UPDATE lab_samples SET state=$1, rejected_reason=$2, rejected_by=$3, rejected_at=CURRENT_TIMESTAMP WHERE id=$4 AND tenant_id=$5',
                [t.to, rejected_reason, req.session.user?.id || null, req.params.id, ctx.tenantId]);
        } else {
            await pool.query('UPDATE lab_samples SET state=$1 WHERE id=$2 AND tenant_id=$3', [t.to, req.params.id, ctx.tenantId]);
        }
        logAudit(req.session.user?.id, req.session.user?.display_name, 'LAB_SAMPLE_' + action.toUpperCase(), 'Lab',
            `Sample #${req.params.id} -> ${t.to}${rejected_reason ? ' (' + rejected_reason + ')' : ''}`, req.ip);
        res.json((await pool.query('SELECT * FROM lab_samples WHERE id=$1 AND tenant_id=$2', [req.params.id, ctx.tenantId])).rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ---- RESULTS: list (optionally by sample) ----
app.get('/api/lab/results', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const ctx = lisRequireTenant(req, res); if (!ctx) return;
        let rows;
        if (req.query.sample_id) {
            rows = (await pool.query('SELECT * FROM lab_results WHERE tenant_id=$1 AND lab_sample_id=$2 ORDER BY id DESC', [ctx.tenantId, req.query.sample_id])).rows;
        } else {
            rows = (await pool.query('SELECT * FROM lab_results WHERE tenant_id=$1 ORDER BY id DESC LIMIT 500', [ctx.tenantId])).rows;
        }
        res.json(rows);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ---- RESULTS: enter a result (runs auto-verification; FAIL-SAFE HOLD) ----
app.post('/api/lab/results', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const ctx = lisRequireTenant(req, res); if (!ctx) return;
        const { lab_sample_id, loinc, test_name, value, unit, normal_range, ref_low, ref_high, order_id } = req.body;
        if (!test_name || value === undefined || value === null || String(value).trim() === '') {
            return res.status(400).json({ error: 'test_name and value are required' });
        }
        // IDOR: sample (if referenced) must belong to this tenant.
        let sample = null;
        if (lab_sample_id) {
            sample = (await pool.query('SELECT * FROM lab_samples WHERE id=$1 AND tenant_id=$2', [lab_sample_id, ctx.tenantId])).rows[0];
            if (!sample) return res.status(404).json({ error: 'Sample not found' });
        }
        // Prior result for the same analyte (delta-check) within tenant — most recent VERIFIED.
        // CLINICAL SAFETY: only a VERIFIED prior may serve as the delta baseline. A held/pending
        // (unverified/erroneous) prior must NOT suppress a true significant delta. ('reported' is
        // tracked by the separate `reported` column, not status, so status='verified' covers it.)
        let prior = null;
        if (sample && sample.patient_id) {
            prior = (await pool.query(
                `SELECT lr.* FROM lab_results lr
                 JOIN lab_samples s ON lr.lab_sample_id = s.id AND s.tenant_id = lr.tenant_id
                 WHERE lr.tenant_id=$1 AND s.patient_id=$2 AND lower(lr.test_name)=lower($3) AND lr.status = 'verified'
                 ORDER BY lr.id DESC LIMIT 1`, [ctx.tenantId, sample.patient_id, test_name])).rows[0] || null;
        }
        // CLINICAL SAFETY: pure-function auto-verify (any uncertainty -> HOLD).
        const verdict = lis.autoVerify({ test_name, value, unit, ref_low, ref_high }, prior);
        const ins = await pool.query(
            `INSERT INTO lab_results
               (tenant_id, facility_id, lab_sample_id, order_id, loinc, test_name, value, unit, normal_range,
                ref_low, ref_high, abnormal_flag, delta_pct, is_critical, is_abnormal, status, hold_reasons)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`,
            [ctx.tenantId, ctx.facilityId || null, lab_sample_id || null, order_id || null, loinc || null, test_name,
             String(value), unit || '', normal_range || '',
             (ref_low === undefined || ref_low === '' ? null : ref_low),
             (ref_high === undefined || ref_high === '' ? null : ref_high),
             verdict.abnormal_flag, verdict.delta_pct, verdict.is_critical ? 1 : 0, verdict.is_abnormal,
             verdict.status, verdict.reasons.join(',')]);
        logAudit(req.session.user?.id, req.session.user?.display_name, 'LAB_RESULT_ENTER', 'Lab',
            `Result ${test_name}=${value} -> ${verdict.status}${verdict.is_critical ? ' [CRITICAL]' : ''} reasons:${verdict.reasons.join('|') || '-'}`, req.ip);
        res.json({ result: ins.rows[0], verdict });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ---- RESULTS: manual verify (for HELD results) ----
app.put('/api/lab/results/:id/verify', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const ctx = lisRequireTenant(req, res); if (!ctx) return;
        const r = (await pool.query('SELECT * FROM lab_results WHERE id=$1 AND tenant_id=$2', [req.params.id, ctx.tenantId])).rows[0];
        if (!r) return res.status(404).json({ error: 'Result not found' });
        await pool.query('UPDATE lab_results SET status=$1, verified_by=$2, verified_at=CURRENT_TIMESTAMP WHERE id=$3 AND tenant_id=$4',
            ['verified', req.session.user?.id || null, req.params.id, ctx.tenantId]);
        logAudit(req.session.user?.id, req.session.user?.display_name, 'LAB_RESULT_VERIFY', 'Lab',
            `Manually verified result #${req.params.id}`, req.ip);
        res.json((await pool.query('SELECT * FROM lab_results WHERE id=$1 AND tenant_id=$2', [req.params.id, ctx.tenantId])).rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ---- CRITICAL CALL-BACK: document a call-back for a critical result ----
app.post('/api/lab/results/:id/callback', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const ctx = lisRequireTenant(req, res); if (!ctx) return;
        const { notified_to, ack, notes } = req.body;
        if (!notified_to || String(notified_to).trim() === '') return res.status(400).json({ error: 'notified_to required' });
        const r = (await pool.query('SELECT * FROM lab_results WHERE id=$1 AND tenant_id=$2', [req.params.id, ctx.tenantId])).rows[0];
        if (!r) return res.status(404).json({ error: 'Result not found' });
        const ins = await pool.query(
            `INSERT INTO lab_critical_callbacks (tenant_id, facility_id, result_id, notified_to, notified_by, notified_by_name, ack, notes)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
            [ctx.tenantId, ctx.facilityId || null, req.params.id, String(notified_to), req.session.user?.id || null,
             req.session.user?.display_name || '', ack ? 1 : 0, notes || '']);
        logAudit(req.session.user?.id, req.session.user?.display_name, 'LAB_CRITICAL_CALLBACK', 'Lab',
            `Critical call-back for result #${req.params.id} -> ${notified_to}`, req.ip);
        res.json(ins.rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ---- RESULTS: report/release (FAIL-CLOSED: critical needs a documented call-back) ----
app.put('/api/lab/results/:id/report', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const ctx = lisRequireTenant(req, res); if (!ctx) return;
        const r = (await pool.query('SELECT * FROM lab_results WHERE id=$1 AND tenant_id=$2', [req.params.id, ctx.tenantId])).rows[0];
        if (!r) return res.status(404).json({ error: 'Result not found' });
        // AUDIT/INTEGRITY: re-reporting an already-reported result is rejected (not silently idempotent).
        if (r.reported) return res.status(409).json({ error: 'Result already reported' });
        // must be verified first.
        if (r.status !== 'verified') return res.status(409).json({ error: 'Result must be verified before reporting' });
        // CLINICAL SAFETY (FAIL-CLOSED): a critical result cannot be reported without a documented call-back.
        if (r.is_critical) {
            const cb = (await pool.query('SELECT count(*)::int AS n FROM lab_critical_callbacks WHERE result_id=$1 AND tenant_id=$2', [req.params.id, ctx.tenantId])).rows[0];
            if (!cb || cb.n === 0) {
                return res.status(409).json({ error: 'Critical result requires a documented call-back before reporting', code: 'CRITICAL_CALLBACK_REQUIRED' });
            }
        }
        // belt-and-suspenders: only flip an as-yet-unreported row (concurrency-safe with the 409 above).
        await pool.query('UPDATE lab_results SET reported=1, reported_at=CURRENT_TIMESTAMP WHERE id=$1 AND tenant_id=$2 AND reported = 0', [req.params.id, ctx.tenantId]);
        // advance the sample to Reported when present.
        if (r.lab_sample_id) {
            await pool.query("UPDATE lab_samples SET state='Reported' WHERE id=$1 AND tenant_id=$2", [r.lab_sample_id, ctx.tenantId]);
        }
        logAudit(req.session.user?.id, req.session.user?.display_name, 'LAB_RESULT_REPORT', 'Lab',
            `Reported result #${req.params.id}${r.is_critical ? ' [CRITICAL, call-back on file]' : ''}`, req.ip);
        res.json((await pool.query('SELECT * FROM lab_results WHERE id=$1 AND tenant_id=$2', [req.params.id, ctx.tenantId])).rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ---- HL7 INBOUND (gated; sandbox parse+store only, NO external connection) ----
// Accepts a raw HL7 v2 ORU-style payload, parses it (lis.parseHL7ORU), matches the specimen
// by barcode WITHIN THIS TENANT (cross-tenant barcode -> no match -> 404), and stores results
// with auto-verification. Malformed payloads are rejected safely (400). FEATURE-GATED.
app.post('/api/lab/hl7', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const ctx = lisRequireTenant(req, res); if (!ctx) return;
        // GATE: disabled unless explicitly enabled (no real analyzer/device wiring here).
        if (process.env.LAB_HL7_ENABLED !== 'true') {
            return res.status(403).json({ error: 'HL7 ingest disabled', code: 'HL7_GATED' });
        }
        const raw = typeof req.body === 'string' ? req.body : (req.body && req.body.message);
        const parsed = lis.parseHL7ORU(raw);
        if (!parsed.ok) return res.status(400).json({ error: 'Malformed HL7', detail: parsed.error });
        // Match specimen by barcode within tenant (explicit tenant predicate + RLS).
        const sample = (await pool.query('SELECT * FROM lab_samples WHERE barcode=$1 AND tenant_id=$2', [parsed.barcode, ctx.tenantId])).rows[0];
        if (!sample) return res.status(404).json({ error: 'No matching specimen for barcode in this tenant' });
        const stored = [];
        for (const obx of parsed.results) {
            const verdict = lis.autoVerify(obx, null);
            const ins = await pool.query(
                `INSERT INTO lab_results
                   (tenant_id, facility_id, lab_sample_id, loinc, test_name, value, unit, normal_range,
                    ref_low, ref_high, abnormal_flag, delta_pct, is_critical, is_abnormal, status, hold_reasons)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id, status, is_critical`,
                [ctx.tenantId, ctx.facilityId || null, sample.id, obx.loinc || null, obx.test_name, String(obx.value),
                 obx.unit || '', '', obx.ref_low, obx.ref_high, verdict.abnormal_flag, verdict.delta_pct,
                 verdict.is_critical ? 1 : 0, verdict.is_abnormal, verdict.status, verdict.reasons.join(',')]);
            stored.push(ins.rows[0]);
        }
        logAudit(req.session.user?.id, req.session.user?.display_name, 'LAB_HL7_INGEST', 'Lab',
            `HL7 ORU ingested for barcode ${parsed.barcode}: ${stored.length} result(s)`, req.ip);
        res.json({ ok: true, barcode: parsed.barcode, stored });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ---- QC: list ----
app.get('/api/lab/qc', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const ctx = lisRequireTenant(req, res); if (!ctx) return;
        res.json((await pool.query('SELECT * FROM lab_qc WHERE tenant_id=$1 ORDER BY id DESC LIMIT 500', [ctx.tenantId])).rows);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ---- QC: enter a point (Levey-Jennings / Westgard 1-3s) ----
app.post('/api/lab/qc', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const ctx = lisRequireTenant(req, res); if (!ctx) return;
        const { analyzer, analyte, level, value, target, sd, reagent_lot } = req.body;
        const flag = lis.qcFlag(value, target, sd);
        const ins = await pool.query(
            `INSERT INTO lab_qc (tenant_id, facility_id, analyzer, analyte, level, value, target, sd, z, westgard_flag, breach, reagent_lot, entered_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
            [ctx.tenantId, ctx.facilityId || null, analyzer || '', analyte || '', level || '',
             (value === undefined || value === '' ? null : value),
             (target === undefined || target === '' ? null : target),
             (sd === undefined || sd === '' ? null : sd),
             flag.z, flag.rule, flag.breach ? 1 : 0, reagent_lot || '', req.session.user?.id || null]);
        logAudit(req.session.user?.id, req.session.user?.display_name, 'LAB_QC_ENTER', 'Lab',
            `QC ${analyzer}/${analyte}/${level} value=${value} -> ${flag.rule}${flag.breach ? ' [BREACH]' : ''}`, req.ip);
        res.json({ qc: ins.rows[0], flag });
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
        // A3A: register file in tenant-scoped phi_files vault; serve only via guarded /api/phi-files/:id (never a public path)
        const crypto = require('crypto');
        const plainBuf = fs.readFileSync(req.file.path);
        const sha256 = crypto.createHash('sha256').update(plainBuf).digest('hex'); // integrity hash of the ORIGINAL bytes
        // A3: encrypt file at-rest (AES-256-GCM / DPAPI KEK) when configured — overwrite the on-disk file with ciphertext
        let encrypted = false;
        if (ce.isEnabled()) {
            try { fs.writeFileSync(req.file.path, Buffer.from(ce.encrypt(plainBuf), 'utf8')); encrypted = true; }
            catch (encErr) { console.error('PHI encrypt failed, storing plaintext:', encErr.message); }
        }
        const phi = (await pool.query(
            'INSERT INTO phi_files (record_type, record_id, stored_path, original_name, sha256, encrypted, uploaded_by_user_id) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
            ['radiology_order', orderId, req.file.path, req.file.originalname || req.file.filename, sha256, encrypted, req.session.user?.id])).rows[0];
        const imagePath = `/api/phi-files/${phi.id}`;
        const existingResults = order.results || '';
        const imageTag = `[IMG:${imagePath}]`;
        const newResults = existingResults ? `${existingResults}\n${imageTag}` : imageTag;
        await pool.query('UPDATE lab_radiology_orders SET results=$1 WHERE id=$2', [newResults, orderId]);
        logAudit(req.session.user?.id, req.session.user?.display_name, 'UPLOAD_RADIOLOGY_IMAGE', 'Radiology',
            `Uploaded image for radiology order #${orderId} (phi_file #${phi.id})`, req.ip);
        const updated = (await pool.query('SELECT * FROM lab_radiology_orders WHERE id=$1', [orderId])).rows[0];
        res.json({ success: true, path: imagePath, order: updated });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// A3A: guarded PHI file download — auth + EXPLICIT tenant predicate (defense-in-depth atop FORCE RLS); path-traversal denied; content-type pinned (no sniff-to-active-content)
app.get('/api/phi-files/:id', requireAuth, async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (!Number.isInteger(id)) return res.status(404).json({ error: 'File not found' });
        // explicit tenant scope (mirrors upload handler) — FORCE RLS is the backstop, not the sole control
        const { tenantId } = getRequestTenantContext(req);
        const tenantCheck = tenantId ? ' AND tenant_id=$2' : '';
        const params = tenantId ? [id, tenantId] : [id];
        const row = (await pool.query(`SELECT stored_path, original_name, encrypted FROM phi_files WHERE id=$1${tenantCheck}`, params)).rows[0];
        if (!row) return res.status(404).json({ error: 'File not found' });   // other tenants -> no row -> 404
        const vaultRoot = path.resolve(path.join(__dirname, 'phi_vault'));
        const resolved = path.resolve(row.stored_path);
        if (!resolved.startsWith(vaultRoot + path.sep) || !fs.existsSync(resolved)) return res.status(404).json({ error: 'File not found' });
        // pin Content-Type to a safe image/dicom MIME (uploads are extension-allowlisted) + block sniffing/active content
        const mimes = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.bmp': 'image/bmp', '.webp': 'image/webp', '.dcm': 'application/dicom', '.dicom': 'application/dicom' };
        const ext = path.extname(resolved).toLowerCase();
        res.setHeader('Content-Type', mimes[ext] || 'application/octet-stream');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
        res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(row.original_name || ('file' + ext))}"`);
        logAudit(req.session.user?.id, req.session.user?.display_name, 'PHI_FILE_DOWNLOAD', 'PHI',
            `Downloaded phi_file #${id}`, req.ip);
        // A3: decrypt at-rest ciphertext on the fly for authorized requester (legacy plaintext served as-is)
        if (row.encrypted) {
            try { return res.send(ce.decryptToBuffer(fs.readFileSync(resolved, 'utf8'))); }
            catch (decErr) { console.error('PHI decrypt failed:', decErr.message); return res.status(500).json({ error: 'Server error' }); }
        }
        res.sendFile(resolved);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ============================================================================
// ===== E4: RADIOLOGY — RIS WORKLIST + DICOM STUDIES (metadata) + STRUCTURED REPORTS
// All E4 endpoints are tenant-scoped with an EXPLICIT tenant_id predicate on EVERY
// query (defense-in-depth atop FORCE RLS), FAIL-CLOSED on null tenant context, and
// audited. DICOM/image bytes are NEVER served here — only via guarded /api/phi-files/:id.
// PACS/MWL is GATED behind RAD_MWL_ENABLED (no external connection; metadata only).
// ============================================================================
const RAD_WORKLIST_STATES = ['Scheduled', 'Arrived', 'InProgress', 'Completed', 'Reported'];
const RAD_WORKLIST_NEXT = {
    Scheduled: ['Arrived'],
    Arrived: ['InProgress'],
    InProgress: ['Completed'],
    Completed: ['Reported'],
    Reported: []
};
const RAD_MWL_ENABLED = String(process.env.RAD_MWL_ENABLED || '').toLowerCase() === 'true';

// --- E4-S1: RIS worklist list (tenant-scoped) ---
app.get('/api/radiology/worklist', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const { tenantId } = getRequestTenantContext(req);
        if (!tenantId) return res.status(403).json({ error: 'Tenant scope required' }); // FAIL-CLOSED
        const rows = (await pool.query(
            `SELECT e.*, p.name_en AS patient_name
             FROM rad_exams e LEFT JOIN patients p ON e.patient_id = p.id
             WHERE e.tenant_id = $1
             ORDER BY CASE e.state
                WHEN 'Scheduled' THEN 0 WHEN 'Arrived' THEN 1 WHEN 'InProgress' THEN 2
                WHEN 'Completed' THEN 3 WHEN 'Reported' THEN 4 ELSE 5 END, e.id DESC`,
            [tenantId])).rows;
        res.json(rows);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// --- E4-S1: schedule a worklist exam from an existing radiology order (tenant-scoped) ---
app.post('/api/radiology/worklist', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const { tenantId, facilityId } = getRequestTenantContext(req);
        if (!tenantId) return res.status(403).json({ error: 'Tenant scope required' }); // FAIL-CLOSED
        const { rad_order_id, modality, exam_name, accession, scheduled_at } = req.body;
        if (!rad_order_id) return res.status(400).json({ error: 'rad_order_id required' });
        // verify order belongs to current tenant (IDOR prevention) — explicit predicate
        const order = (await pool.query(
            'SELECT id, patient_id, order_type FROM lab_radiology_orders WHERE id=$1 AND is_radiology=1 AND tenant_id=$2',
            [rad_order_id, tenantId])).rows[0];
        if (!order) return res.status(404).json({ error: 'Radiology order not found' });
        const r = await pool.query(
            `INSERT INTO rad_exams (tenant_id, facility_id, rad_order_id, patient_id, modality, exam_name, accession, state, scheduled_at, created_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,'Scheduled',$8,$9) RETURNING *`,
            [tenantId, facilityId || null, rad_order_id, order.patient_id, modality || '',
             exam_name || order.order_type || '', accession || '', scheduled_at || null, req.session.user?.id || null]);
        logAudit(req.session.user?.id, req.session.user?.display_name, 'CREATE_RAD_EXAM', 'Radiology',
            `Scheduled rad exam for order #${rad_order_id} (exam #${r.rows[0].id})`, req.ip);
        res.json(r.rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// --- E4-S1: worklist state transition (Scheduled->Arrived->InProgress->Completed->Reported) ---
app.put('/api/radiology/worklist/:id/state', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const { tenantId } = getRequestTenantContext(req);
        if (!tenantId) return res.status(403).json({ error: 'Tenant scope required' }); // FAIL-CLOSED
        const examId = parseInt(req.params.id, 10);
        if (!Number.isInteger(examId)) return res.status(404).json({ error: 'Exam not found' });
        const { state } = req.body;
        if (!RAD_WORKLIST_STATES.includes(state)) return res.status(400).json({ error: 'Invalid state' });
        // verify exam belongs to current tenant (explicit predicate, IDOR + RLS backstop)
        const exam = (await pool.query('SELECT id, state FROM rad_exams WHERE id=$1 AND tenant_id=$2', [examId, tenantId])).rows[0];
        if (!exam) return res.status(404).json({ error: 'Exam not found' });
        // enforce forward-only state machine
        if (state !== exam.state && !(RAD_WORKLIST_NEXT[exam.state] || []).includes(state)) {
            return res.status(400).json({ error: `Illegal transition ${exam.state} -> ${state}` });
        }
        const tsCol = { Arrived: 'arrived_at', InProgress: 'started_at', Completed: 'completed_at', Reported: 'reported_at' }[state];
        const setTs = tsCol ? `, ${tsCol}=COALESCE(${tsCol}, CURRENT_TIMESTAMP)` : '';
        await pool.query(
            `UPDATE rad_exams SET state=$1, updated_at=CURRENT_TIMESTAMP${setTs} WHERE id=$2 AND tenant_id=$3`,
            [state, examId, tenantId]);
        logAudit(req.session.user?.id, req.session.user?.display_name, 'UPDATE_RAD_EXAM_STATE', 'Radiology',
            `Rad exam #${examId} ${exam.state} -> ${state}`, req.ip);
        res.json((await pool.query('SELECT * FROM rad_exams WHERE id=$1 AND tenant_id=$2', [examId, tenantId])).rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// --- E4-S2: DICOM study METADATA register (gated; metadata only; NO bytes here) ---
app.post('/api/radiology/dicom-studies', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const { tenantId, facilityId } = getRequestTenantContext(req);
        if (!tenantId) return res.status(403).json({ error: 'Tenant scope required' }); // FAIL-CLOSED
        const { rad_exam_id, study_uid, accession, modality, study_desc, series_count, instance_count, stored_ref } = req.body;
        let patientId = null, radOrderId = null;
        if (rad_exam_id) {
            // exam must belong to current tenant (explicit predicate)
            const exam = (await pool.query('SELECT id, patient_id, rad_order_id FROM rad_exams WHERE id=$1 AND tenant_id=$2', [rad_exam_id, tenantId])).rows[0];
            if (!exam) return res.status(404).json({ error: 'Exam not found' });
            patientId = exam.patient_id; radOrderId = exam.rad_order_id;
        }
        // if a stored_ref (phi_files.id) is provided, it must be a tenant-owned PHI object — never a public path
        if (stored_ref) {
            const phi = (await pool.query('SELECT id FROM phi_files WHERE id=$1 AND tenant_id=$2', [parseInt(stored_ref, 10) || 0, tenantId])).rows[0];
            if (!phi) return res.status(404).json({ error: 'Referenced file not found' });
        }
        const r = await pool.query(
            `INSERT INTO dicom_studies (tenant_id, facility_id, rad_exam_id, rad_order_id, patient_id, study_uid, accession, modality, study_desc, series_count, instance_count, stored_ref, source, created_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'manual',$13) RETURNING *`,
            [tenantId, facilityId || null, rad_exam_id || null, radOrderId, patientId,
             study_uid || '', accession || '', modality || '', study_desc || '',
             parseInt(series_count, 10) || 0, parseInt(instance_count, 10) || 0, stored_ref ? (parseInt(stored_ref, 10) || null) : null,
             req.session.user?.id || null]);
        logAudit(req.session.user?.id, req.session.user?.display_name, 'REGISTER_DICOM_STUDY', 'Radiology',
            `Registered DICOM study metadata (study #${r.rows[0].id}, accession ${accession || '-'})`, req.ip);
        res.json(r.rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// --- E4-S2: list DICOM study metadata for an exam (tenant-scoped) ---
app.get('/api/radiology/dicom-studies', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const { tenantId } = getRequestTenantContext(req);
        if (!tenantId) return res.status(403).json({ error: 'Tenant scope required' }); // FAIL-CLOSED
        const examId = parseInt(req.query.rad_exam_id, 10);
        const params = [tenantId];
        let sql = 'SELECT * FROM dicom_studies WHERE tenant_id=$1';
        if (Number.isInteger(examId)) { sql += ' AND rad_exam_id=$2'; params.push(examId); }
        sql += ' ORDER BY id DESC';
        res.json((await pool.query(sql, params)).rows);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// --- E4-S2: DICOM Modality Worklist (MWL) — GATED, parse/serve scheduled exams only; NO external connection ---
app.get('/api/radiology/mwl', requireAuth, requireTenantScope, async (req, res) => {
    try {
        if (!RAD_MWL_ENABLED) return res.status(503).json({ error: 'MWL disabled', gated: true });
        const { tenantId } = getRequestTenantContext(req);
        if (!tenantId) return res.status(403).json({ error: 'Tenant scope required' }); // FAIL-CLOSED
        // serve our OWN scheduled exams as a worklist for modalities — purely local, no PACS pull
        const rows = (await pool.query(
            `SELECT e.id, e.accession, e.modality, e.exam_name, e.scheduled_at, e.patient_id,
                    p.name_en AS patient_name, p.national_id
             FROM rad_exams e LEFT JOIN patients p ON e.patient_id = p.id
             WHERE e.tenant_id=$1 AND e.state IN ('Scheduled','Arrived')
             ORDER BY e.scheduled_at NULLS LAST, e.id`,
            [tenantId])).rows;
        logAudit(req.session.user?.id, req.session.user?.display_name, 'READ_RAD_MWL', 'Radiology',
            `Served MWL worklist (${rows.length} items)`, req.ip);
        res.json({ worklist: rows, count: rows.length });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// --- E4-S3: prior-comparison — only SIGNED priors, same patient + modality, within tenant ---
app.get('/api/radiology/reports/priors', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const { tenantId } = getRequestTenantContext(req);
        if (!tenantId) return res.status(403).json({ error: 'Tenant scope required' }); // FAIL-CLOSED
        const patientId = parseInt(req.query.patient_id, 10);
        if (!Number.isInteger(patientId)) return res.status(400).json({ error: 'patient_id required' });
        const modality = req.query.modality || '';
        // E3 Issue-1 lesson: return ONLY signed priors (status='Signed' AND signed_at present), tenant-scoped
        const rows = (await pool.query(
            `SELECT id, rad_exam_id, modality, template, impression, birads, signed_by, signed_at, created_at
             FROM rad_reports
             WHERE tenant_id=$1 AND patient_id=$2 AND status='Signed' AND signed_at IS NOT NULL
               AND ($3 = '' OR modality = $3)
             ORDER BY signed_at DESC`,
            [tenantId, patientId, modality])).rows;
        res.json(rows);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// --- E4-S3: create / update a structured report draft (tenant-scoped) ---
app.post('/api/radiology/reports', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const { tenantId, facilityId } = getRequestTenantContext(req);
        if (!tenantId) return res.status(403).json({ error: 'Tenant scope required' }); // FAIL-CLOSED
        const { rad_exam_id, template, structured_json, findings, impression, birads, is_critical, prior_study_id } = req.body;
        if (!rad_exam_id) return res.status(400).json({ error: 'rad_exam_id required' });
        // exam must belong to current tenant (explicit predicate)
        const exam = (await pool.query('SELECT id, patient_id, rad_order_id, modality FROM rad_exams WHERE id=$1 AND tenant_id=$2', [rad_exam_id, tenantId])).rows[0];
        if (!exam) return res.status(404).json({ error: 'Exam not found' });
        // prior_study_id (if supplied) must be a SIGNED tenant-owned prior report
        if (prior_study_id) {
            const prior = (await pool.query(
                "SELECT id FROM rad_reports WHERE id=$1 AND tenant_id=$2 AND status='Signed' AND signed_at IS NOT NULL",
                [parseInt(prior_study_id, 10) || 0, tenantId])).rows[0];
            if (!prior) return res.status(404).json({ error: 'Prior report not found or not signed' });
        }
        const r = await pool.query(
            `INSERT INTO rad_reports (tenant_id, facility_id, rad_exam_id, rad_order_id, patient_id, modality, template, structured_json, findings, impression, birads, is_critical, prior_study_id, status, radiologist_id, created_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'Draft',$14,$14) RETURNING *`,
            [tenantId, facilityId || null, rad_exam_id, exam.rad_order_id, exam.patient_id, exam.modality || '',
             template || 'generic', structured_json || '', findings || '', impression || '', birads || '',
             !!is_critical, prior_study_id ? (parseInt(prior_study_id, 10) || null) : null, req.session.user?.id || null]);
        logAudit(req.session.user?.id, req.session.user?.display_name, 'CREATE_RAD_REPORT', 'Radiology',
            `Drafted rad report #${r.rows[0].id} for exam #${rad_exam_id}${is_critical ? ' [CRITICAL]' : ''}`, req.ip);
        res.json(r.rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// --- E4-S3: record critical-finding notification (documents the call-back; required before signing) ---
// RBAC: report state-mutating endpoints are restricted to radiology/doctor (medico-legal) — not any tenant user.
app.post('/api/radiology/reports/:id/critical-notify', requireAuth, requireRole('radiology', 'doctor'), requireTenantScope, async (req, res) => {
    try {
        const { tenantId } = getRequestTenantContext(req);
        if (!tenantId) return res.status(403).json({ error: 'Tenant scope required' }); // FAIL-CLOSED
        const reportId = parseInt(req.params.id, 10);
        if (!Number.isInteger(reportId)) return res.status(404).json({ error: 'Report not found' });
        const { notified_doctor_id, note } = req.body;
        // report must belong to current tenant (explicit predicate)
        const rep = (await pool.query('SELECT id, patient_id, rad_order_id, is_critical FROM rad_reports WHERE id=$1 AND tenant_id=$2', [reportId, tenantId])).rows[0];
        if (!rep) return res.status(404).json({ error: 'Report not found' });
        // document the critical notification: notifications row (type='critical') + audit (canonical channel)
        let notifId = null;
        let target = notified_doctor_id ? parseInt(notified_doctor_id, 10) : null;
        // validate notified_doctor_id is a REAL existing user before using it as a notification user_id
        // (never insert a dangling/foreign user_id). system_users has no tenant_id; scope via user_tenants to the session tenant.
        if (target) {
            if (!Number.isInteger(target) || target <= 0) return res.status(400).json({ error: 'Invalid notified_doctor_id' });
            const u = (await pool.query(
                `SELECT u.id FROM system_users u
                 JOIN user_tenants ut ON ut.user_id = u.id
                 WHERE u.id = $1 AND ut.tenant_id = $2 AND ut.is_active = true`,
                [target, tenantId])).rows[0];
            if (!u) return res.status(400).json({ error: 'notified_doctor_id not found in this tenant' });
        }
        const msg = `CRITICAL radiology finding for patient #${rep.patient_id} (report #${reportId})${note ? ': ' + note : ''}`;
        if (target) {
            const n = await pool.query('INSERT INTO notifications (user_id, title, message, type, module, record_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
                [target, 'Critical Radiology Finding', msg, 'critical', 'Radiology', reportId]);
            notifId = n.rows[0].id;
        } else {
            const n = await pool.query('INSERT INTO notifications (target_role, title, message, type, module, record_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
                ['Doctor', 'Critical Radiology Finding', msg, 'critical', 'Radiology', reportId]);
            notifId = n.rows[0].id;
        }
        await pool.query('UPDATE rad_reports SET critical_notified_at=CURRENT_TIMESTAMP, critical_notify_ref=$1, updated_at=CURRENT_TIMESTAMP WHERE id=$2 AND tenant_id=$3',
            [notifId, reportId, tenantId]);
        logAudit(req.session.user?.id, req.session.user?.display_name, 'RAD_CRITICAL_NOTIFY', 'Radiology',
            `Documented critical notification for report #${reportId} (notification #${notifId})`, req.ip);
        res.json((await pool.query('SELECT * FROM rad_reports WHERE id=$1 AND tenant_id=$2', [reportId, tenantId])).rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// --- E4-S3: SIGN report — FAIL-CLOSED if critical without documented notification ---
app.put('/api/radiology/reports/:id/sign', requireAuth, requireRole('radiology', 'doctor'), requireTenantScope, async (req, res) => {
    try {
        const { tenantId } = getRequestTenantContext(req);
        if (!tenantId) return res.status(403).json({ error: 'Tenant scope required' }); // FAIL-CLOSED
        const reportId = parseInt(req.params.id, 10);
        if (!Number.isInteger(reportId)) return res.status(404).json({ error: 'Report not found' });
        const rep = (await pool.query('SELECT id, rad_exam_id, is_critical, critical_notified_at, status FROM rad_reports WHERE id=$1 AND tenant_id=$2', [reportId, tenantId])).rows[0];
        if (!rep) return res.status(404).json({ error: 'Report not found' });
        if (rep.status === 'Signed') return res.status(409).json({ error: 'Report already signed' });
        // CRITICAL FAIL-CLOSED: cannot reach signed/final without notification documented
        if (rep.is_critical && !rep.critical_notified_at) {
            return res.status(409).json({ error: 'Critical finding must be notified before signing', code: 'CRITICAL_NOTIFY_REQUIRED' });
        }
        await pool.query("UPDATE rad_reports SET status='Signed', signed_by=$1, signed_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=$2 AND tenant_id=$3",
            [req.session.user?.id || null, reportId, tenantId]);
        // advance the worklist exam to Reported (tenant-scoped)
        if (rep.rad_exam_id) {
            await pool.query("UPDATE rad_exams SET state='Reported', reported_at=COALESCE(reported_at, CURRENT_TIMESTAMP), updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND tenant_id=$2 AND state IN ('Completed','InProgress','Arrived','Scheduled')",
                [rep.rad_exam_id, tenantId]);
        }
        logAudit(req.session.user?.id, req.session.user?.display_name, 'SIGN_RAD_REPORT', 'Radiology',
            `Signed rad report #${reportId}${rep.is_critical ? ' [CRITICAL, notified]' : ''}`, req.ip);
        res.json((await pool.query('SELECT * FROM rad_reports WHERE id=$1 AND tenant_id=$2', [reportId, tenantId])).rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// --- E4-S3: addendum to a SIGNED report (creates a new linked report) ---
app.post('/api/radiology/reports/:id/addendum', requireAuth, requireRole('radiology', 'doctor'), requireTenantScope, async (req, res) => {
    try {
        const { tenantId, facilityId } = getRequestTenantContext(req);
        if (!tenantId) return res.status(403).json({ error: 'Tenant scope required' }); // FAIL-CLOSED
        const parentId = parseInt(req.params.id, 10);
        if (!Number.isInteger(parentId)) return res.status(404).json({ error: 'Report not found' });
        const { findings, impression, is_critical } = req.body;
        const parent = (await pool.query("SELECT * FROM rad_reports WHERE id=$1 AND tenant_id=$2 AND status='Signed'", [parentId, tenantId])).rows[0];
        if (!parent) return res.status(404).json({ error: 'Signed parent report not found' });
        const r = await pool.query(
            `INSERT INTO rad_reports (tenant_id, facility_id, rad_exam_id, rad_order_id, patient_id, modality, template, findings, impression, is_critical, status, addendum_of, radiologist_id, created_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'Draft',$11,$12,$12) RETURNING *`,
            [tenantId, facilityId || null, parent.rad_exam_id, parent.rad_order_id, parent.patient_id, parent.modality,
             'addendum', findings || '', impression || '', !!is_critical, parentId, req.session.user?.id || null]);
        await pool.query("UPDATE rad_reports SET status='Addended', updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND tenant_id=$2", [parentId, tenantId]);
        logAudit(req.session.user?.id, req.session.user?.display_name, 'ADDENDUM_RAD_REPORT', 'Radiology',
            `Addendum #${r.rows[0].id} to signed report #${parentId}`, req.ip);
        res.json(r.rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// --- E4: list reports for an exam (tenant-scoped) ---
app.get('/api/radiology/reports', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const { tenantId } = getRequestTenantContext(req);
        if (!tenantId) return res.status(403).json({ error: 'Tenant scope required' }); // FAIL-CLOSED
        const examId = parseInt(req.query.rad_exam_id, 10);
        const params = [tenantId];
        let sql = 'SELECT * FROM rad_reports WHERE tenant_id=$1';
        if (Number.isInteger(examId)) { sql += ' AND rad_exam_id=$2'; params.push(examId); }
        sql += ' ORDER BY id DESC';
        res.json((await pool.query(sql, params)).rows);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});
// ===== END E4 RADIOLOGY =====

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

// NOTE: GET /api/pharmacy/queue and PUT /api/pharmacy/queue/:id are registered below
// (E5 enriched versions, ~line 5165) with file_number/phone/age/department + VAT +
// patient verification. The legacy duplicates that used to live here were removed
// (I1) because Express only honours the FIRST registration, leaving the E5 routes dead.

// ===== INVENTORY =====
app.get('/api/inventory/items', requireAuth, requireRole('inventory', 'pharmacy'), requireTenantScope, async (req, res) => {
    try {
        const { tenantId } = getRequestTenantContext(req);
        const query = tenantId ?
            'SELECT * FROM inventory_items WHERE is_active=1 AND tenant_id=$1 ORDER BY item_name' :
            'SELECT * FROM inventory_items WHERE is_active=1 ORDER BY item_name';
        const params = tenantId ? [tenantId] : [];
        res.json((await pool.query(query, params)).rows);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/inventory/items', requireAuth, requireRole('inventory', 'pharmacy'), requireTenantScope, async (req, res) => {
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

app.get('/api/hr/attendance', requireAuth, requireRole('hr'), requireTenantScope, async (req, res) => {
    // I1: tenant-scoped read — hr_attendance rows are stamped with tenant_id on write;
    // fail-closed if tenant cannot be resolved (mirrors all other E18 GET routes).
    try {
        const t = e18RequireTenant(req);
        if (!t.ok) return res.status(403).json({ error: 'Tenant scope required' });
        res.json((await pool.query(
            'SELECT ha.*, he.name_en as employee_name FROM hr_attendance ha LEFT JOIN hr_employees he ON ha.employee_id=he.id WHERE ha.tenant_id=$1 ORDER BY ha.id DESC',
            [t.tenantId]
        )).rows);
    }
    catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== FINANCE =====
// ============================================================================================
// ===== E10 FINANCE / GENERAL LEDGER (double-entry) + ZATCA E-INVOICE =========================
// Posting to the ledger is GATED OFF by default (ACCOUNTING_POSTING_ENABLED). Journal entries are
// created as DRAFT; an explicit POST flips them to POSTED only when the flag is on. A POSTED entry
// is immutable (reversal-only). Every monetary mutation is auth+role+tenant guarded and audited.
// CRITICAL invariants: balanced-entry (sum debit==credit), posting-gate, tenant scoping.
// ============================================================================================

// posting gate — default OFF. Only "1"/"true" (case-insensitive) enables ledger posting.
function e10PostingEnabled() {
    return /^(1|true|on|yes)$/i.test(String(process.env.ACCOUNTING_POSTING_ENABLED || '').trim());
}
// ZATCA external clearance/reporting gate — default OFF (no real CSID => never call ZATCA).
function e10ZatcaEnabled() {
    return /^(1|true|on|yes)$/i.test(String(process.env.ZATCA_ENABLED || '').trim());
}
// fail-closed tenant resolver: null tenant => throw 403 (no unscoped fallback). Mirrors e7/e8/e9.
function e10RequireTenant(req) {
    const { tenantId } = getRequestTenantContext(req);
    if (!tenantId) { const err = new Error('Tenant scope required'); err.e10Status = 403; throw err; }
    return tenantId;
}
// integer-id coercion guard: positive integer or null (no padded-string / float bypass — E6 lesson).
function e10IntId(v) {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    if (!Number.isInteger(n) || n <= 0) return null;
    return n;
}
function e10Err(res, e) {
    if (e && e.e10Status) return res.status(e.e10Status).json({ error: e.message });
    console.error('E10 finance error:', e && e.message);
    return res.status(500).json({ error: 'Server error' });
}

// ----- Chart of Accounts (tenant-scoped; account_class validated server-side) -----
const E10_ACCOUNT_CLASSES = ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'];
app.get('/api/finance/accounts', requireAuth, requireRole('finance', 'accounts', 'invoices'), requireTenantScope, async (req, res) => {
    try {
        const tenantId = e10RequireTenant(req);
        res.json((await pool.query('SELECT * FROM finance_chart_of_accounts WHERE tenant_id=$1 AND is_active=1 ORDER BY account_code', [tenantId])).rows);
    } catch (e) { e10Err(res, e); }
});

app.post('/api/finance/accounts', requireAuth, requireRole('finance', 'accounts', 'invoices'), requireTenantScope, async (req, res) => {
    try {
        const tenantId = e10RequireTenant(req);
        const { account_code, account_name_ar, account_name_en, parent_id } = req.body;
        // account_class is server-validated (client cannot inject an arbitrary class).
        const account_class = E10_ACCOUNT_CLASSES.includes(req.body.account_class) ? req.body.account_class
            : (E10_ACCOUNT_CLASSES.includes(req.body.account_type) ? req.body.account_type : null);
        if (!account_code || !String(account_code).trim()) return res.status(422).json({ error: 'account_code required' });
        if (!account_class) return res.status(422).json({ error: 'account_class must be one of ' + E10_ACCOUNT_CLASSES.join('/') });
        const parentId = e10IntId(parent_id); // null if not a positive int
        // uniqueness within tenant
        const dup = (await pool.query('SELECT id FROM finance_chart_of_accounts WHERE tenant_id=$1 AND account_code=$2', [tenantId, String(account_code).trim()])).rows[0];
        if (dup) return res.status(409).json({ error: 'Account code already exists' });
        const result = await pool.query(
            'INSERT INTO finance_chart_of_accounts (account_code, account_name_ar, account_name_en, parent_id, account_type, account_class, tenant_id) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
            [String(account_code).trim(), account_name_ar || '', account_name_en || '', parentId || 0, account_class, account_class, tenantId]);
        logAudit(req.session.user?.id, req.session.user?.display_name, 'CREATE_LEDGER_ACCOUNT', 'Finance', `CoA ${account_code} (${account_class})`, req.ip);
        res.json((await pool.query('SELECT * FROM finance_chart_of_accounts WHERE id=$1 AND tenant_id=$2', [result.rows[0].id, tenantId])).rows[0]);
    } catch (e) { e10Err(res, e); }
});

// ----- General Ledger: list journal entries (tenant-scoped, with totals) -----
app.get('/api/finance/journal', requireAuth, requireRole('finance', 'accounts', 'invoices'), requireTenantScope, async (req, res) => {
    try {
        const tenantId = e10RequireTenant(req);
        const rows = (await pool.query(
            `SELECT je.*,
                    COALESCE((SELECT SUM(jl.debit)  FROM finance_journal_lines jl WHERE jl.entry_id=je.id AND jl.tenant_id=$1),0)  AS total_debit,
                    COALESCE((SELECT SUM(jl.credit) FROM finance_journal_lines jl WHERE jl.entry_id=je.id AND jl.tenant_id=$1),0) AS total_credit
               FROM finance_journal_entries je
              WHERE je.tenant_id=$1
              ORDER BY je.id DESC`, [tenantId])).rows;
        res.json(rows);
    } catch (e) { e10Err(res, e); }
});

// ----- General Ledger: read one entry with its lines (tenant-scoped, IDOR-safe) -----
app.get('/api/finance/journal/:id', requireAuth, requireRole('finance', 'accounts', 'invoices'), requireTenantScope, async (req, res) => {
    try {
        const tenantId = e10RequireTenant(req);
        const entryId = e10IntId(req.params.id);
        if (!entryId) return res.status(422).json({ error: 'Invalid entry id' });
        const entry = (await pool.query('SELECT * FROM finance_journal_entries WHERE id=$1 AND tenant_id=$2', [entryId, tenantId])).rows[0];
        if (!entry) return res.status(404).json({ error: 'Not found' });
        const lines = (await pool.query(
            `SELECT jl.*, coa.account_code, coa.account_name_en, coa.account_name_ar
               FROM finance_journal_lines jl
               LEFT JOIN finance_chart_of_accounts coa ON coa.id=jl.account_id AND coa.tenant_id=$2
              WHERE jl.entry_id=$1 AND jl.tenant_id=$2
              ORDER BY jl.id`, [entryId, tenantId])).rows;
        res.json({ entry, lines });
    } catch (e) { e10Err(res, e); }
});

// ----- General Ledger: create a balanced journal entry (DRAFT) — SERVER-SIDE balance enforcement -----
// Body: { entry_date, description, reference, source_type?, lines:[{account_id, debit, credit, notes?}] }
// Unbalanced (sum debit != sum credit) => 422. Created as DRAFT regardless of the posting flag.
app.post('/api/finance/journal', requireAuth, requireRole('finance', 'accounts'), requireTenantScope, async (req, res) => {
    const client = await pool.connect();
    try {
        const tenantId = e10RequireTenant(req);
        await client.query("SELECT set_config('app.tenant_id', $1, false)", [String(tenantId)]);
        const { entry_date, description, reference, lines } = req.body;
        const sourceType = ['MANUAL', 'INVOICE', 'SYSTEM'].includes(req.body.source_type) ? req.body.source_type : 'MANUAL';

        // 1) SERVER-SIDE balanced-entry validation (anti-spoof: client totals never trusted).
        const v = fe.validateBalancedEntry(lines);
        if (!v.ok) {
            const code = v.reason === 'unbalanced' ? 422 : 422;
            return res.status(code).json({ error: 'Unbalanced or invalid journal entry', reason: v.reason, debit: v.debit, credit: v.credit });
        }

        // 2) every referenced account must belong to THIS tenant (cross-tenant account => 422, no leak).
        const accountIds = [...new Set(v.lines.map(l => l.account_id))];
        const owned = (await client.query('SELECT id FROM finance_chart_of_accounts WHERE tenant_id=$1 AND id = ANY($2::int[])', [tenantId, accountIds])).rows;
        if (owned.length !== accountIds.length) return res.status(422).json({ error: 'One or more accounts are invalid for this tenant' });

        await client.query('BEGIN');
        const entryNumber = 'JV-' + new Date().getFullYear() + '-' + Date.now().toString().slice(-8);
        const entry = (await client.query(
            `INSERT INTO finance_journal_entries (entry_number, entry_date, description, reference, source_type, posting_status, is_posted, created_by, tenant_id, balanced_at)
             VALUES ($1,$2,$3,$4,$5,'DRAFT',0,$6,$7, now()) RETURNING *`,
            [entryNumber, entry_date || new Date().toISOString().slice(0, 10), description || '', reference || '', sourceType, req.session.user?.display_name || '', tenantId])).rows[0];
        for (const ln of v.lines) {
            await client.query(
                'INSERT INTO finance_journal_lines (entry_id, account_id, debit, credit, notes, tenant_id) VALUES ($1,$2,$3,$4,$5,$6)',
                [entry.id, ln.account_id, ln.debit, ln.credit, '', tenantId]);
        }
        await client.query('COMMIT');
        logAudit(req.session.user?.id, req.session.user?.display_name, 'CREATE_JOURNAL_ENTRY', 'Finance',
            `${entryNumber} DRAFT balanced (${v.debit}=${v.credit}) src=${sourceType}`, req.ip);
        res.json({ entry, debit: v.debit, credit: v.credit, posting_status: 'DRAFT' });
    } catch (e) {
        try { await client.query('ROLLBACK'); } catch (_) { }
        e10Err(res, e);
    } finally {
        try { await client.query("SELECT set_config('app.tenant_id', '', false)"); } catch (_) { }
        client.release();
    }
});

// ----- General Ledger: POST a draft entry to the ledger — GATED by ACCOUNTING_POSTING_ENABLED -----
// State machine: DRAFT -> POSTED. Posting is irreversible (immutable); re-posting => 409.
app.post('/api/finance/journal/:id/post', requireAuth, requireRole('finance', 'accounts'), requireTenantScope, async (req, res) => {
    const client = await pool.connect();
    try {
        const tenantId = e10RequireTenant(req);
        await client.query("SELECT set_config('app.tenant_id', $1, false)", [String(tenantId)]);
        const entryId = e10IntId(req.params.id);
        if (!entryId) return res.status(422).json({ error: 'Invalid entry id' });
        if (!e10PostingEnabled()) {
            return res.status(403).json({ error: 'Accounting posting is disabled (ACCOUNTING_POSTING_ENABLED off)', posting_enabled: false });
        }
        await client.query('BEGIN');
        // lock the row before the state flip (no double-post race).
        const entry = (await client.query('SELECT * FROM finance_journal_entries WHERE id=$1 AND tenant_id=$2 FOR UPDATE', [entryId, tenantId])).rows[0];
        if (!entry) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Not found' }); }
        if (entry.posting_status !== 'DRAFT') { await client.query('ROLLBACK'); return res.status(409).json({ error: `Cannot post entry in ${entry.posting_status} state` }); }
        // re-verify balance from PERSISTED lines before posting (defence-in-depth; never trust prior state).
        const lines = (await client.query('SELECT account_id, debit, credit FROM finance_journal_lines WHERE entry_id=$1 AND tenant_id=$2', [entryId, tenantId])).rows;
        const v = fe.validateBalancedEntry(lines);
        if (!v.ok) { await client.query('ROLLBACK'); return res.status(422).json({ error: 'Persisted lines are not balanced; refusing to post', reason: v.reason }); }
        await client.query(
            `UPDATE finance_journal_entries SET posting_status='POSTED', is_posted=1, posted_by=$1, posted_at=now() WHERE id=$2 AND tenant_id=$3`,
            [req.session.user?.id || null, entryId, tenantId]);
        await client.query('COMMIT');
        logAudit(req.session.user?.id, req.session.user?.display_name, 'POST_JOURNAL_ENTRY', 'Finance',
            `${entry.entry_number} POSTED (${v.debit}=${v.credit})`, req.ip);
        res.json({ success: true, id: entryId, posting_status: 'POSTED' });
    } catch (e) {
        try { await client.query('ROLLBACK'); } catch (_) { }
        e10Err(res, e);
    } finally {
        try { await client.query("SELECT set_config('app.tenant_id', '', false)"); } catch (_) { }
        client.release();
    }
});

// ----- General Ledger: REVERSE a posted entry (the only mutation of a POSTED entry) -----
app.post('/api/finance/journal/:id/reverse', requireAuth, requireRole('finance', 'accounts'), requireTenantScope, async (req, res) => {
    const client = await pool.connect();
    try {
        const tenantId = e10RequireTenant(req);
        await client.query("SELECT set_config('app.tenant_id', $1, false)", [String(tenantId)]);
        const entryId = e10IntId(req.params.id);
        if (!entryId) return res.status(422).json({ error: 'Invalid entry id' });
        if (!e10PostingEnabled()) return res.status(403).json({ error: 'Accounting posting is disabled', posting_enabled: false });
        await client.query('BEGIN');
        const entry = (await client.query('SELECT * FROM finance_journal_entries WHERE id=$1 AND tenant_id=$2 FOR UPDATE', [entryId, tenantId])).rows[0];
        if (!entry) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Not found' }); }
        if (entry.posting_status !== 'POSTED') { await client.query('ROLLBACK'); return res.status(409).json({ error: `Only POSTED entries can be reversed (state ${entry.posting_status})` }); }
        const origLines = (await client.query('SELECT account_id, debit, credit FROM finance_journal_lines WHERE entry_id=$1 AND tenant_id=$2', [entryId, tenantId])).rows;
        const revLines = fe.buildReversalLines(origLines);
        const v = fe.validateBalancedEntry(revLines);
        if (!v.ok) { await client.query('ROLLBACK'); return res.status(422).json({ error: 'Reversal not balanced', reason: v.reason }); }
        const revNumber = 'JV-' + new Date().getFullYear() + '-' + Date.now().toString().slice(-8) + 'R';
        const rev = (await client.query(
            `INSERT INTO finance_journal_entries (entry_number, entry_date, description, reference, source_type, posting_status, is_posted, created_by, posted_by, posted_at, balanced_at, reversal_of, tenant_id)
             VALUES ($1,$2,$3,$4,'REVERSAL','POSTED',1,$5,$6,now(),now(),$7,$8) RETURNING *`,
            [revNumber, new Date().toISOString().slice(0, 10), 'Reversal of ' + entry.entry_number, entry.entry_number, req.session.user?.display_name || '', req.session.user?.id || null, entryId, tenantId])).rows[0];
        for (const ln of v.lines) {
            await client.query('INSERT INTO finance_journal_lines (entry_id, account_id, debit, credit, notes, tenant_id) VALUES ($1,$2,$3,$4,$5,$6)',
                [rev.id, ln.account_id, ln.debit, ln.credit, 'Reversal', tenantId]);
        }
        await client.query(`UPDATE finance_journal_entries SET posting_status='REVERSED' WHERE id=$1 AND tenant_id=$2`, [entryId, tenantId]);
        await client.query('COMMIT');
        logAudit(req.session.user?.id, req.session.user?.display_name, 'REVERSE_JOURNAL_ENTRY', 'Finance', `${entry.entry_number} reversed by ${revNumber}`, req.ip);
        res.json({ success: true, reversal: rev, posting_status: 'REVERSED' });
    } catch (e) {
        try { await client.query('ROLLBACK'); } catch (_) { }
        e10Err(res, e);
    } finally {
        try { await client.query("SELECT set_config('app.tenant_id', '', false)"); } catch (_) { }
        client.release();
    }
});

// ----- AR Aging report (tenant-scoped buckets 0-30/31-60/61-90/90+) -----
app.get('/api/finance/aging', requireAuth, requireRole('finance', 'accounts', 'invoices'), requireTenantScope, async (req, res) => {
    try {
        const tenantId = e10RequireTenant(req);
        // outstanding balance per invoice = total - paid; aged by created_at. Tenant-scoped.
        const rows = (await pool.query(
            `SELECT id, patient_name,
                    (COALESCE(total,0) - COALESCE(paid,0))               AS balance,
                    GREATEST(0, DATE_PART('day', now() - created_at))::int AS age_days
               FROM invoices
              WHERE tenant_id=$1 AND (COALESCE(total,0) - COALESCE(paid,0)) > 0`, [tenantId])).rows;
        const summary = fe.ageInvoices(rows);
        res.json({ summary, invoices: rows });
    } catch (e) { e10Err(res, e); }
});

// ----- Posting / ZATCA gate status (read-only; lets the UI show OFF state) -----
app.get('/api/finance/posting-status', requireAuth, requireRole('finance', 'accounts', 'invoices'), requireTenantScope, async (req, res) => {
    try { e10RequireTenant(req); res.json({ posting_enabled: e10PostingEnabled(), zatca_enabled: e10ZatcaEnabled() }); }
    catch (e) { e10Err(res, e); }
});

app.get('/api/finance/vouchers', requireAuth, requireRole('finance', 'accounts', 'invoices'), requireTenantScope, async (req, res) => {
    try {
        const tenantId = e10RequireTenant(req);
        res.json((await pool.query('SELECT * FROM finance_vouchers WHERE tenant_id=$1 ORDER BY id DESC', [tenantId])).rows);
    } catch (e) { e10Err(res, e); }
});
// ===== end E10 FINANCE / GENERAL LEDGER ======================================================

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

// ===== E0 FACILITY ONBOARDING WIZARD (super-admin facility provisioning) =====
// Mounted here (among route handlers, after :393) so it inherits CORS, session, CSRF-Origin check,
// and tenant-context middleware. The route is guarded inside the module by:
//   requireAuth + requireRole('settings') + inline (role !== 'Admin') -> 403 + audit BLOCKED_.
// It runs a single DB transaction, generates a strong random Admin password if none supplied
// (no default password), records integrations gated (no secrets), and writes FACILITY_PROVISIONED audit.
mountOnboardingRoutes(app, { pool, requireAuth, requireRole, logAudit });

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
        // --- C-2: validate each line item & recompute the total SERVER-SIDE (never trust a client-supplied total) ---
        if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'At least one line item is required' });
        let total = 0;
        for (let i = 0; i < items.length; i++) {
            const it = items[i] || {};
            const lineAmount = parseMoney(it.amount, { field: `items[${i}].amount`, allowZero: false });
            if (it.quantity !== undefined) {
                const qty = Number(it.quantity);
                if (!Number.isInteger(qty) || qty <= 0) { const e = new Error(`Invalid items[${i}].quantity: must be a positive integer`); e.statusCode = 400; throw e; }
            }
            total += lineAmount;
        }
        total = Math.round(total * 100) / 100;
        // --- C-2: server-authoritative VAT (line totals treated as VAT-inclusive) ---
        const vatInfo = fe.vatFromInclusive(total);
        const vatAmount = vatInfo ? parseFloat(vatInfo.vat_amount) : 0;
        const description = items.map(i => String(i.description || '')).join(' | ');
        const invNumber = 'INV-' + new Date().getFullYear() + '-' + String(Date.now()).slice(-5);
        const result = await pool.query('INSERT INTO invoices (patient_id, patient_name, total, description, service_type, invoice_number, vat_amount, original_amount, tenant_id, facility_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id',
            [patient_id, p.name_en || p.name_ar, total, description, 'Medical Services', invNumber, vatAmount, total, tenantId || null, facilityId || null]);
        logAudit(req.session.user?.id, req.session.user?.display_name, 'GENERATE_INVOICE', 'Finance',
            `Generated ${invNumber} for patient ${p.name_en || p.name_ar} total: ${total} (VAT ${vatAmount})`, req.ip);
        res.json((await pool.query('SELECT * FROM invoices WHERE id=$1', [result.rows[0].id])).rows[0]);
    } catch (e) { sendBillingError(res, e); }
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
        const surgeryCheck = (await pool.query('SELECT * FROM surgeries WHERE id=$1' + (tenantId ? ' AND tenant_id=$2' : ''), checkParams)).rows[0];
        if (!surgeryCheck) return res.status(404).json({ error: 'Surgery not found' });

        const { status, operating_room, scheduled_date, scheduled_time, actual_start, actual_end, post_op_notes, preop_status } = req.body;
        // E12 HARDENING: status changes must obey the surgery state machine + WHO checklist gating.
        // This closes the legacy bypass where the UI flipped status directly to InProgress/Completed.
        if (status !== undefined) {
            const current = e12NormalizeStatus(surgeryCheck.status || 'Scheduled');
            const target = e12NormalizeStatus(status);
            if (target !== current) {
                if (!e12IsValidSurgeryTransition(current, target)) {
                    return res.status(409).json({ error: `Invalid surgery status transition from "${current}" to "${target}"` });
                }
                if (target === 'InProgress') {
                    const clQ = tenantId ? 'SELECT state FROM who_surgical_checklist WHERE surgery_id=$1 AND tenant_id=$2' : 'SELECT state FROM who_surgical_checklist WHERE surgery_id=$1';
                    const cl = (await pool.query(clQ, tenantId ? [req.params.id, tenantId] : [req.params.id])).rows[0];
                    const reachedTimeOut = cl && (E12_WHO_ORDER.indexOf(cl.state) >= E12_WHO_ORDER.indexOf('Time-Out'));
                    if (!reachedTimeOut) return res.status(409).json({ error: 'WHO Time-Out must be completed before incision (InProgress)' });
                }
                if (target === 'Completed') {
                    const clQ = tenantId ? 'SELECT state FROM who_surgical_checklist WHERE surgery_id=$1 AND tenant_id=$2' : 'SELECT state FROM who_surgical_checklist WHERE surgery_id=$1';
                    const cl = (await pool.query(clQ, tenantId ? [req.params.id, tenantId] : [req.params.id])).rows[0];
                    if (!cl || cl.state !== 'Completed') return res.status(409).json({ error: 'WHO Sign-Out must be completed before the surgery can be Completed' });
                }
            }
        }
        const fields = []; const params = []; let idx = 1;
        if (status !== undefined) { fields.push(`status=$${idx++}`); params.push(e12NormalizeStatus(status)); }
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

// ============================================================================
// ===== EPIC E12 — SURGERY / OPERATING ROOM (OR scheduling, WHO checklist, PACU, operative note + consumption)
// ============================================================================
// Fail-closed tenant resolver for E12: throws in production when no tenant is bound.
// Mirrors the e7/e8/e9 requireTenant pattern (NO unscoped fallback in production).
function e12RequireTenant(req) {
    const { tenantId, facilityId, isProduction } = getRequestTenantContext(req);
    if (!tenantId) {
        if (isProduction) {
            const err = new Error('Tenant scope required');
            err.statusCode = 403;
            throw err;
        }
    }
    return { tenantId: tenantId || null, facilityId: facilityId || null };
}

// Integer-only id coercion (no string/padded-id coercion bypass — E6 lesson).
function e12IntId(v) {
    const n = Number(v);
    return Number.isInteger(n) && n > 0 ? n : null;
}

// ---- Surgery status state machine (server-enforced; reject invalid transitions 409) ----
// Scheduled -> InProgress -> PACU -> Completed (+ Cancelled from any non-terminal).
const E12_SURGERY_STATUS = ['Scheduled', 'InProgress', 'PACU', 'Completed', 'Cancelled'];
const E12_SURGERY_TRANSITIONS = {
    'Scheduled': ['InProgress', 'Cancelled'],
    'In Progress': ['InProgress', 'PACU', 'Cancelled'], // tolerate legacy label
    'InProgress': ['PACU', 'Cancelled'],
    'PACU': ['Completed', 'Cancelled'],
    'Completed': [],
    'Cancelled': []
};
function e12NormalizeStatus(s) {
    if (s === 'In Progress') return 'InProgress';
    return s;
}
function e12IsValidSurgeryTransition(fromRaw, toRaw) {
    const from = fromRaw || 'Scheduled';
    const to = e12NormalizeStatus(toRaw);
    if (!E12_SURGERY_STATUS.includes(to)) return false;
    const allowed = E12_SURGERY_TRANSITIONS[from] || E12_SURGERY_TRANSITIONS[e12NormalizeStatus(from)] || [];
    return allowed.includes(to);
}

// ---- WHO Safe Surgery Checklist phase state machine ----
// Not Started -> Sign-In -> Time-Out -> Sign-Out -> Completed (sequential; skipping -> 409).
const E12_WHO_ORDER = ['Not Started', 'Sign-In', 'Time-Out', 'Sign-Out', 'Completed'];
const E12_WHO_PHASE_TO_STATE = { 'sign-in': 'Sign-In', 'time-out': 'Time-Out', 'sign-out': 'Sign-Out' };
function e12WhoNextState(currentState, phase) {
    // Returns { ok, newState, error }. Enforces strict sequential ordering.
    const target = E12_WHO_PHASE_TO_STATE[phase];
    if (!target) return { ok: false, error: 'Unknown checklist phase' };
    const curIdx = E12_WHO_ORDER.indexOf(currentState || 'Not Started');
    const tgtIdx = E12_WHO_ORDER.indexOf(target);
    if (tgtIdx !== curIdx + 1) {
        return { ok: false, error: `Invalid checklist phase order: cannot move from "${currentState || 'Not Started'}" to "${target}"` };
    }
    // Completing Sign-Out advances the state to Completed.
    const newState = (target === 'Sign-Out') ? 'Completed' : target;
    return { ok: true, newState };
}

// Helper: verify surgery ownership (tenant-scoped). Returns row or null.
async function e12LoadSurgery(surgeryId, tenantId) {
    const q = tenantId
        ? 'SELECT * FROM surgeries WHERE id=$1 AND tenant_id=$2'
        : 'SELECT * FROM surgeries WHERE id=$1';
    const params = tenantId ? [surgeryId, tenantId] : [surgeryId];
    return (await pool.query(q, params)).rows[0] || null;
}

// ===== E12: OR SCHEDULING — slots + conflict detection + transactional reservation =====
// List slots for a room/date (tenant scoped).
app.get('/api/or/slots', requireAuth, requireRole('surgery', 'doctor', 'nursing'), requireTenantScope, async (req, res) => {
    try {
        const { tenantId } = e12RequireTenant(req);
        const conds = [];
        const params = [];
        if (tenantId) { params.push(tenantId); conds.push(`tenant_id=$${params.length}`); }
        const roomId = e12IntId(req.query.room_id);
        if (req.query.room_id !== undefined && roomId === null) return res.status(400).json({ error: 'Invalid room_id' });
        if (roomId) { params.push(roomId); conds.push(`room_id=$${params.length}`); }
        if (req.query.date) { params.push(req.query.date); conds.push(`slot_date=$${params.length}`); }
        let q = 'SELECT * FROM or_slots';
        if (conds.length) q += ' WHERE ' + conds.join(' AND ');
        q += ' ORDER BY slot_date, slot_start_time';
        res.json((await pool.query(q, params)).rows);
    } catch (e) { res.status(e.statusCode || 500).json({ error: e.statusCode ? e.message : 'Server error' }); }
});

// Reserve a slot for a surgery: conflict detection (no double-booked room/surgeon/time -> 409),
// transactional with SELECT ... FOR UPDATE. tenant_id stamped from session (anti mass-assignment).
app.post('/api/or/slots/reserve', requireAuth, requireRole('surgery', 'doctor'), requireTenantScope, async (req, res) => {
    let tenantCtx;
    try { tenantCtx = e12RequireTenant(req); }
    catch (e) { return res.status(e.statusCode || 500).json({ error: e.message }); }
    const { tenantId, facilityId } = tenantCtx;

    const surgeryId = e12IntId(req.body.surgery_id);
    const roomId = e12IntId(req.body.room_id);
    const surgeonId = e12IntId(req.body.surgeon_id);
    const slot_date = req.body.slot_date;
    const slot_start_time = req.body.slot_start_time;
    const slot_end_time = req.body.slot_end_time;
    const duration = Number.isInteger(Number(req.body.duration_minutes)) ? Number(req.body.duration_minutes) : 60;
    if (!surgeryId || !roomId || !surgeonId || !slot_date || !slot_start_time || !slot_end_time) {
        return res.status(400).json({ error: 'surgery_id, room_id, surgeon_id, slot_date, slot_start_time, slot_end_time required' });
    }
    if (String(slot_end_time) <= String(slot_start_time)) {
        return res.status(422).json({ error: 'slot_end_time must be after slot_start_time' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        // Bind tenant on this dedicated client for RLS defense-in-depth.
        if (tenantId) await client.query("SELECT set_config('app.tenant_id', $1, false)", [String(tenantId)]);

        // Verify surgery, room & surgeon all belong to this tenant.
        const surgeryQ = tenantId ? 'SELECT id, patient_id FROM surgeries WHERE id=$1 AND tenant_id=$2 FOR UPDATE'
                                  : 'SELECT id, patient_id FROM surgeries WHERE id=$1 FOR UPDATE';
        const surgery = (await client.query(surgeryQ, tenantId ? [surgeryId, tenantId] : [surgeryId])).rows[0];
        if (!surgery) { await client.query('ROLLBACK'); client.release(); return res.status(404).json({ error: 'Surgery not found' }); }

        const roomQ = tenantId ? 'SELECT id FROM operating_rooms WHERE id=$1 AND tenant_id=$2'
                               : 'SELECT id FROM operating_rooms WHERE id=$1';
        const room = (await client.query(roomQ, tenantId ? [roomId, tenantId] : [roomId])).rows[0];
        if (!room) { await client.query('ROLLBACK'); client.release(); return res.status(403).json({ error: 'Invalid operating room context or access denied' }); }

        const surgeonQ = tenantId ? 'SELECT su.id FROM system_users su JOIN user_tenants ut ON ut.user_id = su.id WHERE su.id = $1 AND ut.tenant_id = $2'
                                  : 'SELECT id FROM system_users WHERE id=$1';
        const surgeon = (await client.query(surgeonQ, tenantId ? [surgeonId, tenantId] : [surgeonId])).rows[0];
        if (!surgeon) { await client.query('ROLLBACK'); client.release(); return res.status(403).json({ error: 'Invalid surgeon context or access denied' }); }

        // Conflict detection: lock candidate conflicting rows (room OR surgeon overlap on same date),
        // ordered by id ascending to avoid deadlocks. Overlap = start < existing_end AND end > existing_start.
        // I1 FIX: tenantId is guaranteed non-null here (e12RequireTenant throws 403 on null tenant),
        // so the no-tenant else branch (which had mis-numbered $N bindings) is removed entirely.
        const conflictQ = `SELECT id, room_id, surgeon_id FROM or_slots
               WHERE tenant_id=$1 AND slot_date=$2 AND status <> 'Cancelled'
                 AND (room_id=$3 OR surgeon_id=$4)
                 AND (slot_start_time < $6 AND slot_end_time > $5)
               ORDER BY id ASC FOR UPDATE`;
        const conflictParams = [tenantId, slot_date, roomId, surgeonId, slot_start_time, slot_end_time];
        const conflicts = (await client.query(conflictQ, conflictParams)).rows;
        if (conflicts.length > 0) {
            await client.query('ROLLBACK'); client.release();
            const roomClash = conflicts.some(c => c.room_id === roomId);
            const surgeonClash = conflicts.some(c => c.surgeon_id === surgeonId);
            return res.status(409).json({
                error: 'Slot conflict: ' + (roomClash ? 'operating room already booked' : '') +
                       (roomClash && surgeonClash ? ' and ' : '') +
                       (surgeonClash ? 'surgeon already booked' : '') + ' for this time window'
            });
        }

        const ins = await client.query(
            `INSERT INTO or_slots (tenant_id, facility_id, surgery_id, room_id, surgeon_id, slot_date, slot_start_time, slot_end_time, duration_minutes, status, created_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'Booked',CURRENT_TIMESTAMP) RETURNING id`,
            [tenantId, facilityId, surgeryId, roomId, surgeonId, slot_date, slot_start_time, slot_end_time, duration]);

        // Reflect schedule on the surgery row (tenant scoped).
        const updQ = tenantId
            ? 'UPDATE surgeries SET scheduled_date=$1, scheduled_time=$2, surgeon_id=$3 WHERE id=$4 AND tenant_id=$5'
            : 'UPDATE surgeries SET scheduled_date=$1, scheduled_time=$2, surgeon_id=$3 WHERE id=$4';
        await client.query(updQ, tenantId ? [slot_date, slot_start_time, surgeonId, surgeryId, tenantId] : [slot_date, slot_start_time, surgeonId, surgeryId]);

        await client.query('COMMIT');
        client.release();
        logAudit(req.session.user?.id, req.session.user?.display_name || '', 'RESERVE_OR_SLOT', 'Surgery', `Reserved OR slot ${ins.rows[0].id} room ${roomId} surgeon ${surgeonId} for surgery ${surgeryId}`, req.ip);
        res.json({ success: true, id: ins.rows[0].id });
    } catch (e) {
        try { await client.query('ROLLBACK'); } catch (_) {}
        client.release();
        console.error('OR reserve error:', e.message);
        res.status(500).json({ error: 'Server error' });
    }
});

// Cancel a slot (frees the room/surgeon window). Tenant scoped.
app.put('/api/or/slots/:id/cancel', requireAuth, requireRole('surgery', 'doctor'), requireTenantScope, async (req, res) => {
    try {
        const { tenantId } = e12RequireTenant(req);
        const slotId = e12IntId(req.params.id);
        if (!slotId) return res.status(400).json({ error: 'Invalid slot id' });
        const q = tenantId
            ? "UPDATE or_slots SET status='Cancelled' WHERE id=$1 AND tenant_id=$2 RETURNING id"
            : "UPDATE or_slots SET status='Cancelled' WHERE id=$1 RETURNING id";
        const r = await pool.query(q, tenantId ? [slotId, tenantId] : [slotId]);
        if (!r.rows[0]) return res.status(404).json({ error: 'Slot not found' });
        logAudit(req.session.user?.id, req.session.user?.display_name || '', 'CANCEL_OR_SLOT', 'Surgery', `Cancelled OR slot ${slotId}`, req.ip);
        res.json({ success: true });
    } catch (e) { res.status(e.statusCode || 500).json({ error: e.statusCode ? e.message : 'Server error' }); }
});

// ===== E12: SURGERY STATE MACHINE (replaces unguarded status flips) =====
// Server-enforced transitions. Moving to InProgress requires WHO Time-Out completed (no incision without Time-Out).
// Moving to PACU requires a PACU record (handled by /pacu). Completed requires sign-out.
app.put('/api/or/surgeries/:id/status', requireAuth, requireRole('surgery', 'doctor', 'nursing'), requireTenantScope, async (req, res) => {
    try {
        const { tenantId } = e12RequireTenant(req);
        const surgeryId = e12IntId(req.params.id);
        if (!surgeryId) return res.status(400).json({ error: 'Invalid surgery id' });
        const target = e12NormalizeStatus(req.body.status);

        const surgery = await e12LoadSurgery(surgeryId, tenantId);
        if (!surgery) return res.status(404).json({ error: 'Surgery not found' });

        const current = e12NormalizeStatus(surgery.status || 'Scheduled');
        if (!e12IsValidSurgeryTransition(current, target)) {
            return res.status(409).json({ error: `Invalid surgery status transition from "${current}" to "${target}"` });
        }

        // Phase-gating: cannot start the operation (InProgress) without WHO Time-Out completed.
        if (target === 'InProgress') {
            const clQ = tenantId
                ? 'SELECT state FROM who_surgical_checklist WHERE surgery_id=$1 AND tenant_id=$2'
                : 'SELECT state FROM who_surgical_checklist WHERE surgery_id=$1';
            const cl = (await pool.query(clQ, tenantId ? [surgeryId, tenantId] : [surgeryId])).rows[0];
            const reachedTimeOut = cl && (E12_WHO_ORDER.indexOf(cl.state) >= E12_WHO_ORDER.indexOf('Time-Out'));
            if (!reachedTimeOut) {
                return res.status(409).json({ error: 'WHO Time-Out must be completed before incision (InProgress)' });
            }
        }
        // Cannot complete the surgery without WHO Sign-Out (checklist Completed).
        if (target === 'Completed') {
            const clQ = tenantId
                ? 'SELECT state FROM who_surgical_checklist WHERE surgery_id=$1 AND tenant_id=$2'
                : 'SELECT state FROM who_surgical_checklist WHERE surgery_id=$1';
            const cl = (await pool.query(clQ, tenantId ? [surgeryId, tenantId] : [surgeryId])).rows[0];
            if (!cl || cl.state !== 'Completed') {
                return res.status(409).json({ error: 'WHO Sign-Out must be completed before the surgery can be Completed' });
            }
        }

        const updQ = tenantId
            ? 'UPDATE surgeries SET status=$1 WHERE id=$2 AND tenant_id=$3'
            : 'UPDATE surgeries SET status=$1 WHERE id=$2';
        await pool.query(updQ, tenantId ? [target, surgeryId, tenantId] : [target, surgeryId]);
        logAudit(req.session.user?.id, req.session.user?.display_name || '', 'UPDATE_SURGERY_STATUS', 'Surgery', `Surgery ${surgeryId} status ${current} -> ${target}`, req.ip);
        res.json({ success: true, status: target });
    } catch (e) { res.status(e.statusCode || 500).json({ error: e.statusCode ? e.message : 'Server error' }); }
});

// ===== E12: WHO SAFE SURGERY CHECKLIST =====
app.get('/api/or/surgeries/:id/who-checklist', requireAuth, requireRole('surgery', 'doctor', 'nursing'), requireTenantScope, async (req, res) => {
    try {
        const { tenantId } = e12RequireTenant(req);
        const surgeryId = e12IntId(req.params.id);
        if (!surgeryId) return res.status(400).json({ error: 'Invalid surgery id' });
        const surgery = await e12LoadSurgery(surgeryId, tenantId);
        if (!surgery) return res.status(404).json({ error: 'Surgery not found' });
        const q = tenantId
            ? 'SELECT * FROM who_surgical_checklist WHERE surgery_id=$1 AND tenant_id=$2'
            : 'SELECT * FROM who_surgical_checklist WHERE surgery_id=$1';
        const row = (await pool.query(q, tenantId ? [surgeryId, tenantId] : [surgeryId])).rows[0];
        res.json(row || { surgery_id: surgeryId, state: 'Not Started', sign_in_completed: 0, time_out_completed: 0, sign_out_completed: 0 });
    } catch (e) { res.status(e.statusCode || 500).json({ error: e.statusCode ? e.message : 'Server error' }); }
});

// Advance one WHO phase. :phase in {sign-in, time-out, sign-out}. Strict ordering enforced server-side (409 on skip).
app.post('/api/or/surgeries/:id/who-checklist/:phase', requireAuth, requireRole('surgery', 'doctor', 'nursing'), requireTenantScope, async (req, res) => {
    const client = await pool.connect();
    try {
        const { tenantId, facilityId } = e12RequireTenant(req);
        const surgeryId = e12IntId(req.params.id);
        const phase = String(req.params.phase || '').toLowerCase();
        if (!surgeryId) { client.release(); return res.status(400).json({ error: 'Invalid surgery id' }); }
        if (!E12_WHO_PHASE_TO_STATE[phase]) { client.release(); return res.status(400).json({ error: 'Unknown checklist phase' }); }

        await client.query('BEGIN');
        if (tenantId) await client.query("SELECT set_config('app.tenant_id', $1, false)", [String(tenantId)]);

        const sQ = tenantId ? 'SELECT id, patient_id FROM surgeries WHERE id=$1 AND tenant_id=$2'
                            : 'SELECT id, patient_id FROM surgeries WHERE id=$1';
        const surgery = (await client.query(sQ, tenantId ? [surgeryId, tenantId] : [surgeryId])).rows[0];
        if (!surgery) { await client.query('ROLLBACK'); client.release(); return res.status(404).json({ error: 'Surgery not found' }); }

        // Lock the checklist row (or create at Not Started).
        const exQ = tenantId ? 'SELECT * FROM who_surgical_checklist WHERE surgery_id=$1 AND tenant_id=$2 FOR UPDATE'
                             : 'SELECT * FROM who_surgical_checklist WHERE surgery_id=$1 FOR UPDATE';
        let cl = (await client.query(exQ, tenantId ? [surgeryId, tenantId] : [surgeryId])).rows[0];
        if (!cl) {
            const insTxt = `INSERT INTO who_surgical_checklist (surgery_id, patient_id, state, tenant_id, facility_id, created_at)
                            VALUES ($1,$2,'Not Started',$3,$4,CURRENT_TIMESTAMP) RETURNING *`;
            cl = (await client.query(insTxt, [surgeryId, surgery.patient_id || 0, tenantId, facilityId])).rows[0];
        }

        const decision = e12WhoNextState(cl.state, phase);
        if (!decision.ok) {
            await client.query('ROLLBACK'); client.release();
            return res.status(409).json({ error: decision.error });
        }

        // Authority fields (who/when) computed server-side — never trusted from client.
        const actor = req.session.user?.display_name || req.session.user?.name || '';
        const phaseCol = phase === 'sign-in' ? 'sign_in' : phase === 'time-out' ? 'time_out' : 'sign_out';
        const updTxt = tenantId
            ? `UPDATE who_surgical_checklist SET ${phaseCol}_completed=1, ${phaseCol}_completed_by=$1, ${phaseCol}_at=CURRENT_TIMESTAMP, state=$2 WHERE surgery_id=$3 AND tenant_id=$4`
            : `UPDATE who_surgical_checklist SET ${phaseCol}_completed=1, ${phaseCol}_completed_by=$1, ${phaseCol}_at=CURRENT_TIMESTAMP, state=$2 WHERE surgery_id=$3`;
        await client.query(updTxt, tenantId ? [actor, decision.newState, surgeryId, tenantId] : [actor, decision.newState, surgeryId]);

        await client.query('COMMIT');
        client.release();
        logAudit(req.session.user?.id, actor, 'WHO_CHECKLIST_' + phaseCol.toUpperCase(), 'Surgery', `WHO ${phase} completed for surgery ${surgeryId}; state=${decision.newState}`, req.ip);
        res.json({ success: true, state: decision.newState });
    } catch (e) {
        try { await client.query('ROLLBACK'); } catch (_) {}
        client.release();
        res.status(e.statusCode || 500).json({ error: e.statusCode ? e.message : 'Server error' });
    }
});

// ===== E12: PACU (recovery) record =====
app.get('/api/or/surgeries/:id/pacu', requireAuth, requireRole('surgery', 'doctor', 'nursing'), requireTenantScope, async (req, res) => {
    try {
        const { tenantId } = e12RequireTenant(req);
        const surgeryId = e12IntId(req.params.id);
        if (!surgeryId) return res.status(400).json({ error: 'Invalid surgery id' });
        const surgery = await e12LoadSurgery(surgeryId, tenantId);
        if (!surgery) return res.status(404).json({ error: 'Surgery not found' });
        const q = tenantId ? 'SELECT * FROM pacu_records WHERE surgery_id=$1 AND tenant_id=$2'
                           : 'SELECT * FROM pacu_records WHERE surgery_id=$1';
        res.json((await pool.query(q, tenantId ? [surgeryId, tenantId] : [surgeryId])).rows[0] || null);
    } catch (e) { res.status(e.statusCode || 500).json({ error: e.statusCode ? e.message : 'Server error' }); }
});

// Create/update PACU record. Requires WHO Sign-Out completed first (cannot recover before leaving OR safely).
app.post('/api/or/surgeries/:id/pacu', requireAuth, requireRole('surgery', 'doctor', 'nursing'), requireTenantScope, async (req, res) => {
    try {
        const { tenantId, facilityId } = e12RequireTenant(req);
        const surgeryId = e12IntId(req.params.id);
        if (!surgeryId) return res.status(400).json({ error: 'Invalid surgery id' });
        const surgery = await e12LoadSurgery(surgeryId, tenantId);
        if (!surgery) return res.status(404).json({ error: 'Surgery not found' });

        const clQ = tenantId ? 'SELECT state FROM who_surgical_checklist WHERE surgery_id=$1 AND tenant_id=$2'
                             : 'SELECT state FROM who_surgical_checklist WHERE surgery_id=$1';
        const cl = (await pool.query(clQ, tenantId ? [surgeryId, tenantId] : [surgeryId])).rows[0];
        if (!cl || cl.state !== 'Completed') {
            return res.status(409).json({ error: 'WHO Sign-Out must be completed before opening a PACU record' });
        }

        const b = req.body;
        // Aldrete score is an authority field: compute & clamp server-side (0..10) from its 5 components (0..2 each).
        const comp = ['activity', 'respiration', 'circulation', 'consciousness', 'oxygen'];
        let aldrete = null;
        const provided = comp.filter(c => b[c] !== undefined && b[c] !== null && b[c] !== '');
        if (provided.length === comp.length) {
            aldrete = comp.reduce((sum, c) => {
                let v = parseInt(b[c], 10); if (!Number.isInteger(v)) v = 0; if (v < 0) v = 0; if (v > 2) v = 2;
                return sum + v;
            }, 0);
        }
        const dischargeStatus = b.discharge_status === 'Discharged' ? (aldrete !== null && aldrete >= 9 ? 'Discharged' : 'In Recovery') : 'In Recovery';

        const exQ = tenantId ? 'SELECT id FROM pacu_records WHERE surgery_id=$1 AND tenant_id=$2'
                             : 'SELECT id FROM pacu_records WHERE surgery_id=$1';
        const existing = (await pool.query(exQ, tenantId ? [surgeryId, tenantId] : [surgeryId])).rows[0];

        if (existing) {
            const updQ = tenantId
                ? `UPDATE pacu_records SET start_time=$1, end_time=$2, pain_score=$3, bp=$4, hr=$5, spo2=$6, temp=$7, aldrete_score=$8, discharge_status=$9, recovery_nurse=$10, notes=$11 WHERE surgery_id=$12 AND tenant_id=$13`
                : `UPDATE pacu_records SET start_time=$1, end_time=$2, pain_score=$3, bp=$4, hr=$5, spo2=$6, temp=$7, aldrete_score=$8, discharge_status=$9, recovery_nurse=$10, notes=$11 WHERE surgery_id=$12`;
            const p = [b.start_time || '', b.end_time || '', parseInt(b.pain_score, 10) || 0, b.bp || '', b.hr || '', b.spo2 || '', b.temp || '', aldrete, dischargeStatus, req.session.user?.display_name || '', b.notes || '', surgeryId];
            if (tenantId) p.push(tenantId);
            await pool.query(updQ, p);
        } else {
            await pool.query(
                `INSERT INTO pacu_records (surgery_id, patient_id, start_time, end_time, pain_score, bp, hr, spo2, temp, aldrete_score, discharge_status, recovery_nurse, notes, tenant_id, facility_id, created_at)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,CURRENT_TIMESTAMP)`,
                [surgeryId, surgery.patient_id || 0, b.start_time || '', b.end_time || '', parseInt(b.pain_score, 10) || 0, b.bp || '', b.hr || '', b.spo2 || '', b.temp || '', aldrete, dischargeStatus, req.session.user?.display_name || '', b.notes || '', tenantId, facilityId]);
        }
        logAudit(req.session.user?.id, req.session.user?.display_name || '', 'PACU_RECORD', 'Surgery', `PACU record saved for surgery ${surgeryId}; aldrete=${aldrete}`, req.ip);
        const rq = tenantId ? 'SELECT * FROM pacu_records WHERE surgery_id=$1 AND tenant_id=$2' : 'SELECT * FROM pacu_records WHERE surgery_id=$1';
        res.json((await pool.query(rq, tenantId ? [surgeryId, tenantId] : [surgeryId])).rows[0]);
    } catch (e) { res.status(e.statusCode || 500).json({ error: e.statusCode ? e.message : 'Server error' }); }
});

// ===== E12: OPERATIVE NOTE + CONSUMPTION (decrement inventory if present) =====
app.get('/api/or/surgeries/:id/operative-note', requireAuth, requireRole('surgery', 'doctor'), requireTenantScope, async (req, res) => {
    try {
        const { tenantId } = e12RequireTenant(req);
        const surgeryId = e12IntId(req.params.id);
        if (!surgeryId) return res.status(400).json({ error: 'Invalid surgery id' });
        const surgery = await e12LoadSurgery(surgeryId, tenantId);
        if (!surgery) return res.status(404).json({ error: 'Surgery not found' });
        const noteQ = tenantId ? 'SELECT * FROM operative_notes WHERE surgery_id=$1 AND tenant_id=$2'
                               : 'SELECT * FROM operative_notes WHERE surgery_id=$1';
        const note = (await pool.query(noteQ, tenantId ? [surgeryId, tenantId] : [surgeryId])).rows[0] || null;
        const consQ = tenantId ? 'SELECT * FROM or_consumption WHERE surgery_id=$1 AND tenant_id=$2 ORDER BY id'
                               : 'SELECT * FROM or_consumption WHERE surgery_id=$1 ORDER BY id';
        const consumption = (await pool.query(consQ, tenantId ? [surgeryId, tenantId] : [surgeryId])).rows;
        res.json({ note, consumption });
    } catch (e) { res.status(e.statusCode || 500).json({ error: e.statusCode ? e.message : 'Server error' }); }
});

// Save operative note + record consumption lines, decrementing inventory_items.stock_qty transactionally.
// Locks inventory rows in ascending id order (deadlock avoidance). Counts-not-verified -> 'Incomplete' (never falsely reassuring).
app.post('/api/or/surgeries/:id/operative-note', requireAuth, requireRole('surgery', 'doctor'), requireTenantScope, async (req, res) => {
    const client = await pool.connect();
    try {
        const { tenantId, facilityId } = e12RequireTenant(req);
        const surgeryId = e12IntId(req.params.id);
        if (!surgeryId) { client.release(); return res.status(400).json({ error: 'Invalid surgery id' }); }

        await client.query('BEGIN');
        if (tenantId) await client.query("SELECT set_config('app.tenant_id', $1, false)", [String(tenantId)]);

        const sQ = tenantId ? 'SELECT id, patient_id FROM surgeries WHERE id=$1 AND tenant_id=$2'
                            : 'SELECT id, patient_id FROM surgeries WHERE id=$1';
        const surgery = (await client.query(sQ, tenantId ? [surgeryId, tenantId] : [surgeryId])).rows[0];
        if (!surgery) { await client.query('ROLLBACK'); client.release(); return res.status(404).json({ error: 'Surgery not found' }); }

        const b = req.body;
        // Counts verification is an authority field: only TRUE if explicitly confirmed; otherwise 'Incomplete'.
        const countsVerified = (b.counts_verified === true || b.counts_verified === 1 || b.counts_verified === '1') ? 'Verified' : 'Incomplete';
        const surgeon = req.session.user?.display_name || req.session.user?.name || '';

        // Validate + lock consumption items (ascending id order) before any stock flip.
        const rawLines = Array.isArray(b.consumption) ? b.consumption : [];
        const lines = [];
        for (const l of rawLines) {
            const itemId = e12IntId(l.item_id);
            let qty = parseInt(l.qty_used, 10);
            if (itemId === null || !Number.isInteger(qty) || qty <= 0) {
                await client.query('ROLLBACK'); client.release();
                return res.status(422).json({ error: 'Each consumption line requires a valid integer item_id and qty_used > 0' });
            }
            lines.push({ itemId, qty });
        }
        // Detect whether the inventory table exists/has tenant scoping; decrement only if present.
        let inventoryPresent = false;
        try {
            const chk = await client.query("SELECT to_regclass('public.inventory_items') AS t");
            inventoryPresent = !!(chk.rows[0] && chk.rows[0].t);
        } catch (_) { inventoryPresent = false; }

        lines.sort((a, b2) => a.itemId - b2.itemId); // ascending id order — deadlock-safe locking

        // C1 FIX: idempotent re-save. Credit back any prior or_consumption rows BEFORE applying new
        // decrements so re-saving the operative note does not double-decrement stock. All locks are
        // taken in ascending item_id order (consistent across credit + debit passes) to prevent deadlocks.
        if (inventoryPresent) {
            // Step 1: load existing consumption rows for this surgery (prior save, if any), lock their
            // inventory items in ascending id order and credit back the old quantities.
            const prevConsQ = tenantId
                ? 'SELECT item_id, qty_used FROM or_consumption WHERE surgery_id=$1 AND tenant_id=$2 ORDER BY item_id ASC'
                : 'SELECT item_id, qty_used FROM or_consumption WHERE surgery_id=$1 ORDER BY item_id ASC';
            const prevRows = (await client.query(prevConsQ, tenantId ? [surgeryId, tenantId] : [surgeryId])).rows;
            for (const prev of prevRows) {
                const prevItemId = parseInt(prev.item_id, 10);
                const prevQty = parseInt(prev.qty_used, 10) || 0;
                if (prevQty <= 0) continue;
                // Lock the row (ascending id order — same as debit pass below, no deadlock)
                const lockPrevQ = tenantId
                    ? 'SELECT id, stock_qty FROM inventory_items WHERE id=$1 AND tenant_id=$2 FOR UPDATE'
                    : 'SELECT id, stock_qty FROM inventory_items WHERE id=$1 FOR UPDATE';
                await client.query(lockPrevQ, tenantId ? [prevItemId, tenantId] : [prevItemId]);
                // Credit back the previously decremented quantity
                const creditQ = tenantId
                    ? 'UPDATE inventory_items SET stock_qty = stock_qty + $1 WHERE id=$2 AND tenant_id=$3'
                    : 'UPDATE inventory_items SET stock_qty = stock_qty + $1 WHERE id=$2';
                await client.query(creditQ, tenantId ? [prevQty, prevItemId, tenantId] : [prevQty, prevItemId]);
            }

            // Step 2: validate + debit the new consumption lines against post-credit stock.
            for (const ln of lines) {
                const lockQ = tenantId
                    ? 'SELECT id, stock_qty FROM inventory_items WHERE id=$1 AND tenant_id=$2 FOR UPDATE'
                    : 'SELECT id, stock_qty FROM inventory_items WHERE id=$1 FOR UPDATE';
                const item = (await client.query(lockQ, tenantId ? [ln.itemId, tenantId] : [ln.itemId])).rows[0];
                if (!item) { await client.query('ROLLBACK'); client.release(); return res.status(404).json({ error: `Inventory item ${ln.itemId} not found in tenant scope` }); }
                if ((item.stock_qty || 0) < ln.qty) { await client.query('ROLLBACK'); client.release(); return res.status(409).json({ error: `Insufficient stock for item ${ln.itemId} (have ${item.stock_qty || 0}, need ${ln.qty})` }); }
            }
            for (const ln of lines) {
                const decQ = tenantId
                    ? 'UPDATE inventory_items SET stock_qty = stock_qty - $1 WHERE id=$2 AND tenant_id=$3'
                    : 'UPDATE inventory_items SET stock_qty = stock_qty - $1 WHERE id=$2';
                await client.query(decQ, tenantId ? [ln.qty, ln.itemId, tenantId] : [ln.qty, ln.itemId]);
            }
        }
        // Persist consumption lines (idempotent replace for this surgery).
        const delQ = tenantId ? 'DELETE FROM or_consumption WHERE surgery_id=$1 AND tenant_id=$2' : 'DELETE FROM or_consumption WHERE surgery_id=$1';
        await client.query(delQ, tenantId ? [surgeryId, tenantId] : [surgeryId]);
        for (const ln of lines) {
            await client.query(
                `INSERT INTO or_consumption (surgery_id, item_id, qty_used, tenant_id, facility_id, created_at) VALUES ($1,$2,$3,$4,$5,CURRENT_TIMESTAMP)`,
                [surgeryId, ln.itemId, ln.qty, tenantId, facilityId]);
        }

        // Upsert operative note.
        const exQ = tenantId ? 'SELECT id FROM operative_notes WHERE surgery_id=$1 AND tenant_id=$2' : 'SELECT id FROM operative_notes WHERE surgery_id=$1';
        const existing = (await client.query(exQ, tenantId ? [surgeryId, tenantId] : [surgeryId])).rows[0];
        const bloodLoss = parseInt(b.blood_loss_final, 10) || 0;
        if (existing) {
            const upd = tenantId
                ? `UPDATE operative_notes SET procedure_description=$1, findings=$2, complications=$3, blood_loss_final=$4, counts_verified=$5, specimen=$6, surgeon_signature=$7 WHERE surgery_id=$8 AND tenant_id=$9`
                : `UPDATE operative_notes SET procedure_description=$1, findings=$2, complications=$3, blood_loss_final=$4, counts_verified=$5, specimen=$6, surgeon_signature=$7 WHERE surgery_id=$8`;
            const p = [b.procedure_description || '', b.findings || '', b.complications || '', bloodLoss, countsVerified, b.specimen || '', surgeon, surgeryId];
            if (tenantId) p.push(tenantId);
            await client.query(upd, p);
        } else {
            await client.query(
                `INSERT INTO operative_notes (surgery_id, patient_id, procedure_description, findings, complications, blood_loss_final, counts_verified, specimen, surgeon_signature, tenant_id, facility_id, created_at)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,CURRENT_TIMESTAMP)`,
                [surgeryId, surgery.patient_id || 0, b.procedure_description || '', b.findings || '', b.complications || '', bloodLoss, countsVerified, b.specimen || '', surgeon, tenantId, facilityId]);
        }

        await client.query('COMMIT');
        client.release();
        logAudit(req.session.user?.id, surgeon, 'OPERATIVE_NOTE_SIGNED', 'Surgery', `Operative note saved for surgery ${surgeryId}; counts=${countsVerified}; lines=${lines.length}; inventoryDecremented=${inventoryPresent}`, req.ip);
        res.json({ success: true, counts_verified: countsVerified, inventory_decremented: inventoryPresent, lines: lines.length });
    } catch (e) {
        try { await client.query('ROLLBACK'); } catch (_) {}
        client.release();
        console.error('Operative note error:', e.message);
        res.status(500).json({ error: 'Server error' });
    }
});

// ===== BLOOD BANK (LEGACY READ ROUTES — tenant-scoped hardening; E13) =====
// These legacy /api/blood-bank/* paths are retained for backward compatibility
// but are now tenant-scoped (were cross-tenant leaks). The PRIMARY UI uses the
// new /api/bloodbank/* safe routes. Legacy MUTATION paths are deprecated (410)
// further below (see E13 BLOOD BANK SAFE block).
app.get('/api/blood-bank/units', requireAuth, requireRole('bloodbank', 'lab', 'nursing', 'doctor'), requireTenantScope, async (req, res) => {
    try {
        const tenantId = e13RequireTenant(req);
        const { status, blood_type } = req.query;
        const params = [tenantId]; const conds = ['tenant_id = $1'];
        if (status) { params.push(String(status)); conds.push(`status=$${params.length}`); }
        if (blood_type) { params.push(String(blood_type)); conds.push(`blood_type=$${params.length}`); }
        const q = `SELECT * FROM blood_bank_units WHERE ${conds.join(' AND ')} ORDER BY id DESC`;
        res.json((await pool.query(q, params)).rows);
    } catch (e) { e13Respond(res, e); }
});

// Legacy unit creation -> deprecated; use POST /api/bloodbank/units (validated + tenant-stamped).
app.post('/api/blood-bank/units', requireAuth, requireRole('bloodbank', 'lab'), requireTenantScope, (req, res) => {
    res.status(410).json({ error: 'Deprecated. Use POST /api/bloodbank/units (validated, tenant-stamped).' });
});

// Legacy unit status PUT -> deprecated; use the state-machine routes (discard/recall/transfuse).
app.put('/api/blood-bank/units/:id', requireAuth, requireRole('bloodbank', 'lab'), requireTenantScope, (req, res) => {
    res.status(410).json({ error: 'Deprecated. Use /api/bloodbank/units/:id/discard|recall or /api/bloodbank/transfuse.' });
});

app.get('/api/blood-bank/donors', requireAuth, requireRole('bloodbank', 'lab'), requireTenantScope, async (req, res) => {
    try {
        const tenantId = e13RequireTenant(req);
        res.json((await pool.query('SELECT * FROM blood_bank_donors WHERE tenant_id=$1 ORDER BY id DESC', [tenantId])).rows);
    } catch (e) { e13Respond(res, e); }
});

// Legacy donor creation -> deprecated; use POST /api/bloodbank/donors (tenant-stamped).
app.post('/api/blood-bank/donors', requireAuth, requireRole('bloodbank', 'lab'), requireTenantScope, (req, res) => {
    res.status(410).json({ error: 'Deprecated. Use POST /api/bloodbank/donors (tenant-stamped).' });
});

// Legacy crossmatch creation -> deprecated; the safe route enforces server-side ABO/Rh.
app.post('/api/blood-bank/crossmatch', requireAuth, requireRole('bloodbank', 'lab', 'doctor'), requireTenantScope, (req, res) => {
    res.status(410).json({ error: 'Deprecated. Use POST /api/bloodbank/crossmatch (server-side ABO/Rh compatibility).' });
});

app.get('/api/blood-bank/crossmatch', requireAuth, requireRole('bloodbank', 'lab', 'doctor', 'nursing'), requireTenantScope, async (req, res) => {
    try {
        const tenantId = e13RequireTenant(req);
        res.json((await pool.query('SELECT * FROM blood_bank_crossmatch WHERE tenant_id=$1 ORDER BY id DESC', [tenantId])).rows);
    } catch (e) { e13Respond(res, e); }
});

app.get('/api/blood-bank/transfusions', requireAuth, requireRole('bloodbank', 'lab', 'nursing', 'doctor'), requireTenantScope, async (req, res) => {
    try {
        const tenantId = e13RequireTenant(req);
        res.json((await pool.query('SELECT * FROM blood_bank_transfusions WHERE tenant_id=$1 ORDER BY id DESC', [tenantId])).rows);
    } catch (e) { e13Respond(res, e); }
});

app.get('/api/blood-bank/stats', requireAuth, requireRole('bloodbank', 'lab', 'nursing', 'doctor'), requireTenantScope, async (req, res) => {
    try {
        const tenantId = e13RequireTenant(req);
        const total = (await pool.query("SELECT COUNT(*)::int as cnt FROM blood_bank_units WHERE status='Available' AND tenant_id=$1", [tenantId])).rows[0].cnt;
        // F4-FIX (legacy): added lower bound >= CURRENT_DATE so already-expired units are excluded from "Expiring Soon".
        const expiring = (await pool.query("SELECT COUNT(*)::int as cnt FROM blood_bank_units WHERE status='Available' AND tenant_id=$1 AND expiry_date <> '' AND expiry_date >= CURRENT_DATE::TEXT AND expiry_date <= (CURRENT_DATE + INTERVAL '7 days')::TEXT", [tenantId])).rows[0].cnt;
        const todayTransfusions = (await pool.query("SELECT COUNT(*)::int as cnt FROM blood_bank_transfusions WHERE tenant_id=$1 AND created_at::date = CURRENT_DATE", [tenantId])).rows[0].cnt;
        const byType = (await pool.query("SELECT blood_type, rh_factor, COUNT(*)::int as cnt FROM blood_bank_units WHERE status='Available' AND tenant_id=$1 GROUP BY blood_type, rh_factor ORDER BY blood_type", [tenantId])).rows;
        const totalDonors = (await pool.query('SELECT COUNT(*)::int as cnt FROM blood_bank_donors WHERE tenant_id=$1', [tenantId])).rows[0].cnt;
        const pendingCrossmatch = (await pool.query("SELECT COUNT(*)::int as cnt FROM blood_bank_crossmatch WHERE result='Pending' AND tenant_id=$1", [tenantId])).rows[0].cnt;
        res.json({ total, expiring, todayTransfusions, byType, totalDonors, pendingCrossmatch });
    } catch (e) { e13Respond(res, e); }
});

// =====================================================================
// ===== E13 BLOOD BANK (SAFE) — /api/bloodbank/* ======================
// =====================================================================
// World-class blood-bank workflow with the critical safety invariants:
//  - server-side ABO/Rh compatibility (bbCompat); client cannot mark compatible
//  - ABO/Rh-incompatible crossmatch => 422 fail-closed
//  - expired unit => never issuable (block); near-expiry alerts
//  - transactional unit issue under SELECT ... FOR UPDATE; double-issue => 409
//  - tenant isolation on every query (explicit AND tenant_id=$N on top of FORCE RLS)
//  - RBAC (requireRole('bloodbank','lab','nursing','doctor')) + logAudit on every mutation
//
// e13RequireTenant: returns the request tenant or THROWS (fail-closed). Never
// returns a fallback that would widen scope; the route catch -> 403.
function e13RequireTenant(req) {
    const { tenantId, isProduction } = getRequestTenantContext(req);
    if (!tenantId) {
        const err = new Error('Tenant scope required');
        err.e13Status = 403;
        throw err;
    }
    // tenantId must be an integer (no string/padded-id coercion bypass — E6)
    const t = Number(tenantId);
    if (!Number.isInteger(t) || t <= 0) {
        const err = new Error('Invalid tenant scope');
        err.e13Status = 403;
        throw err;
    }
    return t;
}
function e13Respond(res, e) {
    if (e && e.e13Status) return res.status(e.e13Status).json({ error: e.message });
    console.error('bloodbank route error:', e && e.message);
    return res.status(500).json({ error: 'Server error' });
}
const BB_VALID_COMPONENTS = ['Whole Blood', 'Packed RBC', 'FFP', 'Platelets', 'Cryoprecipitate'];
const BB_NEAR_EXPIRY_DAYS = 7;

// --- Inventory: list units (tenant-scoped, near-expiry flags) ---
app.get('/api/bloodbank/units', requireAuth, requireRole('bloodbank', 'lab', 'nursing', 'doctor'), requireTenantScope, async (req, res) => {
    try {
        const tenantId = e13RequireTenant(req);
        const { status, blood_type, component } = req.query;
        const params = [tenantId];
        const conds = ['tenant_id = $1'];
        if (status) { params.push(String(status)); conds.push(`status = $${params.length}`); }
        if (blood_type) { params.push(String(blood_type)); conds.push(`blood_type = $${params.length}`); }
        if (component) { params.push(String(component)); conds.push(`component = $${params.length}`); }
        const q = `SELECT * FROM blood_bank_units WHERE ${conds.join(' AND ')} ORDER BY expiry_date ASC NULLS LAST, id DESC`;
        const rows = (await pool.query(q, params)).rows;
        // Annotate FEFO/expiry status (server-computed; client must not infer authority)
        const annotated = rows.map(u => {
            const days = bbCompat.daysUntilExpiry(u.expiry_date);
            return {
                ...u,
                days_until_expiry: days,
                is_expired: days !== null && days < 0,
                near_expiry: days !== null && days >= 0 && days <= BB_NEAR_EXPIRY_DAYS,
            };
        });
        res.json(annotated);
    } catch (e) { e13Respond(res, e); }
});

// --- Inventory: create unit (tenant-stamped, audited) ---
app.post('/api/bloodbank/units', requireAuth, requireRole('bloodbank', 'lab'), requireTenantScope, async (req, res) => {
    try {
        const tenantId = e13RequireTenant(req);
        const { facilityId } = getRequestTenantContext(req);
        const { bag_number, blood_type, rh_factor, component, donor_id, collection_date, expiry_date, volume_ml, storage_location, notes } = req.body;
        const comp = BB_VALID_COMPONENTS.includes(component) ? component : 'Whole Blood';
        // Validate ABO is a real group (anti-garbage; status authority is server-side)
        const parsed = bbCompat.parseBloodType(blood_type, rh_factor);
        if (!parsed.abo || !parsed.rh) {
            return res.status(422).json({ error: 'Invalid blood type / Rh' });
        }
        let donorParam = null;
        if (donor_id !== undefined && donor_id !== null && String(donor_id).trim() !== '') {
            const d = Number(donor_id);
            if (!Number.isInteger(d) || d <= 0) return res.status(422).json({ error: 'Invalid donor id' });
            // donor must belong to this tenant (IDOR guard)
            const dRow = (await pool.query('SELECT id FROM blood_bank_donors WHERE id=$1 AND tenant_id=$2', [d, tenantId])).rows[0];
            if (!dRow) return res.status(404).json({ error: 'Donor not found' });
            donorParam = d;
        }
        const result = await pool.query(
            `INSERT INTO blood_bank_units (tenant_id, facility_id, bag_number, blood_type, rh_factor, component, donor_id, collection_date, expiry_date, volume_ml, status, storage_location, notes, created_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'Available',$11,$12,$13) RETURNING id`,
            [tenantId, facilityId || null, bag_number || '', parsed.abo, parsed.rh, comp, donorParam, collection_date || '', expiry_date || '', Number(volume_ml) || 450, storage_location || '', notes || '', req.session.user?.id || null]);
        logAudit(req.session.user?.id, req.session.user?.display_name || req.session.user?.name, 'CREATE_UNIT', 'BloodBank', `Created unit ${bag_number || ''} ${parsed.abo}${parsed.rh} ${comp}`, req.ip);
        const row = (await pool.query('SELECT * FROM blood_bank_units WHERE id=$1 AND tenant_id=$2', [result.rows[0].id, tenantId])).rows[0];
        res.json(row);
    } catch (e) { e13Respond(res, e); }
});

// --- Inventory: discard a unit (state machine; cannot discard a transfused unit) ---
app.put('/api/bloodbank/units/:id/discard', requireAuth, requireRole('bloodbank', 'lab'), requireTenantScope, async (req, res) => {
    const client = await pool.connect();
    try {
        const tenantId = e13RequireTenant(req);
        const unitId = Number(req.params.id);
        if (!Number.isInteger(unitId) || unitId <= 0) { client.release(); return res.status(422).json({ error: 'Invalid unit id' }); }
        await client.query('BEGIN');
        const u = (await client.query('SELECT id, status, bag_number FROM blood_bank_units WHERE id=$1 AND tenant_id=$2 FOR UPDATE', [unitId, tenantId])).rows[0];
        if (!u) { await client.query('ROLLBACK'); client.release(); return res.status(404).json({ error: 'Unit not found' }); }
        if (u.status === 'Transfused' || u.status === 'Issued') {
            await client.query('ROLLBACK'); client.release();
            return res.status(409).json({ error: `Cannot discard a unit in status ${u.status}` });
        }
        await client.query("UPDATE blood_bank_units SET status='Discarded', updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND tenant_id=$2", [unitId, tenantId]);
        await client.query('COMMIT');
        client.release();
        logAudit(req.session.user?.id, req.session.user?.display_name || req.session.user?.name, 'DISCARD_UNIT', 'BloodBank', `Discarded unit #${unitId} (${u.bag_number || ''})`, req.ip);
        res.json({ success: true });
    } catch (e) {
        try { await client.query('ROLLBACK'); } catch (_) {}
        client.release();
        e13Respond(res, e);
    }
});

// --- Crossmatch: list (tenant-scoped) ---
app.get('/api/bloodbank/crossmatch', requireAuth, requireRole('bloodbank', 'lab', 'doctor', 'nursing'), requireTenantScope, async (req, res) => {
    try {
        const tenantId = e13RequireTenant(req);
        const { patient_id } = req.query;
        if (patient_id) {
            const pid = Number(patient_id);
            if (!Number.isInteger(pid) || pid <= 0) return res.status(422).json({ error: 'Invalid patient id' });
            const rows = (await pool.query('SELECT * FROM blood_bank_crossmatch WHERE patient_id=$1 AND tenant_id=$2 ORDER BY id DESC', [pid, tenantId])).rows;
            return res.json(rows);
        }
        const rows = (await pool.query('SELECT * FROM blood_bank_crossmatch WHERE tenant_id=$1 ORDER BY id DESC', [tenantId])).rows;
        res.json(rows);
    } catch (e) { e13Respond(res, e); }
});

// --- Crossmatch: create with SERVER-SIDE ABO/Rh check (fail-closed 422) ---
// The critical safety route. patient ABO/Rh is read from the patients table
// (NOT trusted from the client). If a unit is specified its ABO/Rh is read
// from blood_bank_units. Incompatible => 422 and NO row is persisted as Compatible.
app.post('/api/bloodbank/crossmatch', requireAuth, requireRole('bloodbank', 'lab', 'doctor'), requireTenantScope, async (req, res) => {
    try {
        const tenantId = e13RequireTenant(req);
        const { patient_id, units_needed, unit_id, surgery_id, notes } = req.body;
        const pid = Number(patient_id);
        if (!Number.isInteger(pid) || pid <= 0) return res.status(422).json({ error: 'Invalid patient id' });

        // Patient must belong to this tenant; ABO/Rh is server-authoritative (anti-spoof).
        const patient = (await pool.query('SELECT id, name_ar, name_en, blood_type FROM patients WHERE id=$1 AND tenant_id=$2', [pid, tenantId])).rows[0];
        if (!patient) return res.status(404).json({ error: 'Patient not found' });
        const patientName = patient.name_en || patient.name_ar || '';
        const recipient = bbCompat.parseBloodType(patient.blood_type);
        if (!recipient.abo || !recipient.rh) {
            // Incomplete recipient typing must block — never falsely reassure (E6).
            return res.status(422).json({ error: 'Patient blood type not established; crossmatch blocked', reason: 'INCOMPLETE_RECIPIENT_TYPE' });
        }

        let resolvedUnit = null;
        let compat = null;
        if (unit_id !== undefined && unit_id !== null && String(unit_id).trim() !== '') {
            const uid = Number(unit_id);
            if (!Number.isInteger(uid) || uid <= 0) return res.status(422).json({ error: 'Invalid unit id' });
            resolvedUnit = (await pool.query('SELECT id, blood_type, rh_factor, component, status FROM blood_bank_units WHERE id=$1 AND tenant_id=$2', [uid, tenantId])).rows[0];
            if (!resolvedUnit) return res.status(404).json({ error: 'Unit not found' });
            compat = bbCompat.isABORhCompatible(patient.blood_type, null, resolvedUnit.blood_type, resolvedUnit.rh_factor, resolvedUnit.component);
            if (!compat.compatible) {
                // FAIL-CLOSED: incompatible crossmatch is rejected and never stored Compatible.
                logAudit(req.session.user?.id, req.session.user?.display_name || req.session.user?.name, 'CROSSMATCH_BLOCKED', 'BloodBank', `Blocked incompatible crossmatch patient #${pid} (${recipient.abo}${recipient.rh}) vs unit #${uid}: ${compat.reason}`, req.ip);
                return res.status(422).json({ error: 'ABO/Rh incompatible — crossmatch blocked', reason: compat.reason, compatible: false });
            }
        }

        // result is SERVER-computed: Compatible only when a unit was validated; otherwise Pending.
        const serverResult = resolvedUnit ? 'Compatible' : 'Pending';
        const patientBloodType = recipient.abo + recipient.rh;
        const result = await pool.query(
            `INSERT INTO blood_bank_crossmatch (tenant_id, patient_id, patient_name, patient_blood_type, units_needed, unit_id, lab_technician, result, surgery_id, notes, created_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
            [tenantId, pid, patientName, patientBloodType, Number(units_needed) || 1, resolvedUnit ? resolvedUnit.id : null, req.session.user?.display_name || req.session.user?.name || '', serverResult, Number(surgery_id) || null, notes || '', req.session.user?.id || null]);
        logAudit(req.session.user?.id, req.session.user?.display_name || req.session.user?.name, 'CREATE_CROSSMATCH', 'BloodBank', `Crossmatch patient #${pid} result=${serverResult}${resolvedUnit ? ' unit #' + resolvedUnit.id : ''}`, req.ip);
        const row = (await pool.query('SELECT * FROM blood_bank_crossmatch WHERE id=$1 AND tenant_id=$2', [result.rows[0].id, tenantId])).rows[0];
        // On success: omit `compatible:false`. When a unit was validated it is compatible (incompatible already returned 422 above);
        // pending crossmatches (no unit) carry no compatibility verdict yet.
        res.json(resolvedUnit ? { ...row, compatible: true, compatibility: compat } : { ...row });
    } catch (e) { e13Respond(res, e); }
});

// --- Crossmatch: validate an existing crossmatch against a unit (server-side, fail-closed) ---
// Replaces the legacy client-marked PUT. Sets Compatible ONLY if the engine agrees.
app.put('/api/bloodbank/crossmatch/:id/validate', requireAuth, requireRole('bloodbank', 'lab'), requireTenantScope, async (req, res) => {
    try {
        const tenantId = e13RequireTenant(req);
        const cmId = Number(req.params.id);
        if (!Number.isInteger(cmId) || cmId <= 0) return res.status(422).json({ error: 'Invalid crossmatch id' });
        const { unit_id } = req.body;
        const uid = Number(unit_id);
        if (!Number.isInteger(uid) || uid <= 0) return res.status(422).json({ error: 'Invalid unit id' });

        const cm = (await pool.query('SELECT * FROM blood_bank_crossmatch WHERE id=$1 AND tenant_id=$2', [cmId, tenantId])).rows[0];
        if (!cm) return res.status(404).json({ error: 'Crossmatch not found' });
        const patient = (await pool.query('SELECT id, blood_type FROM patients WHERE id=$1 AND tenant_id=$2', [cm.patient_id, tenantId])).rows[0];
        if (!patient) return res.status(404).json({ error: 'Patient not found' });
        const unit = (await pool.query('SELECT id, blood_type, rh_factor, component FROM blood_bank_units WHERE id=$1 AND tenant_id=$2', [uid, tenantId])).rows[0];
        if (!unit) return res.status(404).json({ error: 'Unit not found' });

        const compat = bbCompat.isABORhCompatible(patient.blood_type, null, unit.blood_type, unit.rh_factor, unit.component);
        if (!compat.compatible) {
            await pool.query("UPDATE blood_bank_crossmatch SET result='Incompatible', unit_id=$1, updated_at=CURRENT_TIMESTAMP WHERE id=$2 AND tenant_id=$3", [uid, cmId, tenantId]);
            logAudit(req.session.user?.id, req.session.user?.display_name || req.session.user?.name, 'CROSSMATCH_INCOMPATIBLE', 'BloodBank', `Crossmatch #${cmId} marked Incompatible: ${compat.reason}`, req.ip);
            return res.status(422).json({ error: 'ABO/Rh incompatible', reason: compat.reason, compatible: false });
        }
        await pool.query("UPDATE blood_bank_crossmatch SET result='Compatible', unit_id=$1, updated_at=CURRENT_TIMESTAMP WHERE id=$2 AND tenant_id=$3", [uid, cmId, tenantId]);
        logAudit(req.session.user?.id, req.session.user?.display_name || req.session.user?.name, 'CROSSMATCH_COMPATIBLE', 'BloodBank', `Crossmatch #${cmId} validated Compatible vs unit #${uid}`, req.ip);
        res.json({ success: true, compatible: true, compatibility: compat });
    } catch (e) { e13Respond(res, e); }
});

// --- Transfusion list (tenant-scoped) ---
app.get('/api/bloodbank/transfusions', requireAuth, requireRole('bloodbank', 'lab', 'nursing', 'doctor'), requireTenantScope, async (req, res) => {
    try {
        const tenantId = e13RequireTenant(req);
        const rows = (await pool.query('SELECT * FROM blood_bank_transfusions WHERE tenant_id=$1 ORDER BY id DESC', [tenantId])).rows;
        res.json(rows);
    } catch (e) { e13Respond(res, e); }
});

// --- Transfuse: issue a unit transactionally (the shared-resource race-safe route) ---
// Locks the unit FOR UPDATE, re-checks status+expiry+ABO/Rh under the lock, flips
// status Available -> Transfused atomically, inserts the transfusion record.
//   incompatible -> 422 ; already issued/used -> 409 ; expired -> 422.
app.post('/api/bloodbank/transfuse', requireAuth, requireRole('bloodbank', 'nursing', 'doctor'), requireTenantScope, async (req, res) => {
    const client = await pool.connect();
    try {
        const tenantId = e13RequireTenant(req);
        const { facilityId } = getRequestTenantContext(req);
        const { patient_id, unit_id, volume_ml, start_time, notes, crossmatch_id } = req.body;
        const pid = Number(patient_id);
        const uid = Number(unit_id);
        if (!Number.isInteger(pid) || pid <= 0) { client.release(); return res.status(422).json({ error: 'Invalid patient id' }); }
        if (!Number.isInteger(uid) || uid <= 0) { client.release(); return res.status(422).json({ error: 'Invalid unit id' }); }

        await client.query('BEGIN');

        // Patient ownership + server-authoritative ABO/Rh
        const patient = (await client.query('SELECT id, name_ar, name_en, blood_type FROM patients WHERE id=$1 AND tenant_id=$2', [pid, tenantId])).rows[0];
        if (!patient) { await client.query('ROLLBACK'); client.release(); return res.status(404).json({ error: 'Patient not found' }); }

        // Lock the unit row before any status decision (race-safe; no double-issue).
        const unit = (await client.query('SELECT * FROM blood_bank_units WHERE id=$1 AND tenant_id=$2 FOR UPDATE', [uid, tenantId])).rows[0];
        if (!unit) { await client.query('ROLLBACK'); client.release(); return res.status(404).json({ error: 'Unit not found' }); }

        // Expiry + status gate (FEFO; expired never issuable; reserved/used -> 409)
        const issuable = bbCompat.isUnitIssuable(unit);
        if (!issuable.issuable) {
            await client.query('ROLLBACK'); client.release();
            const code = issuable.reason === 'UNIT_EXPIRED' ? 422 : 409;
            logAudit(req.session.user?.id, req.session.user?.display_name || req.session.user?.name, 'TRANSFUSE_BLOCKED', 'BloodBank', `Blocked transfuse unit #${uid} -> patient #${pid}: ${issuable.reason}`, req.ip);
            return res.status(code).json({ error: 'Unit not issuable', reason: issuable.reason });
        }

        // ABO/Rh compatibility under the lock — fail-closed 422.
        const compat = bbCompat.isABORhCompatible(patient.blood_type, null, unit.blood_type, unit.rh_factor, unit.component);
        if (!compat.compatible) {
            await client.query('ROLLBACK'); client.release();
            logAudit(req.session.user?.id, req.session.user?.display_name || req.session.user?.name, 'TRANSFUSE_BLOCKED', 'BloodBank', `Blocked incompatible transfuse unit #${uid} -> patient #${pid}: ${compat.reason}`, req.ip);
            return res.status(422).json({ error: 'ABO/Rh incompatible — transfusion blocked', reason: compat.reason, compatible: false });
        }

        // Optional crossmatch linkage must belong to tenant + this patient + be Compatible.
        // F2-FIX: added AND result='Compatible' — a Pending or Incompatible crossmatch
        //         must NOT be used to authorise a transfusion.
        let cmId = null;
        if (crossmatch_id !== undefined && crossmatch_id !== null && String(crossmatch_id).trim() !== '') {
            const c = Number(crossmatch_id);
            if (!Number.isInteger(c) || c <= 0) { await client.query('ROLLBACK'); client.release(); return res.status(422).json({ error: 'Invalid crossmatch id' }); }
            const cmRow = (await client.query("SELECT id, result FROM blood_bank_crossmatch WHERE id=$1 AND tenant_id=$2 AND patient_id=$3", [c, tenantId, pid])).rows[0];
            if (!cmRow) { await client.query('ROLLBACK'); client.release(); return res.status(404).json({ error: 'Crossmatch not found for patient' }); }
            if (cmRow.result !== 'Compatible') { await client.query('ROLLBACK'); client.release(); return res.status(409).json({ error: 'Crossmatch not in Compatible status', result: cmRow.result }); }
            cmId = c;
        }

        // Atomic status flip: Available -> Transfused (guard status in WHERE to defeat any TOCTOU).
        const upd = await client.query("UPDATE blood_bank_units SET status='Transfused', updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND tenant_id=$2 AND status='Available'", [uid, tenantId]);
        if (upd.rowCount !== 1) { await client.query('ROLLBACK'); client.release(); return res.status(409).json({ error: 'Unit already issued (concurrent)' }); }

        const patientName = patient.name_en || patient.name_ar || '';
        const ins = await client.query(
            `INSERT INTO blood_bank_transfusions (tenant_id, facility_id, patient_id, patient_name, unit_id, crossmatch_id, bag_number, blood_type, component, administered_by, start_time, volume_ml, notes, created_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
            [tenantId, facilityId || null, pid, patientName, uid, cmId, unit.bag_number || '', (unit.blood_type || '') + (unit.rh_factor || ''), unit.component || '', req.session.user?.display_name || req.session.user?.name || '', start_time || new Date().toISOString(), Number(volume_ml) || unit.volume_ml || 0, notes || '', req.session.user?.id || null]);

        await client.query('COMMIT');
        client.release();
        logAudit(req.session.user?.id, req.session.user?.display_name || req.session.user?.name, 'TRANSFUSE_UNIT', 'BloodBank', `Transfused unit #${uid} (${unit.bag_number || ''}) -> patient #${pid}`, req.ip);
        const row = (await pool.query('SELECT * FROM blood_bank_transfusions WHERE id=$1 AND tenant_id=$2', [ins.rows[0].id, tenantId])).rows[0];
        res.json({ ...row, compatible: true });
    } catch (e) {
        try { await client.query('ROLLBACK'); } catch (_) {}
        client.release();
        e13Respond(res, e);
    }
});

// --- Transfusion reaction reporting (audited; flags unit for recall lookback) ---
// F1-FIX: Both writes (INSERT reaction + UPDATE transfusion) wrapped in a single
//         BEGIN/COMMIT transaction on a pool client so an UPDATE failure cannot
//         leave an orphaned reaction row.
app.post('/api/bloodbank/transfusions/:id/reaction', requireAuth, requireRole('bloodbank', 'nursing', 'doctor'), requireTenantScope, async (req, res) => {
    const client = await pool.connect();
    try {
        const tenantId = e13RequireTenant(req);
        const txId = Number(req.params.id);
        if (!Number.isInteger(txId) || txId <= 0) { client.release(); return res.status(422).json({ error: 'Invalid transfusion id' }); }
        // Lock the transfusion row so concurrent reaction reports are serialised.
        await client.query('BEGIN');
        const tx = (await client.query('SELECT id, unit_id, patient_id FROM blood_bank_transfusions WHERE id=$1 AND tenant_id=$2 FOR UPDATE', [txId, tenantId])).rows[0];
        if (!tx) { await client.query('ROLLBACK'); client.release(); return res.status(404).json({ error: 'Transfusion not found' }); }
        const { reaction_type, severity, reaction_details, vital_signs_after, action_taken } = req.body;
        const sev = ['Mild', 'Moderate', 'Severe', 'Fatal'].includes(severity) ? severity : 'Mild';
        const ins = await client.query(
            `INSERT INTO blood_bank_transfusion_reactions (tenant_id, transfusion_id, unit_id, patient_id, reaction_type, severity, reaction_details, vital_signs_after, action_taken, reported_by, created_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
            [tenantId, txId, tx.unit_id, tx.patient_id, reaction_type || '', sev, reaction_details || '', vital_signs_after || '', action_taken || '', req.session.user?.display_name || req.session.user?.name || '', req.session.user?.id || null]);
        await client.query('UPDATE blood_bank_transfusions SET adverse_reaction=1, reaction_details=$1, updated_at=CURRENT_TIMESTAMP WHERE id=$2 AND tenant_id=$3', [reaction_details || sev, txId, tenantId]);
        await client.query('COMMIT');
        client.release();
        logAudit(req.session.user?.id, req.session.user?.display_name || req.session.user?.name, 'TRANSFUSION_REACTION', 'BloodBank', `Reaction (${sev}) reported on transfusion #${txId} unit #${tx.unit_id}`, req.ip);
        res.json({ success: true, reaction_id: ins.rows[0].id, unit_id: tx.unit_id });
    } catch (e) {
        try { await client.query('ROLLBACK'); } catch (_) {}
        client.release();
        e13Respond(res, e);
    }
});

// --- Recall / lookback: trace a unit -> its donor's other units + all its transfusions ---
app.get('/api/bloodbank/units/:id/lookback', requireAuth, requireRole('bloodbank', 'lab', 'doctor'), requireTenantScope, async (req, res) => {
    try {
        const tenantId = e13RequireTenant(req);
        const uid = Number(req.params.id);
        if (!Number.isInteger(uid) || uid <= 0) return res.status(422).json({ error: 'Invalid unit id' });
        const unit = (await pool.query('SELECT * FROM blood_bank_units WHERE id=$1 AND tenant_id=$2', [uid, tenantId])).rows[0];
        if (!unit) return res.status(404).json({ error: 'Unit not found' });
        // Sibling units from the same donor (recall scope)
        const siblings = unit.donor_id
            ? (await pool.query('SELECT id, bag_number, blood_type, rh_factor, component, status, expiry_date FROM blood_bank_units WHERE donor_id=$1 AND tenant_id=$2 ORDER BY id', [unit.donor_id, tenantId])).rows
            : [];
        const transfusions = (await pool.query('SELECT id, patient_id, patient_name, start_time, adverse_reaction FROM blood_bank_transfusions WHERE unit_id=$1 AND tenant_id=$2 ORDER BY id', [uid, tenantId])).rows;
        const reactions = (await pool.query('SELECT id, transfusion_id, severity, reaction_type, created_at FROM blood_bank_transfusion_reactions WHERE unit_id=$1 AND tenant_id=$2 ORDER BY id', [uid, tenantId])).rows;
        res.json({ unit, donor_id: unit.donor_id || null, sibling_units: siblings, transfusions, reactions });
    } catch (e) { e13Respond(res, e); }
});

// --- Recall a unit: mark Discarded if not yet transfused (transactional) ---
app.put('/api/bloodbank/units/:id/recall', requireAuth, requireRole('bloodbank', 'lab'), requireTenantScope, async (req, res) => {
    const client = await pool.connect();
    try {
        const tenantId = e13RequireTenant(req);
        const uid = Number(req.params.id);
        if (!Number.isInteger(uid) || uid <= 0) { client.release(); return res.status(422).json({ error: 'Invalid unit id' }); }
        await client.query('BEGIN');
        const unit = (await client.query('SELECT id, status, bag_number FROM blood_bank_units WHERE id=$1 AND tenant_id=$2 FOR UPDATE', [uid, tenantId])).rows[0];
        if (!unit) { await client.query('ROLLBACK'); client.release(); return res.status(404).json({ error: 'Unit not found' }); }
        if (unit.status === 'Transfused') {
            // Already in a patient — cannot un-transfuse; recall is informational (lookback) only.
            await client.query('ROLLBACK'); client.release();
            logAudit(req.session.user?.id, req.session.user?.display_name || req.session.user?.name, 'RECALL_TRANSFUSED', 'BloodBank', `Recall flagged on already-transfused unit #${uid}; use lookback`, req.ip);
            return res.status(409).json({ error: 'Unit already transfused; use lookback to trace recipients', status: 'Transfused' });
        }
        await client.query("UPDATE blood_bank_units SET status='Discarded', notes=COALESCE(notes,'')||' [RECALLED]', updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND tenant_id=$2", [uid, tenantId]);
        await client.query('COMMIT');
        client.release();
        logAudit(req.session.user?.id, req.session.user?.display_name || req.session.user?.name, 'RECALL_UNIT', 'BloodBank', `Recalled (discarded) unit #${uid} (${unit.bag_number || ''})`, req.ip);
        res.json({ success: true, status: 'Discarded' });
    } catch (e) {
        try { await client.query('ROLLBACK'); } catch (_) {}
        client.release();
        e13Respond(res, e);
    }
});

// --- Donors (tenant-scoped) ---
app.get('/api/bloodbank/donors', requireAuth, requireRole('bloodbank', 'lab'), requireTenantScope, async (req, res) => {
    try {
        const tenantId = e13RequireTenant(req);
        const rows = (await pool.query('SELECT * FROM blood_bank_donors WHERE tenant_id=$1 ORDER BY id DESC', [tenantId])).rows;
        res.json(rows);
    } catch (e) { e13Respond(res, e); }
});

app.post('/api/bloodbank/donors', requireAuth, requireRole('bloodbank', 'lab'), requireTenantScope, async (req, res) => {
    try {
        const tenantId = e13RequireTenant(req);
        const { donor_name, donor_name_ar, national_id, phone, blood_type, rh_factor, age, gender, medical_history, notes } = req.body;
        const parsed = bbCompat.parseBloodType(blood_type, rh_factor);
        // F3-FIX: mirror unit-creation gate — reject garbage ABO/Rh instead of storing raw client value.
        if (!parsed.abo || !parsed.rh) return res.status(422).json({ error: 'Invalid blood type / Rh' });
        const result = await pool.query(
            `INSERT INTO blood_bank_donors (tenant_id, donor_name, donor_name_ar, national_id, phone, blood_type, rh_factor, age, gender, last_donation_date, medical_history, notes, created_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,CURRENT_DATE::TEXT,$10,$11,$12) RETURNING id`,
            [tenantId, donor_name || '', donor_name_ar || '', national_id || '', phone || '', parsed.abo, parsed.rh, Number(age) || 0, gender || '', medical_history || '', notes || '', req.session.user?.id || null]);
        logAudit(req.session.user?.id, req.session.user?.display_name || req.session.user?.name, 'CREATE_DONOR', 'BloodBank', `Registered donor ${donor_name || ''}`, req.ip);
        const row = (await pool.query('SELECT * FROM blood_bank_donors WHERE id=$1 AND tenant_id=$2', [result.rows[0].id, tenantId])).rows[0];
        res.json(row);
    } catch (e) { e13Respond(res, e); }
});

// --- Stats (tenant-scoped) ---
app.get('/api/bloodbank/stats', requireAuth, requireRole('bloodbank', 'lab', 'nursing', 'doctor'), requireTenantScope, async (req, res) => {
    try {
        const tenantId = e13RequireTenant(req);
        const total = (await pool.query("SELECT COUNT(*)::int AS cnt FROM blood_bank_units WHERE status='Available' AND tenant_id=$1", [tenantId])).rows[0].cnt;
        // F4-FIX: added lower bound >= CURRENT_DATE so already-expired units are excluded from "Expiring Soon".
        const expiring = (await pool.query("SELECT COUNT(*)::int AS cnt FROM blood_bank_units WHERE status='Available' AND tenant_id=$1 AND expiry_date <> '' AND expiry_date >= CURRENT_DATE::TEXT AND expiry_date <= (CURRENT_DATE + INTERVAL '7 days')::TEXT", [tenantId])).rows[0].cnt;
        const todayTransfusions = (await pool.query("SELECT COUNT(*)::int AS cnt FROM blood_bank_transfusions WHERE tenant_id=$1 AND created_at::date = CURRENT_DATE", [tenantId])).rows[0].cnt;
        const byType = (await pool.query("SELECT blood_type, rh_factor, COUNT(*)::int AS cnt FROM blood_bank_units WHERE status='Available' AND tenant_id=$1 GROUP BY blood_type, rh_factor ORDER BY blood_type", [tenantId])).rows;
        const totalDonors = (await pool.query('SELECT COUNT(*)::int AS cnt FROM blood_bank_donors WHERE tenant_id=$1', [tenantId])).rows[0].cnt;
        const pendingCrossmatch = (await pool.query("SELECT COUNT(*)::int AS cnt FROM blood_bank_crossmatch WHERE result='Pending' AND tenant_id=$1", [tenantId])).rows[0].cnt;
        const reactions = (await pool.query('SELECT COUNT(*)::int AS cnt FROM blood_bank_transfusion_reactions WHERE tenant_id=$1', [tenantId])).rows[0].cnt;
        res.json({ total, expiring, todayTransfusions, byType, totalDonors, pendingCrossmatch, reactions });
    } catch (e) { e13Respond(res, e); }
});

// --- LEGACY guard: the old client-marked crossmatch PUT is hardened (no client compatible-mark) ---
// E5/E6/E7/E8 lesson: after adding the safe route, neutralize the legacy bypass.
app.put('/api/blood-bank/crossmatch/:id', requireAuth, requireRole('bloodbank', 'lab'), requireTenantScope, (req, res) => {
    res.status(410).json({ error: 'Deprecated. Use PUT /api/bloodbank/crossmatch/:id/validate (server-side ABO/Rh).' });
});
// --- LEGACY guard: old transfusion POST that hard-marked status without locks ---
app.post('/api/blood-bank/transfusions', requireAuth, requireRole('bloodbank', 'nursing', 'doctor'), requireTenantScope, (req, res) => {
    res.status(410).json({ error: 'Deprecated. Use POST /api/bloodbank/transfuse (transactional, ABO/Rh + expiry checked).' });
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
        // Fail-closed tenant scope (E7 hardening): null tenant => 403, never an unscoped fallback.
        const { tenantId } = e7RequireTenant(req);

        const { status, disposition, assigned_doctor, assigned_bed,
            discharge_diagnosis, discharge_instructions, discharge_medications, followup_date } = req.body;

        // State guard: terminal disposition transitions MUST go through POST /api/er/disposition
        // (server-authoritative state machine + triage/provider gating + ADT handoff + bed release).
        // The legacy route is for non-terminal field updates only.
        const TERMINAL_STATUSES = ['Discharged', 'Admitted', 'Transferred', 'LWBS'];
        if (status && TERMINAL_STATUSES.includes(status)) {
            return res.status(409).json({ error: 'Terminal disposition must use POST /api/er/disposition', use: '/api/er/disposition' });
        }

        // Verify visit ownership first (always tenant-scoped).
        const visit = (await pool.query(
            'SELECT id, assigned_bed, patient_id FROM emergency_visits WHERE id = $1 AND tenant_id = $2',
            [req.params.id, tenantId])).rows[0];
        if (!visit) return res.status(404).json({ error: 'Emergency visit not found' });

        // If assigned_bed is changed, verify it belongs to tenant
        if (assigned_bed) {
            const bedCheck = (await pool.query('SELECT id FROM emergency_beds WHERE bed_name = $1 AND tenant_id = $2', [assigned_bed, tenantId])).rows[0];
            if (!bedCheck) {
                return res.status(403).json({ error: 'Invalid bed context or access denied' });
            }
        }

        // NOTE: acuity/sort fields are intentionally NOT accepted here — they are written only via
        // POST /api/er/triage (server-side ESI engine). Any client-sent acuity values are ignored
        // to prevent bypassing the ESI computation.
        const sets = []; const vals = []; let i = 1;
        if (status) { sets.push(`status=$${i++}`); vals.push(status); }
        if (disposition) { sets.push(`disposition=$${i++}`); vals.push(disposition); sets.push(`disposition_time=$${i++}`); vals.push(new Date().toISOString()); }
        if (assigned_doctor) { sets.push(`assigned_doctor=$${i++}`); vals.push(assigned_doctor); }
        if (assigned_bed) { sets.push(`assigned_bed=$${i++}`); vals.push(assigned_bed); }
        if (discharge_diagnosis) { sets.push(`discharge_diagnosis=$${i++}`); vals.push(discharge_diagnosis); }
        if (discharge_instructions) { sets.push(`discharge_instructions=$${i++}`); vals.push(discharge_instructions); }
        if (discharge_medications) { sets.push(`discharge_medications=$${i++}`); vals.push(discharge_medications); }
        if (followup_date) { sets.push(`followup_date=$${i++}`); vals.push(followup_date); }

        if (!sets.length) return res.status(422).json({ error: 'No updatable fields provided' });

        vals.push(req.params.id);
        const idIdx = i++;
        vals.push(tenantId);
        const tIdx = i;

        await pool.query(
            `UPDATE emergency_visits SET ${sets.join(',')} WHERE id=$${idIdx} AND tenant_id=$${tIdx}`, vals);

        logAudit(req.session.user?.id, req.session.user?.display_name, 'UPDATE_EMERGENCY_VISIT', 'Emergency', `Updated emergency visit #${req.params.id} (Status: ${status || 'N/A'})`, req.ip);
        res.json({ success: true });
    } catch (e) {
        if (e.e7Status) return res.status(e.e7Status).json({ error: e.message });
        res.status(500).json({ error: 'Server error' });
    }
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

// ===== E7: EMERGENCY DEPARTMENT — ESI TRIAGE, TRACKING BOARD, WORKFLOW STATE MACHINE =====
// All routes: requireAuth + requireRole('emergency','nursing','doctor') + requireTenantScope.
// ESI level is computed SERVER-SIDE by esi_engine.computeESI() from clinical inputs; any
// client-sent esi_level is advisory only and is NEVER trusted. Every query carries an explicit
// AND tenant_id=$N on top of FORCE RLS; a null tenant fails closed (403 / zero rows) — never
// an unscoped fallback. The PRIMARY UI buttons (triage / assign provider / disposition) call
// these guarded routes — there is no shadow/unguarded path.

// Fail-closed tenant resolver for E7: throws when tenant is missing so no helper ever runs unscoped.
function e7RequireTenant(req) {
    const { tenantId, facilityId } = getRequestTenantContext(req);
    if (!tenantId) { const err = new Error('Tenant scope required'); err.e7Status = 403; throw err; }
    return { tenantId, facilityId };
}

// ED workflow phases + valid transitions (server-authoritative state machine).
const ER_PHASES = ['Arrival', 'Triage', 'Waiting', 'InTreatment', 'Disposition'];
const ER_DISPOSITIONS = ['Admitted', 'Discharged', 'Transferred', 'LWBS'];

// GET /api/er/board — active ED patients ordered by ESI priority (1 first) then arrival time.
app.get('/api/er/board', requireAuth, requireRole('emergency', 'nursing', 'doctor'), requireTenantScope, async (req, res) => {
    try {
        const { tenantId } = e7RequireTenant(req);
        const rows = (await pool.query(
            `SELECT id, patient_id, patient_name, chief_complaint, chief_complaint_ar,
                    triage_level, triage_color, esi_level, esi_rationale, er_phase,
                    assigned_doctor, assigned_bed, arrival_time, triage_started_at,
                    provider_assigned_at, time_to_provider_min, disposition, disposition_type, status
             FROM emergency_visits
             WHERE status='Active' AND tenant_id = $1
             ORDER BY COALESCE(NULLIF(esi_level,0), triage_level, 3) ASC, arrival_time ASC`,
            [tenantId])).rows;

        const now = Date.now();
        const board = rows.map(v => {
            const arrivalMs = v.arrival_time ? new Date(v.arrival_time).getTime() : now;
            const minsSinceArrival = Math.max(0, Math.round((now - arrivalMs) / 60000));
            const lvl = v.esi_level || v.triage_level || 3;
            const phase = v.er_phase || (v.triage_started_at ? 'Waiting' : 'Arrival');
            // Time-to-provider breach thresholds (ESI-1: immediate; ESI-2: 10 min).
            let ttp_breach = false;
            if (!v.provider_assigned_at && (lvl === 1 || lvl === 2)) {
                const limit = lvl === 1 ? 0 : 10;
                if (minsSinceArrival > limit) ttp_breach = true;
            }
            return {
                id: v.id, patient_id: v.patient_id, patient_name: v.patient_name,
                chief_complaint: v.chief_complaint, chief_complaint_ar: v.chief_complaint_ar,
                esi_level: lvl, triage_color: v.triage_color, esi_rationale: v.esi_rationale,
                phase, location: v.assigned_bed || null, assigned_doctor: v.assigned_doctor || null,
                arrival_time: v.arrival_time, minutes_since_arrival: minsSinceArrival,
                triage_started_at: v.triage_started_at, provider_assigned_at: v.provider_assigned_at,
                time_to_provider_min: v.time_to_provider_min,
                time_to_provider_breach: ttp_breach,
                disposition: v.disposition, disposition_type: v.disposition_type, status: v.status
            };
        });
        res.json(board);
    } catch (e) {
        if (e.e7Status) return res.status(e.e7Status).json({ error: e.message });
        res.status(500).json({ error: 'Server error' });
    }
});

// POST /api/er/triage — compute ESI SERVER-SIDE, persist, set phase Waiting, start the clock.
// Body: { visit_id, vitals:{hr,rr,spo2,sbp,temp,loc}, chief_complaint, pain_score, resources|resource_count,
//         high_risk, age, ... }  (any client-sent esi_level is ignored.)
app.post('/api/er/triage', requireAuth, requireRole('emergency', 'nursing', 'doctor'), requireTenantScope, async (req, res) => {
    try {
        const { tenantId } = e7RequireTenant(req);
        const { visit_id } = req.body;
        if (!visit_id) return res.status(422).json({ error: 'visit_id is required' });

        // Ownership / IDOR: visit must belong to this tenant.
        const visit = (await pool.query(
            'SELECT id, patient_id, er_phase, status FROM emergency_visits WHERE id = $1 AND tenant_id = $2',
            [visit_id, tenantId])).rows[0];
        if (!visit) return res.status(404).json({ error: 'Emergency visit not found' });

        // State machine: cannot (re)triage a visit that has already been dispositioned/closed.
        if (visit.status && visit.status !== 'Active') {
            return res.status(409).json({ error: `Cannot triage a ${visit.status} visit` });
        }
        if (visit.er_phase === 'Disposition') {
            return res.status(409).json({ error: 'Cannot triage after disposition' });
        }
        // A patient already picked up by a provider must not be silently re-triaged to a different ESI.
        if (visit.er_phase === 'InTreatment') {
            return res.status(409).json({ error: 'Cannot re-triage a patient already in treatment' });
        }

        // SERVER-SIDE ESI — never trust req.body.esi_level.
        const esi = esiEngine.computeESI({
            vitals: req.body.vitals || {},
            loc: req.body.loc,
            chief_complaint: req.body.chief_complaint,
            chief_complaint_ar: req.body.chief_complaint_ar,
            pain_score: req.body.pain_score,
            resources: req.body.resources,
            resource_count: req.body.resource_count,
            high_risk: req.body.high_risk,
            age: req.body.age,
            requires_lifesaving: req.body.requires_lifesaving,
            cardiac_arrest: req.body.cardiac_arrest,
            requires_intubation: req.body.requires_intubation,
            active_seizure: req.body.active_seizure
        });

        // I2: corroboration audit. The engine TRUSTS client escalation flags (requires_lifesaving /
        // cardiac_arrest / active_seizure) and may land ESI-1/2 on them alone. We do NOT block (a
        // clinician may know things vitals don't show), but when such a flag is set AND every
        // measurable vital present (spo2,sbp,hr,rr) is within normal range AND LOC is alert, we mark
        // the result `unconfirmed_lifesaving_flag` and emit a distinct audit event for retro review.
        const _v = req.body.vitals || {};
        const _num = (x) => { if (x === null || x === undefined || x === '') return null; const n = Number(x); return Number.isFinite(n) ? n : null; };
        const _loc = String((req.body.loc != null ? req.body.loc : _v.loc) || '').trim().toLowerCase();
        const escalationFlag = req.body.requires_lifesaving === true || req.body.cardiac_arrest === true || req.body.active_seizure === true;
        const _spo2 = _num(_v.spo2), _sbp = _num(_v.sbp != null ? _v.sbp : _v.bp_systolic), _hr = _num(_v.hr), _rr = _num(_v.rr);
        const _present = [_spo2, _sbp, _hr, _rr].filter(x => x !== null);
        const vitalsNormal = _present.length === 4 &&
            _spo2 >= 95 && _sbp >= 100 && _hr >= 50 && _hr <= 100 && _rr >= 10 && _rr <= 20;
        const locAlert = _loc === 'a' || _loc === 'alert' || _loc === '';
        const unconfirmedLifesavingFlag = escalationFlag && vitalsNormal && locAlert;

        const rationaleObj = { decision_point: esi.decision_point, rationale: esi.rationale, danger_zone: esi.danger_zone, fail_safe: esi.fail_safe };
        if (unconfirmedLifesavingFlag) rationaleObj.unconfirmed_lifesaving_flag = true;
        const rationaleStr = JSON.stringify(rationaleObj);
        const nowIso = new Date().toISOString();

        await pool.query(
            `UPDATE emergency_visits
             SET esi_level=$1, triage_level=$1, triage_color=$2, esi_rationale=$3,
                 er_phase='Waiting',
                 triage_started_at=COALESCE(NULLIF(triage_started_at,''), $4),
                 triage_nurse=COALESCE(NULLIF($5,''), triage_nurse)
             WHERE id=$6 AND tenant_id=$7`,
            [esi.esi_level, esi.triage_color, rationaleStr, nowIso,
             req.body.triage_nurse || req.session.user?.display_name || '', visit_id, tenantId]);

        logAudit(req.session.user?.id, req.session.user?.display_name, 'ER_TRIAGE', 'Emergency',
            `ESI ${esi.esi_level} (DP ${esi.decision_point}) for visit #${visit_id}; danger_zone=${esi.danger_zone}`, req.ip);

        // I2: distinct audit event when an ESI-1/2 escalation rests only on a client flag while all
        // measurable vitals are normal and LOC is alert — flagged for retrospective clinical review.
        if (unconfirmedLifesavingFlag) {
            logAudit(req.session.user?.id, req.session.user?.display_name, 'ER_TRIAGE_UNCONFIRMED_ESCALATION', 'Emergency',
                `Visit #${visit_id}: ESI ${esi.esi_level} driven by client escalation flag with all measurable vitals normal (spo2=${_spo2},sbp=${_sbp},hr=${_hr},rr=${_rr}) and LOC alert — review`, req.ip);
        }

        res.json({ success: true, visit_id, esi_level: esi.esi_level, triage_color: esi.triage_color,
            decision_point: esi.decision_point, rationale: esi.rationale, danger_zone: esi.danger_zone,
            high_risk: esi.high_risk, resources_estimated: esi.resources_estimated, fail_safe: esi.fail_safe });
    } catch (e) {
        if (e.e7Status) return res.status(e.e7Status).json({ error: e.message });
        res.status(500).json({ error: 'Server error' });
    }
});

// POST /api/er/assign-provider — provider picks up the patient; record time-to-provider.
// Body: { visit_id, provider }  (provider name; defaults to acting user.)
app.post('/api/er/assign-provider', requireAuth, requireRole('emergency', 'nursing', 'doctor'), requireTenantScope, async (req, res) => {
    try {
        const { tenantId } = e7RequireTenant(req);
        const { visit_id, provider } = req.body;
        if (!visit_id) return res.status(422).json({ error: 'visit_id is required' });

        const visit = (await pool.query(
            'SELECT id, er_phase, status, esi_level, triage_started_at, arrival_time FROM emergency_visits WHERE id = $1 AND tenant_id = $2',
            [visit_id, tenantId])).rows[0];
        if (!visit) return res.status(404).json({ error: 'Emergency visit not found' });

        // State machine: provider assignment requires triage first.
        if (visit.status && visit.status !== 'Active') {
            return res.status(409).json({ error: `Cannot assign provider to a ${visit.status} visit` });
        }
        const triaged = (visit.esi_level && visit.esi_level > 0) || (visit.triage_started_at && visit.triage_started_at !== '');
        if (!triaged) {
            return res.status(409).json({ error: 'Cannot assign provider before triage' });
        }

        const providerName = (provider && String(provider).trim()) || req.session.user?.display_name || 'Provider';
        const nowMs = Date.now();
        const startMs = visit.triage_started_at ? new Date(visit.triage_started_at).getTime()
            : (visit.arrival_time ? new Date(visit.arrival_time).getTime() : nowMs);
        const ttp = Math.max(0, Math.round((nowMs - startMs) / 60000));
        const nowIso = new Date(nowMs).toISOString();

        await pool.query(
            `UPDATE emergency_visits
             SET assigned_doctor=$1, er_phase='InTreatment',
                 provider_assigned_at=COALESCE(NULLIF(provider_assigned_at,''), $2),
                 time_to_provider_min=COALESCE(NULLIF(time_to_provider_min,0), $3)
             WHERE id=$4 AND tenant_id=$5`,
            [providerName, nowIso, ttp, visit_id, tenantId]);

        logAudit(req.session.user?.id, req.session.user?.display_name, 'ER_ASSIGN_PROVIDER', 'Emergency',
            `Provider ${providerName} assigned to visit #${visit_id}; time-to-provider=${ttp}min`, req.ip);

        res.json({ success: true, visit_id, assigned_doctor: providerName, time_to_provider_min: ttp, phase: 'InTreatment' });
    } catch (e) {
        if (e.e7Status) return res.status(e.e7Status).json({ error: e.message });
        res.status(500).json({ error: 'Server error' });
    }
});

// POST /api/er/disposition — close the ED encounter (admit[->ADT]/discharge/transfer/LWBS).
// Body: { visit_id, disposition_type, diagnosis, instructions, medications, followup_date,
//         admission_department, admitting_doctor }  State machine: disposition before triage => 409.
app.post('/api/er/disposition', requireAuth, requireRole('emergency', 'nursing', 'doctor'), requireTenantScope, async (req, res) => {
    try {
        const { tenantId, facilityId } = e7RequireTenant(req);
        const { visit_id, disposition_type } = req.body;
        if (!visit_id) return res.status(422).json({ error: 'visit_id is required' });
        if (!ER_DISPOSITIONS.includes(disposition_type)) {
            return res.status(422).json({ error: 'Invalid disposition_type', allowed: ER_DISPOSITIONS });
        }

        const visit = (await pool.query(
            `SELECT id, patient_id, patient_name, assigned_bed, assigned_doctor, chief_complaint,
                    chief_complaint_ar, er_phase, status, esi_level, triage_started_at, provider_assigned_at
             FROM emergency_visits WHERE id = $1 AND tenant_id = $2`,
            [visit_id, tenantId])).rows[0];
        if (!visit) return res.status(404).json({ error: 'Emergency visit not found' });

        if (visit.status && visit.status !== 'Active') {
            return res.status(409).json({ error: `Visit already ${visit.status}` });
        }

        // State machine: cannot disposition before triage.
        const triaged = (visit.esi_level && visit.esi_level > 0) || (visit.triage_started_at && visit.triage_started_at !== '');
        if (!triaged) {
            return res.status(409).json({ error: 'Cannot set disposition before triage' });
        }
        // Admit/Discharge/Transfer require a provider to have seen the patient. LWBS is allowed
        // after triage without a provider (the patient left before being seen).
        const seenByProvider = visit.provider_assigned_at && visit.provider_assigned_at !== '';
        if (disposition_type !== 'LWBS' && !seenByProvider) {
            return res.status(409).json({ error: 'Cannot disposition before a provider is assigned' });
        }

        // Map disposition -> visit status.
        const STATUS_MAP = { Admitted: 'Admitted', Discharged: 'Discharged', Transferred: 'Transferred', LWBS: 'LWBS' };
        const newStatus = STATUS_MAP[disposition_type];
        const nowIso = new Date().toISOString();

        const sets = ["er_phase='Disposition'", `status=$1`, `disposition=$2`, `disposition_time=$3`];
        const vals = [newStatus, disposition_type, nowIso];
        let i = 4;
        if (req.body.diagnosis) { sets.push(`discharge_diagnosis=$${i++}`); vals.push(req.body.diagnosis); }
        if (req.body.instructions) { sets.push(`discharge_instructions=$${i++}`); vals.push(req.body.instructions); }
        if (req.body.medications) { sets.push(`discharge_medications=$${i++}`); vals.push(req.body.medications); }
        if (req.body.followup_date) { sets.push(`followup_date=$${i++}`); vals.push(req.body.followup_date); }
        if (disposition_type === 'Discharged') { sets.push(`discharge_time=$${i++}`); vals.push(nowIso); }
        vals.push(visit_id); const idIdx = i++;
        vals.push(tenantId); const tIdx = i;

        await pool.query(
            `UPDATE emergency_visits SET ${sets.join(',')} WHERE id=$${idIdx} AND tenant_id=$${tIdx}`, vals);

        // Free the ED bed on terminal dispositions.
        if (visit.assigned_bed) {
            await pool.query(
                "UPDATE emergency_beds SET status='Available', current_patient_id=0 WHERE bed_name=$1 AND tenant_id=$2",
                [visit.assigned_bed, tenantId]);
        }

        // ADT handoff (E5 inpatient): admit -> create an Emergency admission, tenant-scoped.
        let admission = null;
        if (disposition_type === 'Admitted') {
            const admDept = req.body.admission_department || 'Emergency';
            const admDoctor = req.body.admitting_doctor || visit.assigned_doctor || '';
            const diag = req.body.diagnosis || visit.chief_complaint_ar || visit.chief_complaint || '';
            try {
                admission = (await pool.query(
                    `INSERT INTO admissions (patient_id, patient_name, admission_type, admitting_doctor, attending_doctor, department, diagnosis, status, tenant_id, facility_id)
                     VALUES ($1,$2,'Emergency',$3,$3,$4,$5,'Active',$6,$7) RETURNING id`,
                    [visit.patient_id, visit.patient_name, admDoctor, admDept, diag, tenantId, facilityId])).rows[0];
            } catch (admErr) {
                // Admission table shape can vary; never fail the disposition on the handoff insert.
                console.error('ER->ADT handoff insert error:', admErr.message);
            }
        }

        logAudit(req.session.user?.id, req.session.user?.display_name, 'ER_DISPOSITION', 'Emergency',
            `Disposition ${disposition_type} (status ${newStatus}) for visit #${visit_id}${admission ? ` -> admission #${admission.id}` : ''}`, req.ip);

        res.json({ success: true, visit_id, disposition_type, status: newStatus, phase: 'Disposition',
            admission_id: admission ? admission.id : null });
    } catch (e) {
        if (e.e7Status) return res.status(e.e7Status).json({ error: e.message });
        res.status(500).json({ error: 'Server error' });
    }
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
        // L2 fix: fail-closed. The prior null-tenant else-branch used `WHERE tenant_id=$1`
        // with params=[] ("$1 not bound" runtime error) — and any unscoped fallback would be a
        // cross-tenant leak anyway. Require a tenant; every query carries AND tenant_id.
        const { tenantId } = e8RequireTenant(req);
        let qText, params;
        if (status) {
            qText = 'SELECT * FROM admissions WHERE status=$1 AND tenant_id=$2 ORDER BY admission_date DESC';
            params = [status, tenantId];
        } else {
            qText = 'SELECT * FROM admissions WHERE tenant_id=$1 ORDER BY admission_date DESC';
            params = [tenantId];
        }
        const q = await pool.query(qText, params);
        res.json(q.rows);
    } catch (e) {
        if (e.e8Status) return res.status(e.e8Status).json({ error: e.message });
        res.status(500).json({ error: 'Server error' });
    }
});

// Added to allow secure fetch of single admission record and prevent IDOR
app.get('/api/admissions/:id', requireAuth, requireTenantScope, async (req, res) => {
    try {
        // I2 fix: fail-closed (no unscoped fallback) so a null tenant context can never read
        // another tenant's admission (cross-tenant IDOR).
        const { tenantId } = e8RequireTenant(req);
        const row = (await pool.query(
            'SELECT * FROM admissions WHERE id = $1 AND tenant_id = $2',
            [req.params.id, tenantId])).rows[0];
        if (!row) return res.status(404).json({ error: 'Admission not found' });
        res.json(row);
    } catch (e) {
        if (e.e8Status) return res.status(e.e8Status).json({ error: e.message });
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/admissions', requireAuth, requireTenantScope, async (req, res) => {
    // E8 SHADOW-PATH CLOSURE: the legacy admit path occupied a bed WITHOUT a FOR UPDATE lock
    // (double-occupy race) and did not enforce the bed/admission state machine. Admissions must
    // now go through POST /api/adt/admit (race-safe, state-validated). This route is retired for
    // writes; it fails closed and directs callers to the safe route. (The ER->ADT handoff uses a
    // direct INSERT, not this route, so it is unaffected.)
    const { tenantId } = getRequestTenantContext(req);
    if (!tenantId && process.env.NODE_ENV === 'production') return res.status(403).json({ error: 'Tenant scope required' });
    return res.status(409).json({ error: 'Use POST /api/adt/admit', use: '/api/adt/admit' });
});
app.post('/api/admissions/_legacy_disabled', requireAuth, requireTenantScope, async (req, res) => {
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
    // E8 SHADOW-PATH CLOSURE: legacy discharge freed the bed to 'Available' (not 'Cleaning') and
    // did NOT reject an already-discharged admission. Discharge must now go through
    // POST /api/adt/discharge (state-validated, frees bed -> Cleaning). Fails closed.
    const { tenantId } = getRequestTenantContext(req);
    if (!tenantId && process.env.NODE_ENV === 'production') return res.status(403).json({ error: 'Tenant scope required' });
    return res.status(409).json({ error: 'Use POST /api/adt/discharge', use: '/api/adt/discharge' });
});
app.put('/api/admissions/:id/discharge_legacy_disabled', requireAuth, requireTenantScope, async (req, res) => {
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
        // I2 fix: fail-closed — no unscoped fallback (cross-tenant IDOR otherwise).
        const { tenantId, facilityId } = e8RequireTenant(req);

        // Verify admission ownership first
        const adm = (await pool.query('SELECT id FROM admissions WHERE id = $1 AND tenant_id = $2', [req.params.id, tenantId])).rows[0];
        if (!adm) return res.status(404).json({ error: 'Admission not found' });

        const { patient_id, doctor_name, subjective, objective, assessment, plan, vitals_summary, orders, diet_changes } = req.body;

        // Verify patient ownership
        if (patient_id) {
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
    } catch (e) {
        if (e.e8Status) return res.status(e.e8Status).json({ error: e.message });
        res.status(500).json({ error: 'Server error' });
    }
});

app.get('/api/admissions/:id/rounds', requireAuth, requireTenantScope, async (req, res) => {
    try {
        // I2 fix: fail-closed — no unscoped fallback (cross-tenant IDOR otherwise).
        const { tenantId } = e8RequireTenant(req);

        // Verify admission ownership first
        const adm = (await pool.query('SELECT id FROM admissions WHERE id = $1 AND tenant_id = $2', [req.params.id, tenantId])).rows[0];
        if (!adm) return res.status(404).json({ error: 'Admission not found' });

        res.json((await pool.query(
            'SELECT * FROM admission_daily_rounds WHERE admission_id=$1 AND tenant_id=$2 ORDER BY id DESC',
            [req.params.id, tenantId])).rows);
    } catch (e) {
        if (e.e8Status) return res.status(e.e8Status).json({ error: e.message });
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/bed-transfers', requireAuth, requireTenantScope, async (req, res) => {
    // E8 SHADOW-PATH CLOSURE: legacy transfer occupied/freed beds WITHOUT FOR UPDATE locks and did
    // not reject an occupied destination (double-occupy race). Transfers must now go through
    // POST /api/adt/transfer (atomic, locked, rejects occupied dest). Fails closed.
    const { tenantId } = getRequestTenantContext(req);
    if (!tenantId && process.env.NODE_ENV === 'production') return res.status(403).json({ error: 'Tenant scope required' });
    return res.status(409).json({ error: 'Use POST /api/adt/transfer', use: '/api/adt/transfer' });
});
app.post('/api/bed-transfers_legacy_disabled', requireAuth, requireTenantScope, async (req, res) => {
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

// ============================================================
// ===== E8 INPATIENT / ADT — state-machine, race-safe bed mgmt =====
// World-class ADT: admit / transfer / discharge + census + bed board, with a
// server-authoritative bed-status lifecycle and admission state machine. Every
// bed occupy/free is done inside a transaction with SELECT ... FOR UPDATE on the
// bed row so two concurrent admits can never double-occupy one bed.
// ============================================================

// Fail-closed tenant resolver (mirrors e7RequireTenant — generic, no unscoped fallback).
function e8RequireTenant(req) {
    const { tenantId, facilityId } = getRequestTenantContext(req);
    if (!tenantId) { const err = new Error('Tenant scope required'); err.e8Status = 403; throw err; }
    return { tenantId, facilityId };
}

// Server-authoritative bed status lifecycle. 'Available' is the legacy vacant terminal
// (kept for backward compat with the existing schema/seeds). Allowed transitions:
//   Available -> Reserved | Occupied      (reserve or direct admit)
//   Reserved  -> Occupied | Available     (admit the held bed, or release the hold)
//   Occupied  -> Cleaning | Available     (discharge/transfer-out -> needs cleaning, or freed directly)
//   Cleaning  -> Available | Blocked      (housekeeping done, or take offline)
//   Blocked   -> Available                 (return to service)
const E8_BED_STATUSES = ['Available', 'Reserved', 'Occupied', 'Cleaning', 'Blocked'];
const E8_BED_TRANSITIONS = {
    Available: ['Reserved', 'Occupied', 'Blocked', 'Cleaning'],
    Reserved: ['Occupied', 'Available'],
    Occupied: ['Cleaning', 'Available'],
    Cleaning: ['Available', 'Blocked'],
    Blocked: ['Available']
};
// A bed is "occupiable" by an admission only if currently free.
const E8_BED_FREE_STATES = ['Available', 'Reserved'];
function e8CanTransitionBed(from, to) {
    if (!E8_BED_STATUSES.includes(to)) return false;
    const f = from || 'Available';
    if (f === to) return true; // idempotent no-op allowed
    return (E8_BED_TRANSITIONS[f] || []).includes(to);
}

// Admission lifecycle: Active -> (Transferred-in-place stays Active) -> Discharged.
// Discharge is only valid from an Active admission; transfer is only valid for Active.
const E8_ADMISSION_TERMINAL = ['Discharged'];

// Coerce an id to a positive integer (no string/padded-id coercion bypass — E6 lesson).
function e8IntId(v) {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    if (!Number.isInteger(n) || n <= 0) return null;
    return n;
}

// GET /api/adt/beds — bed board (status + current patient) for the tenant.
app.get('/api/adt/beds', requireAuth, requireRole('inpatient', 'nursing', 'doctor'), requireTenantScope, async (req, res) => {
    try {
        const { tenantId } = e8RequireTenant(req);
        const wardId = e8IntId(req.query.ward_id);
        const params = [tenantId];
        let where = 'b.tenant_id = $1';
        if (wardId) { params.push(wardId); where += ` AND b.ward_id = $${params.length}`; }
        const rows = (await pool.query(
            `SELECT b.id, b.bed_number, b.bed_type, b.room_number, b.status, b.ward_id,
                    b.current_patient_id, b.current_admission_id, b.isolation_type,
                    w.ward_name, w.ward_name_ar, w.ward_type,
                    a.patient_name, a.diagnosis, a.attending_doctor, a.admission_date
             FROM beds b
             JOIN wards w ON b.ward_id = w.id AND w.tenant_id = $1
             LEFT JOIN admissions a ON b.current_admission_id = a.id AND a.status='Active' AND a.tenant_id = $1
             WHERE ${where}
             ORDER BY w.id, b.bed_number`, params)).rows;
        res.json({ beds: rows, statuses: E8_BED_STATUSES });
    } catch (e) {
        if (e.e8Status) return res.status(e.e8Status).json({ error: e.message });
        res.status(500).json({ error: 'Server error' });
    }
});

// GET /api/adt/census — occupancy by ward. Only 'Occupied' counts as occupied;
// only 'Available' counts as available (Reserved/Cleaning/Blocked are neither —
// fixes the legacy binary census math which counted any non-Occupied as available).
app.get('/api/adt/census', requireAuth, requireRole('inpatient', 'nursing', 'doctor'), requireTenantScope, async (req, res) => {
    try {
        const { tenantId } = e8RequireTenant(req);
        const wards = (await pool.query('SELECT * FROM wards WHERE tenant_id=$1 ORDER BY id', [tenantId])).rows;
        const beds = (await pool.query(
            `SELECT b.id, b.bed_number, b.room_number, b.status, b.ward_id,
                    w.ward_name, w.ward_name_ar, w.ward_type,
                    a.patient_name, a.diagnosis, a.admission_date, a.attending_doctor
             FROM beds b
             JOIN wards w ON b.ward_id = w.id AND w.tenant_id = $1
             LEFT JOIN admissions a ON b.current_admission_id = a.id AND a.status='Active' AND a.tenant_id = $1
             WHERE b.tenant_id = $1
             ORDER BY w.id, b.bed_number`, [tenantId])).rows;

        const total = beds.length;
        const occupied = beds.filter(b => b.status === 'Occupied').length;
        const available = beds.filter(b => b.status === 'Available').length;
        const cleaning = beds.filter(b => b.status === 'Cleaning').length;
        const reserved = beds.filter(b => b.status === 'Reserved').length;
        const blocked = beds.filter(b => b.status === 'Blocked').length;
        const byWard = wards.map(w => {
            const wb = beds.filter(b => b.ward_id === w.id);
            return {
                ward_id: w.id, ward_name: w.ward_name, ward_name_ar: w.ward_name_ar, ward_type: w.ward_type,
                total: wb.length,
                occupied: wb.filter(b => b.status === 'Occupied').length,
                available: wb.filter(b => b.status === 'Available').length,
                cleaning: wb.filter(b => b.status === 'Cleaning').length,
                reserved: wb.filter(b => b.status === 'Reserved').length,
                blocked: wb.filter(b => b.status === 'Blocked').length
            };
        });
        res.json({
            wards, beds, byWard, total, occupied, available, cleaning, reserved, blocked,
            occupancyRate: total > 0 ? Math.round(occupied / total * 100) : 0
        });
    } catch (e) {
        if (e.e8Status) return res.status(e.e8Status).json({ error: e.message });
        res.status(500).json({ error: 'Server error' });
    }
});

// POST /api/adt/admit — admit a patient into a bed.
// Two modes (both tenant-scoped, race-safe):
//   (a) place an existing admission (e.g. an ER->ADT handoff row with no bed) into a bed:
//       body { admission_id, bed_id }
//   (b) create a new direct/elective admission and place it in a bed:
//       body { patient_id, patient_name, admission_type, attending_doctor, admitting_doctor,
//              department, ward_id, bed_id, diagnosis, icd10_code, diet_order, expected_los }
// The destination bed is locked FOR UPDATE; if it is not free (Available/Reserved) => 409.
app.post('/api/adt/admit', requireAuth, requireRole('inpatient', 'nursing', 'doctor'), requireTenantScope, async (req, res) => {
    const client = await pool.connect();
    let began = false;
    try {
        const { tenantId, facilityId } = e8RequireTenant(req);
        const bedId = e8IntId(req.body.bed_id);
        if (!bedId) { client.release(); return res.status(422).json({ error: 'bed_id is required' }); }
        const admissionId = e8IntId(req.body.admission_id);
        const patientId = e8IntId(req.body.patient_id);

        await client.query('BEGIN'); began = true;

        // Lock the destination bed row inside the txn — prevents two concurrent admits
        // from both seeing it free and double-occupying it.
        const bed = (await client.query(
            'SELECT id, ward_id, status, current_admission_id FROM beds WHERE id=$1 AND tenant_id=$2 FOR UPDATE',
            [bedId, tenantId])).rows[0];
        if (!bed) { await client.query('ROLLBACK'); client.release(); return res.status(404).json({ error: 'Bed not found' }); }
        if (!E8_BED_FREE_STATES.includes(bed.status)) {
            await client.query('ROLLBACK'); client.release();
            return res.status(409).json({ error: `Bed not available (status ${bed.status})` });
        }

        let admission;
        if (admissionId) {
            // Mode (a): place an existing Active admission (no bed yet) into this bed.
            admission = (await client.query(
                'SELECT id, patient_id, status, bed_id FROM admissions WHERE id=$1 AND tenant_id=$2 FOR UPDATE',
                [admissionId, tenantId])).rows[0];
            if (!admission) { await client.query('ROLLBACK'); client.release(); return res.status(404).json({ error: 'Admission not found' }); }
            if (admission.status !== 'Active') {
                await client.query('ROLLBACK'); client.release();
                return res.status(409).json({ error: `Cannot place a ${admission.status} admission into a bed` });
            }
            if (admission.bed_id) {
                await client.query('ROLLBACK'); client.release();
                return res.status(409).json({ error: 'Admission already occupies a bed; use transfer' });
            }
            await client.query(
                'UPDATE admissions SET ward_id=$1, bed_id=$2 WHERE id=$3 AND tenant_id=$4',
                [bed.ward_id, bedId, admissionId, tenantId]);
        } else {
            // Mode (b): create a new admission. Verify patient ownership (IDOR guard).
            if (!patientId) { await client.query('ROLLBACK'); client.release(); return res.status(422).json({ error: 'patient_id or admission_id is required' }); }
            const patient = (await client.query('SELECT id FROM patients WHERE id=$1 AND tenant_id=$2', [patientId, tenantId])).rows[0];
            if (!patient) { await client.query('ROLLBACK'); client.release(); return res.status(403).json({ error: 'Invalid patient context or access denied' }); }
            const b = req.body;
            admission = (await client.query(
                `INSERT INTO admissions (patient_id, patient_name, admission_type, admitting_doctor, attending_doctor, department, ward_id, bed_id, diagnosis, icd10_code, diet_order, expected_los, status, tenant_id, facility_id)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'Active',$13,$14) RETURNING id, patient_id`,
                [patientId, b.patient_name || '', b.admission_type || 'Regular', b.admitting_doctor || '', b.attending_doctor || '',
                 b.department || '', bed.ward_id, bedId, b.diagnosis || '', b.icd10_code || '', b.diet_order || 'Regular',
                 e8IntId(b.expected_los) || 3, tenantId, facilityId])).rows[0];
        }

        // Occupy the (locked) bed — server-side authority; status not trusted from client.
        await client.query(
            "UPDATE beds SET status='Occupied', current_patient_id=$1, current_admission_id=$2 WHERE id=$3 AND tenant_id=$4",
            [admission.patient_id, admission.id, bedId, tenantId]);
        // Reflect on the patient record.
        if (admission.patient_id) {
            await client.query("UPDATE patients SET status='Admitted' WHERE id=$1 AND tenant_id=$2", [admission.patient_id, tenantId]);
        }

        await client.query('COMMIT'); client.release();
        logAudit(req.session.user?.id, req.session.user?.display_name, 'ADT_ADMIT', 'Inpatient',
            `Admitted patient #${admission.patient_id} -> admission #${admission.id} into bed #${bedId}`, req.ip);
        res.json({ success: true, admission_id: admission.id, bed_id: bedId, bed_status: 'Occupied' });
    } catch (e) {
        if (began) { try { await client.query('ROLLBACK'); } catch (_) {} }
        client.release();
        if (e.e8Status) return res.status(e.e8Status).json({ error: e.message });
        res.status(500).json({ error: 'Server error' });
    }
});

// POST /api/adt/transfer — move an Active admission between beds/wards, atomically.
// body { admission_id, to_bed, transfer_reason }
// Locks BOTH beds FOR UPDATE; frees the source (-> Cleaning) and occupies the dest;
// rejects a dest that is not free (409); records the transfer in bed_transfers.
app.post('/api/adt/transfer', requireAuth, requireRole('inpatient', 'nursing', 'doctor'), requireTenantScope, async (req, res) => {
    const client = await pool.connect();
    let began = false;
    try {
        const { tenantId, facilityId } = e8RequireTenant(req);
        const admissionId = e8IntId(req.body.admission_id);
        const toBed = e8IntId(req.body.to_bed);
        if (!admissionId || !toBed) { client.release(); return res.status(422).json({ error: 'admission_id and to_bed are required' }); }

        await client.query('BEGIN'); began = true;

        const admission = (await client.query(
            'SELECT id, patient_id, status, ward_id, bed_id FROM admissions WHERE id=$1 AND tenant_id=$2 FOR UPDATE',
            [admissionId, tenantId])).rows[0];
        if (!admission) { await client.query('ROLLBACK'); client.release(); return res.status(404).json({ error: 'Admission not found' }); }
        if (admission.status !== 'Active') {
            await client.query('ROLLBACK'); client.release();
            return res.status(409).json({ error: `Cannot transfer a ${admission.status} admission` });
        }
        const fromBed = admission.bed_id;
        if (fromBed && fromBed === toBed) {
            await client.query('ROLLBACK'); client.release();
            return res.status(409).json({ error: 'Source and destination beds are the same' });
        }

        // C2 fix — deadlock avoidance: lock BOTH beds in a CONSISTENT ascending-id order,
        // regardless of which is source vs destination. Two reverse-direction concurrent
        // transfers (A->B and B->A) previously deadlocked because each locked its own
        // destination first. Acquiring row locks in a global order (ascending id) guarantees
        // no AB/BA cycle. We collect the locked rows into a map, then resolve src/dest below.
        const lockIds = [toBed, fromBed].filter(Boolean).sort((a, b) => a - b);
        const locked = {};
        for (const lid of lockIds) {
            const row = (await client.query(
                'SELECT id, ward_id, status FROM beds WHERE id=$1 AND tenant_id=$2 FOR UPDATE',
                [lid, tenantId])).rows[0];
            if (row) locked[lid] = row;
        }

        const dest = locked[toBed] || null;
        if (!dest) { await client.query('ROLLBACK'); client.release(); return res.status(404).json({ error: 'Destination bed not found' }); }
        if (!E8_BED_FREE_STATES.includes(dest.status)) {
            await client.query('ROLLBACK'); client.release();
            return res.status(409).json({ error: `Destination bed not available (status ${dest.status})` });
        }

        const src = fromBed ? (locked[fromBed] || null) : null;

        // Free the source bed -> Cleaning (housekeeping), then occupy the destination.
        if (src) {
            await client.query(
                "UPDATE beds SET status='Cleaning', current_patient_id=0, current_admission_id=0 WHERE id=$1 AND tenant_id=$2",
                [fromBed, tenantId]);
        }
        await client.query(
            "UPDATE beds SET status='Occupied', current_patient_id=$1, current_admission_id=$2 WHERE id=$3 AND tenant_id=$4",
            [admission.patient_id, admissionId, toBed, tenantId]);
        await client.query(
            'UPDATE admissions SET ward_id=$1, bed_id=$2 WHERE id=$3 AND tenant_id=$4',
            [dest.ward_id, toBed, admissionId, tenantId]);
        // History (bed_transfers uses branch_id = facilityId, per legacy schema).
        await client.query(
            `INSERT INTO bed_transfers (admission_id, patient_id, from_ward, from_bed, to_ward, to_bed, transfer_reason, transferred_by, transfer_date, tenant_id, branch_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
            [admissionId, admission.patient_id, admission.ward_id, fromBed, dest.ward_id, toBed,
             req.body.transfer_reason || '', req.session.user?.display_name || '', new Date().toISOString(), tenantId, facilityId]);

        await client.query('COMMIT'); client.release();
        logAudit(req.session.user?.id, req.session.user?.display_name, 'ADT_TRANSFER', 'Inpatient',
            `Transferred admission #${admissionId} (patient #${admission.patient_id}) from bed #${fromBed || '-'} to bed #${toBed}`, req.ip);
        res.json({ success: true, admission_id: admissionId, from_bed: fromBed, to_bed: toBed });
    } catch (e) {
        if (began) { try { await client.query('ROLLBACK'); } catch (_) {} }
        client.release();
        if (e.e8Status) return res.status(e.e8Status).json({ error: e.message });
        res.status(500).json({ error: 'Server error' });
    }
});

// POST /api/adt/discharge — end an Active admission, free its bed (-> Cleaning), record disposition.
// body { admission_id, discharge_type, discharge_summary, discharge_instructions,
//        discharge_medications, followup_date, followup_doctor }
app.post('/api/adt/discharge', requireAuth, requireRole('inpatient', 'nursing', 'doctor'), requireTenantScope, async (req, res) => {
    const client = await pool.connect();
    let began = false;
    try {
        const { tenantId } = e8RequireTenant(req);
        const admissionId = e8IntId(req.body.admission_id);
        if (!admissionId) { client.release(); return res.status(422).json({ error: 'admission_id is required' }); }

        await client.query('BEGIN'); began = true;

        const adm = (await client.query(
            'SELECT id, patient_id, bed_id, status FROM admissions WHERE id=$1 AND tenant_id=$2 FOR UPDATE',
            [admissionId, tenantId])).rows[0];
        if (!adm) { await client.query('ROLLBACK'); client.release(); return res.status(404).json({ error: 'Admission not found' }); }
        if (E8_ADMISSION_TERMINAL.includes(adm.status)) {
            await client.query('ROLLBACK'); client.release();
            return res.status(409).json({ error: `Admission already ${adm.status}` });
        }

        const b = req.body;
        await client.query(
            `UPDATE admissions SET status='Discharged', discharge_date=$1, discharge_type=$2, discharge_summary=$3,
                    discharge_instructions=$4, discharge_medications=$5, followup_date=$6, followup_doctor=$7
             WHERE id=$8 AND tenant_id=$9`,
            [new Date().toISOString(), b.discharge_type || 'Regular', b.discharge_summary || '',
             b.discharge_instructions || '', b.discharge_medications || '', b.followup_date || null,
             b.followup_doctor || '', admissionId, tenantId]);

        // Free the bed -> Cleaning (housekeeping turnover) per the bed lifecycle.
        if (adm.bed_id) {
            const bed = (await client.query(
                'SELECT id, status FROM beds WHERE id=$1 AND tenant_id=$2 FOR UPDATE',
                [adm.bed_id, tenantId])).rows[0];
            if (bed) {
                await client.query(
                    "UPDATE beds SET status='Cleaning', current_patient_id=0, current_admission_id=0 WHERE id=$1 AND tenant_id=$2",
                    [adm.bed_id, tenantId]);
            }
        }
        if (adm.patient_id) {
            await client.query("UPDATE patients SET status='Discharged' WHERE id=$1 AND tenant_id=$2", [adm.patient_id, tenantId]);
        }

        await client.query('COMMIT'); client.release();
        logAudit(req.session.user?.id, req.session.user?.display_name, 'ADT_DISCHARGE', 'Inpatient',
            `Discharged admission #${admissionId} (patient #${adm.patient_id}); freed bed #${adm.bed_id || '-'} -> Cleaning`, req.ip);
        res.json({ success: true, admission_id: admissionId, bed_id: adm.bed_id || null, bed_status: adm.bed_id ? 'Cleaning' : null });
    } catch (e) {
        if (began) { try { await client.query('ROLLBACK'); } catch (_) {} }
        client.release();
        if (e.e8Status) return res.status(e.e8Status).json({ error: e.message });
        res.status(500).json({ error: 'Server error' });
    }
});

// POST /api/adt/bed-status — explicit bed-status transition (housekeeping / blocking / reserve).
// body { bed_id, status }. Validated server-side against E8_BED_TRANSITIONS; an Occupied bed
// cannot be flipped to Available via this route (must go through discharge/transfer).
app.post('/api/adt/bed-status', requireAuth, requireRole('inpatient', 'nursing', 'doctor'), requireTenantScope, async (req, res) => {
    const client = await pool.connect();
    let began = false;
    try {
        const { tenantId } = e8RequireTenant(req);
        const bedId = e8IntId(req.body.bed_id);
        const status = req.body.status;
        if (!bedId) { client.release(); return res.status(422).json({ error: 'bed_id is required' }); }
        if (!E8_BED_STATUSES.includes(status)) { client.release(); return res.status(422).json({ error: 'Invalid bed status', allowed: E8_BED_STATUSES }); }

        await client.query('BEGIN'); began = true;
        const bed = (await client.query(
            'SELECT id, status, current_admission_id FROM beds WHERE id=$1 AND tenant_id=$2 FOR UPDATE',
            [bedId, tenantId])).rows[0];
        if (!bed) { await client.query('ROLLBACK'); client.release(); return res.status(404).json({ error: 'Bed not found' }); }
        // An Occupied bed can only be freed by discharge/transfer, never by a raw status flip.
        if (bed.status === 'Occupied') {
            await client.query('ROLLBACK'); client.release();
            return res.status(409).json({ error: 'Occupied bed must be freed via discharge or transfer' });
        }
        if (!e8CanTransitionBed(bed.status, status)) {
            await client.query('ROLLBACK'); client.release();
            return res.status(409).json({ error: `Invalid bed transition ${bed.status} -> ${status}` });
        }
        await client.query('UPDATE beds SET status=$1 WHERE id=$2 AND tenant_id=$3', [status, bedId, tenantId]);
        await client.query('COMMIT'); client.release();
        logAudit(req.session.user?.id, req.session.user?.display_name, 'ADT_BED_STATUS', 'Inpatient',
            `Bed #${bedId} status ${bed.status} -> ${status}`, req.ip);
        res.json({ success: true, bed_id: bedId, status });
    } catch (e) {
        if (began) { try { await client.query('ROLLBACK'); } catch (_) {} }
        client.release();
        if (e.e8Status) return res.status(e.e8Status).json({ error: e.message });
        res.status(500).json({ error: 'Server error' });
    }
});

// ============================================================
// ===== E9 ICU / CRITICAL CARE (hardened) =====
// All routes: requireAuth + requireRole('icu','nursing','doctor') + requireTenantScope.
// Fail-closed tenant resolver (e9RequireTenant) — null tenant => 403 (NO unscoped fallback).
// Integer id coercion (e9IntId) — no string/padded-id bypass (E6 lesson).
// Writes only attach to an Active, tenant-owned admission whose bed is in an ICU/NICU/CCU ward.
// Acuity scores (SOFA/GCS/APACHE-II) are computed SERVER-SIDE via icu_scoring.js — any
// client-supplied score/band is ADVISORY ONLY and is IGNORED (anti-spoof, E6/E7 lesson).
// ICU wards classified by ward_type IN ('ICU','NICU','CCU').
// ============================================================
const E9_ICU_WARD_TYPES = ['ICU', 'NICU', 'CCU'];

// Fail-closed tenant resolver (mirrors e8RequireTenant — no unscoped fallback).
function e9RequireTenant(req) {
    const { tenantId, facilityId } = getRequestTenantContext(req);
    if (!tenantId) { const err = new Error('Tenant scope required'); err.e9Status = 403; throw err; }
    return { tenantId, facilityId };
}

// Coerce an id to a positive integer (no string/padded-id coercion bypass — E6 lesson).
function e9IntId(v) {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    if (!Number.isInteger(n) || n <= 0) return null;
    return n;
}

// Validate that admissionId belongs to this tenant, is Active, and sits in an ICU-typed ward.
// Returns the admission row (with patient_id) or throws an e9Status error.
//   - non-positive id  => 422
//   - not found / cross-tenant => 404 (no leak)
//   - not Active (e.g. Discharged) => 409
//   - not in an ICU/NICU/CCU ward => 409
async function e9LoadActiveIcuAdmission(admissionId, tenantId) {
    const aid = e9IntId(admissionId);
    if (!aid) { const e = new Error('Valid admission_id is required'); e.e9Status = 422; throw e; }
    const row = (await pool.query(
        `SELECT a.id, a.patient_id, a.status, w.ward_type
         FROM admissions a
         LEFT JOIN beds b ON a.bed_id = b.id AND b.tenant_id = $2
         LEFT JOIN wards w ON COALESCE(b.ward_id, a.ward_id) = w.id AND w.tenant_id = $2
         WHERE a.id = $1 AND a.tenant_id = $2`,
        [aid, tenantId])).rows[0];
    if (!row) { const e = new Error('Admission not found'); e.e9Status = 404; throw e; }
    if (row.status !== 'Active') { const e = new Error(`Cannot record ICU data on a ${row.status} admission`); e.e9Status = 409; throw e; }
    if (!E9_ICU_WARD_TYPES.includes(row.ward_type)) {
        const e = new Error('Admission is not in an ICU/NICU/CCU ward'); e.e9Status = 409; throw e;
    }
    return row;
}

// GET /api/icu/patients — Active admissions in ICU-typed wards (tenant-scoped, fail-closed).
app.get('/api/icu/patients', requireAuth, requireRole('icu', 'nursing', 'doctor'), requireTenantScope, async (req, res) => {
    try {
        const { tenantId } = e9RequireTenant(req);
        const rows = (await pool.query(
            `SELECT a.*, b.bed_number, w.ward_name, w.ward_name_ar, w.ward_type
             FROM admissions a
             LEFT JOIN beds b ON a.bed_id = b.id AND b.tenant_id = $1
             JOIN wards w ON COALESCE(b.ward_id, a.ward_id) = w.id AND w.tenant_id = $1
             WHERE a.status='Active' AND a.tenant_id = $1 AND w.ward_type IN ('ICU','NICU','CCU')
             ORDER BY a.admission_date DESC`, [tenantId])).rows;
        res.json(rows);
    } catch (e) {
        if (e.e9Status) return res.status(e.e9Status).json({ error: e.message });
        res.status(500).json({ error: 'Server error' });
    }
});

// ----- ICU flowsheet (time-stamped vitals/hemodynamics/I-O) — backed by icu_monitoring -----
// POST /api/icu/flowsheet  (canonical blueprint name). Legacy alias: POST /api/icu/monitoring.
async function e9PostFlowsheet(req, res) {
    try {
        const { tenantId, facilityId } = e9RequireTenant(req);
        const adm = await e9LoadActiveIcuAdmission(req.body.admission_id, tenantId);
        const b = req.body;
        const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
        const r = await pool.query(
            `INSERT INTO icu_monitoring (admission_id,patient_id,hr,sbp,dbp,map,rr,spo2,temp,etco2,cvp,fio2,peep,urine_output,notes,recorded_by,tenant_id,facility_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`,
            [adm.id, adm.patient_id, num(b.hr), num(b.sbp), num(b.dbp), num(b.map), num(b.rr), num(b.spo2), num(b.temp), num(b.etco2), num(b.cvp), num(b.fio2), num(b.peep), num(b.urine_output), String(b.notes || ''), String(b.recorded_by || req.session.user?.display_name || ''), tenantId, facilityId || null]);
        logAudit(req.session.user?.id, req.session.user?.display_name, 'ICU_FLOWSHEET', 'ICU',
            `Flowsheet row for admission #${adm.id} (patient #${adm.patient_id})`, req.ip);
        res.json(r.rows[0]);
    } catch (e) {
        if (e.e9Status) return res.status(e.e9Status).json({ error: e.message });
        res.status(500).json({ error: 'Server error' });
    }
}
app.post('/api/icu/flowsheet', requireAuth, requireRole('icu', 'nursing', 'doctor'), requireTenantScope, e9PostFlowsheet);
app.post('/api/icu/monitoring', requireAuth, requireRole('icu', 'nursing', 'doctor'), requireTenantScope, e9PostFlowsheet);

async function e9GetFlowsheet(req, res) {
    try {
        const { tenantId } = e9RequireTenant(req);
        const admissionId = e9IntId(req.query.admission_id != null ? req.query.admission_id : req.params.admissionId);
        if (!admissionId) return res.status(422).json({ error: 'Valid admission_id is required' });
        const own = (await pool.query('SELECT id FROM admissions WHERE id=$1 AND tenant_id=$2', [admissionId, tenantId])).rows[0];
        if (!own) return res.status(404).json({ error: 'Admission not found' });
        const rows = (await pool.query(
            'SELECT * FROM icu_monitoring WHERE admission_id=$1 AND tenant_id=$2 ORDER BY monitor_time DESC LIMIT 50',
            [admissionId, tenantId])).rows;
        res.json(rows);
    } catch (e) {
        if (e.e9Status) return res.status(e.e9Status).json({ error: e.message });
        res.status(500).json({ error: 'Server error' });
    }
}
app.get('/api/icu/flowsheet', requireAuth, requireRole('icu', 'nursing', 'doctor'), requireTenantScope, e9GetFlowsheet);
app.get('/api/icu/monitoring/:admissionId', requireAuth, requireRole('icu', 'nursing', 'doctor'), requireTenantScope, e9GetFlowsheet);

// ----- Ventilator records (settings + measured) — icu_ventilator -----
app.post('/api/icu/ventilator', requireAuth, requireRole('icu', 'nursing', 'doctor'), requireTenantScope, async (req, res) => {
    try {
        const { tenantId, facilityId } = e9RequireTenant(req);
        const adm = await e9LoadActiveIcuAdmission(req.body.admission_id, tenantId);
        const b = req.body;
        const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
        const r = await pool.query(
            `INSERT INTO icu_ventilator (admission_id,patient_id,vent_mode,fio2,tidal_volume,respiratory_rate,peep,pip,ie_ratio,ps,ett_size,ett_position,cuff_pressure,notes,recorded_by,tenant_id,facility_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`,
            [adm.id, adm.patient_id, String(b.vent_mode || ''), num(b.fio2) || 21, num(b.tidal_volume), num(b.respiratory_rate), num(b.peep), num(b.pip), String(b.ie_ratio || '1:2'), num(b.ps), String(b.ett_size || ''), String(b.ett_position || ''), num(b.cuff_pressure), String(b.notes || ''), String(b.recorded_by || req.session.user?.display_name || ''), tenantId, facilityId || null]);
        logAudit(req.session.user?.id, req.session.user?.display_name, 'ICU_VENTILATOR', 'ICU',
            `Ventilator record for admission #${adm.id} (mode ${b.vent_mode || '-'})`, req.ip);
        res.json(r.rows[0]);
    } catch (e) {
        if (e.e9Status) return res.status(e.e9Status).json({ error: e.message });
        res.status(500).json({ error: 'Server error' });
    }
});
app.get('/api/icu/ventilator/:admissionId', requireAuth, requireRole('icu', 'nursing', 'doctor'), requireTenantScope, async (req, res) => {
    try {
        const { tenantId } = e9RequireTenant(req);
        const admissionId = e9IntId(req.params.admissionId);
        if (!admissionId) return res.status(422).json({ error: 'Valid admission_id is required' });
        const own = (await pool.query('SELECT id FROM admissions WHERE id=$1 AND tenant_id=$2', [admissionId, tenantId])).rows[0];
        if (!own) return res.status(404).json({ error: 'Admission not found' });
        const rows = (await pool.query(
            'SELECT * FROM icu_ventilator WHERE admission_id=$1 AND tenant_id=$2 ORDER BY created_at DESC LIMIT 20',
            [admissionId, tenantId])).rows;
        res.json(rows);
    } catch (e) {
        if (e.e9Status) return res.status(e.e9Status).json({ error: e.message });
        res.status(500).json({ error: 'Server error' });
    }
});

// ----- Infusions / drips (continuous IV meds) — NEW table icu_infusions -----
// Bonus safety: if a drug name is supplied, run a server-derived allergy check (cds.checkDrugAllergy)
// against the patient's active allergy list — fail-safe (records a warning, does NOT silently block).
app.post('/api/icu/infusion', requireAuth, requireRole('icu', 'nursing', 'doctor'), requireTenantScope, async (req, res) => {
    try {
        const { tenantId, facilityId } = e9RequireTenant(req);
        const adm = await e9LoadActiveIcuAdmission(req.body.admission_id, tenantId);
        const b = req.body;
        const drug = String(b.drug || b.medication || '').trim();
        if (!drug) return res.status(422).json({ error: 'drug is required' });
        const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

        // Bonus: server-derived allergy safety check (advisory; never client-trusted).
        let allergyWarning = null;
        try {
            const allergyRows = (await pool.query(
                'SELECT allergies FROM patients WHERE id=$1 AND tenant_id=$2', [adm.patient_id, tenantId])).rows[0];
            if (allergyRows && allergyRows.allergies) {
                const alerts = cds.checkDrugAllergy({ name: drug }, allergyRows.allergies);
                if (Array.isArray(alerts) && alerts.length) {
                    allergyWarning = alerts.map(a => a.message || a.reason || String(a)).join('; ');
                }
            }
        } catch (_) { /* fail-safe: allergy lookup failure must not block infusion record */ }

        const r = await pool.query(
            `INSERT INTO icu_infusions (admission_id,patient_id,drug,concentration,rate,rate_unit,dose,dose_unit,route,status,allergy_warning,notes,recorded_by,tenant_id,facility_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
            [adm.id, adm.patient_id, drug, String(b.concentration || ''), num(b.rate), String(b.rate_unit || 'mL/hr'), num(b.dose), String(b.dose_unit || ''), String(b.route || 'IV'), String(b.status || 'Running'), allergyWarning, String(b.notes || ''), String(b.recorded_by || req.session.user?.display_name || ''), tenantId, facilityId || null]);
        logAudit(req.session.user?.id, req.session.user?.display_name, 'ICU_INFUSION', 'ICU',
            `Infusion ${drug} for admission #${adm.id}${allergyWarning ? ' [ALLERGY WARNING: ' + allergyWarning + ']' : ''}`, req.ip);
        res.json({ ...r.rows[0], allergy_warning: allergyWarning });
    } catch (e) {
        if (e.e9Status) return res.status(e.e9Status).json({ error: e.message });
        res.status(500).json({ error: 'Server error' });
    }
});
app.get('/api/icu/infusion/:admissionId', requireAuth, requireRole('icu', 'nursing', 'doctor'), requireTenantScope, async (req, res) => {
    try {
        const { tenantId } = e9RequireTenant(req);
        const admissionId = e9IntId(req.params.admissionId);
        if (!admissionId) return res.status(422).json({ error: 'Valid admission_id is required' });
        const own = (await pool.query('SELECT id FROM admissions WHERE id=$1 AND tenant_id=$2', [admissionId, tenantId])).rows[0];
        if (!own) return res.status(404).json({ error: 'Admission not found' });
        const rows = (await pool.query(
            'SELECT * FROM icu_infusions WHERE admission_id=$1 AND tenant_id=$2 ORDER BY created_at DESC LIMIT 50',
            [admissionId, tenantId])).rows;
        res.json(rows);
    } catch (e) {
        if (e.e9Status) return res.status(e.e9Status).json({ error: e.message });
        res.status(500).json({ error: 'Server error' });
    }
});

// ----- ICU acuity scores (SERVER-SIDE SOFA / GCS / APACHE-II) — icu_scores -----
// POST /api/icu/score (canonical) + legacy alias POST /api/icu/scores. Accepts RAW observations;
// the score/band are computed by icu_scoring.js — any client apache_ii/sofa/gcs is IGNORED.
async function e9PostScore(req, res) {
    try {
        const { tenantId, facilityId } = e9RequireTenant(req);
        const adm = await e9LoadActiveIcuAdmission(req.body.admission_id, tenantId);
        const b = req.body;

        // Server-authoritative scoring from raw observations (anti-spoof).
        const result = icuScoring.computeICUScores({
            vitals: b.vitals || {},
            gcs_eye: b.gcs_eye, gcs_verbal: b.gcs_verbal, gcs_motor: b.gcs_motor, gcs_total: b.gcs_total,
            pao2_fio2: b.pao2_fio2, pao2: b.pao2, fio2: b.fio2, ventilated: b.ventilated,
            platelets: b.platelets, bilirubin: b.bilirubin, creatinine: b.creatinine,
            urine_output_24h: b.urine_output_24h, urine_24h: b.urine_24h,
            map: b.map != null ? b.map : (b.vitals && b.vitals.map),
            dopamine: b.dopamine, dobutamine: b.dobutamine, epinephrine: b.epinephrine, norepinephrine: b.norepinephrine,
            temp: b.temp != null ? b.temp : (b.vitals && b.vitals.temp),
            hr: b.hr != null ? b.hr : (b.vitals && b.vitals.hr),
            rr: b.rr != null ? b.rr : (b.vitals && b.vitals.rr),
            spo2: b.spo2 != null ? b.spo2 : (b.vitals && b.vitals.spo2),
            age: b.age, chronic_health: b.chronic_health, immunocompromised: b.immunocompromised
        });

        // RASS / CAM-ICU / pain are observed nursing assessments (not derangement-derived) — accept
        // but clamp to safe ranges; Braden/Morse retained for backward compat (nursing scores).
        const clampInt = (v, lo, hi, dflt) => { const n = parseInt(v); return Number.isInteger(n) ? Math.max(lo, Math.min(hi, n)) : dflt; };
        const rass = clampInt(b.rass, -5, 4, 0);
        const cam = clampInt(b.cam_icu, 0, 1, 0);
        const braden = clampInt(b.braden, 6, 23, 23);
        const morse = clampInt(b.morse_fall, 0, 125, 0);
        const pain = clampInt(b.pain_score, 0, 10, 0);

        const r = await pool.query(
            `INSERT INTO icu_scores (admission_id,patient_id,score_date,apache_ii,sofa,gcs,rass,cam_icu,braden,morse_fall,pain_score,calculated_by,tenant_id,facility_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
            [adm.id, adm.patient_id, new Date().toISOString().split('T')[0],
             result.apache, result.sofa, (result.gcs ?? null), rass, cam, braden, morse, pain,
             String(b.calculated_by || req.session.user?.display_name || ''), tenantId, facilityId || null]);
        logAudit(req.session.user?.id, req.session.user?.display_name, 'ICU_SCORE', 'ICU',
            `Acuity scored admission #${adm.id}: SOFA ${result.sofa} (${result.sofa_band}), GCS ${result.gcs}, APACHE ${result.apache} (${result.apache_band})`, req.ip);
        res.json({
            ...r.rows[0],
            sofa: result.sofa, sofa_band: result.sofa_band, sofa_mortality_risk: result.sofa_mortality_risk,
            gcs: result.gcs, gcs_band: result.gcs_band,
            apache: result.apache, apache_band: result.apache_band, apache_mortality_risk: result.apache_mortality_risk,
            complete: result.complete, components: result.components, missing: result.missing
        });
    } catch (e) {
        if (e.e9Status) return res.status(e.e9Status).json({ error: e.message });
        res.status(500).json({ error: 'Server error' });
    }
}
app.post('/api/icu/score', requireAuth, requireRole('icu', 'nursing', 'doctor'), requireTenantScope, e9PostScore);
app.post('/api/icu/scores', requireAuth, requireRole('icu', 'nursing', 'doctor'), requireTenantScope, e9PostScore);

app.get('/api/icu/scores/:admissionId', requireAuth, requireRole('icu', 'nursing', 'doctor'), requireTenantScope, async (req, res) => {
    try {
        const { tenantId } = e9RequireTenant(req);
        const admissionId = e9IntId(req.params.admissionId);
        if (!admissionId) return res.status(422).json({ error: 'Valid admission_id is required' });
        const own = (await pool.query('SELECT id FROM admissions WHERE id=$1 AND tenant_id=$2', [admissionId, tenantId])).rows[0];
        if (!own) return res.status(404).json({ error: 'Admission not found' });
        const rows = (await pool.query(
            'SELECT * FROM icu_scores WHERE admission_id=$1 AND tenant_id=$2 ORDER BY created_at DESC',
            [admissionId, tenantId])).rows;
        res.json(rows);
    } catch (e) {
        if (e.e9Status) return res.status(e.e9Status).json({ error: e.message });
        res.status(500).json({ error: 'Server error' });
    }
});

// ----- Fluid balance (intake/output) — icu_fluid_balance (server computes totals) -----
app.post('/api/icu/fluid-balance', requireAuth, requireRole('icu', 'nursing', 'doctor'), requireTenantScope, async (req, res) => {
    try {
        const { tenantId, facilityId } = e9RequireTenant(req);
        const adm = await e9LoadActiveIcuAdmission(req.body.admission_id, tenantId);
        const b = req.body;
        const ti = (parseInt(b.iv_fluids) || 0) + (parseInt(b.oral_intake) || 0) + (parseInt(b.blood_products) || 0) + (parseInt(b.medications_iv) || 0);
        const to = (parseInt(b.urine) || 0) + (parseInt(b.drains) || 0) + (parseInt(b.ngt_output) || 0) + (parseInt(b.stool) || 0) + (parseInt(b.vomit) || 0) + (parseInt(b.insensible) || 0);
        const r = await pool.query(
            `INSERT INTO icu_fluid_balance (admission_id,patient_id,balance_date,shift,iv_fluids,oral_intake,blood_products,medications_iv,total_intake,urine,drains,ngt_output,stool,vomit,insensible,total_output,net_balance,recorded_by,tenant_id,facility_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING *`,
            [adm.id, adm.patient_id, new Date().toISOString().split('T')[0], String(b.shift || 'Day'), parseInt(b.iv_fluids) || 0, parseInt(b.oral_intake) || 0, parseInt(b.blood_products) || 0, parseInt(b.medications_iv) || 0, ti, parseInt(b.urine) || 0, parseInt(b.drains) || 0, parseInt(b.ngt_output) || 0, parseInt(b.stool) || 0, parseInt(b.vomit) || 0, parseInt(b.insensible) || 0, to, ti - to, String(b.recorded_by || req.session.user?.display_name || ''), tenantId, facilityId || null]);
        logAudit(req.session.user?.id, req.session.user?.display_name, 'ICU_FLUID_BALANCE', 'ICU',
            `Fluid balance admission #${adm.id}: in ${ti} out ${to} net ${ti - to}`, req.ip);
        res.json(r.rows[0]);
    } catch (e) {
        if (e.e9Status) return res.status(e.e9Status).json({ error: e.message });
        res.status(500).json({ error: 'Server error' });
    }
});
app.get('/api/icu/fluid-balance/:admissionId', requireAuth, requireRole('icu', 'nursing', 'doctor'), requireTenantScope, async (req, res) => {
    try {
        const { tenantId } = e9RequireTenant(req);
        const admissionId = e9IntId(req.params.admissionId);
        if (!admissionId) return res.status(422).json({ error: 'Valid admission_id is required' });
        const own = (await pool.query('SELECT id FROM admissions WHERE id=$1 AND tenant_id=$2', [admissionId, tenantId])).rows[0];
        if (!own) return res.status(404).json({ error: 'Admission not found' });
        const rows = (await pool.query(
            'SELECT * FROM icu_fluid_balance WHERE admission_id=$1 AND tenant_id=$2 ORDER BY created_at DESC',
            [admissionId, tenantId])).rows;
        res.json(rows);
    } catch (e) {
        if (e.e9Status) return res.status(e.e9Status).json({ error: e.message });
        res.status(500).json({ error: 'Server error' });
    }
});

// ----- ICU board — ICU-bed patients + latest SOFA/GCS + vent status, sorted by acuity -----
app.get('/api/icu/board', requireAuth, requireRole('icu', 'nursing', 'doctor'), requireTenantScope, async (req, res) => {
    try {
        const { tenantId } = e9RequireTenant(req);
        const patients = (await pool.query(
            `SELECT a.id AS admission_id, a.patient_id, a.patient_name, a.diagnosis, a.attending_doctor, a.admission_date,
                    b.bed_number, w.ward_name, w.ward_name_ar, w.ward_type
             FROM admissions a
             LEFT JOIN beds b ON a.bed_id = b.id AND b.tenant_id = $1
             JOIN wards w ON COALESCE(b.ward_id, a.ward_id) = w.id AND w.tenant_id = $1
             WHERE a.status='Active' AND a.tenant_id = $1 AND w.ward_type IN ('ICU','NICU','CCU')`,
            [tenantId])).rows;

        const board = [];
        for (const p of patients) {
            const score = (await pool.query(
                'SELECT sofa, gcs, apache_ii, score_date FROM icu_scores WHERE admission_id=$1 AND tenant_id=$2 ORDER BY created_at DESC LIMIT 1',
                [p.admission_id, tenantId])).rows[0] || null;
            const vent = (await pool.query(
                'SELECT vent_mode, fio2, peep FROM icu_ventilator WHERE admission_id=$1 AND tenant_id=$2 ORDER BY created_at DESC LIMIT 1',
                [p.admission_id, tenantId])).rows[0] || null;
            const sofa = score ? Number(score.sofa) || 0 : null;
            const apache = score ? Number(score.apache_ii) || 0 : null;
            const gcs = (score && score.gcs != null) ? Number(score.gcs) : null; // NULL gcs (unmeasured) stays null — Number(null)=0 would wrongly add (15-0)=15
            // Acuity sort key: highest SOFA first, then APACHE, then lowest GCS. No score => treat as
            // unknown (sorted after scored patients, NOT as low acuity).
            const acuity = (sofa !== null ? sofa : -1) * 1000 + (apache !== null ? apache : 0) + (gcs !== null ? (15 - gcs) : 0);
            board.push({
                admission_id: p.admission_id, patient_id: p.patient_id, patient_name: p.patient_name,
                diagnosis: p.diagnosis, attending_doctor: p.attending_doctor, admission_date: p.admission_date,
                bed_number: p.bed_number, ward_name: p.ward_name, ward_name_ar: p.ward_name_ar, ward_type: p.ward_type,
                latest_sofa: sofa, latest_apache: apache, latest_gcs: gcs,
                sofa_band: sofa === null ? null : icuScoring.sofaBand(sofa).band,
                on_ventilator: !!vent, vent_mode: vent ? vent.vent_mode : null,
                acuity
            });
        }
        // Sort descending by acuity (sickest first).
        board.sort((x, y) => y.acuity - x.acuity);
        res.json({ board, count: board.length });
    } catch (e) {
        if (e.e9Status) return res.status(e.e9Status).json({ error: e.message });
        res.status(500).json({ error: 'Server error' });
    }
});

// ===== CSSD =====
app.get('/api/cssd/instruments', requireAuth, requireRole('cssd', 'nursing', 'surgery'), requireTenantScope, async (req, res) => {
    try {
        const t = e16RequireTenant(req);
        if (!t.ok) return res.status(403).json({ error: 'Tenant scope required' });
        res.json((await pool.query('SELECT * FROM cssd_instrument_sets WHERE tenant_id=$1 ORDER BY id', [t.tenantId])).rows);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.post('/api/cssd/instruments', requireAuth, requireRole('cssd', 'nursing', 'surgery'), requireTenantScope, async (req, res) => {
    try {
        const t = e16RequireTenant(req);
        if (!t.ok) return res.status(403).json({ error: 'Tenant scope required' });
        const { set_name, set_name_ar, set_code, category, instrument_count, instruments_list, department } = req.body;
        const r = await pool.query('INSERT INTO cssd_instrument_sets (set_name,set_name_ar,set_code,category,instrument_count,instruments_list,department,tenant_id,facility_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',
            [set_name, set_name_ar, set_code, category, instrument_count || 0, instruments_list, department, t.tenantId, t.facilityId || null]);
        logAudit(req.session.user?.id, req.session.user?.display_name, 'CREATE_CSSD_INSTRUMENT_SET', 'CSSD', `Created set ${set_name}`, req.ip);
        res.json(r.rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.get('/api/cssd/cycles', requireAuth, requireRole('cssd', 'nursing', 'surgery'), requireTenantScope, async (req, res) => {
    try {
        const t = e16RequireTenant(req);
        if (!t.ok) return res.status(403).json({ error: 'Tenant scope required' });
        res.json((await pool.query('SELECT * FROM cssd_sterilization_cycles WHERE tenant_id=$1 ORDER BY start_time DESC', [t.tenantId])).rows);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.post('/api/cssd/cycles', requireAuth, requireRole('cssd', 'nursing', 'surgery'), requireTenantScope, async (req, res) => {
    try {
        const t = e16RequireTenant(req);
        if (!t.ok) return res.status(403).json({ error: 'Tenant scope required' });
        const { cycle_number, machine_name, cycle_type, temperature, pressure, duration_minutes, operator } = req.body;
        // BI result starts Pending and is recorded ONLY via PUT /api/cssd/cycles/:id/bi-result (anti-spoof).
        const r = await pool.query('INSERT INTO cssd_sterilization_cycles (cycle_number,machine_name,cycle_type,temperature,pressure,duration_minutes,operator,status,bi_test_result,tenant_id,facility_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *',
            [cycle_number, machine_name, cycle_type || 'Steam Autoclave', temperature, pressure, duration_minutes, operator, 'running', 'Pending', t.tenantId, t.facilityId || null]);
        logAudit(req.session.user?.id, req.session.user?.display_name, 'CREATE_CSSD_CYCLE', 'CSSD', `Started cycle ${cycle_number}`, req.ip);
        res.json(r.rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.put('/api/cssd/cycles/:id', requireAuth, requireRole('cssd', 'nursing', 'surgery'), requireTenantScope, async (req, res) => {
    // HARDENED (E16): server-side cycle state machine + tenant scope. BI/CI results are NOT
    // accepted here (anti-spoof) — use PUT /api/cssd/cycles/:id/bi-result. Release for sterile
    // issue is the separate fail-CLOSED gate PUT /api/cssd/cycles/:id/release.
    try {
        const t = e16RequireTenant(req);
        if (!t.ok) return res.status(403).json({ error: 'Tenant scope required' });
        const cycleId = e16.e16IntId(req.params.id);
        if (cycleId === null) return res.status(404).json({ error: 'Cycle not found' });
        const target = String(req.body.status || '').toLowerCase();
        if (!target) return res.status(422).json({ error: 'status required' });
        const client = await e16BeginTenantTx(t.tenantId);
        try {
            const cyc = (await client.query('SELECT id, status FROM cssd_sterilization_cycles WHERE id=$1 AND tenant_id=$2 FOR UPDATE', [cycleId, t.tenantId])).rows[0];
            if (!cyc) { await client.query('ROLLBACK'); client.release(); return res.status(404).json({ error: 'Cycle not found' }); }
            if (!e16.canTransitionCycle(String(cyc.status || '').toLowerCase(), target)) {
                await client.query('ROLLBACK'); client.release();
                return res.status(409).json({ error: `Invalid cycle transition ${cyc.status} -> ${target}` });
            }
            const endStamp = (target === 'completed') ? new Date().toISOString() : null;
            const r = (await client.query('UPDATE cssd_sterilization_cycles SET status=$1, end_time=COALESCE($2,end_time) WHERE id=$3 AND tenant_id=$4 RETURNING *', [target, endStamp, cycleId, t.tenantId])).rows[0];
            await client.query('COMMIT'); client.release();
            logAudit(req.session.user?.id, req.session.user?.display_name, 'UPDATE_CSSD_CYCLE_STATUS', 'CSSD', `Cycle #${cycleId}: ${cyc.status} -> ${target}`, req.ip);
            res.json(r);
        } catch (e) { try { await client.query('ROLLBACK'); } catch (_) {} client.release(); throw e; }
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.post('/api/cssd/load-items', requireAuth, requireRole('cssd', 'nursing', 'surgery'), requireTenantScope, async (req, res) => {
    try {
        const t = e16RequireTenant(req);
        if (!t.ok) return res.status(403).json({ error: 'Tenant scope required' });
        const cycleId = e16.e16IntId(req.body.cycle_id);
        const setId = e16.e16IntId(req.body.set_id);
        const { set_name, barcode } = req.body;
        const r = await pool.query('INSERT INTO cssd_load_items (cycle_id,set_id,set_name,barcode,tenant_id,facility_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *', [cycleId, setId, set_name, barcode, t.tenantId, t.facilityId || null]);
        if (setId) await pool.query("UPDATE cssd_instrument_sets SET status='In Sterilization' WHERE id=$1 AND tenant_id=$2", [setId, t.tenantId]);
        res.json(r.rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.get('/api/cssd/load-items/:cycleId', requireAuth, requireRole('cssd', 'nursing', 'surgery'), requireTenantScope, async (req, res) => {
    try {
        const t = e16RequireTenant(req);
        if (!t.ok) return res.status(403).json({ error: 'Tenant scope required' });
        const cycleId = e16.e16IntId(req.params.cycleId);
        res.json((await pool.query('SELECT * FROM cssd_load_items WHERE cycle_id=$1 AND tenant_id=$2', [cycleId, t.tenantId])).rows);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
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

// ===== INFECTION CONTROL (E17 HARDENED: tenant-scoped + RBAC) =====
app.get('/api/infection/surveillance', requireAuth, requireRole('infection'), requireTenantScope, async (req, res) => {
    try {
        const tenantId = e17RequireTenant(req);
        res.json((await pool.query('SELECT * FROM infection_surveillance WHERE tenant_id=$1 ORDER BY id DESC', [tenantId])).rows);
    } catch (e) { res.status(e.statusCode || 500).json({ error: e.statusCode ? e.message : 'Server error' }); }
});
app.post('/api/infection/surveillance', requireAuth, requireRole('infection'), requireTenantScope, async (req, res) => {
    try {
        const tenantId = e17RequireTenant(req);
        const { patient_id, patient_name, infection_type, infection_site, organism, sensitivity, hai_category, device_related, device_type, ward, bed, isolation_type, notes } = req.body;
        let pid = parseInt(patient_id, 10);
        if (!Number.isInteger(pid) || pid <= 0) pid = 0;
        if (pid > 0) {
            const chk = (await pool.query('SELECT id FROM patients WHERE id=$1 AND tenant_id=$2', [pid, tenantId])).rows[0];
            if (!chk) return res.status(403).json({ error: 'Invalid patient context or access denied' });
        }
        const r = await pool.query('INSERT INTO infection_surveillance (patient_id,patient_name,infection_type,infection_site,organism,sensitivity,detection_date,hai_category,device_related,device_type,ward,bed,isolation_type,reported_by,notes,tenant_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *',
            [pid, patient_name || '', infection_type || '', infection_site || '', organism || '', sensitivity || '', new Date().toISOString().split('T')[0], hai_category || '', device_related ? 1 : 0, device_type || '', ward || '', bed || '', isolation_type || '', req.session.user?.display_name || '', notes || '', tenantId]);
        logAudit(req.session.user?.id, req.session.user?.display_name || '', 'CREATE_HAI', 'Infection', `Surveillance ${infection_type || ''} hai=${hai_category || ''}`, req.ip);
        res.json(r.rows[0]);
    } catch (e) { res.status(e.statusCode || 500).json({ error: e.statusCode ? e.message : 'Server error' }); }
});
// C2 FIX: outbreaks/exposures/hand-hygiene hardened — requireRole('infection') + requireTenantScope + fail-closed e17RequireTenant + tenant_id in every query + reported_by from session (L1).
app.get('/api/infection/outbreaks', requireAuth, requireRole('infection'), requireTenantScope, async (req, res) => {
    try {
        const tenantId = e17RequireTenant(req);
        res.json((await pool.query('SELECT * FROM infection_outbreaks WHERE tenant_id=$1 ORDER BY id DESC', [tenantId])).rows);
    } catch (e) { res.status(e.statusCode || 500).json({ error: e.statusCode ? e.message : 'Server error' }); }
});
app.post('/api/infection/outbreaks', requireAuth, requireRole('infection'), requireTenantScope, async (req, res) => {
    try {
        const tenantId = e17RequireTenant(req);
        // L1 FIX: reported_by stamped from session, not trusted from request body.
        const reportedBy = req.session.user?.display_name || req.session.user?.name || '';
        const { outbreak_name, organism, affected_ward, investigation_notes, control_measures } = req.body;
        const r = await pool.query('INSERT INTO infection_outbreaks (outbreak_name,organism,start_date,affected_ward,investigation_notes,control_measures,reported_by,tenant_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
            [outbreak_name || '', organism || '', new Date().toISOString().split('T')[0], affected_ward || '', investigation_notes || '', control_measures || '', reportedBy, tenantId]);
        res.json(r.rows[0]);
    } catch (e) { res.status(e.statusCode || 500).json({ error: e.statusCode ? e.message : 'Server error' }); }
});
app.put('/api/infection/outbreaks/:id', requireAuth, requireRole('infection'), requireTenantScope, async (req, res) => {
    try {
        const tenantId = e17RequireTenant(req);
        const { status, total_cases, control_measures } = req.body;
        const sets = []; const vals = []; let i = 1;
        if (status) { sets.push(`status=$${i++}`); vals.push(status); if (status === 'Resolved') { sets.push(`end_date=$${i++}`); vals.push(new Date().toISOString().split('T')[0]); } }
        if (total_cases !== undefined) { sets.push(`total_cases=$${i++}`); vals.push(total_cases); }
        if (control_measures) { sets.push(`control_measures=$${i++}`); vals.push(control_measures); }
        if (!sets.length) return res.json({ success: true });
        vals.push(req.params.id); vals.push(tenantId);
        await pool.query(`UPDATE infection_outbreaks SET ${sets.join(',')} WHERE id=$${i++} AND tenant_id=$${i}`, vals);
        res.json({ success: true });
    } catch (e) { res.status(e.statusCode || 500).json({ error: e.statusCode ? e.message : 'Server error' }); }
});
app.post('/api/infection/exposures', requireAuth, requireRole('infection'), requireTenantScope, async (req, res) => {
    try {
        const tenantId = e17RequireTenant(req);
        // L1 FIX: reported_by stamped from session, not trusted from request body.
        const reportedBy = req.session.user?.display_name || req.session.user?.name || '';
        const { employee_id, employee_name, exposure_type, source_patient, body_fluid, ppe_worn, action_taken, followup_date } = req.body;
        const r = await pool.query('INSERT INTO employee_exposures (employee_id,employee_name,exposure_type,exposure_date,source_patient,body_fluid,ppe_worn,action_taken,followup_date,reported_by,tenant_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *',
            [employee_id || '', employee_name || '', exposure_type || '', new Date().toISOString().split('T')[0], source_patient || '', body_fluid || '', ppe_worn || '', action_taken || '', followup_date || null, reportedBy, tenantId]);
        res.json(r.rows[0]);
    } catch (e) { res.status(e.statusCode || 500).json({ error: e.statusCode ? e.message : 'Server error' }); }
});
app.get('/api/infection/exposures', requireAuth, requireRole('infection'), requireTenantScope, async (req, res) => {
    try {
        const tenantId = e17RequireTenant(req);
        res.json((await pool.query('SELECT * FROM employee_exposures WHERE tenant_id=$1 ORDER BY id DESC', [tenantId])).rows);
    } catch (e) { res.status(e.statusCode || 500).json({ error: e.statusCode ? e.message : 'Server error' }); }
});
app.post('/api/infection/hand-hygiene', requireAuth, requireRole('infection'), requireTenantScope, async (req, res) => {
    try {
        const tenantId = e17RequireTenant(req);
        // auditor stamped from session (L1 fix for consistency).
        const auditor = req.session.user?.display_name || req.session.user?.name || req.body.auditor || '';
        const { department, moments_observed, moments_compliant, notes } = req.body;
        const obs = parseInt(moments_observed, 10) || 0;
        const comp = parseInt(moments_compliant, 10) || 0;
        const rate = obs > 0 ? parseFloat((comp / obs * 100).toFixed(1)) : 0;
        const r = await pool.query('INSERT INTO hand_hygiene_audits (audit_date,auditor,department,moments_observed,moments_compliant,compliance_rate,notes,tenant_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
            [new Date().toISOString().split('T')[0], auditor, department || '', obs, comp, rate, notes || '', tenantId]);
        res.json(r.rows[0]);
    } catch (e) { res.status(e.statusCode || 500).json({ error: e.statusCode ? e.message : 'Server error' }); }
});
app.get('/api/infection/hand-hygiene', requireAuth, requireRole('infection'), requireTenantScope, async (req, res) => {
    try {
        const tenantId = e17RequireTenant(req);
        res.json((await pool.query('SELECT * FROM hand_hygiene_audits WHERE tenant_id=$1 ORDER BY id DESC', [tenantId])).rows);
    } catch (e) { res.status(e.statusCode || 500).json({ error: e.statusCode ? e.message : 'Server error' }); }
});
app.get('/api/infection/stats', requireAuth, requireRole('infection'), requireTenantScope, async (req, res) => {
    try {
        const tenantId = e17RequireTenant(req);
        const total = (await pool.query('SELECT COUNT(*) as cnt FROM infection_surveillance WHERE tenant_id=$1', [tenantId])).rows[0].cnt;
        const hai = (await pool.query("SELECT COUNT(*) as cnt FROM infection_surveillance WHERE tenant_id=$1 AND hai_category != ''", [tenantId])).rows[0].cnt;
        const activeIso = (await pool.query("SELECT COUNT(*) as cnt FROM hai_isolation WHERE tenant_id=$1 AND status='Active'", [tenantId])).rows[0].cnt;
        const openAms = (await pool.query("SELECT COUNT(*) as cnt FROM ams_flags WHERE tenant_id=$1 AND status='Open'", [tenantId])).rows[0].cnt;
        res.json({ totalInfections: total, haiCount: hai, activeIsolations: activeIso, openAmsFlags: openAms });
    } catch (e) { res.status(e.statusCode || 500).json({ error: e.statusCode ? e.message : 'Server error' }); }
});

// ===== E17 HAI isolation tracking =====
app.get('/api/infection/isolation', requireAuth, requireRole('infection'), requireTenantScope, async (req, res) => {
    try {
        const tenantId = e17RequireTenant(req);
        res.json((await pool.query('SELECT * FROM hai_isolation WHERE tenant_id=$1 ORDER BY id DESC', [tenantId])).rows);
    } catch (e) { res.status(e.statusCode || 500).json({ error: e.statusCode ? e.message : 'Server error' }); }
});
app.post('/api/infection/isolation', requireAuth, requireRole('infection'), requireTenantScope, async (req, res) => {
    try {
        const tenantId = e17RequireTenant(req);
        const { facilityId } = getRequestTenantContext(req);
        const { patient_id, patient_name, surveillance_id, precaution_type, hai_category, organism, ward, bed, notes } = req.body;
        const pid = parseInt(patient_id, 10);
        if (!Number.isInteger(pid) || pid <= 0) return res.status(400).json({ error: 'patient_id required' });
        // IDOR guard: patient must belong to caller's tenant.
        const chk = (await pool.query('SELECT id FROM patients WHERE id=$1 AND tenant_id=$2', [pid, tenantId])).rows[0];
        if (!chk) return res.status(403).json({ error: 'Invalid patient context or access denied' });
        const prec = E17_PRECAUTION_TYPES.includes(precaution_type) ? precaution_type : 'contact';
        let sid = parseInt(surveillance_id, 10);
        if (!Number.isInteger(sid) || sid <= 0) sid = null;
        const r = await pool.query(
            `INSERT INTO hai_isolation (tenant_id,facility_id,patient_id,patient_name,surveillance_id,precaution_type,hai_category,organism,ward,bed,status,notes,created_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'Active',$11,$12) RETURNING *`,
            [tenantId, facilityId, pid, patient_name || '', sid, prec, hai_category || '', organism || '', ward || '', bed || '', notes || '', req.session.user?.display_name || '']);
        logAudit(req.session.user?.id, req.session.user?.display_name || '', 'CREATE_ISOLATION', 'Infection', `Isolation ${prec} for patient ${pid}`, req.ip);
        res.json(r.rows[0]);
    } catch (e) { res.status(e.statusCode || 500).json({ error: e.statusCode ? e.message : 'Server error' }); }
});
app.put('/api/infection/isolation/:id', requireAuth, requireRole('infection'), requireTenantScope, async (req, res) => {
    try {
        const tenantId = e17RequireTenant(req);
        const id = parseInt(req.params.id, 10);
        if (!Number.isInteger(id) || id <= 0) return res.status(404).json({ error: 'Not found' });
        const cur = (await pool.query('SELECT * FROM hai_isolation WHERE id=$1 AND tenant_id=$2', [id, tenantId])).rows[0];
        if (!cur) return res.status(404).json({ error: 'Not found or unauthorized' });
        const { status } = req.body;
        if (!['Active', 'Resolved', 'Discontinued'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
        const resolvedAt = (status === 'Resolved' || status === 'Discontinued') ? new Date().toISOString() : null;
        const r = await pool.query('UPDATE hai_isolation SET status=$1, resolved_at=$2 WHERE id=$3 AND tenant_id=$4 RETURNING *', [status, resolvedAt, id, tenantId]);
        logAudit(req.session.user?.id, req.session.user?.display_name || '', 'UPDATE_ISOLATION', 'Infection', `Isolation ${id} -> ${status}`, req.ip);
        res.json(r.rows[0]);
    } catch (e) { res.status(e.statusCode || 500).json({ error: e.statusCode ? e.message : 'Server error' }); }
});

// ===== E17 Antimicrobial Stewardship (AMS) flags =====
app.get('/api/infection/ams', requireAuth, requireRole('infection'), requireTenantScope, async (req, res) => {
    try {
        const tenantId = e17RequireTenant(req);
        res.json((await pool.query('SELECT * FROM ams_flags WHERE tenant_id=$1 ORDER BY id DESC', [tenantId])).rows);
    } catch (e) { res.status(e.statusCode || 500).json({ error: e.statusCode ? e.message : 'Server error' }); }
});
app.post('/api/infection/ams', requireAuth, requireRole('infection'), requireTenantScope, async (req, res) => {
    try {
        const tenantId = e17RequireTenant(req);
        const { facilityId } = getRequestTenantContext(req);
        const { patient_id, patient_name, antibiotic, flag_reason, severity, notes } = req.body;
        const pid = parseInt(patient_id, 10);
        if (!Number.isInteger(pid) || pid <= 0) return res.status(400).json({ error: 'patient_id required' });
        const chk = (await pool.query('SELECT id FROM patients WHERE id=$1 AND tenant_id=$2', [pid, tenantId])).rows[0];
        if (!chk) return res.status(403).json({ error: 'Invalid patient context or access denied' });
        const sev = E17_AMS_SEVERITY.includes(severity) ? severity : 'Advisory';
        const r = await pool.query(
            `INSERT INTO ams_flags (tenant_id,facility_id,patient_id,patient_name,antibiotic,flag_reason,severity,flagged_by,status,notes)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'Open',$9) RETURNING *`,
            [tenantId, facilityId, pid, patient_name || '', antibiotic || '', flag_reason || '', sev, req.session.user?.display_name || '', notes || '']);
        logAudit(req.session.user?.id, req.session.user?.display_name || '', 'CREATE_AMS_FLAG', 'Infection', `AMS ${antibiotic || ''} severity=${sev} for patient ${pid}`, req.ip);
        res.json(r.rows[0]);
    } catch (e) { res.status(e.statusCode || 500).json({ error: e.statusCode ? e.message : 'Server error' }); }
});
app.put('/api/infection/ams/:id', requireAuth, requireRole('infection'), requireTenantScope, async (req, res) => {
    try {
        const tenantId = e17RequireTenant(req);
        const id = parseInt(req.params.id, 10);
        if (!Number.isInteger(id) || id <= 0) return res.status(404).json({ error: 'Not found' });
        const cur = (await pool.query('SELECT * FROM ams_flags WHERE id=$1 AND tenant_id=$2', [id, tenantId])).rows[0];
        if (!cur) return res.status(404).json({ error: 'Not found or unauthorized' });
        const { status, review_outcome, notes } = req.body;
        const sets = []; const vals = []; let i = 1;
        if (status !== undefined) {
            if (!['Open', 'Reviewed', 'Closed'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
            sets.push(`status=$${i++}`); vals.push(status);
            if (status === 'Reviewed' || status === 'Closed') {
                sets.push(`reviewed_by=$${i++}`); vals.push(req.session.user?.display_name || '');
                sets.push(`reviewed_at=$${i++}`); vals.push(new Date().toISOString());
            }
        }
        if (review_outcome !== undefined) { sets.push(`review_outcome=$${i++}`); vals.push(review_outcome); }
        if (notes !== undefined) { sets.push(`notes=$${i++}`); vals.push(notes); }
        if (!sets.length) return res.json(cur);
        vals.push(id); vals.push(tenantId);
        const r = await pool.query(`UPDATE ams_flags SET ${sets.join(',')} WHERE id=$${i++} AND tenant_id=$${i} RETURNING *`, vals);
        logAudit(req.session.user?.id, req.session.user?.display_name || '', 'UPDATE_AMS_FLAG', 'Infection', `AMS ${id} -> ${status || cur.status}`, req.ip);
        res.json(r.rows[0]);
    } catch (e) { res.status(e.statusCode || 500).json({ error: e.statusCode ? e.message : 'Server error' }); }
});

// ===== QUALITY & PATIENT SAFETY (E17 HARDENED: tenant-scoped + RBAC + audit + state machine) =====
// confidential incidents are restricted to Admin / Quality Manager (RBAC-restricted PHI).
function e17CanSeeConfidential(req) {
    const role = req.session?.user?.role;
    return role === 'Admin' || role === 'Quality Manager';
}
app.get('/api/quality/incidents', requireAuth, requireRole('quality'), requireTenantScope, async (req, res) => {
    try {
        const tenantId = e17RequireTenant(req);
        // Confidential incidents hidden from non-privileged roles (defense-in-depth on top of RLS).
        const q = e17CanSeeConfidential(req)
            ? 'SELECT * FROM quality_incidents WHERE tenant_id=$1 ORDER BY id DESC'
            : 'SELECT * FROM quality_incidents WHERE tenant_id=$1 AND confidential=0 ORDER BY id DESC';
        res.json((await pool.query(q, [tenantId])).rows);
    } catch (e) { res.status(e.statusCode || 500).json({ error: e.statusCode ? e.message : 'Server error' }); }
});
app.post('/api/quality/incidents', requireAuth, requireRole('quality'), requireTenantScope, async (req, res) => {
    try {
        const tenantId = e17RequireTenant(req);
        const { facilityId } = getRequestTenantContext(req);
        const { incident_type, severity, harm_level, near_miss, confidential, incident_date, incident_time, department, location, patient_id, patient_name, description, immediate_action, encounter_id, visit_id } = req.body;

        // Anti-spoof: validate authority fields server-side; reject unknown enum values.
        const sev = E17_INCIDENT_SEVERITY.includes(severity) ? severity : 'low';
        const harm = E17_INCIDENT_HARM.includes(harm_level) ? harm_level : 'None';
        const itype = E17_INCIDENT_TYPES.includes(incident_type) ? incident_type : 'other';
        const isNearMiss = (near_miss === true || near_miss === 1 || near_miss === '1' || itype === 'near_miss') ? 1 : 0;
        const isConfidential = (confidential === true || confidential === 1 || confidential === '1') ? 1 : 0;

        // Validate optional patient reference belongs to this tenant (IDOR guard).
        let pid = parseInt(patient_id, 10);
        if (!Number.isInteger(pid) || pid <= 0) pid = 0;
        if (pid > 0) {
            const chk = (await pool.query('SELECT id FROM patients WHERE id=$1 AND tenant_id=$2', [pid, tenantId])).rows[0];
            if (!chk) return res.status(403).json({ error: 'Invalid patient context or access denied' });
        }

        const r = await pool.query(
            `INSERT INTO quality_incidents
             (incident_type,severity,harm_level,near_miss,confidential,incident_date,incident_time,department,location,patient_id,patient_name,description,immediate_action,reported_by,encounter_id,visit_id,status,workflow_state,tenant_id,facility_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'Open','Open',$17,$18) RETURNING *`,
            [itype, sev, harm, isNearMiss, isConfidential, incident_date || new Date().toISOString().split('T')[0], incident_time || '', department || '', location || '', pid, patient_name || '', description || '', immediate_action || '', req.session.user?.display_name || req.session.user?.name || '', encounter_id || null, visit_id || null, tenantId, facilityId]
        );
        logAudit(req.session.user?.id, req.session.user?.display_name || '', 'CREATE_INCIDENT', 'Quality', `Reported ${itype} severity=${sev} harm=${harm}${isConfidential ? ' [confidential]' : ''}`, req.ip);
        res.json(r.rows[0]);
    } catch (e) { res.status(e.statusCode || 500).json({ error: e.statusCode ? e.message : 'Server error' }); }
});
app.put('/api/quality/incidents/:id', requireAuth, requireRole('quality'), requireTenantScope, async (req, res) => {
    try {
        const tenantId = e17RequireTenant(req);
        const id = parseInt(req.params.id, 10);
        if (!Number.isInteger(id) || id <= 0) return res.status(404).json({ error: 'Not found' });

        // Load current row (tenant-scoped) to enforce the state machine server-side.
        const cur = (await pool.query('SELECT * FROM quality_incidents WHERE id=$1 AND tenant_id=$2', [id, tenantId])).rows[0];
        if (!cur) return res.status(404).json({ error: 'Not found or unauthorized' });
        // SECURITY-HOOK FIX: confidential incident gate — non-privileged roles cannot mutate confidential incidents.
        if (cur.confidential && !e17CanSeeConfidential(req)) return res.status(404).json({ error: 'Not found or unauthorized' });

        const { status, assigned_to, root_cause, corrective_action, preventive_action } = req.body;
        const sets = []; const vals = []; let i = 1;
        if (status !== undefined && status !== null && status !== cur.workflow_state) {
            // State machine: reject invalid transitions (legacy 'Closed' shortcut also validated).
            if (!e17IsValidIncidentTransition(cur.workflow_state, status)) {
                return res.status(409).json({ error: `Invalid incident transition ${cur.workflow_state} -> ${status}` });
            }
            sets.push(`workflow_state=$${i++}`); vals.push(status);
            sets.push(`status=$${i++}`); vals.push(status === 'Closed' ? 'Closed' : 'Open');
            if (status === 'Closed') { sets.push(`closed_date=$${i++}`); vals.push(new Date().toISOString().split('T')[0]); }
        }
        if (assigned_to !== undefined) { sets.push(`assigned_to=$${i++}`); vals.push(assigned_to); }
        if (root_cause !== undefined) { sets.push(`root_cause=$${i++}`); vals.push(root_cause); }
        if (corrective_action !== undefined) { sets.push(`corrective_action=$${i++}`); vals.push(corrective_action); }
        if (preventive_action !== undefined) { sets.push(`preventive_action=$${i++}`); vals.push(preventive_action); }
        if (!sets.length) return res.json(cur);
        vals.push(id); vals.push(tenantId);
        const r = await pool.query(`UPDATE quality_incidents SET ${sets.join(',')} WHERE id=$${i++} AND tenant_id=$${i} RETURNING *`, vals);
        logAudit(req.session.user?.id, req.session.user?.display_name || '', 'UPDATE_INCIDENT', 'Quality', `Incident ${id} -> ${status || cur.workflow_state}`, req.ip);
        res.json(r.rows[0]);
    } catch (e) { res.status(e.statusCode || 500).json({ error: e.statusCode ? e.message : 'Server error' }); }
});
app.get('/api/quality/satisfaction', requireAuth, requireRole('quality'), requireTenantScope, async (req, res) => {
    try {
        const tenantId = e17RequireTenant(req);
        res.json((await pool.query('SELECT * FROM quality_patient_satisfaction WHERE tenant_id=$1 ORDER BY id DESC', [tenantId])).rows);
    } catch (e) { res.status(e.statusCode || 500).json({ error: e.statusCode ? e.message : 'Server error' }); }
});
app.post('/api/quality/satisfaction', requireAuth, requireRole('quality'), requireTenantScope, async (req, res) => {
    try {
        const tenantId = e17RequireTenant(req);
        const { patient_id, patient_name, department, overall_rating, cleanliness, staff_courtesy, wait_time, communication, pain_management, food_quality, comments, would_recommend } = req.body;
        const pid = parseInt(patient_id, 10);
        // I2 FIX: IDOR guard — non-null patient_id must belong to this tenant; anonymous surveys (null/0) are allowed.
        if (pid && pid > 0) {
            const chk = (await pool.query('SELECT id FROM patients WHERE id=$1 AND tenant_id=$2', [pid, tenantId])).rows[0];
            if (!chk) return res.status(403).json({ error: 'Invalid patient context or access denied' });
        }
        const r = await pool.query(
            'INSERT INTO quality_patient_satisfaction (patient_id,patient_name,department,survey_date,overall_rating,cleanliness,staff_courtesy,wait_time,communication,pain_management,food_quality,comments,would_recommend,tenant_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *',
            [pid > 0 ? pid : 0, patient_name || '', department || '', new Date().toISOString().split('T')[0], overall_rating, cleanliness, staff_courtesy, wait_time, communication, pain_management, food_quality, comments, would_recommend ? 1 : 0, tenantId]);
        res.json(r.rows[0]);
    } catch (e) { res.status(e.statusCode || 500).json({ error: e.statusCode ? e.message : 'Server error' }); }
});
app.get('/api/quality/kpis', requireAuth, requireRole('quality'), requireTenantScope, async (req, res) => {
    try {
        const tenantId = e17RequireTenant(req);
        res.json((await pool.query('SELECT * FROM quality_kpis WHERE tenant_id=$1 ORDER BY id DESC', [tenantId])).rows);
    } catch (e) { res.status(e.statusCode || 500).json({ error: e.statusCode ? e.message : 'Server error' }); }
});
app.post('/api/quality/kpis', requireAuth, requireRole('quality'), requireTenantScope, async (req, res) => {
    try {
        const tenantId = e17RequireTenant(req);
        const { kpi_name, kpi_name_ar, category, target_value, actual_value, unit, period, department } = req.body;
        // Anti-spoof: status is derived server-side from target vs actual, never trusted from client.
        const tgt = parseFloat(target_value) || 0;
        const act = parseFloat(actual_value) || 0;
        const status = act >= tgt ? 'On Track' : (tgt > 0 && act >= tgt * 0.8) ? 'At Risk' : 'Below Target';
        const r = await pool.query(
            'INSERT INTO quality_kpis (kpi_name,kpi_name_ar,category,target_value,actual_value,unit,period,department,status,tenant_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *',
            [kpi_name || '', kpi_name_ar || '', category || '', tgt, act, unit || '%', period || '', department || '', status, tenantId]);
        res.json(r.rows[0]);
    } catch (e) { res.status(e.statusCode || 500).json({ error: e.statusCode ? e.message : 'Server error' }); }
});
app.get('/api/quality/stats', requireAuth, requireRole('quality'), requireTenantScope, async (req, res) => {
    try {
        const tenantId = e17RequireTenant(req);
        const open = (await pool.query("SELECT COUNT(*) as cnt FROM quality_incidents WHERE tenant_id=$1 AND workflow_state<>'Closed'", [tenantId])).rows[0].cnt;
        const total = (await pool.query('SELECT COUNT(*) as cnt FROM quality_incidents WHERE tenant_id=$1', [tenantId])).rows[0].cnt;
        const avgSat = (await pool.query('SELECT COALESCE(AVG(overall_rating),0) as avg FROM quality_patient_satisfaction WHERE tenant_id=$1', [tenantId])).rows[0].avg;
        const kpiOnTrack = (await pool.query("SELECT COUNT(*) as cnt FROM quality_kpis WHERE tenant_id=$1 AND status='On Track'", [tenantId])).rows[0].cnt;
        const kpiTotal = (await pool.query('SELECT COUNT(*) as cnt FROM quality_kpis WHERE tenant_id=$1', [tenantId])).rows[0].cnt;
        const openCapa = (await pool.query("SELECT COUNT(*) as cnt FROM quality_capa WHERE tenant_id=$1 AND status IN ('Pending','InProgress')", [tenantId])).rows[0].cnt;
        const openRisks = (await pool.query("SELECT COUNT(*) as cnt FROM quality_risk_register WHERE tenant_id=$1 AND status<>'Closed'", [tenantId])).rows[0].cnt;
        res.json({ openIncidents: open, totalIncidents: total, avgSatisfaction: parseFloat(parseFloat(avgSat).toFixed(1)), kpiOnTrack, kpiTotal, openCapa, openRisks });
    } catch (e) { res.status(e.statusCode || 500).json({ error: e.statusCode ? e.message : 'Server error' }); }
});

// ===== E17 CAPA (corrective/preventive actions) — state machine + audit =====
app.get('/api/quality/incidents/:id/capa', requireAuth, requireRole('quality'), requireTenantScope, async (req, res) => {
    try {
        const tenantId = e17RequireTenant(req);
        const incidentId = parseInt(req.params.id, 10);
        if (!Number.isInteger(incidentId) || incidentId <= 0) return res.status(404).json({ error: 'Not found' });
        // SECURITY-HOOK FIX: load incident with confidential flag; gate non-privileged roles.
        const inc = (await pool.query('SELECT id, confidential FROM quality_incidents WHERE id=$1 AND tenant_id=$2', [incidentId, tenantId])).rows[0];
        if (!inc) return res.status(404).json({ error: 'Not found or unauthorized' });
        if (inc.confidential && !e17CanSeeConfidential(req)) return res.status(404).json({ error: 'Not found or unauthorized' });
        res.json((await pool.query('SELECT * FROM quality_capa WHERE incident_id=$1 AND tenant_id=$2 ORDER BY id DESC', [incidentId, tenantId])).rows);
    } catch (e) { res.status(e.statusCode || 500).json({ error: e.statusCode ? e.message : 'Server error' }); }
});
app.post('/api/quality/incidents/:id/capa', requireAuth, requireRole('quality'), requireTenantScope, async (req, res) => {
    try {
        const tenantId = e17RequireTenant(req);
        const { facilityId } = getRequestTenantContext(req);
        const incidentId = parseInt(req.params.id, 10);
        if (!Number.isInteger(incidentId) || incidentId <= 0) return res.status(404).json({ error: 'Not found' });
        // SECURITY-HOOK FIX: load incident with confidential flag; gate non-privileged roles from writing CAPA to confidential incidents.
        const inc = (await pool.query('SELECT id, confidential FROM quality_incidents WHERE id=$1 AND tenant_id=$2', [incidentId, tenantId])).rows[0];
        if (!inc) return res.status(404).json({ error: 'Not found or unauthorized' });
        if (inc.confidential && !e17CanSeeConfidential(req)) return res.status(404).json({ error: 'Not found or unauthorized' });

        const { capa_type, title, description, root_cause, owner_user_id, owner_name, due_date } = req.body;
        const ctype = E17_CAPA_TYPES.includes(capa_type) ? capa_type : 'Corrective';
        const ownerId = parseInt(owner_user_id, 10);
        const r = await pool.query(
            `INSERT INTO quality_capa (tenant_id,facility_id,incident_id,capa_type,title,description,root_cause,owner_user_id,owner_name,due_date,status,created_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'Pending',$11) RETURNING *`,
            [tenantId, facilityId, incidentId, ctype, title || '', description || '', root_cause || '', Number.isInteger(ownerId) ? ownerId : null, owner_name || '', due_date || null, req.session.user?.display_name || '']);
        logAudit(req.session.user?.id, req.session.user?.display_name || '', 'CREATE_CAPA', 'Quality', `CAPA(${ctype}) for incident ${incidentId}`, req.ip);
        res.json(r.rows[0]);
    } catch (e) { res.status(e.statusCode || 500).json({ error: e.statusCode ? e.message : 'Server error' }); }
});
app.put('/api/quality/capa/:id', requireAuth, requireRole('quality'), requireTenantScope, async (req, res) => {
    try {
        const tenantId = e17RequireTenant(req);
        const id = parseInt(req.params.id, 10);
        if (!Number.isInteger(id) || id <= 0) return res.status(404).json({ error: 'Not found' });
        const cur = (await pool.query('SELECT * FROM quality_capa WHERE id=$1 AND tenant_id=$2', [id, tenantId])).rows[0];
        if (!cur) return res.status(404).json({ error: 'Not found or unauthorized' });
        // SECURITY-HOOK FIX: if CAPA is linked to a confidential incident, gate non-privileged roles.
        if (cur.incident_id) {
            const parentInc = (await pool.query('SELECT confidential FROM quality_incidents WHERE id=$1 AND tenant_id=$2', [cur.incident_id, tenantId])).rows[0];
            if (parentInc && parentInc.confidential && !e17CanSeeConfidential(req)) return res.status(404).json({ error: 'Not found or unauthorized' });
        }

        const { status, completion_notes, due_date, owner_name } = req.body;
        const sets = []; const vals = []; let i = 1;
        if (status !== undefined && status !== null && status !== cur.status) {
            // CAPA state machine: reject invalid transitions with 409.
            if (!e17IsValidCapaTransition(cur.status, status)) {
                return res.status(409).json({ error: `Invalid CAPA transition ${cur.status} -> ${status}` });
            }
            sets.push(`status=$${i++}`); vals.push(status);
            if (status === 'Completed') { sets.push(`completion_date=$${i++}`); vals.push(new Date().toISOString().split('T')[0]); }
            if (status === 'Verified') { sets.push(`verified_by=$${i++}`); vals.push(req.session.user?.display_name || ''); }
        }
        if (completion_notes !== undefined) { sets.push(`completion_notes=$${i++}`); vals.push(completion_notes); }
        if (due_date !== undefined) { sets.push(`due_date=$${i++}`); vals.push(due_date || null); }
        if (owner_name !== undefined) { sets.push(`owner_name=$${i++}`); vals.push(owner_name); }
        if (!sets.length) return res.json(cur);
        vals.push(id); vals.push(tenantId);
        const r = await pool.query(`UPDATE quality_capa SET ${sets.join(',')} WHERE id=$${i++} AND tenant_id=$${i} RETURNING *`, vals);
        logAudit(req.session.user?.id, req.session.user?.display_name || '', 'UPDATE_CAPA', 'Quality', `CAPA ${id} -> ${status || cur.status}`, req.ip);
        res.json(r.rows[0]);
    } catch (e) { res.status(e.statusCode || 500).json({ error: e.statusCode ? e.message : 'Server error' }); }
});

// ===== E17 Risk Register (CBAHI indicators / score / trend) =====
app.get('/api/quality/risks', requireAuth, requireRole('quality'), requireTenantScope, async (req, res) => {
    try {
        const tenantId = e17RequireTenant(req);
        res.json((await pool.query('SELECT * FROM quality_risk_register WHERE tenant_id=$1 ORDER BY risk_score DESC, id DESC', [tenantId])).rows);
    } catch (e) { res.status(e.statusCode || 500).json({ error: e.statusCode ? e.message : 'Server error' }); }
});
app.post('/api/quality/risks', requireAuth, requireRole('quality'), requireTenantScope, async (req, res) => {
    try {
        const tenantId = e17RequireTenant(req);
        const { facilityId } = getRequestTenantContext(req);
        const { incident_id, risk_title, category, likelihood, impact, control_measure, owner_name, review_date } = req.body;
        // Anti-spoof: score + level computed server-side, never trusted from client.
        const rk = e17ComputeRisk(likelihood, impact);
        let incId = parseInt(incident_id, 10);
        if (!Number.isInteger(incId) || incId <= 0) incId = null;
        if (incId) {
            const inc = (await pool.query('SELECT id FROM quality_incidents WHERE id=$1 AND tenant_id=$2', [incId, tenantId])).rows[0];
            if (!inc) return res.status(403).json({ error: 'Invalid incident context or access denied' });
        }
        const r = await pool.query(
            `INSERT INTO quality_risk_register (tenant_id,facility_id,incident_id,risk_title,category,likelihood,impact,risk_score,risk_level,control_measure,owner_name,review_date,status,created_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'Open',$13) RETURNING *`,
            [tenantId, facilityId, incId, risk_title || '', category || '', rk.likelihood, rk.impact, rk.score, rk.level, control_measure || '', owner_name || '', review_date || null, req.session.user?.display_name || '']);
        logAudit(req.session.user?.id, req.session.user?.display_name || '', 'CREATE_RISK', 'Quality', `Risk "${(risk_title || '').slice(0, 40)}" score=${rk.score} level=${rk.level}`, req.ip);
        res.json(r.rows[0]);
    } catch (e) { res.status(e.statusCode || 500).json({ error: e.statusCode ? e.message : 'Server error' }); }
});
app.put('/api/quality/risks/:id', requireAuth, requireRole('quality'), requireTenantScope, async (req, res) => {
    try {
        const tenantId = e17RequireTenant(req);
        const id = parseInt(req.params.id, 10);
        if (!Number.isInteger(id) || id <= 0) return res.status(404).json({ error: 'Not found' });
        const cur = (await pool.query('SELECT * FROM quality_risk_register WHERE id=$1 AND tenant_id=$2', [id, tenantId])).rows[0];
        if (!cur) return res.status(404).json({ error: 'Not found or unauthorized' });

        const { status, control_measure, residual_likelihood, residual_impact, review_date } = req.body;
        const sets = []; const vals = []; let i = 1;
        if (status !== undefined && ['Open', 'Mitigating', 'Closed'].includes(status)) { sets.push(`status=$${i++}`); vals.push(status); }
        if (control_measure !== undefined) { sets.push(`control_measure=$${i++}`); vals.push(control_measure); }
        if (residual_likelihood !== undefined && residual_impact !== undefined) {
            // Anti-spoof: residual score recomputed server-side.
            const rr = e17ComputeRisk(residual_likelihood, residual_impact);
            sets.push(`residual_likelihood=$${i++}`); vals.push(rr.likelihood);
            sets.push(`residual_impact=$${i++}`); vals.push(rr.impact);
            sets.push(`residual_score=$${i++}`); vals.push(rr.score);
        }
        if (review_date !== undefined) { sets.push(`review_date=$${i++}`); vals.push(review_date || null); }
        if (!sets.length) return res.json(cur);
        vals.push(id); vals.push(tenantId);
        const r = await pool.query(`UPDATE quality_risk_register SET ${sets.join(',')} WHERE id=$${i++} AND tenant_id=$${i} RETURNING *`, vals);
        logAudit(req.session.user?.id, req.session.user?.display_name || '', 'UPDATE_RISK', 'Quality', `Risk ${id} -> ${status || cur.status}`, req.ip);
        res.json(r.rows[0]);
    } catch (e) { res.status(e.statusCode || 500).json({ error: e.statusCode ? e.message : 'Server error' }); }
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
app.get('/api/cosmetic/procedures', requireAuth, requireRole('doctor', 'surgery'), requireTenantScope, async (req, res) => {
    try { res.json((await pool.query('SELECT * FROM cosmetic_procedures WHERE is_active=1 ORDER BY category, name_en')).rows); }
    catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.get('/api/cosmetic/cases', requireAuth, requireRole('doctor', 'surgery'), requireTenantScope, async (req, res) => {
    try { res.json((await pool.query('SELECT * FROM cosmetic_cases ORDER BY created_at DESC')).rows); }
    catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.post('/api/cosmetic/cases', requireAuth, requireRole('doctor', 'surgery'), requireTenantScope, async (req, res) => {
    try {
        const { patient_id, patient_name, procedure_id, procedure_name, surgery_date, surgery_time, anesthesia_type, operating_room, total_cost, pre_op_notes } = req.body;
        const result = await pool.query('INSERT INTO cosmetic_cases (patient_id, patient_name, procedure_id, procedure_name, surgeon, surgery_date, surgery_time, anesthesia_type, operating_room, total_cost, pre_op_notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *',
            [patient_id, patient_name || '', procedure_id || 0, procedure_name || '', req.session.user.name, surgery_date || '', surgery_time || '', anesthesia_type || 'Local', operating_room || '', total_cost || 0, pre_op_notes || '']);
        logAudit(req.session.user.id, req.session.user.name, 'COSMETIC_CASE', 'Cosmetic Surgery', `New case: ${procedure_name} for ${patient_name}`, req.ip);
        res.json(result.rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.put('/api/cosmetic/cases/:id', requireAuth, requireRole('doctor', 'surgery'), requireTenantScope, async (req, res) => {
    try {
        const { status, operative_notes, post_op_notes, complications, duration_minutes } = req.body;
        await pool.query('UPDATE cosmetic_cases SET status=$1, operative_notes=$2, post_op_notes=$3, complications=$4, duration_minutes=$5 WHERE id=$6',
            [status || 'Completed', operative_notes || '', post_op_notes || '', complications || '', duration_minutes || 0, req.params.id]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});
// Consent Forms
app.get('/api/cosmetic/consents', requireAuth, requireRole('doctor', 'surgery'), requireTenantScope, async (req, res) => {
    try {
        const { case_id } = req.query;
        if (case_id) res.json((await pool.query('SELECT * FROM cosmetic_consents WHERE case_id=$1 ORDER BY created_at DESC', [case_id])).rows);
        else res.json((await pool.query('SELECT * FROM cosmetic_consents ORDER BY created_at DESC')).rows);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.post('/api/cosmetic/consents', requireAuth, requireRole('doctor', 'surgery'), requireTenantScope, async (req, res) => {
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
app.get('/api/cosmetic/followups', requireAuth, requireRole('doctor', 'surgery'), requireTenantScope, async (req, res) => {
    try {
        const { case_id } = req.query;
        if (case_id) res.json((await pool.query('SELECT * FROM cosmetic_followups WHERE case_id=$1 ORDER BY followup_date DESC', [case_id])).rows);
        else res.json((await pool.query('SELECT * FROM cosmetic_followups ORDER BY followup_date DESC')).rows);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.post('/api/cosmetic/followups', requireAuth, requireRole('doctor', 'surgery'), requireTenantScope, async (req, res) => {
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
        // Never default to a guessable password; generate a strong random one if none supplied (portal onboarding sets a real one).
        const initPw = password || require('crypto').randomBytes(18).toString('base64');
        const hash = await bcrypt.hash(initPw, 10);
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
// ===== E10 ZATCA PHASE-2 E-INVOICE (tenant-scoped, role-gated; clearance GATED off) =====
// generate => deterministic UBL 2.1 XML + TLV base64 QR + stamp PLACEHOLDER (no CSID => no real stamp).
// submit   => records intent only; when ZATCA_ENABLED is off the external call is stubbed 503.
app.get('/api/zatca/invoices', requireAuth, requireRole('finance', 'accounts', 'invoices'), requireTenantScope, async (req, res) => {
    try {
        const tenantId = e10RequireTenant(req);
        res.json((await pool.query('SELECT * FROM zatca_invoices WHERE tenant_id=$1 ORDER BY created_at DESC', [tenantId])).rows);
    } catch (e) { e10Err(res, e); }
});

app.post('/api/zatca/generate', requireAuth, requireRole('finance', 'accounts'), requireTenantScope, async (req, res) => {
    try {
        const tenantId = e10RequireTenant(req);
        const invoiceId = e10IntId(req.body.invoice_id);
        if (!invoiceId) return res.status(422).json({ error: 'Invalid invoice_id' });
        // tenant-scoped invoice lookup (cross-tenant invoice => 404, no leak).
        const inv = (await pool.query(
            'SELECT i.*, p.name_ar, p.name_en FROM invoices i LEFT JOIN patients p ON i.patient_id=p.id AND p.tenant_id=$2 WHERE i.id=$1 AND i.tenant_id=$2',
            [invoiceId, tenantId])).rows[0];
        if (!inv) return res.status(404).json({ error: 'Invoice not found' });
        const company = (await pool.query("SELECT setting_value FROM company_settings WHERE setting_key='company_name'")).rows[0];
        const vatNo = (await pool.query("SELECT setting_value FROM company_settings WHERE setting_key='vat_number'")).rows[0];

        // VAT computed SERVER-SIDE from the invoice total (treated as VAT-inclusive). Client vat never trusted.
        const vatBreak = fe.vatFromInclusive(inv.total);
        if (!vatBreak) return res.status(422).json({ error: 'Invoice total is not a valid amount' });
        const issueDate = new Date().toISOString().slice(0, 10);
        const issueTime = new Date().toISOString().slice(11, 19);
        const sellerName = company?.setting_value || 'jumanaMedical';
        const sellerVat = vatNo?.setting_value || '';
        const invNumber = inv.invoice_number || ('INV-' + String(invoiceId).padStart(8, '0'));

        const qrTlv = fe.buildZatcaQR({
            sellerName, sellerVat, timestamp: issueDate + 'T' + issueTime + 'Z',
            total: vatBreak.total_incl, vat: vatBreak.vat_amount
        });
        const ubl = fe.buildUBLInvoice({
            invoiceNumber: invNumber, issueDate, issueTime, invoiceTypeCode: '388',
            sellerName, sellerVat, buyerName: inv.name_ar || inv.name_en || inv.patient_name || '',
            buyerVat: '', baseExcl: vatBreak.base_excl, vat: vatBreak.vat_amount, total: vatBreak.total_incl,
            currency: 'SAR', stampPlaceholder: 'UNSIGNED-NO-CSID'
        });
        const xmlHash = fe.ublHash(ubl);
        // stamp PLACEHOLDER — a real cryptographic stamp requires an onboarded CSID (gated). We persist
        // a deterministic placeholder derived from the doc hash, never a forged ZATCA stamp.
        const stampPlaceholder = 'PLACEHOLDER:' + xmlHash.slice(0, 32);

        // idempotent upsert on (tenant_id, invoice_id).
        const result = await pool.query(
            `INSERT INTO zatca_invoices
               (invoice_id, invoice_number, seller_name, seller_vat, buyer_name, total_before_vat, vat_amount, total_with_vat,
                qr_code, qr_tlv, ubl_xml, xml_hash, digital_stamp, submission_status, clearance_status, tenant_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'',$9,$10,$11,$12,'Generated','NOT_SUBMITTED',$13)
             ON CONFLICT (tenant_id, invoice_id) DO UPDATE SET
               qr_tlv=$9, ubl_xml=$10, xml_hash=$11, digital_stamp=$12,
               total_before_vat=$6, vat_amount=$7, total_with_vat=$8, submission_status='Generated'
             RETURNING *`,
            [invoiceId, invNumber, sellerName, sellerVat, inv.name_ar || inv.name_en || inv.patient_name || '',
            vatBreak.base_excl, vatBreak.vat_amount, vatBreak.total_incl, qrTlv, ubl, xmlHash, stampPlaceholder, tenantId]);
        logAudit(req.session.user?.id, req.session.user?.display_name, 'ZATCA_GENERATE', 'ZATCA', `E-invoice for ${invNumber} (VAT ${vatBreak.vat_amount})`, req.ip);
        res.json(result.rows[0]);
    } catch (e) { e10Err(res, e); }
});

// submit/report to ZATCA — GATED: without ZATCA_ENABLED + real CSID we stub 503 and only record intent.
app.post('/api/zatca/submit', requireAuth, requireRole('finance', 'accounts'), requireTenantScope, async (req, res) => {
    try {
        const tenantId = e10RequireTenant(req);
        const invoiceId = e10IntId(req.body.invoice_id);
        if (!invoiceId) return res.status(422).json({ error: 'Invalid invoice_id' });
        const z = (await pool.query('SELECT * FROM zatca_invoices WHERE invoice_id=$1 AND tenant_id=$2', [invoiceId, tenantId])).rows[0];
        if (!z) return res.status(404).json({ error: 'E-invoice not generated yet' });
        // record submission INTENT regardless of gate (auditable).
        await pool.query('UPDATE zatca_invoices SET clearance_status=$1 WHERE invoice_id=$2 AND tenant_id=$3', ['RECORDED', invoiceId, tenantId]);
        logAudit(req.session.user?.id, req.session.user?.display_name, 'ZATCA_SUBMIT_INTENT', 'ZATCA', `Submit intent for ${z.invoice_number}`, req.ip);
        if (!e10ZatcaEnabled()) {
            // no external call without a real CSID — fail closed with 503 (intent recorded above).
            return res.status(503).json({ error: 'ZATCA clearance disabled (ZATCA_ENABLED off; no CSID configured)', clearance_status: 'RECORDED', zatca_enabled: false });
        }
        // (real clearance call would go here once a CSID is onboarded — intentionally not implemented)
        return res.status(503).json({ error: 'ZATCA clearance endpoint not configured', clearance_status: 'RECORDED', zatca_enabled: true });
    } catch (e) { e10Err(res, e); }
});

// ===== TELEMEDICINE =====
app.get('/api/telemedicine/sessions', requireAuth, async (req, res) => {
    try { res.json((await pool.query('SELECT * FROM telemedicine_sessions ORDER BY scheduled_date DESC, scheduled_time DESC')).rows); }
    catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.post('/api/telemedicine/sessions', requireAuth, async (req, res) => {
    try {
        const { patient_id, patient_name, speciality, session_type, scheduled_date, scheduled_time, duration_minutes, notes } = req.body;
        const link = 'https://meet.nama.sa/' + require('crypto').randomBytes(16).toString('hex');
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

// ===== PATHOLOGY (legacy cases — hardened: tenant-scoped + RBAC + audit) =====
// Superseded by the E15 path_specimens workflow below; retained for back-compat
// but now tenant-isolated (was an unscoped cross-tenant leak).
app.get('/api/pathology/cases', requireAuth, requireRole('pathology', 'lab', 'doctor'), requireTenantScope, async (req, res) => {
    try {
        const { tenantId } = getRequestTenantContext(req);
        if (!tenantId) return res.json([]); // fail-closed
        res.json((await pool.query('SELECT * FROM pathology_cases WHERE tenant_id=$1 ORDER BY created_at DESC', [tenantId])).rows);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.post('/api/pathology/cases', requireAuth, requireRole('pathology', 'lab'), requireTenantScope, async (req, res) => {
    try {
        const { tenantId, facilityId } = getRequestTenantContext(req);
        if (!tenantId) return res.status(403).json({ error: 'Tenant scope required' });
        const { patient_id, patient_name, specimen_type, collection_date } = req.body;
        const pid = parseInt(patient_id, 10);
        if (Number.isInteger(pid)) {
            const pat = await pool.query('SELECT id FROM patients WHERE id=$1 AND tenant_id=$2', [pid, tenantId]);
            if (!pat.rows[0]) return res.status(404).json({ error: 'Patient not found' }); // anti-IDOR
        }
        const result = await pool.query(
            'INSERT INTO pathology_cases (patient_id, patient_name, specimen_type, collection_date, received_date, status, tenant_id, facility_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
            [Number.isInteger(pid) ? pid : null, patient_name || '', specimen_type || '',
             collection_date || new Date().toISOString().split('T')[0], new Date().toISOString().split('T')[0], 'Received', tenantId, facilityId || null]);
        logAudit(req.session.user?.id, req.session.user?.name, 'PATHOLOGY_CASE_CREATE', 'Pathology', JSON.stringify({ id: result.rows[0].id }), req.ip);
        res.json(result.rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.put('/api/pathology/cases/:id', requireAuth, requireRole('pathology'), requireTenantScope, async (req, res) => {
    try {
        const { tenantId } = getRequestTenantContext(req);
        const id = parseInt(req.params.id, 10);
        if (!Number.isInteger(id) || !tenantId) return res.status(400).json({ error: 'Invalid request' });
        const own = await pool.query('SELECT id FROM pathology_cases WHERE id=$1 AND tenant_id=$2', [id, tenantId]);
        if (!own.rows[0]) return res.status(404).json({ error: 'Not found' }); // cross-tenant -> 404
        const { gross_description, microscopic_findings, diagnosis, icd_code, stage, grade, status } = req.body;
        await pool.query('UPDATE pathology_cases SET gross_description=$1, microscopic_findings=$2, diagnosis=$3, icd_code=$4, stage=$5, grade=$6, status=$7, pathologist=$8, report_date=$9 WHERE id=$10 AND tenant_id=$11',
            [gross_description || '', microscopic_findings || '', diagnosis || '', icd_code || '', stage || '', grade || '', status || 'Reported', req.session.user.name, new Date().toISOString().split('T')[0], id, tenantId]);
        logAudit(req.session.user?.id, req.session.user?.name, 'PATHOLOGY_CASE_UPDATE', 'Pathology', JSON.stringify({ id }), req.ip);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== SOCIAL WORK =====
app.get('/api/social-work/cases', requireAuth, requireRole('him', 'nursing'), requireTenantScope, async (req, res) => {
    try { res.json((await pool.query('SELECT * FROM social_work_cases ORDER BY created_at DESC')).rows); }
    catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.post('/api/social-work/cases', requireAuth, requireRole('him', 'nursing'), requireTenantScope, async (req, res) => {
    try {
        const { patient_id, patient_name, case_type, assessment, plan, priority } = req.body;
        const result = await pool.query('INSERT INTO social_work_cases (patient_id, patient_name, case_type, social_worker, assessment, plan, priority) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
            [patient_id, patient_name || '', case_type || 'General', req.session.user.name, assessment || '', plan || '', priority || 'Medium']);
        res.json(result.rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.put('/api/social-work/cases/:id', requireAuth, requireRole('him', 'nursing'), requireTenantScope, async (req, res) => {
    try {
        const { status, interventions, referrals, follow_up_date } = req.body;
        await pool.query('UPDATE social_work_cases SET status=$1, interventions=$2, referrals=$3, follow_up_date=$4 WHERE id=$5',
            [status || 'Open', interventions || '', referrals || '', follow_up_date || '', req.params.id]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== MORTUARY =====
app.get('/api/mortuary/cases', requireAuth, requireRole('him', 'nursing'), requireTenantScope, async (req, res) => {
    try { res.json((await pool.query('SELECT * FROM mortuary_cases ORDER BY created_at DESC')).rows); }
    catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.post('/api/mortuary/cases', requireAuth, requireRole('him', 'nursing'), requireTenantScope, async (req, res) => {
    try {
        const { patient_id, deceased_name, date_of_death, time_of_death, cause_of_death, attending_physician, next_of_kin, next_of_kin_phone, notes } = req.body;
        const result = await pool.query('INSERT INTO mortuary_cases (patient_id, deceased_name, date_of_death, time_of_death, cause_of_death, attending_physician, next_of_kin, next_of_kin_phone, notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',
            [patient_id || 0, deceased_name || '', date_of_death || new Date().toISOString().split('T')[0], time_of_death || '', cause_of_death || '', attending_physician || '', next_of_kin || '', next_of_kin_phone || '', notes || '']);
        logAudit(req.session.user.id, req.session.user.name, 'DEATH_RECORD', 'Mortuary', `Death record for ${deceased_name}`, req.ip);
        res.json(result.rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.put('/api/mortuary/cases/:id', requireAuth, requireRole('him', 'nursing'), requireTenantScope, async (req, res) => {
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
app.get('/api/emar/orders', requireAuth, requireRole('nursing', 'doctor'), requireTenantScope, async (req, res) => {
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
app.post('/api/emar/orders', requireAuth, requireRole('nursing', 'doctor'), requireTenantScope, async (req, res) => {
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
app.get('/api/emar/administrations', requireAuth, requireRole('nursing', 'doctor'), requireTenantScope, async (req, res) => {
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
// LEGACY eMAR administration record. The PRIMARY nurse "Give" UI now posts to the safe
// /api/mar/administer (5-rights + CDS + witness). This route is kept for compatibility but is
// hardened: role-gated, status is FORCED 'Given' server-side (never trusted from the body), and
// every insert is audited (item 5 + item 6).
app.post('/api/emar/administrations', requireAuth, requireRole('nursing', 'doctor'), requireTenantScope, async (req, res) => {
    try {
        const { emar_order_id, patient_id, medication, dose, scheduled_time, reason_not_given, notes } = req.body;
        const { tenantId, facilityId } = getRequestTenantContext(req);
        if (tenantId) {
            const orderCheck = await pool.query('SELECT id FROM emar_orders WHERE id=$1 AND tenant_id=$2', [emar_order_id, tenantId]);
            if (orderCheck.rows.length === 0) return res.status(404).json({ error: 'Order not found' });
            const patientCheck = await pool.query('SELECT id FROM patients WHERE id=$1 AND tenant_id=$2', [patient_id, tenantId]);
            if (patientCheck.rows.length === 0) return res.status(404).json({ error: 'Patient not found' });
        }
        // status is FORCED server-side (do not accept an arbitrary status from the body).
        const status = 'Given';
        const result = await pool.query('INSERT INTO emar_administrations (emar_order_id, patient_id, medication, dose, scheduled_time, actual_time, administered_by, status, reason_not_given, notes, tenant_id, facility_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *',
            [emar_order_id, patient_id || 0, medication || '', dose || '', scheduled_time || '', new Date().toISOString(), req.session.user.name, status, reason_not_given || '', notes || '', tenantId || null, facilityId || null]);
        logAudit(req.session.user?.id, req.session.user?.name, 'MAR_ADMINISTRATION', 'Nursing',
            `eMAR (legacy) administration: patient #${patient_id} order #${emar_order_id} (${medication || ''} ${dose || ''}) status=${status}`, req.ip);
        res.json(result.rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ============================================================================
// E6 MAR — SAFE medication administration (server-enforced 5 RIGHTS + CDS + witness).
// POST /api/mar/administer  — the PRIMARY nurse "Give" path (NOT /api/emar/administrations).
//
// Fail-CLOSED security model. Every right is verified SERVER-SIDE against the authoritative
// prescription/order row (the client medication/dose/route strings are NEVER trusted):
//   Right Patient — the source row's patient_id must equal the submitted patient_id, and the
//                   patient must belong to this tenant. Mismatch => 422 MAR_WRONG_PATIENT.
//   Right Drug    — scanned drug barcode/name must match the prescribed medication. => MAR_WRONG_DRUG.
//   Right Dose    — administered dose must equal prescribed dose unless override_reason. => MAR_OVERRIDE_DOSE.
//   Right Route   — administered route must equal prescribed route unless override_reason. => MAR_OVERRIDE_ROUTE.
//   Right Time    — scheduled_at vs server clock within MAR_TIME_WINDOW_MIN; outside => override_reason. => MAR_OVERRIDE_TIME.
//   CDS           — cds.checkDrugAllergy + checkDrugDrugInteraction (server-derived active meds),
//                   fail-SAFE: an engine error becomes a WARNING (never a silent OK). A CRITICAL
//                   alert HARD-STOPS (422 MAR_CDS_BLOCK) unless override_reason (then audited).
//   Witness       — a high-alert drug (HIGH_ALERT list) requires a DISTINCT witness_user_id that is
//                   a real system_users row in the SAME tenant. else 422 MAR_WITNESS_REQUIRED (fail-closed).
// On success writes mar_administrations (tenant_id stamped; explicit AND tenant_id=$N on every query;
// null tenant => fail-closed) and audits MAR_ADMINISTRATION. Every blocked right/override is audited.
// ============================================================================
const MAR_TIME_WINDOW_MIN = 60; // tolerance (minutes) between scheduled_at and server clock
// High-alert medications (ISMP-style): administration requires an independent second-nurse witness.
const MAR_HIGH_ALERT = [
    'insulin', 'heparin', 'warfarin', 'morphine', 'hydromorphone', 'fentanyl', 'methadone',
    'oxycodone', 'potassium chloride', 'kcl', 'magnesium sulfate', 'digoxin', 'epinephrine',
    'norepinephrine', 'chemotherapy', 'methotrexate', 'insulin glargine', 'oxytocin',
];
function isHighAlertMed(name) {
    const n = String(name || '').trim().toLowerCase();
    if (!n) return false;
    return MAR_HIGH_ALERT.some(h => n.includes(h));
}
function marNorm(s) { return String(s == null ? '' : s).trim().toLowerCase().replace(/\s+/g, ' '); }

app.post('/api/mar/administer', requireAuth, requireRole('nursing', 'doctor'), requireTenantScope, async (req, res) => {
    const {
        prescription_ref, emar_order_id, patient_id,
        scanned_drug, scanned_dose, scanned_route, scanned_patient_id,
        scheduled_at, override_reason, witness_user_id, notes,
    } = req.body || {};
    const { tenantId, facilityId } = getRequestTenantContext(req);
    const uid = req.session.user?.id;
    const uname = req.session.user?.name || req.session.user?.display_name || '';
    // Null tenant => fail-closed (requireTenantScope already blocks in production; belt-and-braces here).
    if (!tenantId) return res.status(403).json({ error: 'Tenant scope required' });
    const reason = (override_reason == null) ? '' : String(override_reason).trim();
    const auditBlock = (action, detail) => logAudit(uid, uname, action, 'Nursing',
        `${detail} | tenant #${tenantId} by user #${uid}`, req.ip);

    try {
        // ----- Resolve the AUTHORITATIVE source row (drug/dose/route/patient) SERVER-SIDE -----
        // Prefer prescription_ref (pharmacy_prescriptions_queue); else an emar_orders row.
        let src = null;       // { patient_id, medication, dose, route }
        if (prescription_ref) {
            const r = (await pool.query(
                'SELECT id, patient_id, medication_name, dosage, frequency FROM pharmacy_prescriptions_queue WHERE id=$1 AND tenant_id=$2',
                [prescription_ref, tenantId])).rows[0];
            if (!r) return res.status(404).json({ error: 'Prescription not found' });
            // I1: pharmacy_prescriptions_queue has NO route column (no DDL allowed). Use route=null so the
            // Right-Route check below treats the scanned route as authoritative (no spurious override). The
            // emar_orders path (which HAS a route) keeps the hard Right-Route enforcement.
            src = { patient_id: r.patient_id, medication: r.medication_name, dose: r.dosage, route: null };
        } else if (emar_order_id) {
            const r = (await pool.query(
                'SELECT id, patient_id, medication, dose, route FROM emar_orders WHERE id=$1 AND tenant_id=$2',
                [emar_order_id, tenantId])).rows[0];
            if (!r) return res.status(404).json({ error: 'Order not found' });
            src = { patient_id: r.patient_id, medication: r.medication, dose: r.dose, route: r.route };
        } else {
            return res.status(422).json({ error: 'A prescription_ref or emar_order_id is required', blocked: true });
        }

        // ----- RIGHT PATIENT -----
        // The source row's patient must belong to this tenant.
        const pat = (await pool.query('SELECT id, allergies FROM patients WHERE id=$1 AND tenant_id=$2', [src.patient_id, tenantId])).rows[0];
        if (!pat) return res.status(404).json({ error: 'Patient not found' });
        // The submitted/scanned patient must MATCH the prescription's patient.
        const claimedPatient = (scanned_patient_id != null ? scanned_patient_id : patient_id);
        if (claimedPatient == null || Number(claimedPatient) !== Number(src.patient_id)) {
            auditBlock('MAR_WRONG_PATIENT', `Right-Patient FAIL: claimed #${claimedPatient} != prescribed #${src.patient_id}`);
            return res.status(422).json({ error: 'Right Patient failed: scanned patient does not match the prescription', right: 'patient', blocked: true });
        }

        // ----- RIGHT DRUG ----- (scanned barcode/name must match prescribed drug; never trust client string blindly)
        if (scanned_drug != null && marNorm(scanned_drug) && marNorm(scanned_drug) !== marNorm(src.medication)) {
            auditBlock('MAR_WRONG_DRUG', `Right-Drug FAIL: scanned "${scanned_drug}" != prescribed "${src.medication}" (patient #${src.patient_id})`);
            return res.status(422).json({ error: 'Right Drug failed: scanned drug does not match the prescription', right: 'drug', blocked: true });
        }

        // ----- RIGHT DOSE ----- (must equal prescribed dose unless override_reason supplied)
        if (scanned_dose != null && marNorm(scanned_dose) && marNorm(scanned_dose) !== marNorm(src.dose)) {
            if (!reason) {
                auditBlock('MAR_WRONG_DOSE', `Right-Dose FAIL: given "${scanned_dose}" != prescribed "${src.dose}" (patient #${src.patient_id})`);
                return res.status(422).json({ error: 'Right Dose failed: dose differs from prescription (override_reason required)', right: 'dose', requires_override_reason: true, blocked: true });
            }
            auditBlock('MAR_OVERRIDE_DOSE', `Dose override: given "${scanned_dose}" vs prescribed "${src.dose}". Reason: ${reason.slice(0, 160)}`);
        }

        // ----- RIGHT ROUTE ----- (must equal prescribed route unless override_reason)
        // I1: only enforce when the source route is a KNOWN non-null value (emar_orders path). For the
        // prescription path src.route is null (queue has no route column), so the scanned route is accepted
        // as authoritative and recorded — no spurious mismatch/override polluting the audit trail.
        if (src.route != null && scanned_route != null && marNorm(scanned_route) && marNorm(scanned_route) !== marNorm(src.route)) {
            if (!reason) {
                auditBlock('MAR_WRONG_ROUTE', `Right-Route FAIL: given "${scanned_route}" != prescribed "${src.route}" (patient #${src.patient_id})`);
                return res.status(422).json({ error: 'Right Route failed: route differs from prescription (override_reason required)', right: 'route', requires_override_reason: true, blocked: true });
            }
            auditBlock('MAR_OVERRIDE_ROUTE', `Route override: given "${scanned_route}" vs prescribed "${src.route}". Reason: ${reason.slice(0, 160)}`);
        }
        // I1: when the source route is unknown (prescription path), record the scanned route as authoritative.
        if (src.route == null && scanned_route != null && marNorm(scanned_route)) {
            src.route = String(scanned_route).trim();
        }

        // ----- RIGHT TIME ----- (scheduled_at vs SERVER clock within tolerance; outside => override_reason)
        if (scheduled_at) {
            const sched = new Date(scheduled_at);
            if (!isNaN(sched.getTime())) {
                const driftMin = Math.abs(Date.now() - sched.getTime()) / 60000;
                if (driftMin > MAR_TIME_WINDOW_MIN) {
                    if (!reason) {
                        auditBlock('MAR_WRONG_TIME', `Right-Time FAIL: ${driftMin.toFixed(0)}min outside ${MAR_TIME_WINDOW_MIN}min window (patient #${src.patient_id})`);
                        return res.status(422).json({ error: `Right Time failed: ${Math.round(driftMin)} min outside the ${MAR_TIME_WINDOW_MIN}-min window (override_reason required)`, right: 'time', requires_override_reason: true, blocked: true });
                    }
                    auditBlock('MAR_OVERRIDE_TIME', `Time override: ${driftMin.toFixed(0)}min out of window. Reason: ${reason.slice(0, 160)}`);
                }
            }
        }

        // ----- CDS AT ADMINISTRATION (fail-SAFE; never a silent OK) -----
        let cdsAlerts = [];
        try {
            cdsAlerts = cdsAlerts.concat(cds.checkDrugAllergy(src.medication, pat.allergies));
        } catch (e) {
            // I3: inability to VERIFY an allergy is a hard-stop (fail-safe), not a soft warning. severity:'critical'
            // makes cds.decide() block administration unless an override_reason is supplied (then it is audited).
            cdsAlerts.push({ rule: 'allergy', severity: 'critical', message: 'CDS allergy check unavailable — verify manually',
                message_en: 'CDS allergy check unavailable — verify manually', message_ar: 'تعذّر فحص الحساسية — تأكد يدوياً', overridable: true, fail_safe: true });
        }
        try {
            const activeMeds = await getPatientActiveMeds(src.patient_id, tenantId);
            const others = (activeMeds || []).filter(m => marNorm(m) !== marNorm(src.medication));
            cdsAlerts = cdsAlerts.concat(cds.checkDrugDrugInteraction([src.medication].concat(others)));
        } catch (e) {
            cdsAlerts.push({ rule: 'drug-drug', severity: 'warning', message: 'Active medications unavailable — interaction check inconclusive',
                message_en: 'Active medications unavailable — interaction check inconclusive', message_ar: 'تعذّر جلب الأدوية الفعالة — فحص التداخل غير حاسم', overridable: true, subjects: [], fail_safe: true });
        }
        const cdsDecision = cds.decide(cdsAlerts, reason);
        if (!cdsDecision.allow) {
            auditBlock('MAR_CDS_BLOCK', `CDS hard-stop at administration (patient #${src.patient_id}, ${src.medication}): ${cdsAlerts.filter(a => a.severity === 'critical').map(a => a.message_en || a.message).join('; ').slice(0, 200)}`);
            return res.status(422).json({ error: 'CDS hard-stop at administration', blocked: true, requires_override_reason: true, alerts: cdsAlerts });
        }
        const cdsCriticals = cdsAlerts.filter(a => a.severity === 'critical');
        if (cdsCriticals.length > 0 && cdsDecision.reason) {
            auditBlock('MAR_CDS_OVERRIDE', `CDS override at administration (patient #${src.patient_id}, ${src.medication}). Reason: ${String(cdsDecision.reason).slice(0, 160)}. Alerts: ${cdsCriticals.map(a => a.message_en || a.message).join('; ').slice(0, 200)}`);
        }

        // ----- WITNESS GATE (high-alert drug => DISTINCT, real, same-tenant second user) -----
        const highAlert = isHighAlertMed(src.medication);
        let witnessName = '';
        let witnessId = null;
        if (highAlert) {
            if (witness_user_id == null || String(witness_user_id).trim() === '') {
                auditBlock('MAR_WITNESS_REQUIRED', `High-alert "${src.medication}" without witness (patient #${src.patient_id})`);
                return res.status(422).json({ error: 'High-alert medication requires a second-nurse witness', high_alert: true, requires_witness: true, blocked: true });
            }
            // C1: compare as INTEGERS. A space-padded value like ' 5' is cast to int 5 by PostgreSQL, so a
            // string compare (`' 5' === '5'` => false) could let a nurse witness themselves. Parse both sides;
            // reject a non-numeric/NaN witness outright, and use the parsed int for the self-check AND the DB
            // lookup so a padded value cannot slip through.
            witnessId = parseInt(witness_user_id, 10);
            if (Number.isNaN(witnessId)) {
                auditBlock('MAR_WITNESS_REQUIRED', `High-alert "${src.medication}" witness id not a valid integer (patient #${src.patient_id})`);
                return res.status(422).json({ error: 'Witness id is invalid', high_alert: true, requires_witness: true, blocked: true });
            }
            if (witnessId === parseInt(uid, 10)) {
                auditBlock('MAR_WITNESS_REQUIRED', `High-alert "${src.medication}" witness == administering nurse (patient #${src.patient_id})`);
                return res.status(422).json({ error: 'Witness must be a different user from the administering nurse', high_alert: true, requires_witness: true, blocked: true });
            }
            // system_users has NO tenant_id column (global user table); tenant membership lives in
            // user_tenants(user_id, tenant_id, is_active). Verify the witness is a REAL, ACTIVE user
            // who is a member of THIS tenant (fail-closed: no membership row => reject).
            const w = (await pool.query(
                `SELECT su.id, su.display_name
                   FROM system_users su
                   JOIN user_tenants ut ON ut.user_id = su.id
                  WHERE su.id=$1 AND su.is_active=1 AND ut.tenant_id=$2 AND ut.is_active=true`,
                [witnessId, tenantId])).rows[0];
            if (!w) {
                auditBlock('MAR_WITNESS_REQUIRED', `High-alert "${src.medication}" witness #${witness_user_id} not a valid same-tenant active user (patient #${src.patient_id})`);
                return res.status(422).json({ error: 'Witness is not a valid active user in this tenant', high_alert: true, requires_witness: true, blocked: true });
            }
            witnessName = w.display_name || '';
        }

        // ----- RECORD (status FORCED server-side; explicit tenant_id stamped) -----
        const cdsSummary = cdsAlerts.map(a => a.message_en || a.message).filter(Boolean).join('; ').slice(0, 500);
        const result = await pool.query(
            `INSERT INTO mar_administrations
               (tenant_id, facility_id, patient_id, prescription_ref, medication, dose, route,
                scheduled_at, administered_at, administered_by, administered_by_name,
                witness_by, witness_by_name, status, override_reason, cds_warnings, notes)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,CURRENT_TIMESTAMP,$9,$10,$11,$12,'given',$13,$14,$15)
             RETURNING *`,
            [tenantId, facilityId || null, src.patient_id, prescription_ref || null,
             src.medication || '', src.dose || '', src.route || '',
             scheduled_at || null, uid || null, uname,
             highAlert ? witnessId : null, witnessName,
             reason, cdsSummary, notes || '']);

        logAudit(uid, uname, 'MAR_ADMINISTRATION', 'Nursing',
            `MAR administered: patient #${src.patient_id} ${src.medication} ${src.dose || ''} ${src.route || ''}${highAlert ? ` (high-alert, witness #${witnessId})` : ''}${reason ? ` [override: ${reason.slice(0, 80)}]` : ''} | tenant #${tenantId}`, req.ip);
        res.json({ success: true, administration: result.rows[0], cds_alerts: cdsAlerts });
    } catch (e) {
        res.status(500).json({ error: 'Server error' });
    }
});

// ============================================================================
// E6 NURSING SCORES — POST /api/nursing/scores
// Accepts RAW observations and computes the score + band SERVER-SIDE via nursing_scores.js
// (the client can NEVER forge a "score"). Writes nursing_scores (tenant_id + explicit AND
// tenant_id predicate). Incomplete Braden (any missing subscale) => 422 (item 8, fail-closed).
// ============================================================================
app.post('/api/nursing/scores', requireAuth, requireRole('nursing', 'doctor'), requireTenantScope, async (req, res) => {
    try {
        const { patient_id, score_type, observations, notes } = req.body || {};
        const { tenantId, facilityId } = getRequestTenantContext(req);
        if (!tenantId) return res.status(403).json({ error: 'Tenant scope required' });
        const type = String(score_type || '').trim().toLowerCase();
        if (!['morse', 'braden', 'news', 'pain'].includes(type)) {
            return res.status(422).json({ error: 'Invalid score_type (morse|braden|news|pain)' });
        }
        // Right patient, tenant-scoped.
        const pat = (await pool.query('SELECT id FROM patients WHERE id=$1 AND tenant_id=$2', [patient_id, tenantId])).rows[0];
        if (!pat) return res.status(404).json({ error: 'Patient not found' });

        const obs = observations || {};
        let computed;
        if (type === 'morse') computed = nursingScores.computeMorseFallRisk(obs);
        else if (type === 'braden') computed = nursingScores.computeBraden(obs);
        else if (type === 'news') computed = nursingScores.computeNEWS(obs);
        else computed = nursingScores.computePainBand(obs.pain != null ? obs.pain : obs.score);

        // Incomplete Braden => fail-closed 422 (never store a partial pressure-ulcer score).
        if (type === 'braden' && (computed.score == null || computed.band === 'Incomplete')) {
            return res.status(422).json({ error: computed.error || 'Incomplete Braden subscales', band: 'Incomplete', incomplete: true });
        }

        const uid = req.session.user?.id;
        const uname = req.session.user?.name || req.session.user?.display_name || '';
        const result = await pool.query(
            `INSERT INTO nursing_scores
               (tenant_id, facility_id, patient_id, score_type, score, band, inputs_json, recorded_by, recorded_by_name, notes)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
            [tenantId, facilityId || null, patient_id, type, computed.score, computed.band || '',
             JSON.stringify(obs).slice(0, 4000), uid || null, uname, notes || '']);
        logAudit(uid, uname, 'NURSING_SCORE', 'Nursing',
            `${type} score ${computed.score} (${computed.band}) for patient #${patient_id} | tenant #${tenantId}`, req.ip);
        res.json({ score: computed.score, band: computed.band, components: computed.components || null, record: result.rows[0] });
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
app.get('/api/nursing/assessments', requireAuth, requireRole('nursing', 'doctor'), requireTenantScope, async (req, res) => {
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
app.post('/api/nursing/assessments', requireAuth, requireRole('nursing', 'doctor'), requireTenantScope, async (req, res) => {
    try {
        const { patient_id, patient_name, assessment_type, pain_score, gcs_score, shift, notes } = req.body;
        const { tenantId, facilityId } = getRequestTenantContext(req);
        if (tenantId) {
            const patientCheck = await pool.query('SELECT id FROM patients WHERE id=$1 AND tenant_id=$2', [patient_id, tenantId]);
            if (patientCheck.rows.length === 0) return res.status(404).json({ error: 'Patient not found' });
        }
        // item 2: never store a CLIENT-sent fall_risk/Braden score as authoritative. The pain band is
        // re-derived SERVER-SIDE from the raw 0–10 pain observation; authoritative Morse/Braden/NEWS
        // scores must be computed via POST /api/nursing/scores (server-side engine) — so they are
        // persisted here as 0 (not trusted) and the client score/band fields are ignored.
        const pain = nursingScores.computePainBand(pain_score);
        const result = await pool.query('INSERT INTO nursing_assessments (patient_id, patient_name, assessment_type, fall_risk_score, braden_score, pain_score, gcs_score, nurse, shift, notes, tenant_id, facility_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *',
            [patient_id, patient_name || '', assessment_type || 'General', 0, 0, pain.score, gcs_score || 15, req.session.user.name, shift || 'Morning', notes || '', tenantId || null, facilityId || null]);
        res.json(result.rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== FINANCIAL DAILY CLOSE =====
app.get('/api/finance/daily-close', requireAuth, requireRole('finance', 'accounts', 'invoices'), requireTenantScope, async (req, res) => {
    try {
        const tenantId = e10RequireTenant(req);
        res.json((await pool.query('SELECT * FROM daily_close WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 30', [tenantId])).rows);
    } catch (e) { e10Err(res, e); }
});
app.post('/api/finance/daily-close', requireAuth, requireRole('finance', 'accounts', 'invoices'), requireTenantScope, async (req, res) => {
    try {
        const tenantId = e10RequireTenant(req); // E10: fail-closed; aggregate only THIS tenant's invoices (no cross-tenant leak)
        const today = new Date().toISOString().split('T')[0];
        // Aggregate today's transactions — every invoices aggregation explicitly tenant-scoped.
        const cash = (await pool.query("SELECT COALESCE(SUM(total),0) as t, COUNT(*) as c FROM invoices WHERE tenant_id=$1 AND created_at::date=CURRENT_DATE AND payment_method='Cash'", [tenantId])).rows[0];
        const card = (await pool.query("SELECT COALESCE(SUM(total),0) as t FROM invoices WHERE tenant_id=$1 AND created_at::date=CURRENT_DATE AND payment_method='Card'", [tenantId])).rows[0];
        const ins = (await pool.query("SELECT COALESCE(SUM(total),0) as t FROM invoices WHERE tenant_id=$1 AND created_at::date=CURRENT_DATE AND payment_method='Insurance'", [tenantId])).rows[0];
        const totalTx = (await pool.query("SELECT COUNT(*) as c FROM invoices WHERE tenant_id=$1 AND created_at::date=CURRENT_DATE", [tenantId])).rows[0];
        const { opening_balance, closing_balance, notes } = req.body;
        const totalCash = Number(cash.t); const totalCard = Number(card.t); const totalIns = Number(ins.t);
        const variance = Number(closing_balance || 0) - (Number(opening_balance || 0) + totalCash);
        const result = await pool.query('INSERT INTO daily_close (close_date, cashier, total_cash, total_card, total_insurance, total_transactions, opening_balance, closing_balance, variance, notes, status, closed_by, tenant_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *',
            [today, req.session.user.name, totalCash, totalCard, totalIns, Number(totalTx.c), Number(opening_balance || 0), Number(closing_balance || 0), variance, notes || '', 'Closed', req.session.user.name, tenantId]);
        logAudit(req.session.user.id, req.session.user.name, 'DAILY_CLOSE', 'Finance', `Daily close for ${today}: Cash=${totalCash}, Card=${totalCard}`, req.ip);
        res.json(result.rows[0]);
    } catch (e) { e10Err(res, e); }
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

// ============================================================
// ===== E2 MEDICAL RECORDS / HIM =====
// Longitudinal record (access-logged), structured coding + deficiencies,
// ROI workflow, record-access-log read + break-glass.
// All endpoints: requireAuth + requireRole('him','medical-records') + requireTenantScope.
// Fail-closed: no tenant context in production -> 403 (requireTenantScope). New tables are
// tenant-scoped by FORCE RLS (app.tenant_id bound via AsyncLocalStorage) AND we stamp tenant_id
// from the session (never from body) for defense-in-depth. Optional sources (problems,
// clinical_notes, coding, access log) degrade gracefully if the table is absent (try/catch).
// ============================================================

// helper: append an event source without aborting the whole aggregation if a table is missing
async function _himPushSource(events, sql, params, mapFn) {
    try {
        const rows = (await pool.query(sql, params)).rows;
        rows.forEach(r => { const ev = mapFn(r); if (ev) events.push(ev); });
    } catch (e) { /* table may not exist yet (E1 not landed) — degrade gracefully */ }
}

// 1) LONGITUDINAL RECORD — aggregate the full chronological chart; EVERY access is logged.
app.get('/api/him/record/:patientId', requireAuth, requireRole('him', 'medical-records'), requireTenantScope, async (req, res) => {
    try {
        const pid = parseInt(req.params.patientId, 10);
        if (!Number.isFinite(pid)) return res.status(400).json({ error: 'Invalid patient id' });
        const { tenantId, facilityId } = getRequestTenantContext(req);
        const actor = req.session.user;

        // FAIL-CLOSED: no tenant context -> never run unfiltered PHI sub-queries. Return empty record.
        if (!tenantId) return res.status(403).json({ error: 'Tenant scope required' });

        // TENANT SCOPE: patient must belong to current tenant (explicit predicate + fail-closed -> 404)
        const patient = (await pool.query('SELECT id, name_en, name_ar, file_number FROM patients WHERE id=$1 AND tenant_id=$2', [pid, tenantId])).rows[0];
        if (!patient) return res.status(404).json({ error: 'Patient not found' });

        // --- HIM ACCESS AUDIT: every chart open MUST write a record_access_log row (who/what/when/tenant).
        // FAIL-CLOSED AUDIT: if the access cannot be logged, do NOT serve PHI (return 500). A record
        // view without a successful audit row is an HIPAA-unaccountable disclosure — refuse it. ---
        try {
            await pool.query(
                'INSERT INTO record_access_log (tenant_id, facility_id, patient_id, accessor_id, access_type, reason) VALUES ($1,$2,$3,$4,$5,$6)',
                [tenantId, facilityId || null, pid, actor.id, 'normal', '']
            );
        } catch (e) {
            console.error('record_access_log insert FAILED — refusing to serve PHI (audit fail-closed):', e.message);
            // record a loud audit_trail BREAK-style entry so the failed-to-log access is itself accountable
            logAudit(actor.id, actor.display_name || actor.name, 'VIEW_RECORD_AUDIT_FAIL', 'HIM', `BLOCKED record view patient #${pid}: access-log write failed (${e.message})`, req.ip);
            return res.status(500).json({ error: 'Access could not be logged; record view denied' });
        }
        logAudit(actor.id, actor.display_name || actor.name, 'VIEW_RECORD', 'HIM', `Viewed longitudinal record patient #${pid}`, req.ip);

        const events = [];
        // DEFENSE-IN-DEPTH: explicit tenant_id predicate on EVERY sub-query (independent of FORCE RLS).
        // FAIL-CLOSED: tenantId is guaranteed non-null here (patients fetch above already 404s a
        // cross-tenant patient and requireTenantScope 403s a null tenant in prod), but we still bind
        // tenant_id=$2 on every aggregation sub-query so a bypassing DB role cannot leak foreign rows.
        // Visits / encounters (visit_lifecycle is the nearest encounter table)
        await _himPushSource(events, 'SELECT id, diagnosis, complaint, visit_date, created_at FROM visits WHERE patient_id=$1 AND tenant_id=$2 ORDER BY id DESC LIMIT 500', [pid, tenantId],
            r => ({ type: 'visit', icon: '🏥', title: r.diagnosis || r.complaint || 'Visit', subtitle: r.complaint || '', date: r.visit_date || r.created_at }));
        await _himPushSource(events, 'SELECT id, status, stage, created_at FROM visit_lifecycle WHERE patient_id=$1 AND tenant_id=$2 ORDER BY id DESC LIMIT 500', [pid, tenantId],
            r => ({ type: 'encounter', icon: '📋', title: r.stage || 'Encounter', subtitle: r.status || '', date: r.created_at }));
        // Problems (E1 — optional)
        await _himPushSource(events, 'SELECT id, icd10, description, status, onset_date, created_at FROM problems WHERE patient_id=$1 AND tenant_id=$2 ORDER BY id DESC LIMIT 500', [pid, tenantId],
            r => ({ type: 'problem', icon: '⚠️', title: r.description || r.icd10 || 'Problem', subtitle: `${r.icd10 || ''} ${r.status || ''}`.trim(), date: r.onset_date || r.created_at }));
        // Clinical notes (E1 — optional, SOAP)
        await _himPushSource(events, 'SELECT id, note_type, assessment, created_at FROM clinical_notes WHERE patient_id=$1 AND tenant_id=$2 ORDER BY id DESC LIMIT 500', [pid, tenantId],
            r => ({ type: 'clinical_note', icon: '📝', title: r.note_type || 'Clinical Note', subtitle: r.assessment || '', date: r.created_at }));
        // Medical records
        await _himPushSource(events, 'SELECT id, diagnosis, symptoms, visit_date FROM medical_records WHERE patient_id=$1 AND tenant_id=$2 ORDER BY id DESC LIMIT 500', [pid, tenantId],
            r => ({ type: 'medical_record', icon: '🩺', title: r.diagnosis || 'Consultation', subtitle: r.symptoms || '', date: r.visit_date }));
        // Lab results (structured)
        await _himPushSource(events, 'SELECT id, order_type, status, created_at FROM lab_radiology_orders WHERE patient_id=$1 AND tenant_id=$2 AND is_radiology=0 ORDER BY id DESC LIMIT 500', [pid, tenantId],
            r => ({ type: 'lab', icon: '🔬', title: r.order_type || 'Lab', subtitle: r.status || '', date: r.created_at }));
        // Radiology
        await _himPushSource(events, 'SELECT id, order_type, status, created_at FROM lab_radiology_orders WHERE patient_id=$1 AND tenant_id=$2 AND is_radiology=1 ORDER BY id DESC LIMIT 500', [pid, tenantId],
            r => ({ type: 'radiology', icon: '📡', title: r.order_type || 'Radiology', subtitle: r.status || '', date: r.created_at }));
        // Prescriptions
        await _himPushSource(events, 'SELECT id, dosage, status, created_at FROM prescriptions WHERE patient_id=$1 AND tenant_id=$2 ORDER BY id DESC LIMIT 500', [pid, tenantId],
            r => ({ type: 'prescription', icon: '💊', title: r.dosage || 'Prescription', subtitle: r.status || '', date: r.created_at }));
        // Coding (E2 — structured codes)
        await _himPushSource(events, 'SELECT id, code_system, code, description, created_at FROM coding WHERE patient_id=$1 AND tenant_id=$2 ORDER BY id DESC LIMIT 500', [pid, tenantId],
            r => ({ type: 'coding', icon: '🏷️', title: `${r.code_system}: ${r.code}`, subtitle: r.description || '', date: r.created_at }));

        events.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
        res.json({ patient: { id: patient.id, name_en: patient.name_en, name_ar: patient.name_ar, file_number: patient.file_number }, events });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// 2) CODING — list / add structured codes for an encounter or patient.
app.get('/api/him/coding', requireAuth, requireRole('him', 'medical-records'), requireTenantScope, async (req, res) => {
    try {
        const { tenantId } = getRequestTenantContext(req);
        if (!tenantId) return res.json([]); // FAIL-CLOSED: never run unfiltered
        const { patient_id, encounter_ref } = req.query;
        // DEFENSE-IN-DEPTH: explicit tenant_id predicate (always), independent of FORCE RLS.
        const params = [tenantId], where = ['tenant_id=$1'];
        if (patient_id) { params.push(parseInt(patient_id, 10)); where.push(`patient_id=$${params.length}`); }
        if (encounter_ref) { params.push(parseInt(encounter_ref, 10)); where.push(`encounter_ref=$${params.length}`); }
        const sql = 'SELECT * FROM coding WHERE ' + where.join(' AND ') + ' ORDER BY id DESC LIMIT 500';
        res.json((await pool.query(sql, params)).rows);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.post('/api/him/coding', requireAuth, requireRole('him', 'medical-records'), requireTenantScope, async (req, res) => {
    try {
        const { tenantId, facilityId } = getRequestTenantContext(req);
        const actor = req.session.user;
        const { patient_id, encounter_ref, code_system, code, description } = req.body;
        const pid = parseInt(patient_id, 10);
        if (!Number.isFinite(pid)) return res.status(400).json({ error: 'patient_id required' });
        if (!code || !String(code).trim()) return res.status(400).json({ error: 'code required' });
        const cs = ['ICD10', 'SNOMED', 'CPT'].includes(code_system) ? code_system : 'ICD10';
        // tenant_id stamped from session (never from body)
        const result = await pool.query(
            'INSERT INTO coding (tenant_id, facility_id, patient_id, encounter_ref, code_system, code, description, coder_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
            [tenantId, facilityId || null, pid, encounter_ref ? parseInt(encounter_ref, 10) : null, cs, String(code), description || '', actor.id]);
        logAudit(actor.id, actor.display_name || actor.name, 'ADD_CODING', 'HIM', `Coded ${cs} ${String(code)} patient #${pid}`, req.ip);
        res.json(result.rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// 2b) DEFICIENCIES — encounters/records missing required coding or signature.
app.get('/api/him/deficiencies', requireAuth, requireRole('him', 'medical-records'), requireTenantScope, async (req, res) => {
    try {
        const { tenantId } = getRequestTenantContext(req);
        if (!tenantId) return res.json([]); // FAIL-CLOSED: never run unfiltered
        const deficiencies = [];
        // Unsigned medical records (missing signature) — explicit tenant_id predicate + FORCE RLS
        try {
            const unsigned = (await pool.query(
                "SELECT id, patient_id, visit_date FROM medical_records WHERE tenant_id=$1 AND COALESCE(emr_status,'') <> 'locked' ORDER BY id DESC LIMIT 200", [tenantId])).rows;
            unsigned.forEach(r => deficiencies.push({ type: 'unsigned_record', record_type: 'medical_records', record_id: r.id, patient_id: r.patient_id, detail: 'Record not signed/locked', date: r.visit_date }));
        } catch (e) { /* emr_status may be out-of-band; skip */ }
        // Records without any coding row (missing coding) — both sides tenant-scoped explicitly
        try {
            const uncoded = (await pool.query(
                "SELECT mr.id, mr.patient_id, mr.visit_date FROM medical_records mr WHERE mr.tenant_id=$1 AND NOT EXISTS (SELECT 1 FROM coding c WHERE c.patient_id = mr.patient_id AND c.tenant_id=$1) ORDER BY mr.id DESC LIMIT 200", [tenantId])).rows;
            uncoded.forEach(r => deficiencies.push({ type: 'missing_coding', record_type: 'medical_records', record_id: r.id, patient_id: r.patient_id, detail: 'No coding assigned', date: r.visit_date }));
        } catch (e) { /* coding table may not exist yet; skip */ }
        res.json(deficiencies);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// 3) ROI (Release of Information) — create / approve / deny / release. All audited; RBAC-guarded.
app.get('/api/him/roi', requireAuth, requireRole('him', 'medical-records'), requireTenantScope, async (req, res) => {
    try {
        const { tenantId } = getRequestTenantContext(req);
        if (!tenantId) return res.json([]); // FAIL-CLOSED: never run unfiltered
        // DEFENSE-IN-DEPTH: explicit tenant_id predicate (always), independent of FORCE RLS.
        res.json((await pool.query('SELECT * FROM roi_requests WHERE tenant_id=$1 ORDER BY id DESC LIMIT 500', [tenantId])).rows);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.post('/api/him/roi', requireAuth, requireRole('him', 'medical-records'), requireTenantScope, async (req, res) => {
    try {
        const { tenantId, facilityId } = getRequestTenantContext(req);
        const actor = req.session.user;
        const { patient_id, requester, purpose } = req.body;
        const pid = parseInt(patient_id, 10);
        if (!Number.isFinite(pid)) return res.status(400).json({ error: 'patient_id required' });
        if (!requester || !String(requester).trim()) return res.status(400).json({ error: 'requester required' });
        const result = await pool.query(
            "INSERT INTO roi_requests (tenant_id, facility_id, patient_id, requester, purpose, status, requested_by) VALUES ($1,$2,$3,$4,$5,'pending',$6) RETURNING *",
            [tenantId, facilityId || null, pid, String(requester), purpose || '', actor.id]);
        logAudit(actor.id, actor.display_name || actor.name, 'ROI_REQUEST', 'HIM', `ROI requested patient #${pid} by ${String(requester).slice(0, 80)}`, req.ip);
        res.json(result.rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.put('/api/him/roi/:id', requireAuth, requireRole('him', 'medical-records'), requireTenantScope, async (req, res) => {
    try {
        const actor = req.session.user;
        const id = parseInt(req.params.id, 10);
        if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });
        const { tenantId } = getRequestTenantContext(req);
        if (!tenantId) return res.status(403).json({ error: 'Tenant scope required' }); // FAIL-CLOSED
        const action = req.body.action; // 'approve' | 'deny' | 'release'
        // DEFENSE-IN-DEPTH: tenant_id predicate on the current-row SELECT (cross-tenant -> 404).
        const cur = (await pool.query('SELECT id, status, requested_by FROM roi_requests WHERE id=$1 AND tenant_id=$2', [id, tenantId])).rows[0];
        if (!cur) return res.status(404).json({ error: 'ROI request not found' });
        // SEGREGATION OF DUTIES: the requester cannot approve their own ROI request.
        if (action === 'approve' && cur.requested_by === actor.id) return res.status(403).json({ error: 'Cannot self-approve ROI request' });
        let r, audit;
        // Every UPDATE also binds tenant_id=$3 so a bypassing DB role cannot mutate a foreign-tenant row.
        if (action === 'approve') {
            if (cur.status !== 'pending') return res.status(409).json({ error: 'Only pending requests can be approved' });
            r = await pool.query("UPDATE roi_requests SET status='approved', approved_by=$1 WHERE id=$2 AND status='pending' AND tenant_id=$3 RETURNING *", [actor.id, id, tenantId]);
            audit = 'ROI_APPROVE';
        } else if (action === 'deny') {
            if (cur.status !== 'pending') return res.status(409).json({ error: 'Only pending requests can be denied' });
            r = await pool.query("UPDATE roi_requests SET status='denied', approved_by=$1 WHERE id=$2 AND status='pending' AND tenant_id=$3 RETURNING *", [actor.id, id, tenantId]);
            audit = 'ROI_DENY';
        } else if (action === 'release') {
            if (cur.status !== 'approved') return res.status(409).json({ error: 'Only approved requests can be released' });
            r = await pool.query("UPDATE roi_requests SET status='released', released_at=now() WHERE id=$1 AND status='approved' AND tenant_id=$2 RETURNING *", [id, tenantId]);
            audit = 'ROI_RELEASE';
        } else {
            return res.status(400).json({ error: 'Invalid action (approve|deny|release)' });
        }
        if (!r || r.rowCount === 0) return res.status(409).json({ error: 'State changed; refresh and retry' });
        logAudit(actor.id, actor.display_name || actor.name, audit, 'HIM', `ROI #${id} -> ${r.rows[0].status}`, req.ip);
        res.json(r.rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// STRICT server-side gate for the HIM audit surfaces (access-log + break-glass): ONLY the dedicated
// HIM role or Admin — NOT the broad 'medical-records'/'him' module (which Doctors also hold). The
// client tab is already gated to ['Admin','HIM']; this mirrors that check server-side (defense-in-depth).
function isHimOrAdmin(req) {
    const role = req.session?.user?.role;
    return role === 'HIM' || role === 'Admin';
}

// 4) RECORD ACCESS LOG (read) — HIM access audit, Admin/HIM only.
app.get('/api/him/access-log', requireAuth, requireRole('him', 'medical-records'), requireTenantScope, async (req, res) => {
    try {
        if (!isHimOrAdmin(req)) return res.status(403).json({ error: 'Access denied' }); // strict HIM/Admin only
        const { tenantId } = getRequestTenantContext(req);
        if (!tenantId) return res.json([]); // FAIL-CLOSED: never run unfiltered
        // DEFENSE-IN-DEPTH: explicit tenant_id predicate (always), independent of FORCE RLS.
        const params = [tenantId], where = ['tenant_id=$1'];
        const { patient_id } = req.query;
        if (patient_id) { params.push(parseInt(patient_id, 10)); where.push(`patient_id=$${params.length}`); }
        const sql = 'SELECT * FROM record_access_log WHERE ' + where.join(' AND ') + ' ORDER BY id DESC LIMIT 500';
        res.json((await pool.query(sql, params)).rows);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// 4b) BREAK-GLASS — emergency access: REQUIRES a reason, records break_glass access + raises BREAK_GLASS audit alert.
app.post('/api/him/break-glass', requireAuth, requireRole('him', 'medical-records'), requireTenantScope, async (req, res) => {
    try {
        if (!isHimOrAdmin(req)) return res.status(403).json({ error: 'Access denied' }); // strict HIM/Admin only
        const { tenantId, facilityId } = getRequestTenantContext(req);
        if (!tenantId) return res.status(403).json({ error: 'Tenant scope required' }); // FAIL-CLOSED
        const actor = req.session.user;
        const { patient_id, reason } = req.body;
        const pid = parseInt(patient_id, 10);
        if (!Number.isFinite(pid)) return res.status(400).json({ error: 'patient_id required' });
        if (!reason || !String(reason).trim()) return res.status(400).json({ error: 'Break-glass reason required' });
        // record the emergency access (fail-closed tenant stamping)
        const result = await pool.query(
            "INSERT INTO record_access_log (tenant_id, facility_id, patient_id, accessor_id, access_type, reason) VALUES ($1,$2,$3,$4,'break_glass',$5) RETURNING *",
            [tenantId, facilityId || null, pid, actor.id, String(reason)]);
        // raise an audit ALERT
        logAudit(actor.id, actor.display_name || actor.name, 'BREAK_GLASS', 'HIM', `BREAK-GLASS access patient #${pid}: ${String(reason).slice(0, 200)}`, req.ip);
        res.json({ success: true, access: result.rows[0] });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== CLINICAL PHARMACY (E5: tenant-scoped for consistency with the rest of pharmacy) =====
app.get('/api/clinical-pharmacy/reviews', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const { tenantId } = getRequestTenantContext(req);
        res.json((await pool.query('SELECT * FROM clinical_pharmacy_reviews WHERE tenant_id=$1 ORDER BY created_at DESC', [tenantId])).rows);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.post('/api/clinical-pharmacy/reviews', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const { patient_id, patient_name, prescription_id, review_type, findings, recommendations, interventions, severity } = req.body;
        const { tenantId, facilityId } = getRequestTenantContext(req);
        const result = await pool.query('INSERT INTO clinical_pharmacy_reviews (patient_id, patient_name, prescription_id, review_type, pharmacist, findings, recommendations, interventions, severity, tenant_id, branch_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *',
            [patient_id, patient_name || '', prescription_id || 0, review_type || 'Medication Review', req.session.user.name, findings || '', recommendations || '', interventions || '', severity || 'Low', tenantId || null, facilityId || null]);
        logAudit(req.session.user.id, req.session.user.name, 'CLINICAL_REVIEW', 'Clinical Pharmacy', `Review for patient ${patient_name}`, req.ip);
        res.json(result.rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.put('/api/clinical-pharmacy/reviews/:id', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const { outcome, status } = req.body;
        const { tenantId } = getRequestTenantContext(req);
        // IDOR: only update a review owned by this tenant.
        const r = await pool.query('UPDATE clinical_pharmacy_reviews SET outcome=$1, status=$2 WHERE id=$3 AND tenant_id=$4', [outcome || 'Resolved', status || 'Closed', req.params.id, tenantId]);
        if (!r.rowCount) return res.status(404).json({ error: 'Review not found' });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.get('/api/clinical-pharmacy/interactions', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const { tenantId } = getRequestTenantContext(req);
        res.json((await pool.query('SELECT * FROM drug_interactions WHERE tenant_id=$1 ORDER BY severity DESC', [tenantId])).rows);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.get('/api/clinical-pharmacy/education', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const { tenantId } = getRequestTenantContext(req);
        res.json((await pool.query('SELECT * FROM patient_drug_education WHERE tenant_id=$1 ORDER BY created_at DESC', [tenantId])).rows);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.post('/api/clinical-pharmacy/education', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const { patient_id, patient_name, medication, instructions, side_effects, precautions } = req.body;
        const { tenantId, facilityId } = getRequestTenantContext(req);
        const result = await pool.query('INSERT INTO patient_drug_education (patient_id, patient_name, medication, instructions, side_effects, precautions, educated_by, tenant_id, branch_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',
            [patient_id, patient_name || '', medication || '', instructions || '', side_effects || '', precautions || '', req.session.user.name, tenantId || null, facilityId || null]);
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
// H-6: audit trail is a security log — restricted to system/security operators (settings module = IT/Admin),
// tenant-scoped with an explicit predicate (defense-in-depth atop FORCE RLS). No client tenant_id trusted.
app.get('/api/audit-trail', requireAuth, requireRole('settings'), requireTenantScope, async (req, res) => {
    try {
        const { tenantId } = getRequestTenantContext(req);
        const lim = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 1000);
        const q = tenantId
            ? 'SELECT * FROM audit_trail WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT $2'
            : 'SELECT * FROM audit_trail ORDER BY created_at DESC LIMIT $1';
        const params = tenantId ? [tenantId, lim] : [lim];
        res.json((await pool.query(q, params)).rows);
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

// ============================================================================
// ===== E18 — HR / WORKFORCE (employees PII, SCFHS licenses, shifts, attendance,
//        leave state machine, payroll-slip [GL posting GATED OFF]) =====
// All E18 tables provisioned out-of-band via candidate migration e18_01 (NOT in
//   db_postgres.js bootstrap). Every route: requireAuth + requireRole('hr') (HR+Admin)
//   + requireTenantScope + explicit AND tenant_id=$N on top of FORCE RLS. Mutations
//   stamped + logAudit. PII (salary/national_id) is HR/Admin-only; license expiry,
//   leave state, worked-hours and net pay are all computed SERVER-SIDE (anti-spoof).
// ============================================================================

// fail-CLOSED tenant resolver (mirrors e16RequireTenant): trusted session tenant or null.
function e18RequireTenant(req) {
    const { tenantId, facilityId } = getRequestTenantContext(req);
    if (!tenantId) return { ok: false };               // fail-closed: no unscoped fallback
    return { ok: true, tenantId, facilityId };
}
// Dedicated-client tenant tx (pool.connect bypasses the patched pool.query wrapper, so
// app.tenant_id must be set explicitly for FORCE-RLS rows to be visible under FOR UPDATE).
async function e18BeginTenantTx(tenantId) {
    const client = await pool.connect();
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [String(tenantId)]);
    return client;
}

// ---- LICENSES: list with SERVER-SIDE expiry classification (SCFHS alerts) ----
app.get('/api/hr/licenses', requireAuth, requireRole('hr'), requireTenantScope, async (req, res) => {
    try {
        const t = e18RequireTenant(req);
        if (!t.ok) return res.status(403).json({ error: 'Tenant scope required' });
        const empId = e18.e18IntId(req.query.employee_id);
        const params = [t.tenantId];
        let q = 'SELECT l.*, e.name_en AS employee_name FROM hr_licenses l LEFT JOIN hr_employees e ON l.employee_id=e.id WHERE l.tenant_id=$1';
        if (empId) { q += ' AND l.employee_id=$2'; params.push(empId); }
        q += ' ORDER BY l.expiry_date ASC NULLS LAST, l.id ASC';
        const rows = (await pool.query(q, params)).rows;
        // expiry computed SERVER-SIDE — client never decides validity
        const out = rows.map(r => {
            const c = e18.licenseStatus(r.expiry_date, r.alert_days);
            return { ...r, expiry_status: c.status, days_to_expiry: c.daysToExpiry };
        });
        res.json(out);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ---- LICENSES: expiring/expired alert list (server-computed, on-demand) ----
app.get('/api/hr/licenses/alerts', requireAuth, requireRole('hr'), requireTenantScope, async (req, res) => {
    try {
        const t = e18RequireTenant(req);
        if (!t.ok) return res.status(403).json({ error: 'Tenant scope required' });
        const rows = (await pool.query(
            'SELECT l.*, e.name_en AS employee_name FROM hr_licenses l LEFT JOIN hr_employees e ON l.employee_id=e.id WHERE l.tenant_id=$1 ORDER BY l.expiry_date ASC NULLS LAST',
            [t.tenantId])).rows;
        const out = rows.map(r => {
            const c = e18.licenseStatus(r.expiry_date, r.alert_days);
            return { ...r, expiry_status: c.status, days_to_expiry: c.daysToExpiry };
        }).filter(r => r.expiry_status === 'expired' || r.expiry_status === 'expiring' || r.expiry_status === 'unknown');
        res.json(out);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ---- LICENSES: create ----
app.post('/api/hr/licenses', requireAuth, requireRole('hr'), requireTenantScope, async (req, res) => {
    try {
        const t = e18RequireTenant(req);
        if (!t.ok) return res.status(403).json({ error: 'Tenant scope required' });
        const empId = e18.e18IntId(req.body.employee_id);
        if (empId === null) return res.status(422).json({ error: 'Invalid employee_id' });
        // verify employee belongs to this tenant (IDOR guard, integer-compared id)
        const own = (await pool.query('SELECT id FROM hr_employees WHERE id=$1 AND tenant_id=$2', [empId, t.tenantId])).rows[0];
        if (!own) return res.status(404).json({ error: 'Employee not found' });
        const { license_type, license_number, authority, issue_date, expiry_date, alert_days, notes } = req.body;
        const alert = e18.e18Num(alert_days);
        const result = await pool.query(
            `INSERT INTO hr_licenses (employee_id, license_type, license_number, authority, issue_date, expiry_date, alert_days, notes, created_by, tenant_id, facility_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
            [empId, license_type || 'SCFHS', license_number || '', authority || 'SCFHS', issue_date || null,
             expiry_date || null, (alert !== null && alert >= 0) ? Math.floor(alert) : 30, notes || '',
             req.session.user?.display_name || '', t.tenantId, t.facilityId || null]);
        logAudit(req.session.user?.id, req.session.user?.display_name, 'CREATE_HR_LICENSE', 'HR', `License #${result.rows[0].id} for employee #${empId}`, req.ip);
        res.json(result.rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ---- SHIFTS: list ----
app.get('/api/hr/shifts', requireAuth, requireRole('hr'), requireTenantScope, async (req, res) => {
    try {
        const t = e18RequireTenant(req);
        if (!t.ok) return res.status(403).json({ error: 'Tenant scope required' });
        const empId = e18.e18IntId(req.query.employee_id);
        const params = [t.tenantId];
        let q = 'SELECT s.*, e.name_en AS employee_name FROM hr_shifts s LEFT JOIN hr_employees e ON s.employee_id=e.id WHERE s.tenant_id=$1';
        if (empId) { q += ' AND s.employee_id=$2'; params.push(empId); }
        q += ' ORDER BY s.shift_date DESC, s.start_time ASC';
        res.json((await pool.query(q, params)).rows);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ---- SHIFTS: create (server validates time + rejects overlap 409) ----
app.post('/api/hr/shifts', requireAuth, requireRole('hr'), requireTenantScope, async (req, res) => {
    try {
        const t = e18RequireTenant(req);
        if (!t.ok) return res.status(403).json({ error: 'Tenant scope required' });
        const empId = e18.e18IntId(req.body.employee_id);
        if (empId === null) return res.status(422).json({ error: 'Invalid employee_id' });
        const { shift_date, shift_name, start_time, end_time, department, notes } = req.body;
        if (!shift_date) return res.status(422).json({ error: 'shift_date required' });
        // server-authoritative time validation (start<end)
        const v = e18.validateShift(start_time, end_time);
        if (!v.ok) return res.status(422).json({ error: 'Invalid shift time: ' + v.error });
        const client = await e18BeginTenantTx(t.tenantId);
        try {
            const own = (await client.query('SELECT id FROM hr_employees WHERE id=$1 AND tenant_id=$2', [empId, t.tenantId])).rows[0];
            if (!own) { await client.query('ROLLBACK'); client.release(); return res.status(404).json({ error: 'Employee not found' }); }
            // lock same-day rows for this employee (ascending id) then overlap-check server-side
            const existing = (await client.query(
                'SELECT id, start_time, end_time FROM hr_shifts WHERE tenant_id=$1 AND employee_id=$2 AND shift_date=$3 AND status<>$4 ORDER BY id ASC FOR UPDATE',
                [t.tenantId, empId, shift_date, 'cancelled'])).rows;
            if (e18.hasShiftConflict(existing, { start_time, end_time })) {
                await client.query('ROLLBACK'); client.release();
                return res.status(409).json({ error: 'Shift overlaps an existing shift for this employee on this date' });
            }
            const result = (await client.query(
                `INSERT INTO hr_shifts (employee_id, shift_date, shift_name, start_time, end_time, department, notes, created_by, tenant_id, facility_id)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
                [empId, shift_date, shift_name || '', start_time, end_time, department || '', notes || '',
                 req.session.user?.display_name || '', t.tenantId, t.facilityId || null])).rows[0];
            await client.query('COMMIT'); client.release();
            logAudit(req.session.user?.id, req.session.user?.display_name, 'CREATE_HR_SHIFT', 'HR', `Shift #${result.id} for employee #${empId} on ${shift_date}`, req.ip);
            res.json(result);
        } catch (e) { try { await client.query('ROLLBACK'); } catch (_) {} client.release(); throw e; }
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ---- ATTENDANCE: clock-in/out (worked-hours computed SERVER-SIDE, never trusted) ----
app.post('/api/hr/attendance', requireAuth, requireRole('hr'), requireTenantScope, async (req, res) => {
    try {
        const t = e18RequireTenant(req);
        if (!t.ok) return res.status(403).json({ error: 'Tenant scope required' });
        const empId = e18.e18IntId(req.body.employee_id);
        if (empId === null) return res.status(422).json({ error: 'Invalid employee_id' });
        const own = (await pool.query('SELECT id FROM hr_employees WHERE id=$1 AND tenant_id=$2', [empId, t.tenantId])).rows[0];
        if (!own) return res.status(404).json({ error: 'Employee not found' });
        const { attendance_date, check_in, check_out, status } = req.body;
        // SERVER computes total_hours — client cannot supply it (anti-spoof). null when incomplete.
        const total = e18.computeWorkedHours(check_in, check_out);
        const result = await pool.query(
            `INSERT INTO hr_attendance (employee_id, attendance_date, check_in, check_out, total_hours, status, source, tenant_id, branch_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
            [empId, attendance_date || new Date().toISOString().slice(0, 10), check_in || '', check_out || '',
             total === null ? 0 : total, status || (check_out ? 'Present' : 'Open'), 'Manual', t.tenantId, t.facilityId || null]);
        logAudit(req.session.user?.id, req.session.user?.display_name, 'RECORD_HR_ATTENDANCE', 'HR', `Attendance for employee #${empId}`, req.ip);
        res.json({ ...result.rows[0], computed_hours: total });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ---- LEAVE REQUESTS: list ----
app.get('/api/hr/leave-requests', requireAuth, requireRole('hr'), requireTenantScope, async (req, res) => {
    try {
        const t = e18RequireTenant(req);
        if (!t.ok) return res.status(403).json({ error: 'Tenant scope required' });
        res.json((await pool.query(
            'SELECT r.*, e.name_en AS employee_name FROM hr_leave_requests r LEFT JOIN hr_employees e ON r.employee_id=e.id WHERE r.tenant_id=$1 ORDER BY r.id DESC',
            [t.tenantId])).rows);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ---- LEAVE REQUESTS: create (status forced 'requested'; days computed server-side) ----
app.post('/api/hr/leave-requests', requireAuth, requireRole('hr'), requireTenantScope, async (req, res) => {
    try {
        const t = e18RequireTenant(req);
        if (!t.ok) return res.status(403).json({ error: 'Tenant scope required' });
        const empId = e18.e18IntId(req.body.employee_id);
        if (empId === null) return res.status(422).json({ error: 'Invalid employee_id' });
        const { leave_type, start_date, end_date, reason } = req.body;
        // server computes inclusive days; rejects inverted/invalid range
        const days = e18.leaveDays(start_date, end_date);
        if (days === null) return res.status(422).json({ error: 'Invalid leave date range' });
        const own = (await pool.query('SELECT id FROM hr_employees WHERE id=$1 AND tenant_id=$2', [empId, t.tenantId])).rows[0];
        if (!own) return res.status(404).json({ error: 'Employee not found' });
        // status is server-authoritative: a new request is ALWAYS 'requested' (client cannot pre-approve)
        const result = await pool.query(
            `INSERT INTO hr_leave_requests (employee_id, leave_type, start_date, end_date, days, status, reason, requested_by, tenant_id, facility_id)
             VALUES ($1,$2,$3,$4,$5,'requested',$6,$7,$8,$9) RETURNING *`,
            [empId, leave_type || 'Annual', start_date, end_date, days, reason || '',
             req.session.user?.display_name || '', t.tenantId, t.facilityId || null]);
        logAudit(req.session.user?.id, req.session.user?.display_name, 'CREATE_LEAVE_REQUEST', 'HR', `Leave request #${result.rows[0].id} for employee #${empId} (${days}d)`, req.ip);
        res.json(result.rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ---- LEAVE REQUESTS: state transition (approve/deny/cancel) — 409 on invalid ----
app.put('/api/hr/leave-requests/:id/status', requireAuth, requireRole('hr'), requireTenantScope, async (req, res) => {
    try {
        const t = e18RequireTenant(req);
        if (!t.ok) return res.status(403).json({ error: 'Tenant scope required' });
        const id = e18.e18IntId(req.params.id);
        if (id === null) return res.status(404).json({ error: 'Not found' });
        const target = String(req.body.status || '').trim();
        if (!e18.LEAVE_STATUSES.includes(target)) return res.status(422).json({ error: 'Invalid target status' });
        const client = await e18BeginTenantTx(t.tenantId);
        try {
            const row = (await client.query('SELECT id, status FROM hr_leave_requests WHERE id=$1 AND tenant_id=$2 FOR UPDATE', [id, t.tenantId])).rows[0];
            if (!row) { await client.query('ROLLBACK'); client.release(); return res.status(404).json({ error: 'Not found' }); }
            // SERVER-SIDE state machine: reject invalid transition with 409
            if (!e18.canTransitionLeave(row.status, target)) {
                await client.query('ROLLBACK'); client.release();
                return res.status(409).json({ error: `Invalid leave transition ${row.status} -> ${target}` });
            }
            const denial = target === 'denied' ? (req.body.denial_reason || '') : '';
            const upd = (await client.query(
                `UPDATE hr_leave_requests SET status=$1, approved_by=$2, approved_at=now(), denial_reason=$3
                 WHERE id=$4 AND tenant_id=$5 RETURNING *`,
                [target, req.session.user?.display_name || '', denial, id, t.tenantId])).rows[0];
            await client.query('COMMIT'); client.release();
            logAudit(req.session.user?.id, req.session.user?.display_name, 'UPDATE_LEAVE_STATUS', 'HR', `Leave #${id}: ${row.status} -> ${target}`, req.ip);
            res.json(upd);
        } catch (e) { try { await client.query('ROLLBACK'); } catch (_) {} client.release(); throw e; }
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ---- PAYROLL SLIPS: list ----
app.get('/api/hr/payroll-slips', requireAuth, requireRole('hr'), requireTenantScope, async (req, res) => {
    try {
        const t = e18RequireTenant(req);
        if (!t.ok) return res.status(403).json({ error: 'Tenant scope required' });
        const month = String(req.query.month || '').trim();
        const params = [t.tenantId];
        let q = 'SELECT s.*, e.name_en AS employee_name FROM hr_payroll_slips s LEFT JOIN hr_employees e ON s.employee_id=e.id WHERE s.tenant_id=$1';
        if (month) { q += ' AND s.pay_month=$2'; params.push(month); }
        q += ' ORDER BY s.id DESC';
        res.json({ posting_enabled: e18.isPostingEnabled(), slips: (await pool.query(q, params)).rows });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ---- PAYROLL SLIP: generate computed DRAFT slip (NET PAY computed SERVER-SIDE) ----
// No GL posting here. Slips are draft/computed only. Posting is a separate, GATED step.
app.post('/api/hr/payroll-slips', requireAuth, requireRole('hr'), requireTenantScope, async (req, res) => {
    try {
        const t = e18RequireTenant(req);
        if (!t.ok) return res.status(403).json({ error: 'Tenant scope required' });
        const empId = e18.e18IntId(req.body.employee_id);
        if (empId === null) return res.status(422).json({ error: 'Invalid employee_id' });
        const month = String(req.body.pay_month || '').trim();
        if (!month) return res.status(422).json({ error: 'pay_month required' });
        // pull authoritative salary components from the employee master (NOT from client body)
        const emp = (await pool.query(
            'SELECT id, name_en, basic_salary, housing_allowance, transport_allowance, national_id FROM hr_employees WHERE id=$1 AND tenant_id=$2',
            [empId, t.tenantId])).rows[0];
        if (!emp) return res.status(404).json({ error: 'Employee not found' });
        // is_saudi inferred from national_id (starts with 1 = Saudi national); advances/other from body but clamped >=0 in engine
        const isSaudi = String(emp.national_id || '').trim().startsWith('1');
        const slip = e18.computePayrollSlip({
            basic_salary: emp.basic_salary,
            housing_allowance: emp.housing_allowance,
            transport_allowance: emp.transport_allowance,
            other_allowances: req.body.other_allowances,
            advances_deducted: req.body.advances_deducted,
            other_deductions: req.body.other_deductions,
            is_saudi: isSaudi
        });
        if (!slip.ok) return res.status(422).json({ error: 'Cannot compute slip: ' + slip.error });
        // upsert draft (unique per tenant+employee+month). NEVER auto-post.
        const result = await pool.query(
            `INSERT INTO hr_payroll_slips
               (employee_id, pay_month, basic, housing_allowance, transport_allowance, other_allowances,
                gross_earnings, gosi_deduction, advances_deducted, other_deductions, total_deductions,
                net_salary, status, posted, created_by, tenant_id, facility_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'draft',0,$13,$14,$15)
             ON CONFLICT (tenant_id, employee_id, pay_month)
               DO UPDATE SET basic=EXCLUDED.basic, housing_allowance=EXCLUDED.housing_allowance,
                 transport_allowance=EXCLUDED.transport_allowance, other_allowances=EXCLUDED.other_allowances,
                 gross_earnings=EXCLUDED.gross_earnings, gosi_deduction=EXCLUDED.gosi_deduction,
                 advances_deducted=EXCLUDED.advances_deducted, other_deductions=EXCLUDED.other_deductions,
                 total_deductions=EXCLUDED.total_deductions, net_salary=EXCLUDED.net_salary
               WHERE hr_payroll_slips.status='draft'
             RETURNING *`,
            [empId, month, slip.basic, slip.housing_allowance, slip.transport_allowance, slip.other_allowances,
             slip.gross_earnings, slip.gosi_deduction, slip.advances_deducted, slip.other_deductions,
             slip.total_deductions, slip.net_salary, req.session.user?.display_name || '', t.tenantId, t.facilityId || null]);
        if (!result.rows[0]) return res.status(409).json({ error: 'Slip exists and is not in draft (cannot recompute)' });
        logAudit(req.session.user?.id, req.session.user?.display_name, 'GENERATE_PAYROLL_SLIP', 'HR', `Draft slip #${result.rows[0].id} employee #${empId} ${month} net ${slip.net_salary}`, req.ip);
        res.json({ ...result.rows[0], posting_enabled: e18.isPostingEnabled() });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ---- PAYROLL SLIP: status transition. POSTING ('posted') is GATED OFF by flag (E10-style) ----
app.put('/api/hr/payroll-slips/:id/status', requireAuth, requireRole('hr'), requireTenantScope, async (req, res) => {
    try {
        const t = e18RequireTenant(req);
        if (!t.ok) return res.status(403).json({ error: 'Tenant scope required' });
        const id = e18.e18IntId(req.params.id);
        if (id === null) return res.status(404).json({ error: 'Not found' });
        const target = String(req.body.status || '').trim();
        if (!e18.SLIP_STATUSES.includes(target)) return res.status(422).json({ error: 'Invalid target status' });
        // HARD GATE: posting to GL is disabled by default. Reject 'posted' unless flag explicitly ON.
        if (target === 'posted' && !e18.isPostingEnabled()) {
            return res.status(403).json({ error: 'Payroll GL posting is disabled (HR_PAYROLL_POSTING_ENABLED is off)' });
        }
        const client = await e18BeginTenantTx(t.tenantId);
        try {
            const row = (await client.query('SELECT id, status FROM hr_payroll_slips WHERE id=$1 AND tenant_id=$2 FOR UPDATE', [id, t.tenantId])).rows[0];
            if (!row) { await client.query('ROLLBACK'); client.release(); return res.status(404).json({ error: 'Not found' }); }
            if (!e18.canTransitionSlip(row.status, target)) {
                await client.query('ROLLBACK'); client.release();
                return res.status(409).json({ error: `Invalid slip transition ${row.status} -> ${target}` });
            }
            const setPosted = target === 'posted';
            const upd = (await client.query(
                `UPDATE hr_payroll_slips SET status=$1, posted=$2, posted_at=$3 WHERE id=$4 AND tenant_id=$5 RETURNING *`,
                [target, setPosted ? 1 : 0, setPosted ? new Date() : null, id, t.tenantId])).rows[0];
            await client.query('COMMIT'); client.release();
            logAudit(req.session.user?.id, req.session.user?.display_name, 'UPDATE_PAYROLL_SLIP_STATUS', 'HR', `Slip #${id}: ${row.status} -> ${target}`, req.ip);
            res.json(upd);
        } catch (e) { try { await client.query('ROLLBACK'); } catch (_) {} client.release(); throw e; }
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ---- COMPETENCIES / CME: list + create (SCFHS compliance) ----
app.get('/api/hr/competencies', requireAuth, requireRole('hr'), requireTenantScope, async (req, res) => {
    try {
        const t = e18RequireTenant(req);
        if (!t.ok) return res.status(403).json({ error: 'Tenant scope required' });
        const empId = e18.e18IntId(req.query.employee_id);
        const params = [t.tenantId];
        let q = 'SELECT c.*, e.name_en AS employee_name FROM hr_competencies c LEFT JOIN hr_employees e ON c.employee_id=e.id WHERE c.tenant_id=$1';
        if (empId) { q += ' AND c.employee_id=$2'; params.push(empId); }
        q += ' ORDER BY c.id DESC';
        res.json((await pool.query(q, params)).rows);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/hr/competencies', requireAuth, requireRole('hr'), requireTenantScope, async (req, res) => {
    try {
        const t = e18RequireTenant(req);
        if (!t.ok) return res.status(403).json({ error: 'Tenant scope required' });
        const empId = e18.e18IntId(req.body.employee_id);
        if (empId === null) return res.status(422).json({ error: 'Invalid employee_id' });
        const own = (await pool.query('SELECT id FROM hr_employees WHERE id=$1 AND tenant_id=$2', [empId, t.tenantId])).rows[0];
        if (!own) return res.status(404).json({ error: 'Employee not found' });
        const cme = Math.max(0, e18.e18Num(req.body.cme_hours) ?? 0);
        const required = Math.max(0, e18.e18Num(req.body.required_hours) ?? 0);
        // compliance computed server-side (client cannot self-declare 'compliant')
        const status = required > 0 ? (cme >= required ? 'compliant' : 'non_compliant') : 'in_progress';
        const result = await pool.query(
            `INSERT INTO hr_competencies (employee_id, competency_name, cme_hours, required_hours, period_start, period_end, status, notes, created_by, tenant_id, facility_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
            [empId, req.body.competency_name || '', cme, required, req.body.period_start || null, req.body.period_end || null,
             status, req.body.notes || '', req.session.user?.display_name || '', t.tenantId, t.facilityId || null]);
        logAudit(req.session.user?.id, req.session.user?.display_name, 'CREATE_HR_COMPETENCY', 'HR', `Competency #${result.rows[0].id} for employee #${empId} (${status})`, req.ip);
        res.json(result.rows[0]);
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
            console.log(`\n  ✅ jumanaMedical Web is running!`);
            console.log(`  🌐 Open: http://localhost:${PORT}`);
            console.log(`  📦 Database: PostgreSQL (nama_medical_web)\n`);
        });
    } catch (err) {
        console.error('  ❌ Failed to start:', err.message);
        process.exit(1);
    }
}

// ===== PHARMACY & PRESCRIPTIONS =====
// CRITICAL-1 helper: derive the patient's CURRENT active medications from AUTHORITATIVE server-side
// sources (never the client body), scoped to patient + tenant. Sources:
//   1) pharmacy_prescriptions_queue rows not yet dispensed/cancelled (medication_name).
//   2) active/pending med-type orders (orders.type='med' -> order_items.catalog_ref) via the E-X tables.
// Returns a de-duplicated array of drug-name strings. RLS also enforces tenant isolation; the explicit
// tenant_id predicate is defense-in-depth. Caller treats a thrown error as FAIL-SAFE (warns, never skips).
async function getPatientActiveMeds(patientId, tenantId) {
    // I2: FAIL-CLOSED. Refuse to run unscoped — a falsy tenantId previously fell back to a cross-tenant query
    // that returned meds across ALL tenants. Both callers run behind requireTenantScope, so this is
    // defense-in-depth (the throw is treated FAIL-SAFE by callers, surfacing a warning, never a silent skip).
    if (!tenantId) throw new Error('tenantId required for getPatientActiveMeds');
    const meds = [];
    // 1) Pharmacy queue (not dispensed / cancelled)
    const qSql = "SELECT medication_name FROM pharmacy_prescriptions_queue WHERE patient_id=$1 AND tenant_id=$2 AND COALESCE(status,'') NOT IN ('Dispensed','Cancelled','Rejected')";
    const qParams = [patientId, tenantId];
    for (const r of (await pool.query(qSql, qParams)).rows) {
        if (r.medication_name) meds.push(String(r.medication_name));
    }
    // 2) Active/pending med-type orders (E-X orders/order_items). Best-effort: a missing orders table
    //    must not break the gate — but a real query error propagates so the caller fails SAFE (warns).
    try {
        const oSql = "SELECT oi.catalog_ref FROM order_items oi JOIN orders o ON oi.order_id=o.id WHERE o.patient_id=$1 AND o.tenant_id=$2 AND o.type='med' AND o.status IN ('pending','active')";
        const oParams = [patientId, tenantId];
        for (const r of (await pool.query(oSql, oParams)).rows) {
            if (r.catalog_ref) meds.push(String(r.catalog_ref));
        }
    } catch (e) {
        // orders table may be absent in some deployments; the queue source above still applies.
        // Do NOT swallow into a silent pass at the caller — but a missing-relation here is tolerated.
        if (!/relation .* does not exist/i.test(e.message || '')) throw e;
    }
    // de-duplicate (case-insensitive)
    const seen = new Set();
    return meds.filter(m => { const k = m.trim().toLowerCase(); if (!k || seen.has(k)) return false; seen.add(k); return true; });
}

// Doctor sends prescription → Pharmacy queue
app.post('/api/prescriptions', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const { patient_id, medication_name, dosage, quantity_per_day, frequency, duration, override_reason } = req.body;
        const { tenantId, facilityId } = getRequestTenantContext(req);
        let prescribedPatient = null;
        if (tenantId && patient_id) {
            const patientCheck = (await pool.query('SELECT id, allergies FROM patients WHERE id=$1 AND tenant_id=$2', [patient_id, tenantId])).rows[0];
            if (!patientCheck) return res.status(404).json({ error: 'Patient not found' });
            prescribedPatient = patientCheck;
        } else if (patient_id) {
            prescribedPatient = (await pool.query('SELECT id, allergies FROM patients WHERE id=$1', [patient_id])).rows[0] || null;
        }

        // E1 CDS GATE (clinical safety, FAIL-SAFE): allergy + dose + DRUG-DRUG INTERACTION checks
        // BEFORE writing. A CRITICAL alert HARD-STOPS with 422 unless override_reason is provided
        // (then the override is AUDITED). This ENHANCES (does not replace) the client
        // checkAllergyBeforePrescribe/checkDrugInteractions.
        let rxCdsAlerts = [];
        try {
            rxCdsAlerts = rxCdsAlerts
                .concat(cds.checkDrugAllergy(medication_name, prescribedPatient ? prescribedPatient.allergies : null))
                .concat(cds.checkDoseRange(medication_name, dosage, null));
        } catch (e) {
            // FAIL-SAFE: if the engine itself errors, surface a warning rather than silently passing.
            rxCdsAlerts.push({ rule: 'dose', severity: 'warning', message: 'CDS unavailable — verify manually',
                message_en: 'CDS unavailable — verify manually', message_ar: 'تعذّر تشغيل CDS — تأكد يدوياً', overridable: true, fail_safe: true });
        }
        // CRITICAL-1: server-side DRUG-DRUG interaction. The patient's CURRENT active medications are
        // queried SERVER-SIDE (never trusted from the client) from the pharmacy prescriptions queue
        // (not yet dispensed/cancelled) + active med-type orders, scoped to this patient + tenant.
        // The new drug is checked against that authoritative list. FAIL-SAFE: if the active-med
        // lookup fails we surface a warning (never silently skip the interaction check).
        if (patient_id && medication_name) {
            try {
                const activeMeds = await getPatientActiveMeds(patient_id, tenantId);
                const ddAlerts = cds.checkDrugDrugInteraction([medication_name].concat(activeMeds));
                rxCdsAlerts = rxCdsAlerts.concat(ddAlerts);
            } catch (e) {
                // FAIL-SAFE: cannot enumerate current meds => interaction check inconclusive => warn.
                rxCdsAlerts.push({ rule: 'drug-drug', severity: 'warning',
                    message: 'Active medications unavailable — interaction check inconclusive',
                    message_en: 'Active medications unavailable — interaction check inconclusive',
                    message_ar: 'تعذّر جلب الأدوية الفعالة — فحص التداخل غير حاسم', overridable: true, subjects: [], fail_safe: true });
            }
        }
        const rxDecision = cds.decide(rxCdsAlerts, override_reason);
        if (!rxDecision.allow) {
            logAudit(req.session.user?.id, req.session.user?.display_name, 'CDS_BLOCK', 'Pharmacy',
                `Blocked prescription for patient #${patient_id} (${medication_name}): ${rxCdsAlerts.filter(a => a.severity === 'critical').map(a => a.message_en || a.message).join('; ').slice(0, 200)}`, req.ip);
            return res.status(422).json({ error: 'CDS hard-stop', blocked: true, requires_override_reason: true, alerts: rxCdsAlerts });
        }
        const rxCriticals = rxCdsAlerts.filter(a => a.severity === 'critical');
        if (rxCriticals.length > 0 && rxDecision.reason) {
            logAudit(req.session.user?.id, req.session.user?.display_name, 'CDS_OVERRIDE', 'Pharmacy',
                `Override (CRITICAL) prescription patient #${patient_id} (${medication_name}). Reason: ${String(rxDecision.reason).slice(0, 160)}. Alerts: ${rxCriticals.map(a => a.message_en || a.message).join('; ').slice(0, 200)}`, req.ip);
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

// ============================================================================
// ===== E5 PHARMACY: FEFO BATCHES + PHARMACIST VERIFICATION + DISPENSE + CONTROLLED DRUGS =====
// Builds on E1 cds.js (REUSED — no duplicated matrix). CLINICAL-SAFETY: FAIL-CLOSED.
// Rules enforced here:
//   - FEFO: dispense from the earliest NON-EXPIRED batch first; NEVER from an expired batch;
//     insufficient on-hand across valid batches => 409 (no partial silent dispense).
//   - VERIFY: pharmacist re-runs the E1 CDS engine (allergy + dose + drug-drug) against the
//     patient's active meds queried SERVER-SIDE (getPatientActiveMeds — never trust client).
//     A CRITICAL alert HARD-STOPS (422) unless override_reason is supplied (then AUDITED).
//   - CONTROLLED: dispensing a controlled/high-alert drug REQUIRES a second witness id; missing
//     witness => 422 (fail-closed). A double-entry controlled_drug_log row records balance before/after.
//   - Every query carries an explicit tenant_id predicate (defense-in-depth on top of FORCE RLS);
//     null tenant in production is already blocked by requireTenantScope (fail-closed).
// ============================================================================

// Transaction helper: a SINGLE dedicated client with app.tenant_id bound for the WHOLE transaction.
// The patched pool.query binds tenant per-call only, so multi-statement RLS transactions must set
// app.tenant_id themselves on the client. Fail-closed: a null tenantId here means NO binding => RLS
// (FORCE) yields zero rows, so the transaction cannot touch any tenant's data.
async function withPharmacyTx(tenantId, fn) {
    const client = await pool.connect();
    try {
        await client.query("SELECT set_config('app.tenant_id', $1, false)", [tenantId ? String(tenantId) : '']);
        await client.query('BEGIN');
        const out = await fn(client);
        await client.query('COMMIT');
        return out;
    } catch (e) {
        try { await client.query('ROLLBACK'); } catch (_) { /* best-effort */ }
        throw e;
    } finally {
        try { await client.query("SELECT set_config('app.tenant_id', '', false)"); } catch (_) { /* reset best-effort */ }
        client.release();
    }
}

// --- GET pharmacy stock view: per-drug on-hand (sum of batches) + low-stock / near-expiry flags ---
app.get('/api/pharmacy/batches', requireAuth, requireRole('pharmacy'), requireTenantScope, async (req, res) => {
    try {
        const { tenantId } = getRequestTenantContext(req);
        const days = Math.max(1, parseInt(req.query.days, 10) || 90);
        // Explicit tenant_id predicate (defense-in-depth) + FORCE RLS. Null tenant blocked upstream.
        const rows = (await pool.query(
            `SELECT b.*, (b.expiry_date < CURRENT_DATE) AS is_expired,
                    (b.expiry_date < CURRENT_DATE + ($2::int * INTERVAL '1 day')) AS is_near_expiry
             FROM drug_batches b
             WHERE b.tenant_id=$1
             ORDER BY b.drug_id, b.expiry_date ASC`,
            [tenantId, days])).rows;
        res.json(rows);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// --- POST receive a drug batch (FEFO lot) ---
app.post('/api/pharmacy/batches', requireAuth, requireRole('pharmacy'), requireTenantScope, async (req, res) => {
    try {
        const { drug_id, drug_name, lot, expiry_date, qty_received, cost_price, supplier_id } = req.body;
        const { tenantId, facilityId } = getRequestTenantContext(req);
        if (!expiry_date || !/^\d{4}-\d{2}-\d{2}$/.test(String(expiry_date))) {
            return res.status(400).json({ error: 'expiry_date (YYYY-MM-DD) required' });
        }
        const qty = parseInt(qty_received, 10) || 0;
        if (qty <= 0) return res.status(400).json({ error: 'qty_received must be > 0' });
        // IDOR: if a drug_id is given, it must belong to this tenant.
        if (drug_id) {
            const d = (await pool.query('SELECT id FROM pharmacy_drug_catalog WHERE id=$1 AND tenant_id=$2', [drug_id, tenantId])).rows[0];
            if (!d) return res.status(404).json({ error: 'Drug not found' });
        }
        const r = await pool.query(
            `INSERT INTO drug_batches (tenant_id, branch_id, drug_id, drug_name, lot, expiry_date, qty_received, qty_on_hand, cost_price, supplier_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$7,$8,$9) RETURNING *`,
            [tenantId, facilityId || null, drug_id || null, drug_name || '', lot || '', expiry_date, qty, cost_price || 0, supplier_id || null]);
        logAudit(req.session.user?.id, req.session.user?.display_name, 'RECEIVE_BATCH', 'Pharmacy',
            `Received batch ${lot || ''} of ${drug_name || ('#' + drug_id)} qty:${qty} exp:${expiry_date}`, req.ip);
        res.json(r.rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// --- PUT pharmacist VERIFY: re-run E1 CDS engine (allergy + dose + drug-drug) at the pharmacist checkpoint ---
// Active meds are derived SERVER-SIDE (getPatientActiveMeds) — never trusted from the client (E1 CRITICAL-2 lesson).
app.put('/api/pharmacy/queue/:id/verify', requireAuth, requireRole('pharmacy'), requireTenantScope, async (req, res) => {
    try {
        const { override_reason } = req.body;
        const { tenantId } = getRequestTenantContext(req);
        // IDOR + tenant: the queue item must belong to this tenant.
        const rx = (await pool.query(
            'SELECT * FROM pharmacy_prescriptions_queue WHERE id=$1 AND tenant_id=$2', [req.params.id, tenantId])).rows[0];
        if (!rx) return res.status(404).json({ error: 'Queue item not found' });
        if (String(rx.status) === 'Dispensed') return res.status(409).json({ error: 'Already dispensed' });

        // patient allergies (tenant-scoped)
        let allergies = null;
        if (rx.patient_id) {
            const p = (await pool.query('SELECT allergies FROM patients WHERE id=$1 AND tenant_id=$2', [rx.patient_id, tenantId])).rows[0];
            allergies = p ? p.allergies : null;
        }
        // E1 CDS re-check (REUSED engine). FAIL-SAFE on engine/data errors -> warning, never silent pass.
        let alerts = [];
        try {
            alerts = alerts
                .concat(cds.checkDrugAllergy(rx.medication_name, allergies))
                .concat(cds.checkDoseRange(rx.medication_name, rx.dosage, null));
        } catch (e) {
            alerts.push({ rule: 'dose', severity: 'warning', message: 'CDS unavailable — verify manually',
                message_en: 'CDS unavailable — verify manually', message_ar: 'تعذّر تشغيل CDS — تأكد يدوياً', overridable: true, fail_safe: true });
        }
        if (rx.patient_id && rx.medication_name) {
            try {
                const activeMeds = await getPatientActiveMeds(rx.patient_id, tenantId);
                // exclude THIS queue item's own drug from the active list so it is not compared to itself
                const others = activeMeds.filter(m => String(m).trim().toLowerCase() !== String(rx.medication_name).trim().toLowerCase());
                alerts = alerts.concat(cds.checkDrugDrugInteraction([rx.medication_name].concat(others)));
            } catch (e) {
                alerts.push({ rule: 'drug-drug', severity: 'warning',
                    message: 'Active medications unavailable — interaction check inconclusive',
                    message_en: 'Active medications unavailable — interaction check inconclusive',
                    message_ar: 'تعذّر جلب الأدوية الفعالة — فحص التداخل غير حاسم', overridable: true, subjects: [], fail_safe: true });
            }
        }
        const decision = cds.decide(alerts, override_reason);
        if (!decision.allow) {
            logAudit(req.session.user?.id, req.session.user?.display_name, 'CDS_BLOCK', 'Pharmacy',
                `Pharmacist verify blocked queue #${req.params.id} (${rx.medication_name}): ${alerts.filter(a => a.severity === 'critical').map(a => a.message_en || a.message).join('; ').slice(0, 200)}`, req.ip);
            return res.status(422).json({ error: 'CDS hard-stop', blocked: true, requires_override_reason: true, alerts });
        }
        const criticals = alerts.filter(a => a.severity === 'critical');
        if (criticals.length > 0 && decision.reason) {
            logAudit(req.session.user?.id, req.session.user?.display_name, 'CDS_OVERRIDE', 'Pharmacy',
                `Pharmacist override (CRITICAL) verify queue #${req.params.id} (${rx.medication_name}). Reason: ${String(decision.reason).slice(0, 160)}. Alerts: ${criticals.map(a => a.message_en || a.message).join('; ').slice(0, 200)}`, req.ip);
        }
        await pool.query(
            "UPDATE pharmacy_prescriptions_queue SET status='Verified', verified_by=$1, verified_at=CURRENT_TIMESTAMP WHERE id=$2 AND tenant_id=$3",
            [req.session.user?.id || 0, req.params.id, tenantId]);
        logAudit(req.session.user?.id, req.session.user?.display_name, 'PHARMACY_VERIFY', 'Pharmacy',
            `Verified queue #${req.params.id} (${rx.medication_name})`, req.ip);
        res.json({ success: true, status: 'Verified', alerts });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// --- POST FEFO DISPENSE (by barcode or drug_id): single transaction, decrements earliest non-expired batch first ---
// Requires the queue item to be 'Verified'. Controlled drugs require a witness (fail-closed).
app.post('/api/pharmacy/dispense', requireAuth, requireRole('pharmacy'), requireTenantScope, async (req, res) => {
    try {
        const { prescription_id, barcode, drug_id: bodyDrugId, quantity, witness_user_id, price, payment_method } = req.body;
        const { tenantId, facilityId } = getRequestTenantContext(req);
        const qty = parseInt(quantity, 10) || 0;
        if (qty <= 0) return res.status(400).json({ error: 'quantity must be > 0' });

        // 1) Resolve + tenant-check the queue item; it MUST be Verified before any stock moves.
        const rx = (await pool.query(
            'SELECT * FROM pharmacy_prescriptions_queue WHERE id=$1 AND tenant_id=$2', [prescription_id, tenantId])).rows[0];
        if (!rx) return res.status(404).json({ error: 'Queue item not found' });
        if (String(rx.status) === 'Dispensed') return res.status(409).json({ error: 'Already dispensed' });
        if (String(rx.status) !== 'Verified') return res.status(409).json({ error: 'Prescription must be Verified before dispensing' });

        // 2) Resolve the drug (by barcode or drug_id), tenant-scoped (IDOR + RLS).
        let drug;
        if (barcode) {
            drug = (await pool.query('SELECT * FROM pharmacy_drug_catalog WHERE barcode=$1 AND tenant_id=$2', [barcode, tenantId])).rows[0];
        } else if (bodyDrugId) {
            drug = (await pool.query('SELECT * FROM pharmacy_drug_catalog WHERE id=$1 AND tenant_id=$2', [bodyDrugId, tenantId])).rows[0];
        }
        if (!drug) return res.status(404).json({ error: 'Drug not found' });

        // 3) Controlled fail-closed: a controlled/high-alert drug CANNOT be dispensed without a witness.
        const isControlled = !!(drug.is_controlled && Number(drug.is_controlled) > 0);
        if (isControlled && !witness_user_id) {
            return res.status(422).json({ error: 'Controlled drug requires a second witness', requires_witness: true });
        }
        if (isControlled && witness_user_id && String(witness_user_id) === String(req.session.user?.id)) {
            return res.status(422).json({ error: 'Witness must be a different user', requires_witness: true });
        }

        // 4) Transactional FEFO decrement + dispense ledger (+ controlled double-log) + invoice.
        const result = await withPharmacyTx(tenantId, async (client) => {
            // FEFO: earliest NON-EXPIRED batch first; lock rows to avoid concurrent over-dispense.
            const batches = (await client.query(
                `SELECT * FROM drug_batches
                 WHERE tenant_id=$1 AND drug_id=$2 AND qty_on_hand > 0 AND expiry_date >= CURRENT_DATE
                 ORDER BY expiry_date ASC, id ASC
                 FOR UPDATE`,
                [tenantId, drug.id])).rows;
            const totalAvailable = batches.reduce((s, b) => s + (parseInt(b.qty_on_hand, 10) || 0), 0);
            if (totalAvailable < qty) {
                return { conflict: true, available: totalAvailable };
            }
            // I2: controlled-register balance must come from the AUTHORITATIVE batch sum
            // (SUM(drug_batches.qty_on_hand)), not the denormalized catalog stock_qty. Computed
            // here under the FOR UPDATE lock, tenant-scoped, so it is consistent within the tx.
            const balanceBefore = parseInt((await client.query(
                'SELECT COALESCE(SUM(qty_on_hand),0) AS bal FROM drug_batches WHERE tenant_id=$1 AND drug_id=$2',
                [tenantId, drug.id])).rows[0].bal, 10) || 0;
            const balanceAfter = balanceBefore - qty;
            let remaining = qty;
            const consumed = [];
            for (const b of batches) {
                if (remaining <= 0) break;
                const take = Math.min(remaining, parseInt(b.qty_on_hand, 10) || 0);
                const newQty = (parseInt(b.qty_on_hand, 10) || 0) - take;
                await client.query('UPDATE drug_batches SET qty_on_hand=$1 WHERE id=$2 AND tenant_id=$3', [newQty, b.id, tenantId]);
                consumed.push({ batch_id: b.id, lot: b.lot, expiry_date: b.expiry_date, qty: take });
                remaining -= take;
            }
            // keep the catalog cached stock_qty in sync (derived sum) + write the raw stock movement log.
            const prevCatalog = parseInt(drug.stock_qty, 10) || 0;
            const newCatalog = Math.max(0, prevCatalog - qty);
            await client.query('UPDATE pharmacy_drug_catalog SET stock_qty=$1 WHERE id=$2 AND tenant_id=$3', [newCatalog, drug.id, tenantId]);
            await client.query(
                'INSERT INTO pharmacy_stock_log (drug_id, drug_name, movement_type, quantity, previous_qty, new_qty, reason, patient_id, prescription_id, performed_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
                [drug.id, drug.drug_name, 'OUT', qty, prevCatalog, newCatalog, 'Dispensed (FEFO)', rx.patient_id, prescription_id, req.session.user?.display_name || '']);

            // dispense ledger line (one per FEFO batch consumed)
            const dispenseIds = [];
            for (const c of consumed) {
                const d = await client.query(
                    `INSERT INTO pharmacy_dispense (tenant_id, branch_id, prescription_id, patient_id, drug_id, drug_batch_id, drug_name, qty, verified_by, verified_at, dispensed_by, status)
                     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'Dispensed') RETURNING id`,
                    [tenantId, facilityId || null, prescription_id, rx.patient_id, drug.id, c.batch_id, drug.drug_name, c.qty, rx.verified_by || null, rx.verified_at || null, req.session.user?.id || 0]);
                dispenseIds.push(d.rows[0].id);
            }

            // controlled double-entry register (fail-closed witness already enforced above)
            if (isControlled) {
                await client.query(
                    `INSERT INTO controlled_drug_log (tenant_id, branch_id, drug_id, drug_name, drug_batch_id, dispense_id, prescription_id, patient_id, qty, balance_before, balance_after, schedule_class, dispensed_by, witnessed_by)
                     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
                    [tenantId, facilityId || null, drug.id, drug.drug_name, consumed[0] ? consumed[0].batch_id : null, dispenseIds[0] || null,
                     prescription_id, rx.patient_id, qty, balanceBefore, balanceAfter, drug.schedule_class || 'controlled', req.session.user?.id || 0, witness_user_id]);
            }

            // mark the queue item Dispensed
            await client.query(
                "UPDATE pharmacy_prescriptions_queue SET status='Dispensed', dispensed_by=$1, dispensed_at=CURRENT_TIMESTAMP, price=$2, payment_method=$3 WHERE id=$4 AND tenant_id=$5",
                [req.session.user?.display_name || '', price || 0, payment_method || 'Cash', prescription_id, tenantId]);

            // invoice (VAT) when priced — mirror the legacy dispense path
            if (price && price > 0 && rx.patient_id) {
                const patient = (await client.query('SELECT name_ar, name_en FROM patients WHERE id=$1 AND tenant_id=$2', [rx.patient_id, tenantId])).rows[0];
                const vat = await calcVAT(rx.patient_id);
                const { total: finalTotal, vatAmount } = addVAT(price, vat.rate);
                await client.query(
                    `INSERT INTO invoices (patient_id, patient_name, total, amount, vat_amount, description, service_type, paid, payment_method, tenant_id, facility_id)
                     VALUES ($1,$2,$3,$4,$5,$6,'Pharmacy',1,$7,$8,$9)`,
                    [rx.patient_id, patient?.name_ar || patient?.name_en || '', finalTotal, price, vatAmount,
                     `Pharmacy: ${rx.prescription_text || drug.drug_name}`, payment_method || 'Cash', tenantId, facilityId || null]);
            }

            // near-expiry / low-stock notifications (best-effort, inside tx)
            if (newCatalog <= (drug.min_qty || drug.min_stock_level || 10)) {
                await client.query('INSERT INTO notifications (target_role, title, message, type, module) VALUES ($1,$2,$3,$4,$5)',
                    ['Pharmacist', 'Low Stock Alert', `${drug.drug_name} stock: ${newCatalog}`, 'warning', 'Pharmacy']);
            }
            return { consumed, dispenseIds, new_stock: newCatalog, isControlled };
        });

        if (result && result.conflict) {
            return res.status(409).json({ error: 'Insufficient stock', available: result.available });
        }
        logAudit(req.session.user?.id, req.session.user?.display_name, 'DISPENSE_FEFO', 'Pharmacy',
            `FEFO dispense queue #${prescription_id} ${drug.drug_name} qty:${qty} batches:${result.consumed.map(c => c.lot || c.batch_id).join(',')}`, req.ip);
        if (result.isControlled) {
            logAudit(req.session.user?.id, req.session.user?.display_name, 'CONTROLLED_DISPENSE', 'Pharmacy',
                `Controlled dispense ${drug.drug_name} qty:${qty} witness:#${witness_user_id} (double-logged)`, req.ip);
            logAudit(witness_user_id, '(witness)', 'CONTROLLED_WITNESS', 'Pharmacy',
                `Witnessed controlled dispense ${drug.drug_name} qty:${qty} dispenser:#${req.session.user?.id}`, req.ip);
        }
        res.json({ success: true, dispensed: qty, batches: result.consumed, new_stock: result.new_stock });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// --- Wasfaty / NPHIES coverage stub (gated; NO external call) ---
// Behind WASFATY_ENABLED. Records coverage INTENT only — never opens a real connection.
app.post('/api/pharmacy/wasfaty/dispense-intent', requireAuth, requireRole('pharmacy'), requireTenantScope, async (req, res) => {
    if (String(process.env.WASFATY_ENABLED || '').toLowerCase() !== 'true') {
        return res.status(503).json({ error: 'Wasfaty/NPHIES integration disabled', enabled: false });
    }
    try {
        const { prescription_id } = req.body;
        const { tenantId } = getRequestTenantContext(req);
        // stub: verify the rx belongs to this tenant, then record intent. No external network I/O.
        const rx = (await pool.query('SELECT id FROM pharmacy_prescriptions_queue WHERE id=$1 AND tenant_id=$2', [prescription_id, tenantId])).rows[0];
        if (!rx) return res.status(404).json({ error: 'Queue item not found' });
        logAudit(req.session.user?.id, req.session.user?.display_name, 'WASFATY_INTENT', 'Pharmacy',
            `Recorded Wasfaty coverage intent for queue #${prescription_id} (stub, no external call)`, req.ip);
        res.json({ success: true, recorded: true, external_call: false, note: 'stub — coverage intent recorded only' });
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

// ===== DRUG EXPIRY ALERTS (E5: FEFO-accurate, repointed to drug_batches DATE per lot) =====
app.get('/api/pharmacy/expiring', requireAuth, requireRole('pharmacy'), requireTenantScope, async (req, res) => {
    try {
        const days = Math.max(1, parseInt(req.query.days, 10) || 90);
        const { tenantId } = getRequestTenantContext(req);
        // Explicit tenant_id predicate (defense-in-depth) + FORCE RLS. Per-lot DATE expiry; only
        // batches with stock on hand. Flags already-expired vs near-expiry windows.
        const query =
            `SELECT b.*, (b.expiry_date < CURRENT_DATE) AS is_expired
             FROM drug_batches b
             WHERE b.tenant_id=$1 AND b.qty_on_hand > 0
               AND b.expiry_date <= (CURRENT_DATE + ($2::int * INTERVAL '1 day'))
             ORDER BY b.expiry_date ASC`;
        const expiring = (await pool.query(query, [tenantId, days])).rows;
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
        if (req.session.user?.role !== 'Admin') return res.status(403).json({ error: 'Admin only' });
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
app.post('/api/nursing/assessment', requireAuth, requireRole('nursing', 'doctor'), requireTenantScope, async (req, res) => {
    try {
        const { patient_id, pain_scale, notes } = req.body;
        const { tenantId } = getRequestTenantContext(req);
        if (!tenantId) return res.status(403).json({ error: 'Tenant scope required' });
        // item 2: do NOT trust client-sent fall_risk_score/braden_score as authoritative scores.
        // The pain band is computed SERVER-SIDE from the raw numeric pain_scale; authoritative
        // Morse/Braden/NEWS scoring goes through POST /api/nursing/scores (server-derived).
        const pain = nursingScores.computePainBand(pain_scale);
        // item 3: SELECT/UPDATE carry explicit AND tenant_id=$N so a cross-tenant write is impossible.
        const vitals = (await pool.query(
            'SELECT id FROM nursing_vitals WHERE patient_id=$1 AND tenant_id=$2 ORDER BY id DESC LIMIT 1',
            [patient_id, tenantId])).rows[0];
        if (vitals) {
            await pool.query('UPDATE nursing_vitals SET notes=$1 WHERE id=$2 AND tenant_id=$3', [
                JSON.stringify({ pain_scale: pain.score, pain_band: pain.band, notes, assessed_at: new Date().toISOString() }),
                vitals.id, tenantId
            ]);
        }
        res.json({ success: true, pain_score: pain.score, pain_band: pain.band });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== BACKUP ENDPOINT =====
app.get('/api/admin/backup-info', requireAuth, async (req, res) => {
    try {
        if (req.session.user?.role !== 'Admin') return res.status(403).json({ error: 'Admin only' });
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


// ============================================================================
// ===== OB/GYN / MATERNITY DEPARTMENT (Epic E14) =====
// HARDENED: every route requires auth + RBAC(obgyn/antenatal) + requireTenantScope.
// Every query carries an explicit `AND tenant_id=$N` on top of FORCE RLS. Patient /
// pregnancy / delivery ownership is verified against the caller's tenant; cross-tenant
// access returns 404 (never leak existence). Authority fields (EDD, GA, GPAL living,
// APGAR total, biometry GA/percentile, risk flags) are computed SERVER-SIDE via
// ob_engine (anti-spoof — client-submitted values are ignored). Delivery is gated by a
// server-side state machine (Active -> Delivered only) with SELECT ... FOR UPDATE.
// IDs are compared as integers (parseInt + Number.isInteger), never string-coerced.
// ============================================================================

// e14RequireTenant — fail-closed tenant resolver for OB routes. Returns an integer
// tenantId or null; callers MUST treat null as "block" (no unscoped fallback in prod).
function e14RequireTenant(req) {
    const { tenantId } = getRequestTenantContext(req);
    if (tenantId === null || tenantId === undefined || tenantId === '') return null;
    const t = parseInt(tenantId, 10);
    return Number.isInteger(t) ? t : null;
}
function e14IntId(v) { const n = parseInt(v, 10); return Number.isInteger(n) ? n : null; }

// Verify a patient belongs to the caller's tenant. Returns the integer id or null.
async function e14PatientInTenant(patientId, tenantId) {
    const pid = e14IntId(patientId);
    if (pid === null) return null;
    const row = (await pool.query('SELECT id FROM patients WHERE id=$1 AND tenant_id=$2', [pid, tenantId])).rows[0];
    return row ? pid : null;
}
// Load a tenant-owned pregnancy row (or null). Used for ownership + state checks.
async function e14PregnancyInTenant(pregnancyId, tenantId) {
    const id = e14IntId(pregnancyId);
    if (id === null) return null;
    const row = (await pool.query('SELECT * FROM obgyn_pregnancies WHERE id=$1 AND tenant_id=$2', [id, tenantId])).rows[0];
    return row || null;
}

const OB_RBAC = ['obgyn', 'antenatal', 'doctor', 'nursing'];

// Pregnancy Records — list (tenant-scoped; integer-validated filters)
app.get('/api/obgyn/pregnancies', requireAuth, requireRole(...OB_RBAC), requireTenantScope, async (req, res) => {
    try {
        const tenantId = e14RequireTenant(req);
        if (tenantId === null) return res.status(403).json({ error: 'Tenant scope required' });
        const { patient_id, status } = req.query;
        let q = 'SELECT * FROM obgyn_pregnancies WHERE tenant_id=$1';
        const params = [tenantId];
        if (patient_id) { const pid = e14IntId(patient_id); if (pid === null) return res.status(400).json({ error: 'Invalid patient_id' }); params.push(pid); q += ' AND patient_id=$' + params.length; }
        if (status) { params.push(String(status)); q += ' AND status=$' + params.length; }
        q += ' ORDER BY created_at DESC';
        res.json((await pool.query(q, params)).rows);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/obgyn/pregnancies', requireAuth, requireRole(...OB_RBAC), requireTenantScope, async (req, res) => {
    try {
        const tenantId = e14RequireTenant(req);
        if (tenantId === null) return res.status(403).json({ error: 'Tenant scope required' });
        const { patient_id, lmp, gravida, para, abortions, living_children,
            blood_group, rh_factor, risk_level, pre_pregnancy_weight, height,
            allergies, chronic_conditions, previous_cs, previous_complications,
            husband_name, husband_blood_group, attending_doctor } = req.body;

        // Cross-tenant guard: patient MUST belong to caller's tenant -> else 404
        const pid = await e14PatientInTenant(patient_id, tenantId);
        if (pid === null) return res.status(404).json({ error: 'Patient not found' });
        // resolve canonical patient name server-side (don't trust client display name)
        const patientRow = (await pool.query('SELECT COALESCE(name_ar, name_en, full_name, name, \'\') AS nm FROM patients WHERE id=$1 AND tenant_id=$2', [pid, tenantId])).rows[0];
        const patientName = patientRow ? patientRow.nm : '';

        // Anti-spoof: EDD via Naegele + GPAL validated/derived server-side.
        const edd = obEngine.computeEDD(lmp); // null if LMP invalid (stored as NULL — never guessed)
        const gpal = obEngine.computeGPAL({ gravida, para, abortion: abortions, living: living_children });
        if (!gpal.ok) return res.status(422).json({ error: 'Invalid obstetric history (GPAL): ' + gpal.error });

        const result = await pool.query(
            `INSERT INTO obgyn_pregnancies (tenant_id, patient_id, patient_name, lmp, edd, gravida, para, abortions, living_children,
             blood_group, rh_factor, risk_level, pre_pregnancy_weight, height, allergies, chronic_conditions,
             previous_cs, previous_complications, husband_name, husband_blood_group, attending_doctor, status, created_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23) RETURNING *`,
            [tenantId, pid, patientName, lmp || null, edd, gpal.gravida, gpal.para, gpal.abortion, gpal.living,
                blood_group || '', rh_factor || '', risk_level || 'Low', pre_pregnancy_weight || 0, height || 0,
                allergies || '', chronic_conditions || '', e14IntId(previous_cs) || 0, previous_complications || '',
                husband_name || '', husband_blood_group || '', attending_doctor || '', 'Active', req.session.user?.display_name || '']);
        logAudit(req.session.user?.id, req.session.user?.display_name, 'CREATE_PREGNANCY', 'OB/GYN',
            `Pregnancy for patient #${pid} (G${gpal.gravida}P${gpal.para}A${gpal.abortion}L${gpal.living}) LMP ${lmp || 'n/a'} EDD ${edd || 'n/a'}`, req.ip);
        res.json(result.rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.put('/api/obgyn/pregnancies/:id', requireAuth, requireRole(...OB_RBAC), requireTenantScope, async (req, res) => {
    try {
        const tenantId = e14RequireTenant(req);
        if (tenantId === null) return res.status(403).json({ error: 'Tenant scope required' });
        const preg = await e14PregnancyInTenant(req.params.id, tenantId);
        if (!preg) return res.status(404).json({ error: 'Pregnancy not found' });

        // Whitelist updatable columns only — never accept id/tenant_id/patient_id/created_* /
        // authority fields (edd, living_children, status) from the client.
        const ALLOWED = new Set(['blood_group', 'rh_factor', 'risk_level', 'pre_pregnancy_weight', 'height',
            'allergies', 'chronic_conditions', 'previous_cs', 'previous_complications',
            'husband_name', 'husband_blood_group', 'attending_doctor']);
        const sets = [], params = [];
        for (const [k, v] of Object.entries(req.body || {})) {
            if (!ALLOWED.has(k)) continue;
            params.push(v); sets.push(k + '=$' + params.length);
        }
        // Recompute EDD only if a new LMP is supplied (authority field, server-derived).
        if (req.body && req.body.lmp) {
            const newEdd = obEngine.computeEDD(req.body.lmp);
            params.push(req.body.lmp); sets.push('lmp=$' + params.length);
            params.push(newEdd); sets.push('edd=$' + params.length);
        }
        // GPAL re-derivation when any component supplied.
        if (req.body && (req.body.gravida !== undefined || req.body.para !== undefined || req.body.abortions !== undefined || req.body.living_children !== undefined)) {
            const g = obEngine.computeGPAL({
                gravida: req.body.gravida ?? preg.gravida, para: req.body.para ?? preg.para,
                abortion: req.body.abortions ?? preg.abortions, living: req.body.living_children ?? preg.living_children
            });
            if (!g.ok) return res.status(422).json({ error: 'Invalid GPAL: ' + g.error });
            params.push(g.gravida); sets.push('gravida=$' + params.length);
            params.push(g.para); sets.push('para=$' + params.length);
            params.push(g.abortion); sets.push('abortions=$' + params.length);
            params.push(g.living); sets.push('living_children=$' + params.length);
        }
        if (!sets.length) return res.json(preg);
        params.push(preg.id); params.push(tenantId);
        await pool.query('UPDATE obgyn_pregnancies SET ' + sets.join(',') + ',updated_at=NOW() WHERE id=$' + (params.length - 1) + ' AND tenant_id=$' + params.length, params);
        logAudit(req.session.user?.id, req.session.user?.display_name, 'UPDATE_PREGNANCY', 'OB/GYN', `Pregnancy #${preg.id} updated`, req.ip);
        res.json((await pool.query('SELECT * FROM obgyn_pregnancies WHERE id=$1 AND tenant_id=$2', [preg.id, tenantId])).rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// Antenatal Visits — read (verify pregnancy ownership first)
app.get('/api/obgyn/antenatal/:pregnancy_id', requireAuth, requireRole(...OB_RBAC), requireTenantScope, async (req, res) => {
    try {
        const tenantId = e14RequireTenant(req);
        if (tenantId === null) return res.status(403).json({ error: 'Tenant scope required' });
        const preg = await e14PregnancyInTenant(req.params.pregnancy_id, tenantId);
        if (!preg) return res.status(404).json({ error: 'Pregnancy not found' });
        res.json((await pool.query('SELECT * FROM obgyn_antenatal_visits WHERE pregnancy_id=$1 AND tenant_id=$2 ORDER BY visit_number DESC', [preg.id, tenantId])).rows);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/obgyn/antenatal', requireAuth, requireRole(...OB_RBAC), requireTenantScope, async (req, res) => {
    try {
        const tenantId = e14RequireTenant(req);
        if (tenantId === null) return res.status(403).json({ error: 'Tenant scope required' });
        const { pregnancy_id, gestational_age, weight, blood_pressure,
            systolic, diastolic, fundal_height, fetal_heart_rate, fetal_presentation,
            fetal_movement, edema, proteinuria, glucose_urine, hemoglobin,
            complaints, examination_notes, plan, next_visit } = req.body;
        // Ownership: pregnancy must belong to caller's tenant -> else 404
        const preg = await e14PregnancyInTenant(pregnancy_id, tenantId);
        if (!preg) return res.status(404).json({ error: 'Pregnancy not found' });
        const pid = preg.patient_id;

        const count = (await pool.query('SELECT COUNT(*) as cnt FROM obgyn_antenatal_visits WHERE pregnancy_id=$1 AND tenant_id=$2', [preg.id, tenantId])).rows[0].cnt;
        const firstVisit = (await pool.query('SELECT weight FROM obgyn_antenatal_visits WHERE pregnancy_id=$1 AND tenant_id=$2 ORDER BY visit_number LIMIT 1', [preg.id, tenantId])).rows[0];
        const wGain = firstVisit ? ((Number(weight) || 0) - (Number(firstVisit.weight) || 0)) : 0;
        // Server-derived GA label from stored LMP (anti-spoof; client value advisory only).
        const gaCalc = obEngine.gestationalAgeFromLMP(preg.lmp, next_visit || undefined);
        const gaLabel = gaCalc ? gaCalc.label : (gestational_age || '');
        // Server-side risk classification (client risk_flags ignored).
        const flags = obEngine.antenatalRiskFlags({ systolic, diastolic, proteinuria, hemoglobin, fetal_heart_rate, fetal_movement });

        const result = await pool.query(
            `INSERT INTO obgyn_antenatal_visits (tenant_id, pregnancy_id, patient_id, visit_number, gestational_age, weight, weight_gain,
             blood_pressure, systolic, diastolic, fundal_height, fetal_heart_rate, fetal_presentation,
             fetal_movement, edema, proteinuria, glucose_urine, hemoglobin, complaints, examination_notes,
             plan, next_visit, doctor, risk_flags) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24) RETURNING *`,
            [tenantId, preg.id, pid, parseInt(count) + 1, gaLabel, weight || 0, wGain,
                blood_pressure || '', e14IntId(systolic) || 0, e14IntId(diastolic) || 0, fundal_height || 0, e14IntId(fetal_heart_rate) || 0,
                fetal_presentation || '', fetal_movement || 'Active', edema || 'None', proteinuria || 'Negative',
                glucose_urine || 'Negative', hemoglobin || 0, complaints || '', examination_notes || '',
                plan || '', next_visit || null, req.session.user?.display_name || '', flags.join(', ')]);
        if (flags.length) {
            await pool.query('INSERT INTO notifications (target_role, title, message, type, module) VALUES ($1,$2,$3,$4,$5)',
                ['Doctor', 'OB/GYN Risk Alert', 'Patient #' + pid + ': ' + flags.join(', '), 'warning', 'OB/GYN']);
        }
        logAudit(req.session.user?.id, req.session.user?.display_name, 'ANTENATAL_VISIT', 'OB/GYN',
            `Antenatal visit pregnancy #${preg.id} GA ${gaLabel}${flags.length ? ' flags:' + flags.join('/') : ''}`, req.ip);
        res.json(result.rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== PARTOGRAM (labor progression trend; tenant-scoped) =====
app.get('/api/obgyn/partogram/:pregnancy_id', requireAuth, requireRole(...OB_RBAC), requireTenantScope, async (req, res) => {
    try {
        const tenantId = e14RequireTenant(req);
        if (tenantId === null) return res.status(403).json({ error: 'Tenant scope required' });
        const preg = await e14PregnancyInTenant(req.params.pregnancy_id, tenantId);
        if (!preg) return res.status(404).json({ error: 'Pregnancy not found' });
        res.json((await pool.query('SELECT * FROM obgyn_partogram WHERE pregnancy_id=$1 AND tenant_id=$2 ORDER BY recorded_at ASC, id ASC', [preg.id, tenantId])).rows);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/obgyn/partogram', requireAuth, requireRole(...OB_RBAC), requireTenantScope, async (req, res) => {
    try {
        const tenantId = e14RequireTenant(req);
        if (tenantId === null) return res.status(403).json({ error: 'Tenant scope required' });
        const b = req.body || {};
        const preg = await e14PregnancyInTenant(b.pregnancy_id, tenantId);
        if (!preg) return res.status(404).json({ error: 'Pregnancy not found' });
        // Server-side alert flags from this timepoint (anti-spoof).
        const flags = obEngine.antenatalRiskFlags({ fetal_heart_rate: b.fetal_heart_rate_baseline });
        const dil = e14IntId(b.cervical_dilation);
        if (dil !== null && (dil < 0 || dil > 10)) return res.status(422).json({ error: 'cervical_dilation must be 0-10' });
        const result = await pool.query(
            `INSERT INTO obgyn_partogram (tenant_id, pregnancy_id, patient_id, cervical_dilation, cervical_effacement,
             descent_station, contractions_per_10min, contraction_duration, contraction_intensity,
             fetal_heart_rate_baseline, fetal_heart_rate_variability, decelerations, molding, caput_succedaneum,
             meconium, amniotic_fluid, maternal_bp, maternal_hr, maternal_temp, oxytocin_units, notes, alert_flags, recorded_by, recorded_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23, NOW()) RETURNING *`,
            [tenantId, preg.id, preg.patient_id, dil || 0, e14IntId(b.cervical_effacement) || 0,
                e14IntId(b.descent_station) || 0, e14IntId(b.contractions_per_10min) || 0, e14IntId(b.contraction_duration) || 0, b.contraction_intensity || '',
                e14IntId(b.fetal_heart_rate_baseline) || 0, b.fetal_heart_rate_variability || '', b.decelerations || 'None', b.molding || 'None', b.caput_succedaneum || 'None',
                b.meconium ? 1 : 0, b.amniotic_fluid || '', b.maternal_bp || '', e14IntId(b.maternal_hr) || 0, b.maternal_temp || 0, b.oxytocin_units || 0, b.notes || '', flags.join(', '), req.session.user?.display_name || '']);
        logAudit(req.session.user?.id, req.session.user?.display_name, 'PARTOGRAM_ENTRY', 'OB/GYN',
            `Partogram pregnancy #${preg.id} dil ${dil || 0}cm FHR ${e14IntId(b.fetal_heart_rate_baseline) || 0}`, req.ip);
        res.json(result.rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// Ultrasound Records — biometry -> GA/percentile computed server-side
app.get('/api/obgyn/ultrasounds/:pregnancy_id', requireAuth, requireRole(...OB_RBAC), requireTenantScope, async (req, res) => {
    try {
        const tenantId = e14RequireTenant(req);
        if (tenantId === null) return res.status(403).json({ error: 'Tenant scope required' });
        const preg = await e14PregnancyInTenant(req.params.pregnancy_id, tenantId);
        if (!preg) return res.status(404).json({ error: 'Pregnancy not found' });
        res.json((await pool.query('SELECT * FROM obgyn_ultrasounds WHERE pregnancy_id=$1 AND tenant_id=$2 ORDER BY scan_date DESC, id DESC', [preg.id, tenantId])).rows);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/obgyn/ultrasounds', requireAuth, requireRole(...OB_RBAC), requireTenantScope, async (req, res) => {
    try {
        const tenantId = e14RequireTenant(req);
        if (tenantId === null) return res.status(403).json({ error: 'Tenant scope required' });
        const b = req.body || {};
        const preg = await e14PregnancyInTenant(b.pregnancy_id, tenantId);
        if (!preg) return res.status(404).json({ error: 'Pregnancy not found' });
        // Server-derived GA from biometry + EFW percentile band (anti-spoof).
        const biometryGa = obEngine.gaFromBiometry({ bpd: b.bpd, hc: b.hc, ac: b.ac, fl: b.fl });
        const gaLabel = biometryGa.ok ? `${biometryGa.gaWeeks}+${biometryGa.gaDays} weeks` : (b.gestational_age || '');
        const pctl = obEngine.efwPercentileBand(biometryGa.ok ? biometryGa.gaWeeks : null, b.efw);
        const anomalies = [b.anomalies || '', pctl && pctl.flag ? pctl.flag : ''].filter(Boolean).join('; ');
        const result = await pool.query(
            `INSERT INTO obgyn_ultrasounds (tenant_id, pregnancy_id, patient_id, scan_type, gestational_age,
             bpd, hc, ac, fl, efw, efw_percentile, amniotic_fluid_index, placenta_location, placenta_grade,
             fetal_heart_rate, fetal_presentation, fetal_gender, number_of_fetuses, cervical_length,
             anomalies, findings, impression, performed_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23) RETURNING *`,
            [tenantId, preg.id, preg.patient_id, b.scan_type || 'Routine', gaLabel,
            b.bpd || 0, b.hc || 0, b.ac || 0, b.fl || 0, b.efw || 0, pctl ? pctl.band : '',
            b.amniotic_fluid_index || 0, b.placenta_location || '', b.placenta_grade || '', e14IntId(b.fetal_heart_rate) || 0,
            b.fetal_presentation || '', b.fetal_gender || 'Not determined', e14IntId(b.number_of_fetuses) || 1,
            b.cervical_length || 0, anomalies, b.findings || '', b.impression || '',
            req.session.user?.display_name || '']);
        logAudit(req.session.user?.id, req.session.user?.display_name, 'ULTRASOUND', 'OB/GYN',
            `US pregnancy #${preg.id} GA ${gaLabel}${pctl ? ' EFW ' + pctl.band : ''}`, req.ip);
        res.json(result.rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// Delivery Records — state machine (Active -> Delivered) + SELECT...FOR UPDATE; server APGAR
app.post('/api/obgyn/deliveries', requireAuth, requireRole(...OB_RBAC), requireTenantScope, async (req, res) => {
    const client = await pool.connect();
    try {
        const tenantId = e14RequireTenant(req);
        if (tenantId === null) { return res.status(403).json({ error: 'Tenant scope required' }); }
        const b = req.body || {};
        const pregId = e14IntId(b.pregnancy_id);
        if (pregId === null) { return res.status(400).json({ error: 'Invalid pregnancy_id' }); }

        // Bind tenant on this dedicated connection so RLS applies to the locking SELECT.
        await client.query("SELECT set_config('app.tenant_id', $1, true)", [String(tenantId)]);
        await client.query('BEGIN');
        // Lock the pregnancy row before flipping status (race-safe single-row lock).
        const pregRow = (await client.query('SELECT * FROM obgyn_pregnancies WHERE id=$1 AND tenant_id=$2 FOR UPDATE', [pregId, tenantId])).rows[0];
        if (!pregRow) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Pregnancy not found' }); }
        // Server-side state machine: reject delivery on a non-Active pregnancy (409).
        const transition = obEngine.deliveryTransitionAllowed(pregRow.status);
        if (!transition.ok) { await client.query('ROLLBACK'); return res.status(409).json({ error: transition.error }); }

        // Anti-spoof APGAR: computed from components; fail-closed if incomplete provided.
        let apgar1 = 0, apgar5 = 0;
        if (b.apgar_1min_components) {
            const a1 = obEngine.computeAPGAR(b.apgar_1min_components);
            if (!a1.ok) { await client.query('ROLLBACK'); return res.status(422).json({ error: 'Incomplete APGAR (1 min): ' + (a1.missing || []).join(',') }); }
            apgar1 = a1.total;
        }
        if (b.apgar_5min_components) {
            const a5 = obEngine.computeAPGAR(b.apgar_5min_components);
            if (!a5.ok) { await client.query('ROLLBACK'); return res.status(422).json({ error: 'Incomplete APGAR (5 min): ' + (a5.missing || []).join(',') }); }
            apgar5 = a5.total;
        }

        const result = await client.query(
            `INSERT INTO obgyn_deliveries (tenant_id, pregnancy_id, patient_id, admission_id, delivery_date, gestational_age_at_delivery,
             delivery_type, delivery_method, indication_for_cs, anesthesia_type, labor_duration_hours,
             episiotomy, perineal_tear, blood_loss_ml, placenta_delivery, complications,
             attending_doctor, assisting_nurse, anesthetist, pediatrician, notes,
             apgar_1min, apgar_5min, baby_weight, baby_length, baby_head_circumference,
             baby_gender, baby_status, baby_anomalies, nicu_admission, nicu_reason, breastfeeding_initiated)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32) RETURNING *`,
            [tenantId, pregId, pregRow.patient_id, e14IntId(b.admission_id), b.delivery_date || new Date(), b.gestational_age_at_delivery || '',
            b.delivery_type || 'NVD', b.delivery_method || '', b.indication_for_cs || '', b.anesthesia_type || '',
            b.labor_duration_hours || 0, b.episiotomy ? 1 : 0, b.perineal_tear || 'None', e14IntId(b.blood_loss_ml) || 0,
            b.placenta_delivery || 'Complete', b.complications || '', b.attending_doctor || '',
            b.assisting_nurse || '', b.anesthetist || '', b.pediatrician || '', b.notes || '',
            apgar1, apgar5, e14IntId(b.baby_weight) || 0, b.baby_length || 0,
            b.baby_head_circumference || 0, b.baby_gender || '', b.baby_status || 'Alive',
            b.baby_anomalies || '', b.nicu_admission ? 1 : 0, b.nicu_reason || '', b.breastfeeding_initiated ? 1 : 0]);
        // Flip pregnancy status under the lock (state-machine commit).
        await client.query('UPDATE obgyn_pregnancies SET status=$1, delivery_date=$2, delivery_type=$3, outcome=$4, updated_at=NOW() WHERE id=$5 AND tenant_id=$6',
            ['Delivered', b.delivery_date || new Date(), b.delivery_type || 'NVD', b.baby_status || 'Alive', pregId, tenantId]);
        await client.query('COMMIT');
        logAudit(req.session.user?.id, req.session.user?.display_name, 'RECORD_DELIVERY', 'OB/GYN',
            `Delivery pregnancy #${pregId}: mode=${b.delivery_type || 'NVD'}, baby_wt=${e14IntId(b.baby_weight) || 0}g, APGAR 1'=${apgar1} 5'=${apgar5}`, req.ip);
        res.json(result.rows[0]);
    } catch (e) {
        try { await client.query('ROLLBACK'); } catch (_) { }
        res.status(500).json({ error: 'Server error' });
    } finally { client.release(); }
});

app.get('/api/obgyn/deliveries/:pregnancy_id', requireAuth, requireRole(...OB_RBAC), requireTenantScope, async (req, res) => {
    try {
        const tenantId = e14RequireTenant(req);
        if (tenantId === null) return res.status(403).json({ error: 'Tenant scope required' });
        const preg = await e14PregnancyInTenant(req.params.pregnancy_id, tenantId);
        if (!preg) return res.status(404).json({ error: 'Pregnancy not found' });
        res.json((await pool.query('SELECT * FROM obgyn_deliveries WHERE pregnancy_id=$1 AND tenant_id=$2', [preg.id, tenantId])).rows);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== NEONATAL RECORD (attached 1:1 to a delivery; APGAR computed server-side) =====
app.get('/api/obgyn/neonatal/:delivery_id', requireAuth, requireRole(...OB_RBAC), requireTenantScope, async (req, res) => {
    try {
        const tenantId = e14RequireTenant(req);
        if (tenantId === null) return res.status(403).json({ error: 'Tenant scope required' });
        const did = e14IntId(req.params.delivery_id);
        if (did === null) return res.status(400).json({ error: 'Invalid delivery_id' });
        const del = (await pool.query('SELECT id FROM obgyn_deliveries WHERE id=$1 AND tenant_id=$2', [did, tenantId])).rows[0];
        if (!del) return res.status(404).json({ error: 'Delivery not found' });
        res.json((await pool.query('SELECT * FROM obgyn_neonatal WHERE delivery_id=$1 AND tenant_id=$2 ORDER BY id', [did, tenantId])).rows);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/obgyn/neonatal', requireAuth, requireRole(...OB_RBAC), requireTenantScope, async (req, res) => {
    try {
        const tenantId = e14RequireTenant(req);
        if (tenantId === null) return res.status(403).json({ error: 'Tenant scope required' });
        const b = req.body || {};
        const did = e14IntId(b.delivery_id);
        if (did === null) return res.status(400).json({ error: 'Invalid delivery_id' });
        // Ownership: delivery must belong to caller's tenant -> else 404
        const del = (await pool.query('SELECT id, patient_id FROM obgyn_deliveries WHERE id=$1 AND tenant_id=$2', [did, tenantId])).rows[0];
        if (!del) return res.status(404).json({ error: 'Delivery not found' });
        // Optional newborn patient must also be tenant-owned if provided.
        let babyPatientId = null;
        if (b.baby_patient_id !== undefined && b.baby_patient_id !== null && b.baby_patient_id !== '') {
            babyPatientId = await e14PatientInTenant(b.baby_patient_id, tenantId);
            if (babyPatientId === null) return res.status(404).json({ error: 'Newborn patient not found' });
        }
        // Anti-spoof APGAR: computed from components; fail-closed if incomplete.
        const a1 = obEngine.computeAPGAR(b.apgar_1min_components || {});
        const a5 = obEngine.computeAPGAR(b.apgar_5min_components || {});
        if (!a1.ok) return res.status(422).json({ error: 'Incomplete APGAR (1 min): ' + (a1.missing || []).join(',') });
        if (!a5.ok) return res.status(422).json({ error: 'Incomplete APGAR (5 min): ' + (a5.missing || []).join(',') });
        let apgar10 = 0;
        if (b.apgar_10min_components) {
            const a10 = obEngine.computeAPGAR(b.apgar_10min_components);
            if (!a10.ok) return res.status(422).json({ error: 'Incomplete APGAR (10 min): ' + (a10.missing || []).join(',') });
            apgar10 = a10.total;
        }
        const result = await pool.query(
            `INSERT INTO obgyn_neonatal (tenant_id, delivery_id, baby_patient_id, apgar_1min, apgar_5min, apgar_10min,
             birth_weight_grams, length_cm, head_circumference_cm, blood_group, coombs_test,
             resuscitation_needed, resuscitation_type, birth_injury, jaundice_onset, phototherapy_needed,
             hypoglycemia, hypothermia, congenital_abnormalities, feeding_type, feeding_established,
             discharge_destination, discharge_status, follow_up_plan, recorded_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25) RETURNING *`,
            [tenantId, did, babyPatientId, a1.total, a5.total, apgar10,
                e14IntId(b.birth_weight_grams) || 0, b.length_cm || 0, b.head_circumference_cm || 0, b.blood_group || '', b.coombs_test || 'Not Done',
                b.resuscitation_needed ? 1 : 0, b.resuscitation_type || '', b.birth_injury || '', b.jaundice_onset || '', b.phototherapy_needed ? 1 : 0,
                b.hypoglycemia ? 1 : 0, b.hypothermia ? 1 : 0, b.congenital_abnormalities || '', b.feeding_type || 'Breast', b.feeding_established ? 1 : 0,
                b.discharge_destination || 'Home', b.discharge_status || 'Healthy', b.follow_up_plan || '', req.session.user?.display_name || '']);
        logAudit(req.session.user?.id, req.session.user?.display_name, 'RECORD_NEONATAL', 'OB/GYN',
            `Neonatal delivery #${did}: APGAR 1'=${a1.total} 5'=${a5.total} wt=${e14IntId(b.birth_weight_grams) || 0}g resus=${b.resuscitation_needed ? 'Y' : 'N'}`, req.ip);
        res.json(result.rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// NST Records
app.post('/api/obgyn/nst', requireAuth, requireRole(...OB_RBAC), requireTenantScope, async (req, res) => {
    try {
        const tenantId = e14RequireTenant(req);
        if (tenantId === null) return res.status(403).json({ error: 'Tenant scope required' });
        const b = req.body || {};
        const preg = await e14PregnancyInTenant(b.pregnancy_id, tenantId);
        if (!preg) return res.status(404).json({ error: 'Pregnancy not found' });
        const result = await pool.query(
            `INSERT INTO obgyn_nst (tenant_id, pregnancy_id, patient_id, duration_minutes, baseline_fhr, variability,
             accelerations, decelerations, contractions, result, interpretation, action_taken, performed_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
            [tenantId, preg.id, preg.patient_id, b.duration_minutes || 20, e14IntId(b.baseline_fhr) || 0, b.variability || '',
            b.accelerations || 0, b.decelerations || 'None', b.contractions || 0, b.result || 'Reactive',
            b.interpretation || '', b.action_taken || '', req.session.user?.display_name || '']);
        if (b.result === 'Non-Reactive') {
            await pool.query('INSERT INTO notifications (target_role, title, message, type, module) VALUES ($1,$2,$3,$4,$5)',
                ['Doctor', 'Non-Reactive NST', 'Patient #' + preg.patient_id + ' - Non-reactive NST: ' + (b.interpretation || ''), 'danger', 'OB/GYN']);
        }
        logAudit(req.session.user?.id, req.session.user?.display_name, 'NST_ENTRY', 'OB/GYN',
            `NST pregnancy #${preg.id}: result=${b.result || 'Reactive'} fhr=${e14IntId(b.baseline_fhr) || 0} dur=${b.duration_minutes || 20}min`, req.ip);
        res.json(result.rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// OB/GYN Lab Panels (tenant-scoped catalog)
app.get('/api/obgyn/lab-panels', requireAuth, requireRole(...OB_RBAC), requireTenantScope, async (req, res) => {
    try {
        const tenantId = e14RequireTenant(req);
        if (tenantId === null) return res.status(403).json({ error: 'Tenant scope required' });
        res.json((await pool.query('SELECT * FROM obgyn_lab_panels WHERE is_active=1 AND tenant_id=$1 ORDER BY id', [tenantId])).rows);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// OB/GYN Dashboard Stats — fail-closed tenant scoping (HR#1: null tenant -> 403, no unscoped fallback)
app.get('/api/obgyn/stats', requireAuth, requireRole(...OB_RBAC), requireTenantScope, async (req, res) => {
    try {
        const tenantId = e14RequireTenant(req);
        if (tenantId === null) return res.status(403).json({ error: 'Tenant scope required' });

        // Schema for obgyn_pregnancies/obgyn_deliveries is provisioned out-of-band
        // (migrations/e14_ob_maternity_*.sql); no DDL in handler under restricted role.
        const params = [tenantId];
        const active = (await pool.query(`SELECT COUNT(*) as cnt FROM obgyn_pregnancies WHERE status='Active' AND tenant_id=$1`, params)).rows[0].cnt;
        const highRisk = (await pool.query(`SELECT COUNT(*) as cnt FROM obgyn_pregnancies WHERE status='Active' AND risk_level='High' AND tenant_id=$1`, params)).rows[0].cnt;
        const dueThisWeek = (await pool.query(`SELECT COUNT(*) as cnt FROM obgyn_pregnancies WHERE status='Active' AND edd BETWEEN CURRENT_DATE AND CURRENT_DATE + 7 AND tenant_id=$1`, params)).rows[0].cnt;
        const deliveredThisMonth = (await pool.query(`SELECT COUNT(*) as cnt FROM obgyn_deliveries WHERE delivery_date >= date_trunc('month', CURRENT_DATE) AND tenant_id=$1`, params)).rows[0].cnt;
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

        // E1 ENHANCE (additive, tenant-aware): also consult the DB-driven drug_interactions table so
        // tenant-curated pairs are honored alongside the built-in matrix. Failure here NEVER drops the
        // built-in results (FAIL-SAFE: a DB error must not silently weaken the interaction check).
        try {
            const { tenantId } = getRequestTenantContext(req);
            const dbRows = (await pool.query(
                tenantId
                    ? 'SELECT drug_a, drug_b, severity, description, clinical_action FROM drug_interactions WHERE tenant_id=$1'
                    : 'SELECT drug_a, drug_b, severity, description, clinical_action FROM drug_interactions',
                tenantId ? [tenantId] : []
            )).rows;
            for (const row of dbRows) {
                const a = (row.drug_a || '').toLowerCase(), b = (row.drug_b || '').toLowerCase();
                if (!a || !b) continue;
                const hasA = drugNamesLower.some(dn => dn.includes(a) || a.includes(dn));
                const hasB = drugNamesLower.some(dn => dn.includes(b) || b.includes(dn));
                if (hasA && hasB) {
                    const already = found.some(f => {
                        const [f1, f2] = f.drugs.map(d => d.toLowerCase());
                        return (f1.includes(a) || a.includes(f1)) && (f2.includes(b) || b.includes(f2));
                    });
                    if (!already) {
                        found.push({
                            drugs: [row.drug_a, row.drug_b],
                            // map via the shared cds engine so DB severities follow the same info|warning|critical contract
                            severity: cds.mapSeverity(row.severity),
                            message_ar: row.description || 'تعارض دوائي مسجل', message_en: row.description || 'Recorded interaction',
                            clinical_action: row.clinical_action || '', source: 'db',
                        });
                    }
                }
            }
        } catch (e) { /* FAIL-SAFE: DB augmentation optional; built-in matrix results stand */ }

        res.json({ interactions: found, total_checked: INTERACTIONS.length });
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== ALLERGY CROSS-CHECK =====
app.post('/api/allergy-check', requireAuth, async (req, res) => {
    try {
        const { patient_id, drugs } = req.body;
        if (!patient_id || !drugs) return res.json({ alerts: [] });

        // E1 ENHANCE: scope the patient lookup by tenant when context is present (defense-in-depth;
        // RLS also enforces isolation). Behavior unchanged when no tenant context (dev/test).
        const { tenantId } = getRequestTenantContext(req);
        const patient = (await pool.query(
            tenantId ? 'SELECT allergies FROM patients WHERE id=$1 AND tenant_id=$2' : 'SELECT allergies FROM patients WHERE id=$1',
            tenantId ? [patient_id, tenantId] : [patient_id])).rows[0];
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
// H-1: partial payment — amount validated server-side (fail-closed), outstanding computed from DB,
// no overpayment, row-locked transaction (race-safe), tenant-scoped + RLS-bound under the manual client.
app.put('/api/invoices/:id/partial-pay', requireAuth, requireRole('invoices', 'accounts'), requireTenantScope, async (req, res) => {
    const client = await pool.connect();
    try {
        const { amount_paid, payment_method } = req.body;
        const { tenantId } = getRequestTenantContext(req);
        await client.query('BEGIN');
        if (tenantId) await client.query("SELECT set_config('app.tenant_id', $1, true)", [String(tenantId)]);
        // tenant-scoped lock on the invoice row (prevents TOCTOU double-pay races)
        const tenantCheck = tenantId ? ' AND tenant_id=$2' : '';
        const lockParams = tenantId ? [req.params.id, tenantId] : [req.params.id];
        const invoice = (await client.query(`SELECT * FROM invoices WHERE id=$1${tenantCheck} FOR UPDATE`, lockParams)).rows[0];
        if (!invoice) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Invoice not found' }); }
        // outstanding is SERVER-COMPUTED (never trusts a client total/outstanding); amount is validated + capped
        const totalMinor = toMinorUnits(invoice.total);
        const prevPaidMinor = toMinorUnits(invoice.amount_paid || 0);
        const outstandingMinor = totalMinor - prevPaidMinor;
        const payMinor = parsePositiveMoneyToMinorUnits(amount_paid, { field: 'amount_paid' });
        assertAmountWithinCap(payMinor, outstandingMinor, 'payment');   // rejects NaN/neg/zero/over-outstanding
        const newPaidMinor = prevPaidMinor + payMinor;
        const balanceMinor = Math.max(0, totalMinor - newPaidMinor);
        const isPaid = (totalMinor - newPaidMinor) <= 0 ? 1 : 0;
        const updParams = tenantId
            ? [newPaidMinor / 100, balanceMinor / 100, isPaid, payment_method || invoice.payment_method, req.params.id, tenantId]
            : [newPaidMinor / 100, balanceMinor / 100, isPaid, payment_method || invoice.payment_method, req.params.id];
        await client.query(
            `UPDATE invoices SET amount_paid=$1, balance_due=$2, paid=$3, payment_method=$4 WHERE id=$5${tenantId ? ' AND tenant_id=$6' : ''}`,
            updParams);
        await client.query('COMMIT');
        logAudit(req.session.user?.id, req.session.user?.display_name, 'PARTIAL_PAYMENT', 'Invoice',
            invoice.invoice_number + ' paid ' + (payMinor / 100) + ' (total paid: ' + (newPaidMinor / 100) + '/' + (totalMinor / 100) + ')', req.ip);
        res.json({ success: true, amount_paid: newPaidMinor / 100, balance_due: balanceMinor / 100, fully_paid: isPaid });
    } catch (e) { try { await client.query('ROLLBACK'); } catch (_) {} sendBillingError(res, e); }
    finally { client.release(); }
});

// H-2: refund — original invoice MUST belong to current tenant (IDOR fix), amount validated server-side,
// refundable = amount_paid - already-refunded (server-computed, tenant-scoped), refund row stamped with
// tenant_id/facility_id, row-locked transaction. No GL/journal/ZATCA/NPHIES (out of scope).
app.post('/api/invoices/:id/refund', requireAuth, requireRole('invoices', 'accounts'), requireTenantScope, async (req, res) => {
    const client = await pool.connect();
    try {
        const { amount, reason } = req.body;
        const { tenantId, facilityId } = getRequestTenantContext(req);
        await client.query('BEGIN');
        if (tenantId) await client.query("SELECT set_config('app.tenant_id', $1, true)", [String(tenantId)]);
        // IDOR fix: load+lock the ORIGINAL invoice scoped to the current tenant (never by bare id)
        const tenantCheck = tenantId ? ' AND tenant_id=$2' : '';
        const lockParams = tenantId ? [req.params.id, tenantId] : [req.params.id];
        const invoice = (await client.query(`SELECT * FROM invoices WHERE id=$1${tenantCheck} FOR UPDATE`, lockParams)).rows[0];
        if (!invoice) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Invoice not found' }); }
        // refundable computed SERVER-SIDE: amount actually paid minus prior refunds for this invoice (tenant-scoped)
        const paidMinor = toMinorUnits(invoice.amount_paid || 0);
        const refRow = await client.query(
            `SELECT COALESCE(SUM(-total),0) AS refunded FROM invoices WHERE service_type='Refund' AND description LIKE $1${tenantId ? ' AND tenant_id=$2' : ''}`,
            tenantId ? ['Refund for ' + invoice.invoice_number + ':%', tenantId] : ['Refund for ' + invoice.invoice_number + ':%']);
        const alreadyRefundedMinor = toMinorUnits(refRow.rows[0].refunded || 0);
        const refundableMinor = paidMinor - alreadyRefundedMinor;
        const refundMinor = parsePositiveMoneyToMinorUnits(amount, { field: 'refund amount' });
        assertAmountWithinCap(refundMinor, refundableMinor, 'refund'); // rejects NaN/neg/zero/over-refundable/already-fully-refunded
        const refundNum = 'REF-' + new Date().getFullYear() + '-' + String(Date.now()).slice(-6);
        // stamp tenant_id & facility_id on the refund row (was previously unscoped)
        await client.query(
            "INSERT INTO invoices (patient_id, patient_name, total, description, service_type, payment_method, invoice_number, created_by, discount_reason, tenant_id, facility_id) VALUES ($1,$2,$3,$4,'Refund',$5,$6,$7,$8,$9,$10)",
            [invoice.patient_id, invoice.patient_name, -(refundMinor / 100), 'Refund for ' + invoice.invoice_number + ': ' + String(reason || ''), invoice.payment_method, refundNum, req.session.user?.display_name || '', String(reason || ''), tenantId || null, facilityId || null]);
        await client.query('COMMIT');
        logAudit(req.session.user?.id, req.session.user?.display_name, 'REFUND', 'Invoice', refundNum + ' amount: ' + (refundMinor / 100) + ' reason: ' + String(reason || '').slice(0, 120), req.ip);
        res.json({ success: true, refund_number: refundNum, refunded: refundMinor / 100, refundable_remaining: (refundableMinor - refundMinor) / 100 });
    } catch (e) { try { await client.query('ROLLBACK'); } catch (_) {} sendBillingError(res, e); }
    finally { client.release(); }
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
        // I-2 fix: fail-closed — no unscoped fallback. e10RequireTenant throws 403 if tenant missing.
        const tenantId = e10RequireTenant(req);
        const { from, to } = req.query;
        let where = "WHERE total > 0 AND tenant_id = $1";
        let p = [tenantId];
        if (from) { where += " AND created_at >= $" + (p.length + 1); p.push(from); }
        if (to) { where += " AND created_at <= $" + (p.length + 1); p.push(to + ' 23:59:59'); }

        const total = (await pool.query("SELECT COALESCE(SUM(total),0) as revenue, COUNT(*) as count FROM invoices " + where, p)).rows[0];
        const paid = (await pool.query("SELECT COALESCE(SUM(total),0) as paid FROM invoices " + where + " AND paid=1", p)).rows[0];
        const unpaid = (await pool.query("SELECT COALESCE(SUM(total),0) as unpaid FROM invoices " + where + " AND (paid=0 OR paid IS NULL)", p)).rows[0];
        const byMethod = (await pool.query("SELECT COALESCE(payment_method,'Cash') as method, SUM(total) as amount, COUNT(*) as cnt FROM invoices " + where + " AND paid=1 GROUP BY payment_method ORDER BY amount DESC", p)).rows;
        const byService = (await pool.query("SELECT COALESCE(service_type,description,'Other') as service, SUM(total) as amount, COUNT(*) as cnt FROM invoices " + where + " GROUP BY COALESCE(service_type,description,'Other') ORDER BY amount DESC LIMIT 10", p)).rows;
        const daily = (await pool.query("SELECT DATE(created_at) as day, SUM(total) as amount FROM invoices " + where + " GROUP BY DATE(created_at) ORDER BY day", p)).rows;

        res.json({ revenue: total.revenue, count: total.count, paid: paid.paid, unpaid: unpaid.unpaid, byMethod, byService, daily });
    } catch (e) { e10Err(res, e); }
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
app.get('/api/medical-records/patient/:patientId', requireAuth, requireTenantScope, async (req, res) => {
    try {
        const { tenantId } = getRequestTenantContext(req);
        // Verify patient belongs to tenant
        const p = (await pool.query('SELECT id FROM patients WHERE id=$1 AND tenant_id=$2', [req.params.patientId, tenantId])).rows[0];
        if (!p) return res.status(404).json({ error: 'Patient not found' });

        const records = (await pool.query("SELECT * FROM medical_records WHERE patient_id=$1 AND tenant_id=$2 ORDER BY created_at DESC", [req.params.patientId, tenantId])).rows;
        res.json(records);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});



// ===== PATHOLOGY SPECIMENS (E15 — tenant-scoped, RBAC, server-authoritative state machine) =====
// Hierarchy: path_specimens -> path_blocks -> path_slides ; path_reports (1:1 per specimen).
// Reads: pathology/lab/doctor. Writes: pathology/lab. Sign-out/addendum: pathology only.

// LIST specimens (tenant-scoped). Returns rows for the session tenant only; null tenant -> [].
app.get('/api/pathology/specimens', requireAuth, requireRole('pathology', 'lab', 'doctor'), requireTenantScope, async (req, res) => {
    try {
        const { tenantId } = getRequestTenantContext(req);
        if (!tenantId) return res.json([]); // fail-closed: no tenant -> zero rows
        const r = await pool.query(
            `SELECT s.*, r.state AS report_state, r.malignancy_flag, r.critical_flag, r.signed_at,
                    p.name AS patient_name
               FROM path_specimens s
               LEFT JOIN path_reports r ON r.specimen_id = s.id AND r.tenant_id = s.tenant_id
               LEFT JOIN patients p ON p.id = s.patient_id AND p.tenant_id = s.tenant_id
              WHERE s.tenant_id = $1
              ORDER BY s.created_at DESC`, [tenantId]);
        res.json(r.rows);
    } catch (e) { console.error('PATH list error:', e.message); res.status(500).json({ error: 'Server error' }); }
});

// GET one specimen with blocks + slides + report (tenant-scoped; IDOR -> 404).
app.get('/api/pathology/specimens/:id', requireAuth, requireRole('pathology', 'lab', 'doctor'), requireTenantScope, async (req, res) => {
    try {
        const { tenantId } = getRequestTenantContext(req);
        const sid = parseInt(req.params.id, 10);
        if (!Number.isInteger(sid)) return res.status(400).json({ error: 'Invalid id' });
        if (!tenantId) return res.status(404).json({ error: 'Not found' });
        const sp = await pool.query('SELECT * FROM path_specimens WHERE id=$1 AND tenant_id=$2', [sid, tenantId]);
        if (!sp.rows[0]) return res.status(404).json({ error: 'Not found' }); // cross-tenant -> 404
        const blocks = (await pool.query('SELECT * FROM path_blocks WHERE specimen_id=$1 AND tenant_id=$2 ORDER BY id', [sid, tenantId])).rows;
        const slides = (await pool.query('SELECT * FROM path_slides WHERE specimen_id=$1 AND tenant_id=$2 ORDER BY id', [sid, tenantId])).rows;
        const report = (await pool.query('SELECT * FROM path_reports WHERE specimen_id=$1 AND tenant_id=$2', [sid, tenantId])).rows[0] || null;
        res.json({ specimen: sp.rows[0], blocks, slides, report });
    } catch (e) { console.error('PATH get error:', e.message); res.status(500).json({ error: 'Server error' }); }
});

// CREATE specimen — accession server-generated; patient validated same-tenant (IDOR -> 404).
app.post('/api/pathology/specimens', requireAuth, requireRole('pathology', 'lab'), requireTenantScope, async (req, res) => {
    const client = await pool.connect();
    try {
        const { tenantId, facilityId } = getRequestTenantContext(req);
        if (!tenantId) { client.release(); return res.status(403).json({ error: 'Tenant scope required' }); }
        const { patient_id, visit_id, specimen_type, site, clinical_details, priority } = req.body;
        const pid = parseInt(patient_id, 10);
        if (!Number.isInteger(pid)) { client.release(); return res.status(400).json({ error: 'patient_id required (integer)' }); }
        const allowedPriority = ['routine', 'urgent', 'stat'];
        const prio = allowedPriority.includes(priority) ? priority : 'routine';

        // F3: validate visit_id before BEGIN so we can early-return without a transaction.
        const vid = (visit_id != null && visit_id !== '') ? parseInt(visit_id, 10) : null;
        if (vid !== null && !Number.isInteger(vid)) { client.release(); return res.status(400).json({ error: 'visit_id must be integer' }); }

        await client.query('BEGIN');
        // F1: serialize per-tenant accession generation — prevents race that produces duplicate accession numbers.
        await client.query('SELECT pg_advisory_xact_lock($1::bigint)', [tenantId]);
        // 1. Validate patient belongs to the session tenant (anti-IDOR; 404 not 403).
        const pat = await client.query('SELECT id FROM patients WHERE id=$1 AND tenant_id=$2', [pid, tenantId]);
        if (!pat.rows[0]) { await client.query('ROLLBACK'); client.release(); return res.status(404).json({ error: 'Patient not found' }); }

        // 2. Server-authoritative accession number (never from client) — lock today's count.
        const cnt = await client.query(
            "SELECT COUNT(*)::int AS c FROM path_specimens WHERE tenant_id=$1 AND received_at::date = CURRENT_DATE", [tenantId]);
        const accession = pathologyEngine.generateAccession(tenantId, cnt.rows[0].c);

        // 3. Insert specimen (state forced to 'Received'; tenant stamped from session).
        const ins = await client.query(
            `INSERT INTO path_specimens
               (tenant_id, facility_id, patient_id, visit_id, accession_number, specimen_type, site, clinical_details, priority, state, received_at, created_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'Received',CURRENT_TIMESTAMP,$10) RETURNING *`,
            [tenantId, facilityId || null, pid, vid, accession,
             specimen_type || '', site || '', clinical_details || '', prio, req.session.user?.id || null]);

        // 4. Create the companion report shell (state mirrors specimen).
        await client.query(
            `INSERT INTO path_reports (tenant_id, facility_id, specimen_id, state)
             VALUES ($1,$2,$3,'Received') ON CONFLICT (tenant_id, specimen_id) DO NOTHING`,
            [tenantId, facilityId || null, ins.rows[0].id]);

        await client.query('COMMIT');
        client.release();
        logAudit(req.session.user?.id, req.session.user?.name, 'PATHOLOGY_SPECIMEN_CREATE', 'Pathology',
            JSON.stringify({ specimen_id: ins.rows[0].id, accession, patient_id: pid }), req.ip);
        res.json(ins.rows[0]);
    } catch (e) {
        try { await client.query('ROLLBACK'); } catch (_) {}
        client.release();
        // F1: unique constraint on accession_number (23505) -> 409 to signal retry; avoids raw 500.
        if (e.code === '23505') return res.status(409).json({ error: 'Accession collision; please retry' });
        console.error('PATH create error:', e.message);
        res.status(500).json({ error: 'Server error' });
    }
});

// ADD block to specimen (tenant-scoped; specimen must be same-tenant -> 404 else).
app.post('/api/pathology/specimens/:id/blocks', requireAuth, requireRole('pathology', 'lab'), requireTenantScope, async (req, res) => {
    const client = await pool.connect();
    try {
        const { tenantId } = getRequestTenantContext(req);
        const sid = parseInt(req.params.id, 10);
        if (!Number.isInteger(sid) || !tenantId) { client.release(); return res.status(400).json({ error: 'Invalid request' }); }
        const { block_no, cassette_label, embedding_type } = req.body;
        await client.query('BEGIN');
        const sp = await client.query('SELECT id, state FROM path_specimens WHERE id=$1 AND tenant_id=$2 FOR UPDATE', [sid, tenantId]);
        if (!sp.rows[0]) { await client.query('ROLLBACK'); client.release(); return res.status(404).json({ error: 'Specimen not found' }); }
        if (sp.rows[0].state === 'SignedOut') { await client.query('ROLLBACK'); client.release(); return res.status(409).json({ error: 'Specimen signed out; immutable' }); }
        const ins = await client.query(
            `INSERT INTO path_blocks (tenant_id, specimen_id, block_no, cassette_label, embedding_type)
             VALUES ($1,$2,$3,$4,$5) RETURNING *`,
            [tenantId, sid, String(block_no || '').slice(0, 32) || ('B' + Date.now()), cassette_label || '', embedding_type || 'paraffin']);
        await client.query('UPDATE path_specimens SET blocks_count = blocks_count + 1, updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND tenant_id=$2', [sid, tenantId]);
        await client.query('COMMIT');
        client.release();
        logAudit(req.session.user?.id, req.session.user?.name, 'PATHOLOGY_BLOCK_ADD', 'Pathology', JSON.stringify({ specimen_id: sid, block_id: ins.rows[0].id }), req.ip);
        res.json(ins.rows[0]);
    } catch (e) { try { await client.query('ROLLBACK'); } catch (_) {} client.release(); console.error('PATH block error:', e.message); res.status(500).json({ error: 'Server error' }); }
});

// ADD slide to a block (validates block + specimen same-tenant chain).
app.post('/api/pathology/blocks/:blockId/slides', requireAuth, requireRole('pathology', 'lab'), requireTenantScope, async (req, res) => {
    try {
        const { tenantId } = getRequestTenantContext(req);
        const bid = parseInt(req.params.blockId, 10);
        if (!Number.isInteger(bid) || !tenantId) return res.status(400).json({ error: 'Invalid request' });
        const blk = await pool.query('SELECT id, specimen_id FROM path_blocks WHERE id=$1 AND tenant_id=$2', [bid, tenantId]);
        if (!blk.rows[0]) return res.status(404).json({ error: 'Block not found' });
        const { slide_no, stain_type } = req.body;
        const ins = await pool.query(
            `INSERT INTO path_slides (tenant_id, block_id, specimen_id, slide_no, stain_type)
             VALUES ($1,$2,$3,$4,$5) RETURNING *`,
            [tenantId, bid, blk.rows[0].specimen_id, String(slide_no || '').slice(0, 32) || ('S' + Date.now()), stain_type || 'H&E']);
        logAudit(req.session.user?.id, req.session.user?.name, 'PATHOLOGY_SLIDE_ADD', 'Pathology', JSON.stringify({ block_id: bid, slide_id: ins.rows[0].id }), req.ip);
        res.json(ins.rows[0]);
    } catch (e) { console.error('PATH slide error:', e.message); res.status(500).json({ error: 'Server error' }); }
});

// STATE transition — server-authoritative; invalid -> 409. SignedOut is terminal.
app.put('/api/pathology/specimens/:id/state', requireAuth, requireRole('pathology', 'lab'), requireTenantScope, async (req, res) => {
    const client = await pool.connect();
    try {
        const { tenantId } = getRequestTenantContext(req);
        const sid = parseInt(req.params.id, 10);
        if (!Number.isInteger(sid) || !tenantId) { client.release(); return res.status(400).json({ error: 'Invalid request' }); }
        const target = String(req.body?.state || '');
        await client.query('BEGIN');
        const sp = await client.query('SELECT id, state FROM path_specimens WHERE id=$1 AND tenant_id=$2 FOR UPDATE', [sid, tenantId]);
        if (!sp.rows[0]) { await client.query('ROLLBACK'); client.release(); return res.status(404).json({ error: 'Specimen not found' }); }
        const current = sp.rows[0].state;
        if (!pathologyEngine.isValidTransition(current, target)) {
            await client.query('ROLLBACK'); client.release();
            return res.status(409).json({ error: `Invalid state transition ${current} -> ${target}` });
        }
        await client.query('UPDATE path_specimens SET state=$1, updated_at=CURRENT_TIMESTAMP WHERE id=$2 AND tenant_id=$3', [target, sid, tenantId]);
        await client.query('UPDATE path_reports SET state=$1, updated_at=CURRENT_TIMESTAMP WHERE specimen_id=$2 AND tenant_id=$3', [target, sid, tenantId]);
        await client.query('COMMIT');
        client.release();
        logAudit(req.session.user?.id, req.session.user?.name, 'PATHOLOGY_STATE_CHANGE', 'Pathology', JSON.stringify({ specimen_id: sid, from: current, to: target }), req.ip);
        res.json({ success: true, state: target });
    } catch (e) { try { await client.query('ROLLBACK'); } catch (_) {} client.release(); console.error('PATH state error:', e.message); res.status(500).json({ error: 'Server error' }); }
});

// SAVE report draft (gross/micro/diagnosis/SNOMED). Blocked once SignedOut (addendum-only).
app.put('/api/pathology/specimens/:id/report', requireAuth, requireRole('pathology'), requireTenantScope, async (req, res) => {
    const client = await pool.connect();
    try {
        const { tenantId } = getRequestTenantContext(req);
        const sid = parseInt(req.params.id, 10);
        if (!Number.isInteger(sid) || !tenantId) { client.release(); return res.status(400).json({ error: 'Invalid request' }); }
        const { gross_text, micro_text, diagnosis, snomed_codes, icd10_codes } = req.body;
        await client.query('BEGIN');
        const rep = await client.query('SELECT id, state FROM path_reports WHERE specimen_id=$1 AND tenant_id=$2 FOR UPDATE', [sid, tenantId]);
        if (!rep.rows[0]) { await client.query('ROLLBACK'); client.release(); return res.status(404).json({ error: 'Report not found' }); }
        if (pathologyEngine.isImmutable(rep.rows[0].state)) {
            await client.query('ROLLBACK'); client.release();
            return res.status(409).json({ error: 'Report signed out and immutable; use addendum' });
        }
        // Server-derived flags (anti-spoof: ignore any client-supplied flag values).
        const snomed = Array.isArray(snomed_codes) ? snomed_codes.map(String).slice(0, 50) : [];
        const icd10 = Array.isArray(icd10_codes) ? icd10_codes.map(String).slice(0, 50) : [];
        const flags = pathologyEngine.deriveFlags({ diagnosis, micro_text, snomed_codes: snomed });
        await client.query(
            `UPDATE path_reports SET gross_text=$1, micro_text=$2, diagnosis=$3, snomed_codes=$4::jsonb,
                    icd10_codes=$5::jsonb, malignancy_flag=$6, critical_flag=$7, updated_at=CURRENT_TIMESTAMP
              WHERE specimen_id=$8 AND tenant_id=$9`,
            [gross_text || '', micro_text || '', diagnosis || '', JSON.stringify(snomed), JSON.stringify(icd10),
             flags.malignancy_flag, flags.critical_flag, sid, tenantId]);
        await client.query('COMMIT');
        client.release();
        logAudit(req.session.user?.id, req.session.user?.name, 'PATHOLOGY_REPORT_SAVE', 'Pathology', JSON.stringify({ specimen_id: sid, ...flags }), req.ip);
        res.json({ success: true, malignancy_flag: flags.malignancy_flag, critical_flag: flags.critical_flag });
    } catch (e) { try { await client.query('ROLLBACK'); } catch (_) {} client.release(); console.error('PATH report error:', e.message); res.status(500).json({ error: 'Server error' }); }
});

// SIGN-OUT — pathologist only; final transition Reported -> SignedOut; locks report.
app.post('/api/pathology/specimens/:id/signout', requireAuth, requireRole('pathology'), requireTenantScope, async (req, res) => {
    const client = await pool.connect();
    try {
        const { tenantId } = getRequestTenantContext(req);
        const sid = parseInt(req.params.id, 10);
        if (!Number.isInteger(sid) || !tenantId) { client.release(); return res.status(400).json({ error: 'Invalid request' }); }
        await client.query('BEGIN');
        const sp = await client.query('SELECT id, state FROM path_specimens WHERE id=$1 AND tenant_id=$2 FOR UPDATE', [sid, tenantId]);
        if (!sp.rows[0]) { await client.query('ROLLBACK'); client.release(); return res.status(404).json({ error: 'Specimen not found' }); }
        const current = sp.rows[0].state;
        if (current === 'SignedOut') { await client.query('ROLLBACK'); client.release(); return res.status(409).json({ error: 'Already signed out; addendum-only' }); }
        if (!pathologyEngine.isValidTransition(current, 'SignedOut')) {
            await client.query('ROLLBACK'); client.release();
            return res.status(409).json({ error: `Cannot sign out from ${current}; must reach Reported first` });
        }
        const rep = await client.query('SELECT id, diagnosis FROM path_reports WHERE specimen_id=$1 AND tenant_id=$2 FOR UPDATE', [sid, tenantId]);
        if (!rep.rows[0] || !String(rep.rows[0].diagnosis || '').trim()) {
            await client.query('ROLLBACK'); client.release();
            return res.status(409).json({ error: 'Cannot sign out: diagnosis required' });
        }
        await client.query('UPDATE path_specimens SET state=$1, updated_at=CURRENT_TIMESTAMP WHERE id=$2 AND tenant_id=$3', ['SignedOut', sid, tenantId]);
        await client.query(
            'UPDATE path_reports SET state=$1, signed_at=CURRENT_TIMESTAMP, signed_by=$2, pathologist_id=$2, updated_at=CURRENT_TIMESTAMP WHERE specimen_id=$3 AND tenant_id=$4',
            ['SignedOut', req.session.user?.id || null, sid, tenantId]);
        await client.query('COMMIT');
        client.release();
        logAudit(req.session.user?.id, req.session.user?.name, 'PATHOLOGY_SPECIMEN_SIGNOUT', 'Pathology', JSON.stringify({ specimen_id: sid }), req.ip);
        res.json({ success: true, state: 'SignedOut' });
    } catch (e) { try { await client.query('ROLLBACK'); } catch (_) {} client.release(); console.error('PATH signout error:', e.message); res.status(500).json({ error: 'Server error' }); }
});

// ADDENDUM — only after sign-out; append-only, never edits the signed report body.
app.post('/api/pathology/specimens/:id/addendum', requireAuth, requireRole('pathology'), requireTenantScope, async (req, res) => {
    const client = await pool.connect();
    try {
        const { tenantId } = getRequestTenantContext(req);
        const sid = parseInt(req.params.id, 10);
        if (!Number.isInteger(sid) || !tenantId) { client.release(); return res.status(400).json({ error: 'Invalid request' }); }
        const text = String(req.body?.text || '').trim();
        if (!text) { client.release(); return res.status(400).json({ error: 'Addendum text required' }); }
        await client.query('BEGIN');
        const rep = await client.query('SELECT id, state, addenda, addendum_count FROM path_reports WHERE specimen_id=$1 AND tenant_id=$2 FOR UPDATE', [sid, tenantId]);
        if (!rep.rows[0]) { await client.query('ROLLBACK'); client.release(); return res.status(404).json({ error: 'Report not found' }); }
        if (rep.rows[0].state !== 'SignedOut') { await client.query('ROLLBACK'); client.release(); return res.status(409).json({ error: 'Addendum allowed only after sign-out' }); }
        const entry = { text, by: req.session.user?.name || '', by_id: req.session.user?.id || null, at: new Date().toISOString() };
        const existing = Array.isArray(rep.rows[0].addenda) ? rep.rows[0].addenda : [];
        existing.push(entry);
        await client.query(
            'UPDATE path_reports SET addenda=$1::jsonb, addendum_count=addendum_count+1, updated_at=CURRENT_TIMESTAMP WHERE specimen_id=$2 AND tenant_id=$3',
            [JSON.stringify(existing), sid, tenantId]);
        await client.query('COMMIT');
        client.release();
        logAudit(req.session.user?.id, req.session.user?.name, 'PATHOLOGY_ADDENDUM_ADD', 'Pathology', JSON.stringify({ specimen_id: sid }), req.ip);
        res.json({ success: true, addendum_count: (rep.rows[0].addendum_count || 0) + 1 });
    } catch (e) { try { await client.query('ROLLBACK'); } catch (_) {} client.release(); console.error('PATH addendum error:', e.message); res.status(500).json({ error: 'Server error' }); }
});

// LEGACY GUARD: old client called PUT /api/pathology/specimens/:id { status:'completed' }.
// That bypassed the state machine. It is now rewired to a 409 telling clients to use /state.
app.put('/api/pathology/specimens/:id', requireAuth, requireRole('pathology', 'lab'), requireTenantScope, (req, res) => {
    res.status(409).json({ error: 'Deprecated: use PUT /api/pathology/specimens/:id/state (server-authoritative state machine)' });
});

// ===== CSSD BATCHES =====
app.get('/api/cssd/batches', requireAuth, requireRole('cssd', 'nursing', 'surgery'), requireTenantScope, async (req, res) => {
    try {
        // cssd_batches schema provisioned out-of-band (route_level_ddl_batch_b); no DDL in handler
        const t = e16RequireTenant(req);
        if (!t.ok) return res.status(403).json({ error: 'Tenant scope required' });
        res.json((await pool.query('SELECT * FROM cssd_batches WHERE tenant_id=$1 ORDER BY created_at DESC', [t.tenantId])).rows);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.post('/api/cssd/batches', requireAuth, requireRole('cssd', 'nursing', 'surgery'), requireTenantScope, async (req, res) => {
    try {
        const t = e16RequireTenant(req);
        if (!t.ok) return res.status(403).json({ error: 'Tenant scope required' });
        const { batch_number, items, department, method, temperature, operator } = req.body;
        // status server-set to 'processing'; completion goes through the hardened PUT (no client status).
        const r = await pool.query('INSERT INTO cssd_batches (batch_number,items,department,method,temperature,operator,status,tenant_id,facility_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *', [batch_number, items, department, method, temperature, operator, 'processing', t.tenantId, t.facilityId || null]);
        logAudit(req.session.user?.id, req.session.user?.display_name, 'CREATE_CSSD_BATCH', 'CSSD', `Started batch ${batch_number}`, req.ip);
        res.json(r.rows[0]);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.put('/api/cssd/batches/:id', requireAuth, requireRole('cssd', 'nursing', 'surgery'), requireTenantScope, async (req, res) => {
    try {
        const t = e16RequireTenant(req);
        if (!t.ok) return res.status(403).json({ error: 'Tenant scope required' });
        const batchId = e16.e16IntId(req.params.id);
        if (batchId === null) return res.status(404).json({ error: 'Batch not found' });
        const targetStatus = String(req.body.status || '');
        if (!['processing', 'completed', 'failed'].includes(targetStatus)) return res.status(422).json({ error: 'Invalid status' });
        // state machine: read current status (tenant-scoped) before update
        const BATCH_TRANSITIONS = { processing: ['completed', 'failed'], completed: [], failed: [] };
        const check = (await pool.query('SELECT id, status FROM cssd_batches WHERE id=$1 AND tenant_id=$2', [batchId, t.tenantId])).rows[0];
        if (!check) return res.status(404).json({ error: 'Batch not found' });
        const currentStatus = String(check.status || '').toLowerCase();
        const allowed = (BATCH_TRANSITIONS[currentStatus] || []).includes(targetStatus);
        if (!allowed) return res.status(409).json({ error: `Invalid batch transition ${currentStatus} -> ${targetStatus}` });
        const r = await pool.query('UPDATE cssd_batches SET status=$1 WHERE id=$2 AND tenant_id=$3 RETURNING *', [targetStatus, batchId, t.tenantId]);
        logAudit(req.session.user?.id, req.session.user?.display_name, 'UPDATE_CSSD_BATCH', 'CSSD', `Batch #${batchId} -> ${status}`, req.ip);
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
// C1 FIX: /api/infection-control/reports hardened — requireRole('infection') + requireTenantScope + fail-closed e17RequireTenant + tenant_id in every query.
// The primary UI path now calls /api/infection/surveillance (window.reportInfection); this legacy route is retained read-only for resolveIc and is fully guarded.
app.get('/api/infection-control/reports', requireAuth, requireRole('infection'), requireTenantScope, async (req, res) => {
    try {
        const tenantId = e17RequireTenant(req);
        res.json((await pool.query('SELECT * FROM infection_control_reports WHERE tenant_id=$1 ORDER BY created_at DESC', [tenantId])).rows);
    } catch (e) { res.status(e.statusCode || 500).json({ error: e.statusCode ? e.message : 'Server error' }); }
});
app.post('/api/infection-control/reports', requireAuth, requireRole('infection'), requireTenantScope, async (req, res) => {
    try {
        // C1 FIX: fail-closed tenant required; unscoped fallback removed.
        const tenantId = e17RequireTenant(req);
        const { patient_name, infection_type, ward, isolation_type, culture_results, action_taken, status } = req.body;
        const reportedBy = req.session.user?.display_name || req.session.user?.name || '';
        const r = await pool.query(
            'INSERT INTO infection_control_reports (patient_name,infection_type,ward,isolation_type,culture_results,action_taken,status,reported_by,tenant_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',
            [patient_name || '', infection_type || '', ward || '', isolation_type || '', culture_results || '', action_taken || '', status || 'active', reportedBy, tenantId]
        );
        res.json(r.rows[0]);
    } catch (e) { res.status(e.statusCode || 500).json({ error: e.statusCode ? e.message : 'Server error' }); }
});
app.put('/api/infection-control/reports/:id', requireAuth, requireRole('infection'), requireTenantScope, async (req, res) => {
    try {
        // C1 FIX: fail-closed tenant required; unscoped fallback removed.
        const tenantId = e17RequireTenant(req);
        const { status } = req.body;
        const r = await pool.query(
            'UPDATE infection_control_reports SET status=$1 WHERE id=$2 AND tenant_id=$3 RETURNING *',
            [status, req.params.id, tenantId]);
        if (r.rows.length === 0) return res.status(404).json({ error: 'Not found or unauthorized' });
        res.json(r.rows[0]);
    } catch (e) { res.status(e.statusCode || 500).json({ error: e.statusCode ? e.message : 'Server error' }); }
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

// ===== INSURANCE POLICIES (moved into the E11 INSURANCE / NPHIES block above — tenant-scoped) =====

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

// ===== E-X FOUNDATIONAL ROUTES (mounted AFTER all existing routes, BEFORE SPA catch-all) =====
// Additive only: does NOT modify requireRole / ROLE_PERMISSIONS or any existing route.
// requirePermission enforces the DB role_permissions matrix (closes L6) and falls back to the
// legacy ROLE_PERMISSIONS module check when no matrix row exists for the role (non-breaking).
const requirePermission = makeRequirePermission({
    pool,
    getRequestTenantContext,
    // Legacy fallback: reuse the in-code ROLE_PERMISSIONS module intersection used by requireRole.
    // For orders we map to clinical modules already granted to ordering roles (doctor/lab/radiology/pharmacy).
    roleFallback: (req) => {
        const role = req.session?.user?.role;
        const perms = ROLE_PERMISSIONS[role];
        if (perms === '*') return true; // Admin
        const orderModules = ['doctor', 'lab', 'radiology', 'pharmacy'];
        return !!(perms && orderModules.some(m => perms.includes(m)));
    }
});
mountOrderRoutes(app, { pool, requireAuth, requireTenantScope, getRequestTenantContext, logAudit, requirePermission });

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


// ===== E1 DOCTOR STATION ROUTES (additive; mounted BEFORE the SPA catch-all) =====
// Problem List + SOAP clinical notes + CDS-gated CPOE (orders via the E-X unified `orders` table).
// requirePermission (rbac.js / E-X2) is optional and not present on main yet -> guards fall back to
// requireAuth + requireTenantScope + requireRole('doctor'). cds is the pure FAIL-SAFE engine.
mountClinicalRoutes(app, {
    pool,
    requireAuth,
    requireTenantScope,
    getRequestTenantContext,
    logAudit,
    requireRole,
    requirePermission: (typeof requirePermission === 'function' ? requirePermission : undefined),
    cds,
});

// ============================================================================
// ===== E16 — INVENTORY / SUPPLY CHAIN + CSSD (batches, PO, GRN, movements,
//        transactional no-negative stock, CSSD biological-indicator gate) =====
// All tables provisioned out-of-band via candidate migrations e16_01/e16_02/e16_03
//   (NOT in db_postgres.js bootstrap). Every route: requireAuth + requireRole + tenant scope
//   + explicit AND tenant_id=$N on top of FORCE RLS. Mutations stamped + logAudit.
// ============================================================================

// fail-CLOSED tenant resolver (mirrors e7/e8/e9RequireTenant convention): returns the
// trusted session tenant or null; callers MUST 403 on null in production. Never invents a tenant.
function e16RequireTenant(req) {
    const { tenantId, facilityId, isProduction } = getRequestTenantContext(req);
    if (!tenantId) {
        if (isProduction) return { ok: false };           // fail-closed: no unscoped fallback in prod
        return { ok: false };                              // dev: getRequestTenantContext already injects 1; null here => still block
    }
    return { ok: true, tenantId, facilityId };
}

// Transactionally bind app.tenant_id on a DEDICATED client (the patched pool.query wrapper does
// NOT cover a client obtained via pool.connect(), so FORCE-RLS rows would be invisible without
// this). SET LOCAL scopes the setting to the surrounding transaction only.
async function e16BeginTenantTx(tenantId) {
    const client = await pool.connect();
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [String(tenantId)]);
    return client;
}

// ---- inventory items: low-stock by reorder_point (engine classification) ----
app.get('/api/inventory/items/low-stock', requireAuth, requireRole('inventory', 'pharmacy'), requireTenantScope, async (req, res) => {
    try {
        const t = e16RequireTenant(req);
        if (!t.ok) return res.status(403).json({ error: 'Tenant scope required' });
        const rows = (await pool.query(
            'SELECT id, item_name, item_code, stock_qty, reorder_point, min_qty FROM inventory_items WHERE is_active=1 AND tenant_id=$1 ORDER BY stock_qty ASC',
            [t.tenantId])).rows;
        const out = rows.map(r => {
            const rp = (r.reorder_point && r.reorder_point > 0) ? r.reorder_point : r.min_qty;
            return { ...r, stock_status: e16.stockStatus(r.stock_qty, rp), is_low: e16.isLowStock(r.stock_qty, rp) };
        }).filter(r => r.is_low);
        res.json(out);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ---- batches: list per item / create (FEFO source of truth) ----
app.get('/api/inventory/batches', requireAuth, requireRole('inventory', 'pharmacy'), requireTenantScope, async (req, res) => {
    try {
        const t = e16RequireTenant(req);
        if (!t.ok) return res.status(403).json({ error: 'Tenant scope required' });
        const itemId = e16.e16IntId(req.query.item_id);
        const params = [t.tenantId];
        let q = 'SELECT * FROM inventory_batches WHERE tenant_id=$1';
        if (itemId) { q += ' AND item_id=$2'; params.push(itemId); }
        q += ' ORDER BY expiry_date ASC NULLS LAST, id ASC';
        res.json((await pool.query(q, params)).rows);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ---- purchase orders: create (draft) ----
app.post('/api/inventory/purchase-orders', requireAuth, requireRole('inventory', 'pharmacy'), requireTenantScope, async (req, res) => {
    try {
        const t = e16RequireTenant(req);
        if (!t.ok) return res.status(403).json({ error: 'Tenant scope required' });
        const { po_number, supplier_id, supplier_name, notes, items } = req.body;
        if (!Array.isArray(items) || items.length === 0) return res.status(422).json({ error: 'PO must have at least one line item' });
        // validate every line: integer item id owned by tenant, positive qty.
        const lines = [];
        for (const it of items) {
            const iid = e16.e16IntId(it.item_id);
            const qty = e16.e16Qty(it.qty_ordered);
            if (iid === null || qty === null || qty <= 0) return res.status(422).json({ error: 'Invalid PO line' });
            const own = (await pool.query('SELECT id FROM inventory_items WHERE id=$1 AND tenant_id=$2', [iid, t.tenantId])).rows[0];
            if (!own) return res.status(404).json({ error: 'Item not found' });
            lines.push({ iid, qty, unit_cost: e16.e16Qty(it.unit_cost) || 0 });
        }
        const total = lines.reduce((s, l) => s + l.qty * l.unit_cost, 0);
        const client = await e16BeginTenantTx(t.tenantId);
        try {
            const po = (await client.query(
                'INSERT INTO purchase_orders (po_number, supplier_id, supplier_name, status, total_amount, notes, created_by, tenant_id, facility_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',
                [po_number || '', e16.e16IntId(supplier_id), supplier_name || '', 'draft', total, notes || '', req.session.user?.display_name || '', t.tenantId, t.facilityId || null])).rows[0];
            for (const l of lines) {
                await client.query(
                    'INSERT INTO purchase_order_items (po_id, item_id, qty_ordered, unit_cost, tenant_id, facility_id) VALUES ($1,$2,$3,$4,$5,$6)',
                    [po.id, l.iid, l.qty, l.unit_cost, t.tenantId, t.facilityId || null]);
            }
            await client.query('COMMIT');
            client.release();
            logAudit(req.session.user?.id, req.session.user?.display_name, 'CREATE_PURCHASE_ORDER', 'Inventory', `Created PO #${po.id} (${lines.length} lines, total ${total})`, req.ip);
            res.json(po);
        } catch (e) { try { await client.query('ROLLBACK'); } catch (_) {} client.release(); throw e; }
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ---- purchase orders: state transition (approve / cancel) — server-side state machine ----
app.put('/api/inventory/purchase-orders/:id/status', requireAuth, requireRole('inventory', 'pharmacy'), requireTenantScope, async (req, res) => {
    try {
        const t = e16RequireTenant(req);
        if (!t.ok) return res.status(403).json({ error: 'Tenant scope required' });
        const poId = e16.e16IntId(req.params.id);
        if (poId === null) return res.status(404).json({ error: 'PO not found' });
        const target = String(req.body.status || '');
        const client = await e16BeginTenantTx(t.tenantId);
        try {
            const po = (await client.query('SELECT id, status FROM purchase_orders WHERE id=$1 AND tenant_id=$2 FOR UPDATE', [poId, t.tenantId])).rows[0];
            if (!po) { await client.query('ROLLBACK'); client.release(); return res.status(404).json({ error: 'PO not found' }); }
            if (!e16.canTransitionPO(po.status, target)) {
                await client.query('ROLLBACK'); client.release();
                return res.status(409).json({ error: `Invalid PO transition ${po.status} -> ${target}` });
            }
            const approving = target === 'approved';
            const r = (await client.query(
                'UPDATE purchase_orders SET status=$1, approved_by=COALESCE($2,approved_by), approved_at=COALESCE($3,approved_at) WHERE id=$4 AND tenant_id=$5 RETURNING *',
                [target, approving ? (req.session.user?.display_name || '') : null, approving ? new Date().toISOString() : null, poId, t.tenantId])).rows[0];
            await client.query('COMMIT'); client.release();
            logAudit(req.session.user?.id, req.session.user?.display_name, 'UPDATE_PO_STATUS', 'Inventory', `PO #${poId}: ${po.status} -> ${target}`, req.ip);
            res.json(r);
        } catch (e) { try { await client.query('ROLLBACK'); } catch (_) {} client.release(); throw e; }
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ---- GRN: receive goods against an approved/partially-received PO (TRANSACTIONAL) ----
// Increments stock by creating a batch + a 'receive' movement per line, advances PO line/header
// state, all in one transaction. Receiving only valid from approved/partially_received (else 409).
app.post('/api/inventory/goods-receipts', requireAuth, requireRole('inventory', 'pharmacy'), requireTenantScope, async (req, res) => {
    try {
        const t = e16RequireTenant(req);
        if (!t.ok) return res.status(403).json({ error: 'Tenant scope required' });
        const poId = e16.e16IntId(req.body.po_id);
        if (poId === null) return res.status(404).json({ error: 'PO not found' });
        const { grn_number, notes, lines } = req.body;
        if (!Array.isArray(lines) || lines.length === 0) return res.status(422).json({ error: 'GRN must have at least one line' });

        const client = await e16BeginTenantTx(t.tenantId);
        try {
            // lock PO header first (ascending lock order: header before items)
            const po = (await client.query('SELECT id, status FROM purchase_orders WHERE id=$1 AND tenant_id=$2 FOR UPDATE', [poId, t.tenantId])).rows[0];
            if (!po) { await client.query('ROLLBACK'); client.release(); return res.status(404).json({ error: 'PO not found' }); }
            if (!e16.canReceivePO(po.status)) {
                await client.query('ROLLBACK'); client.release();
                return res.status(409).json({ error: `PO not receivable in status ${po.status}` });
            }
            // validate + lock each PO line (ascending id) before mutating
            const validated = [];
            const poItemIds = lines.map(l => e16.e16IntId(l.po_item_id)).filter(x => x !== null).sort((a, b) => a - b);
            if (poItemIds.length === 0) { await client.query('ROLLBACK'); client.release(); return res.status(422).json({ error: 'No valid PO items to receive' }); }
            for (const pid of poItemIds) {
                const line = lines.find(l => e16.e16IntId(l.po_item_id) === pid);
                const qty = e16.e16Qty(line.qty_received);
                if (qty === null || qty <= 0) { await client.query('ROLLBACK'); client.release(); return res.status(422).json({ error: 'Invalid GRN qty' }); }
                const poItem = (await client.query('SELECT id, item_id, qty_ordered, qty_received FROM purchase_order_items WHERE id=$1 AND po_id=$2 AND tenant_id=$3 FOR UPDATE', [pid, poId, t.tenantId])).rows[0];
                if (!poItem) { await client.query('ROLLBACK'); client.release(); return res.status(404).json({ error: 'PO line not found' }); }
                const remaining = poItem.qty_ordered - poItem.qty_received;
                if (qty > remaining) { await client.query('ROLLBACK'); client.release(); return res.status(409).json({ error: `Over-receipt: line ${pid} remaining ${remaining}, got ${qty}` }); }
                validated.push({ poItem, qty, lot_number: line.lot_number || '', expiry_date: line.expiry_date || null, unit_cost: e16.e16Qty(line.unit_cost) || 0 });
            }

            const grn = (await client.query(
                'INSERT INTO goods_receipts (grn_number, po_id, received_by, notes, tenant_id, facility_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
                [grn_number || '', poId, req.session.user?.display_name || '', notes || '', t.tenantId, t.facilityId || null])).rows[0];

            for (const v of validated) {
                // 1. create batch (qty_received = qty_on_hand at receipt)
                const batch = (await client.query(
                    'INSERT INTO inventory_batches (item_id, lot_number, expiry_date, qty_received, qty_on_hand, unit_cost, status, tenant_id, facility_id) VALUES ($1,$2,$3,$4,$4,$5,$6,$7,$8) RETURNING id',
                    [v.poItem.item_id, v.lot_number, v.expiry_date, v.qty, v.unit_cost, 'active', t.tenantId, t.facilityId || null])).rows[0];
                // 2. bump the item master stock_qty (server-authoritative)
                const upd = (await client.query(
                    'UPDATE inventory_items SET stock_qty = stock_qty + $1, updated_at=now() WHERE id=$2 AND tenant_id=$3 RETURNING stock_qty',
                    [v.qty, v.poItem.item_id, t.tenantId])).rows[0];
                // 3. ledger movement (receive, +qty)
                await client.query(
                    'INSERT INTO inventory_movements (item_id, batch_id, movement_type, qty_delta, balance_after, ref_table, ref_id, reason, created_by, tenant_id, facility_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
                    [v.poItem.item_id, batch.id, 'receive', v.qty, upd ? upd.stock_qty : null, 'goods_receipts', grn.id, 'GRN', req.session.user?.display_name || '', t.tenantId, t.facilityId || null]);
                // 4. GRN line + PO line received bump
                await client.query(
                    'INSERT INTO goods_receipt_items (grn_id, po_item_id, item_id, batch_id, qty_received, lot_number, expiry_date, unit_cost, tenant_id, facility_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
                    [grn.id, v.poItem.id, v.poItem.item_id, batch.id, v.qty, v.lot_number, v.expiry_date, v.unit_cost, t.tenantId, t.facilityId || null]);
                await client.query('UPDATE purchase_order_items SET qty_received = qty_received + $1 WHERE id=$2 AND tenant_id=$3', [v.qty, v.poItem.id, t.tenantId]);
            }

            // recompute PO header status from line fulfilment (server-authoritative)
            const agg = (await client.query('SELECT COALESCE(SUM(qty_ordered),0) AS ord, COALESCE(SUM(qty_received),0) AS rec FROM purchase_order_items WHERE po_id=$1 AND tenant_id=$2', [poId, t.tenantId])).rows[0];
            const newStatus = (Number(agg.rec) >= Number(agg.ord)) ? 'received' : 'partially_received';
            await client.query('UPDATE purchase_orders SET status=$1 WHERE id=$2 AND tenant_id=$3', [newStatus, poId, t.tenantId]);

            await client.query('COMMIT'); client.release();
            logAudit(req.session.user?.id, req.session.user?.display_name, 'CREATE_GOODS_RECEIPT', 'Inventory', `GRN #${grn.id} against PO #${poId}; PO now ${newStatus}`, req.ip);
            res.json({ ...grn, po_status: newStatus });
        } catch (e) { try { await client.query('ROLLBACK'); } catch (_) {} client.release(); throw e; }
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ---- stock movement: issue / adjust / transfer (TRANSACTIONAL, no-negative, FEFO) ----
// The server is authoritative on the movement sign — a client cannot turn an 'issue' into a
// stock-increasing op. Decrements are FEFO across batches and blocked (409) if insufficient.
app.post('/api/inventory/movements', requireAuth, requireRole('inventory', 'pharmacy'), requireTenantScope, async (req, res) => {
    try {
        const t = e16RequireTenant(req);
        if (!t.ok) return res.status(403).json({ error: 'Tenant scope required' });
        const itemId = e16.e16IntId(req.body.item_id);
        const qty = e16.e16Qty(req.body.qty);
        const movementType = String(req.body.movement_type || '');
        if (itemId === null || qty === null || qty <= 0) return res.status(422).json({ error: 'Invalid item or quantity' });
        const sign = e16.movementSign(movementType);
        if (sign === null) return res.status(422).json({ error: 'Invalid movement_type' });

        const client = await e16BeginTenantTx(t.tenantId);
        try {
            const item = (await client.query('SELECT id, stock_qty FROM inventory_items WHERE id=$1 AND tenant_id=$2 FOR UPDATE', [itemId, t.tenantId])).rows[0];
            if (!item) { await client.query('ROLLBACK'); client.release(); return res.status(404).json({ error: 'Item not found' }); }

            if (sign < 0) {
                // DECREMENT path: never allow negative. Allocate FEFO across active batches (locked ascending id).
                const dec = e16.checkDecrement(item.stock_qty, qty);
                if (!dec.ok) { await client.query('ROLLBACK'); client.release(); return res.status(409).json({ error: 'Insufficient stock', detail: dec }); }
                const batches = (await client.query(
                    'SELECT id, qty_on_hand, expiry_date FROM inventory_batches WHERE item_id=$1 AND tenant_id=$2 AND qty_on_hand > 0 ORDER BY id ASC FOR UPDATE',
                    [itemId, t.tenantId])).rows;
                const alloc = e16.fefoAllocate(batches, qty);
                if (!alloc.ok) { await client.query('ROLLBACK'); client.release(); return res.status(409).json({ error: 'Insufficient batch stock', detail: alloc }); }
                // apply allocations in ascending batch id order (deadlock-safe)
                const ordered = [...alloc.allocations].sort((a, b) => a.batch_id - b.batch_id);
                for (const a of ordered) {
                    const ur = await client.query(
                        'UPDATE inventory_batches SET qty_on_hand = qty_on_hand - $1 WHERE id=$2 AND tenant_id=$3 AND qty_on_hand >= $1 RETURNING qty_on_hand',
                        [a.qty, a.batch_id, t.tenantId]);
                    if (ur.rowCount === 0) { await client.query('ROLLBACK'); client.release(); return res.status(409).json({ error: 'Batch race / insufficient batch stock' }); }
                }
                const newQty = (await client.query(
                    'UPDATE inventory_items SET stock_qty = stock_qty - $1, updated_at=now() WHERE id=$2 AND tenant_id=$3 AND stock_qty >= $1 RETURNING stock_qty',
                    [qty, itemId, t.tenantId]));
                if (newQty.rowCount === 0) { await client.query('ROLLBACK'); client.release(); return res.status(409).json({ error: 'Insufficient stock' }); }
                await client.query(
                    'INSERT INTO inventory_movements (item_id, batch_id, movement_type, qty_delta, balance_after, ref_table, ref_id, reason, created_by, tenant_id, facility_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
                    [itemId, ordered[0] ? ordered[0].batch_id : null, movementType, -qty, newQty.rows[0].stock_qty, String(req.body.ref_table || ''), e16.e16IntId(req.body.ref_id), String(req.body.reason || ''), req.session.user?.display_name || '', t.tenantId, t.facilityId || null]);
                await client.query('COMMIT'); client.release();
                logAudit(req.session.user?.id, req.session.user?.display_name, 'STOCK_MOVEMENT', 'Inventory', `${movementType} -${qty} item #${itemId}; FEFO over ${ordered.length} batch(es)`, req.ip);
                return res.json({ success: true, balance_after: newQty.rows[0].stock_qty, allocations: ordered });
            } else {
                // INCREMENT path (adjust_in / transfer_in): bump master; optional batch.
                const batchId = e16.e16IntId(req.body.batch_id);
                if (batchId) {
                    const br = await client.query('UPDATE inventory_batches SET qty_on_hand = qty_on_hand + $1 WHERE id=$2 AND tenant_id=$3 RETURNING id', [qty, batchId, t.tenantId]);
                    if (br.rowCount === 0) { await client.query('ROLLBACK'); client.release(); return res.status(404).json({ error: 'Batch not found' }); }
                }
                const newQty = (await client.query('UPDATE inventory_items SET stock_qty = stock_qty + $1, updated_at=now() WHERE id=$2 AND tenant_id=$3 RETURNING stock_qty', [qty, itemId, t.tenantId])).rows[0];
                await client.query(
                    'INSERT INTO inventory_movements (item_id, batch_id, movement_type, qty_delta, balance_after, ref_table, ref_id, reason, created_by, tenant_id, facility_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
                    [itemId, batchId, movementType, qty, newQty.stock_qty, String(req.body.ref_table || ''), e16.e16IntId(req.body.ref_id), String(req.body.reason || ''), req.session.user?.display_name || '', t.tenantId, t.facilityId || null]);
                await client.query('COMMIT'); client.release();
                logAudit(req.session.user?.id, req.session.user?.display_name, 'STOCK_MOVEMENT', 'Inventory', `${movementType} +${qty} item #${itemId}`, req.ip);
                return res.json({ success: true, balance_after: newQty.stock_qty });
            }
        } catch (e) { try { await client.query('ROLLBACK'); } catch (_) {} client.release(); throw e; }
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ---- stock movements ledger (read) ----
app.get('/api/inventory/movements', requireAuth, requireRole('inventory', 'pharmacy'), requireTenantScope, async (req, res) => {
    try {
        const t = e16RequireTenant(req);
        if (!t.ok) return res.status(403).json({ error: 'Tenant scope required' });
        const itemId = e16.e16IntId(req.query.item_id);
        const params = [t.tenantId];
        let q = 'SELECT * FROM inventory_movements WHERE tenant_id=$1';
        if (itemId) { q += ' AND item_id=$2'; params.push(itemId); }
        q += ' ORDER BY created_at DESC, id DESC LIMIT 500';
        res.json((await pool.query(q, params)).rows);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ---- periodic stock count / reconciliation (records variance; optional adjust movement) ----
app.post('/api/inventory/stock-counts', requireAuth, requireRole('inventory', 'pharmacy'), requireTenantScope, async (req, res) => {
    try {
        const t = e16RequireTenant(req);
        if (!t.ok) return res.status(403).json({ error: 'Tenant scope required' });
        const itemId = e16.e16IntId(req.body.item_id);
        const counted = e16.e16Qty(req.body.counted_qty);
        if (itemId === null || counted === null || counted < 0) return res.status(422).json({ error: 'Invalid item or counted_qty' });
        const client = await e16BeginTenantTx(t.tenantId);
        try {
            const item = (await client.query('SELECT id, stock_qty FROM inventory_items WHERE id=$1 AND tenant_id=$2 FOR UPDATE', [itemId, t.tenantId])).rows[0];
            if (!item) { await client.query('ROLLBACK'); client.release(); return res.status(404).json({ error: 'Item not found' }); }
            const systemQty = item.stock_qty;
            const diff = counted - systemQty;     // server computes variance (not client-trusted)
            const reconcile = req.body.reconcile === true || req.body.reconcile === 'true';
            const sc = (await client.query(
                'INSERT INTO inventory_stock_counts (item_id, system_qty, counted_qty, difference, reconciled, counted_by, notes, tenant_id, facility_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',
                [itemId, systemQty, counted, diff, reconcile ? 1 : 0, req.session.user?.display_name || '', String(req.body.notes || ''), t.tenantId, t.facilityId || null])).rows[0];
            if (reconcile && diff !== 0) {
                const mtype = diff > 0 ? 'adjust_in' : 'adjust_out';
                const newQty = (await client.query('UPDATE inventory_items SET stock_qty=$1, updated_at=now() WHERE id=$2 AND tenant_id=$3 RETURNING stock_qty', [counted, itemId, t.tenantId])).rows[0];
                await client.query(
                    'INSERT INTO inventory_movements (item_id, movement_type, qty_delta, balance_after, ref_table, ref_id, reason, created_by, tenant_id, facility_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
                    [itemId, mtype, diff, newQty.stock_qty, 'inventory_stock_counts', sc.id, 'reconciliation', req.session.user?.display_name || '', t.tenantId, t.facilityId || null]);
            }
            await client.query('COMMIT'); client.release();
            logAudit(req.session.user?.id, req.session.user?.display_name, 'STOCK_COUNT', 'Inventory', `Count item #${itemId}: sys ${systemQty} vs counted ${counted} (diff ${diff})${reconcile ? ' reconciled' : ''}`, req.ip);
            res.json(sc);
        } catch (e) { try { await client.query('ROLLBACK'); } catch (_) {} client.release(); throw e; }
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// ============================================================================
// ===== E16 — CSSD biological-indicator (BI) gate (fail-CLOSED) =====
// A cycle's BI result is recorded server-side; a cycle/tray can only be RELEASED for sterile
// issue when the BI is an explicit recorded PASS. The client cannot self-assert 'Pass'.
// ============================================================================

// record the BI / CI result for a cycle (does NOT itself release — that is a separate gated step)
app.put('/api/cssd/cycles/:id/bi-result', requireAuth, requireRole('cssd', 'nursing', 'surgery'), requireTenantScope, async (req, res) => {
    try {
        const t = e16RequireTenant(req);
        if (!t.ok) return res.status(403).json({ error: 'Tenant scope required' });
        const cycleId = e16.e16IntId(req.params.id);
        if (cycleId === null) return res.status(404).json({ error: 'Cycle not found' });
        const bi = e16.normIndicator(req.body.bi_test_result);     // normalised server-side
        const ci = e16.normIndicator(req.body.ci_result);
        if (bi === null) return res.status(422).json({ error: 'bi_test_result required' });
        const client = await e16BeginTenantTx(t.tenantId);
        try {
            const cyc = (await client.query('SELECT id, status FROM cssd_sterilization_cycles WHERE id=$1 AND tenant_id=$2 FOR UPDATE', [cycleId, t.tenantId])).rows[0];
            if (!cyc) { await client.query('ROLLBACK'); client.release(); return res.status(404).json({ error: 'Cycle not found' }); }
            const r = (await client.query(
                'UPDATE cssd_sterilization_cycles SET bi_test_result=$1, ci_result=$2, bi_indicator_lot=$3, bi_result_recorded_at=now(), bi_result_by=$4 WHERE id=$5 AND tenant_id=$6 RETURNING *',
                [bi, ci || '', String(req.body.bi_indicator_lot || ''), req.session.user?.display_name || '', cycleId, t.tenantId])).rows[0];
            await client.query('COMMIT'); client.release();
            logAudit(req.session.user?.id, req.session.user?.display_name, 'CSSD_BI_RESULT', 'CSSD', `Cycle #${cycleId} BI=${bi} CI=${ci || 'n/a'}`, req.ip);
            res.json(r);
        } catch (e) { try { await client.query('ROLLBACK'); } catch (_) {} client.release(); throw e; }
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// THE GATE: release a completed cycle's load for sterile issue — fail-CLOSED on BI.
app.put('/api/cssd/cycles/:id/release', requireAuth, requireRole('cssd', 'nursing', 'surgery'), requireTenantScope, async (req, res) => {
    try {
        const t = e16RequireTenant(req);
        if (!t.ok) return res.status(403).json({ error: 'Tenant scope required' });
        const cycleId = e16.e16IntId(req.params.id);
        if (cycleId === null) return res.status(404).json({ error: 'Cycle not found' });
        const client = await e16BeginTenantTx(t.tenantId);
        try {
            const cyc = (await client.query('SELECT * FROM cssd_sterilization_cycles WHERE id=$1 AND tenant_id=$2 FOR UPDATE', [cycleId, t.tenantId])).rows[0];
            if (!cyc) { await client.query('ROLLBACK'); client.release(); return res.status(404).json({ error: 'Cycle not found' }); }
            // require the cycle to be completed AND BI passed (engine is authoritative, fail-closed)
            const gate = e16.canIssueSterileLoad(String(cyc.status || '').toLowerCase(), cyc.bi_test_result, cyc.ci_result);
            if (!gate.allowed) {
                await client.query('ROLLBACK'); client.release();
                return res.status(409).json({ error: 'Sterile release blocked', reason: gate.reason });
            }
            await client.query('UPDATE cssd_sterilization_cycles SET released_for_issue=1 WHERE id=$1 AND tenant_id=$2', [cycleId, t.tenantId]);
            // promote this cycle's trays to sterile (only those still in_cycle/packed)
            await client.query("UPDATE cssd_trays SET status='sterile', sterilized_at=now() WHERE cycle_id=$1 AND tenant_id=$2 AND status IN ('packed','in_cycle')", [cycleId, t.tenantId]);
            await client.query('COMMIT'); client.release();
            logAudit(req.session.user?.id, req.session.user?.display_name, 'CSSD_RELEASE_STERILE', 'CSSD', `Cycle #${cycleId} released for issue (BI passed)`, req.ip);
            res.json({ success: true, released: true });
        } catch (e) { try { await client.query('ROLLBACK'); } catch (_) {} client.release(); throw e; }
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// CSSD trays: list / create (packed) ----
app.get('/api/cssd/trays', requireAuth, requireRole('cssd', 'nursing', 'surgery'), requireTenantScope, async (req, res) => {
    try {
        const t = e16RequireTenant(req);
        if (!t.ok) return res.status(403).json({ error: 'Tenant scope required' });
        res.json((await pool.query('SELECT * FROM cssd_trays WHERE tenant_id=$1 ORDER BY id DESC LIMIT 500', [t.tenantId])).rows);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});
app.post('/api/cssd/trays', requireAuth, requireRole('cssd', 'nursing', 'surgery'), requireTenantScope, async (req, res) => {
    try {
        const t = e16RequireTenant(req);
        if (!t.ok) return res.status(403).json({ error: 'Tenant scope required' });
        const r = (await pool.query(
            'INSERT INTO cssd_trays (tray_code, set_id, cycle_id, department, status, notes, created_by, tenant_id, facility_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',
            [String(req.body.tray_code || ''), e16.e16IntId(req.body.set_id), e16.e16IntId(req.body.cycle_id), String(req.body.department || ''), 'packed', String(req.body.notes || ''), req.session.user?.display_name || '', t.tenantId, t.facilityId || null])).rows[0];
        logAudit(req.session.user?.id, req.session.user?.display_name, 'CREATE_CSSD_TRAY', 'CSSD', `Created tray ${r.tray_code} (#${r.id})`, req.ip);
        res.json(r);
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// issue a STERILE tray to OR/ward — fail-CLOSED: only a tray already 'sterile' may be issued.
app.put('/api/cssd/trays/:id/issue', requireAuth, requireRole('cssd', 'nursing', 'surgery'), requireTenantScope, async (req, res) => {
    try {
        const t = e16RequireTenant(req);
        if (!t.ok) return res.status(403).json({ error: 'Tenant scope required' });
        const trayId = e16.e16IntId(req.params.id);
        if (trayId === null) return res.status(404).json({ error: 'Tray not found' });
        const client = await e16BeginTenantTx(t.tenantId);
        try {
            const tray = (await client.query('SELECT id, status, cycle_id FROM cssd_trays WHERE id=$1 AND tenant_id=$2 FOR UPDATE', [trayId, t.tenantId])).rows[0];
            if (!tray) { await client.query('ROLLBACK'); client.release(); return res.status(404).json({ error: 'Tray not found' }); }
            if (tray.status !== 'sterile') {
                await client.query('ROLLBACK'); client.release();
                return res.status(409).json({ error: 'Tray not sterile-released', status: tray.status });
            }
            // defence-in-depth: re-confirm the parent cycle BI gate still holds at issue time
            if (!tray.cycle_id) {
                // cycle deleted (ON DELETE SET NULL) — a tray without a verifiable cycle must not be issued
                await client.query('ROLLBACK'); client.release();
                return res.status(409).json({ error: 'cycle_missing' });
            }
            {
                const cyc = (await client.query('SELECT status, bi_test_result, ci_result, released_for_issue FROM cssd_sterilization_cycles WHERE id=$1 AND tenant_id=$2', [tray.cycle_id, t.tenantId])).rows[0];
                const gate = cyc ? e16.canIssueSterileLoad(String(cyc.status || '').toLowerCase(), cyc.bi_test_result, cyc.ci_result) : { allowed: false, reason: 'cycle_missing' };
                if (!gate.allowed || !cyc.released_for_issue) {
                    await client.query('ROLLBACK'); client.release();
                    return res.status(409).json({ error: 'Sterile issue blocked', reason: gate.reason || 'not_released' });
                }
            }
            const r = (await client.query(
                "UPDATE cssd_trays SET status='issued', issued_to=$1, issued_at=now(), used_in_surgery_id=$2 WHERE id=$3 AND tenant_id=$4 RETURNING *",
                [String(req.body.issued_to || ''), e16.e16IntId(req.body.used_in_surgery_id), trayId, t.tenantId])).rows[0];
            await client.query('COMMIT'); client.release();
            logAudit(req.session.user?.id, req.session.user?.display_name, 'CSSD_ISSUE_TRAY', 'CSSD', `Issued sterile tray #${trayId} to ${req.body.issued_to || 'n/a'}`, req.ip);
            res.json(r);
        } catch (e) { try { await client.query('ROLLBACK'); } catch (_) {} client.release(); throw e; }
    } catch (e) { res.status(500).json({ error: 'Server error' }); }
});
// ===== END E16 ROUTES =====

// ===== SPA CATCH-ALL (must be LAST route) =====
app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

startServer();
