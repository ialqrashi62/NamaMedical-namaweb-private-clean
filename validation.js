/**
 * validation.js — central, dependency-free input validation (GATE3-H1 remediation).
 *
 * Why: input validation was scattered inline across ~538 routes with no single source of truth, so
 * non-money fields (required strings, ids, enums, dates, lengths, Saudi national-id/phone) were
 * validated inconsistently or not at all. Money fields are already robustly validated by
 * ./billing_integrity (parseMoney / assertAmountWithinCap, fail-closed) — this module complements that
 * for the NON-money fields and is the building block for a gradual per-route rollout.
 *
 * Design (mirrors ./billing_integrity):
 *   - Pure, side-effect-free, no external dependency.
 *   - FAIL-CLOSED: every validator throws a ValidationError on bad input (never silently coerces).
 *   - Errors carry .statusCode = 400 so the existing sendBillingError(res, e) path (server.js) maps
 *     them to HTTP 400 automatically, and `.field` for client-friendly messages.
 *   - validateBody(schema) returns an Express middleware; validate(obj, schema) is the pure core.
 *
 * IMPORTANT: this module is ADDITIVE. Importing it has ZERO runtime effect until a route opts in via
 * validate()/validateBody(). It does not modify or replace any existing inline checks.
 */
'use strict';

class ValidationError extends Error {
    constructor(message, field) {
        super(message);
        this.name = 'ValidationError';
        this.statusCode = 400;
        if (field) this.field = field;
    }
}

function fail(field, msg) { throw new ValidationError(`${field}: ${msg}`, field); }

// ---- primitive validators (each returns the cleaned value or throws) ----

function str(value, { field = 'value', required = true, min = 0, max = 10000, trim = true } = {}) {
    if (value === undefined || value === null || value === '') {
        if (required) fail(field, 'is required');
        return '';
    }
    if (typeof value !== 'string') fail(field, 'must be a string');
    const v = trim ? value.trim() : value;
    if (required && v.length === 0) fail(field, 'must not be blank');
    if (v.length < min) fail(field, `must be at least ${min} characters`);
    if (v.length > max) fail(field, `must be at most ${max} characters`);
    return v;
}

function int(value, { field = 'value', required = true, min = -Infinity, max = Infinity } = {}) {
    if (value === undefined || value === null || value === '') {
        if (required) fail(field, 'is required');
        return null;
    }
    const n = Number(value);
    if (!Number.isInteger(n)) fail(field, 'must be an integer');
    if (n < min) fail(field, `must be >= ${min}`);
    if (n > max) fail(field, `must be <= ${max}`);
    return n;
}

function num(value, { field = 'value', required = true, min = -Infinity, max = Infinity } = {}) {
    if (value === undefined || value === null || value === '') {
        if (required) fail(field, 'is required');
        return null;
    }
    const n = Number(value);
    if (!Number.isFinite(n)) fail(field, 'must be a number');
    if (n < min) fail(field, `must be >= ${min}`);
    if (n > max) fail(field, `must be <= ${max}`);
    return n;
}

// positive integer primary-key / foreign-key id
function id(value, { field = 'id', required = true } = {}) {
    return int(value, { field, required, min: 1, max: Number.MAX_SAFE_INTEGER });
}

function enumOf(value, allowed, { field = 'value', required = true } = {}) {
    if (value === undefined || value === null || value === '') {
        if (required) fail(field, 'is required');
        return '';
    }
    if (!Array.isArray(allowed) || !allowed.includes(value)) {
        fail(field, `must be one of: ${(allowed || []).join(', ')}`);
    }
    return value;
}

function bool(value, { field = 'value', required = false } = {}) {
    if (value === undefined || value === null || value === '') {
        if (required) fail(field, 'is required');
        return false;
    }
    if (value === true || value === 1 || value === '1' || value === 'true') return true;
    if (value === false || value === 0 || value === '0' || value === 'false') return false;
    fail(field, 'must be a boolean');
}

// accepts a parseable date (ISO 8601 preferred); returns the original string after validity check
function dateStr(value, { field = 'date', required = true } = {}) {
    if (value === undefined || value === null || value === '') {
        if (required) fail(field, 'is required');
        return '';
    }
    if (typeof value !== 'string') fail(field, 'must be a date string');
    const t = Date.parse(value);
    if (Number.isNaN(t)) fail(field, 'must be a valid date');
    return value;
}

// Saudi national id / iqama: exactly 10 digits (optional unless required)
function nationalId(value, { field = 'national_id', required = false } = {}) {
    if (value === undefined || value === null || value === '') {
        if (required) fail(field, 'is required');
        return '';
    }
    const v = String(value).trim();
    if (!/^\d{10}$/.test(v)) fail(field, 'must be 10 digits');
    return v;
}

// phone: 7..15 chars, digits with optional leading + and spaces/dashes
function phone(value, { field = 'phone', required = false } = {}) {
    if (value === undefined || value === null || value === '') {
        if (required) fail(field, 'is required');
        return '';
    }
    const v = String(value).trim();
    if (!/^\+?[\d\s-]{7,15}$/.test(v)) fail(field, 'must be a valid phone number');
    return v;
}

// ---- schema runner ----
// schema: { fieldName: (value, ctx) => cleaned } where each fn is one of the validators above bound
// with options, OR a plain options object { type, ...opts }. Returns a NEW object of cleaned values.
const TYPES = { str, int, num, id, enumOf, bool, dateStr, nationalId, phone };

function validate(obj, schema) {
    if (!obj || typeof obj !== 'object') throw new ValidationError('body: must be an object', 'body');
    const out = {};
    for (const field of Object.keys(schema)) {
        const spec = schema[field];
        if (typeof spec === 'function') {
            out[field] = spec(obj[field], field);
        } else if (spec && typeof spec === 'object' && spec.type) {
            const fn = TYPES[spec.type];
            if (!fn) throw new Error(`validation: unknown type '${spec.type}' for field '${field}'`);
            const { type, allowed, ...opts } = spec;
            out[field] = type === 'enumOf'
                ? fn(obj[field], allowed, { field, ...opts })
                : fn(obj[field], { field, ...opts });
        } else {
            throw new Error(`validation: invalid spec for field '${field}'`);
        }
    }
    return out;
}

// Express middleware: validates req.body against schema, attaches cleaned values to req.validated,
// and on failure responds 400 (fail-closed) without leaking internals.
function validateBody(schema) {
    return function (req, res, next) {
        try {
            req.validated = validate(req.body || {}, schema);
            return next();
        } catch (e) {
            if (e instanceof ValidationError) {
                return res.status(400).json({ error: e.message, field: e.field });
            }
            console.error('validation middleware error:', e.message);
            return res.status(400).json({ error: 'Invalid request' });
        }
    };
}

module.exports = {
    ValidationError,
    str, int, num, id, enumOf, bool, dateStr, nationalId, phone,
    validate, validateBody
};
