/**
 * route_schemas.js — accurate validation schemas for high-value financial/clinical routes (GATE3-H1).
 *
 * These schemas are derived by reading the ACTUAL req.body usage of each route, so they are
 * NON-BREAKING: every field a route currently accepts is allowed; money fields that are already
 * validated server-side by ./billing_integrity (parseMoney/enforceDiscountCap) and engine-validated
 * structures (journal lines via finance_engine.validateBalancedEntry) are intentionally LEFT to those
 * authorities and not duplicated here.
 *
 * Usage (deferred to staging integration test — PHASE 1.2):
 *   const { validateBody } = require('./validation');
 *   const S = require('./route_schemas');
 *   app.post('/api/invoices', requireAuth, requireRole('invoices','accounts'), validateBody(S.invoiceCreate), handler)
 *
 * Each schema uses ./validation specs. Most fields are OPTIONAL (the routes accept partial bodies and
 * the permissive DB schema defaults blanks) — we enforce TYPE, LENGTH, ENUM, and DATE validity only,
 * which strictly hardens without rejecting any currently-valid request.
 */
'use strict';

// POST /api/invoices — body: patient_id?, patient_name?, description?, service_type?, payment_method?,
// discount_reason?  (total/discount validated by billing_integrity.parseMoney; not duplicated here)
const invoiceCreate = {
    patient_id:      { type: 'id',  required: false },
    patient_name:    { type: 'str', required: false, max: 200 },
    description:     { type: 'str', required: false, max: 1000 },
    service_type:    { type: 'str', required: false, max: 100 },
    payment_method:  { type: 'str', required: false, max: 40 },
    discount_reason: { type: 'str', required: false, max: 500 }
};

// POST /api/finance/journal — body: entry_date, description?, reference?, source_type?
// (lines[] balance is validated by finance_engine.validateBalancedEntry; not duplicated here)
const journalCreate = {
    entry_date:  { type: 'dateStr', required: true },
    description: { type: 'str', required: false, max: 1000 },
    reference:   { type: 'str', required: false, max: 200 },
    source_type: { type: 'enumOf', allowed: ['MANUAL', 'INVOICE', 'SYSTEM'], required: false }
};

// POST /api/invoices/:id/refund — body: amount (validated by billing_integrity), reason?
const invoiceRefund = {
    reason: { type: 'str', required: false, max: 500 }
};

// POST /api/patients — common PHI registration fields. national_id is LENIENT (non-Saudi patients use
// iqama/passport which are NOT 10 digits), so it is a bounded string, not the strict 10-digit validator.
const patientCreate = {
    name_ar:     { type: 'str', required: false, max: 200 },
    name_en:     { type: 'str', required: false, max: 200 },
    national_id: { type: 'str', required: false, max: 30 },   // lenient: iqama/passport allowed
    phone:       { type: 'phone', required: false },
    gender:      { type: 'enumOf', allowed: ['Male', 'Female', 'male', 'female', 'M', 'F', 'ذكر', 'أنثى', ''], required: false },
    dob:         { type: 'str', required: false, max: 30 }
};

// POST /api/settings/integrations — high-value compliance config edge.
// NOTE: config_json is intentionally not schema-validated here because the route accepts either
// string or object and then applies per-integration deep validators (ZATCA/NPHIES/CBAHI).
const integrationSettingsSave = {
    integration_name: { type: 'str', required: true, max: 40 },
    provider:         { type: 'str', required: false, max: 200 },
    api_key:          { type: 'str', required: false, max: 4000 },
    api_secret:       { type: 'str', required: false, max: 4000 },
    endpoint_url:     { type: 'str', required: false, max: 2000 },
    is_enabled:       { type: 'int', required: false, min: 0, max: 1 }
};

// POST /api/settings/integrations/ping
const integrationPing = {
    integration_name: { type: 'str', required: true, max: 40 }
};

// POST /api/zatca/submit
const zatcaSubmit = {
    invoice_id: { type: 'id', required: true }
};

module.exports = {
    invoiceCreate,
    journalCreate,
    invoiceRefund,
    patientCreate,
    integrationSettingsSave,
    integrationPing,
    zatcaSubmit
};
