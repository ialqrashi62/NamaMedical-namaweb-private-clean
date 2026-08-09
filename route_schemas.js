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

// PUT /api/invoices/:id/pay
const invoicePay = {
    payment_method: { type: 'str', required: false, max: 80 }
};

// POST /api/payments/moyasar/initiate
const paymentMoyasarInitiate = {
    invoiceId: { type: 'id', required: true }
};

// POST /api/invoices/cancel/:id
const invoiceCancel = {
    reason: { type: 'str', required: false, max: 500 }
};

// PUT /api/invoices/:id/partial-pay
const invoicePartialPay = {
    amount_paid:    { type: 'num', required: true, min: 0.01 },
    payment_method: { type: 'str', required: false, max: 80 }
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

// POST /api/finance/ap
const financeApCreate = {
    vendor_id:        { type: 'id', required: false },
    vendor_name:      { type: 'str', required: true, max: 200 },
    invoice_number:   { type: 'str', required: true, max: 120 },
    invoice_date:     { type: 'dateStr', required: false },
    due_date:         { type: 'dateStr', required: false },
    po_reference:     { type: 'str', required: false, max: 120 },
    description:      { type: 'str', required: false, max: 1000 },
    subtotal:         { type: 'num', required: false, min: 0 },
    vat_amount:       { type: 'num', required: false, min: 0 },
    total_amount:     { type: 'num', required: true, min: 0.01 },
    gl_account_code:  { type: 'str', required: false, max: 40 },
    cost_center:      { type: 'str', required: false, max: 120 },
    notes:            { type: 'str', required: false, max: 1000 }
};

// POST /api/finance/ap/:id/pay
const financeApPay = {
    payment_amount:    { type: 'num', required: true, min: 0.01 },
    payment_method:    { type: 'str', required: false, max: 80 },
    payment_reference: { type: 'str', required: false, max: 200 }
};

// POST /api/finance/ar
const financeArCreate = {
    patient_id:       { type: 'id', required: false },
    patient_name:     { type: 'str', required: false, max: 200 },
    payer_type:       { type: 'str', required: false, max: 80 },
    payer_id:         { type: 'id', required: false },
    payer_name:       { type: 'str', required: false, max: 200 },
    invoice_number:   { type: 'str', required: true, max: 120 },
    visit_id:         { type: 'id', required: false },
    admission_id:     { type: 'id', required: false },
    due_date:         { type: 'dateStr', required: false },
    subtotal:         { type: 'num', required: false, min: 0 },
    discount_amount:  { type: 'num', required: false, min: 0 },
    insurance_share:  { type: 'num', required: false, min: 0 },
    patient_share:    { type: 'num', required: false, min: 0 },
    vat_amount:       { type: 'num', required: false, min: 0 },
    total_amount:     { type: 'num', required: true, min: 0.01 },
    notes:            { type: 'str', required: false, max: 1000 }
};

// POST /api/finance/ar/:id/collect
const financeArCollect = {
    collection_amount: { type: 'num', required: true, min: 0.01 }
};

// POST /api/finance/reports/generate
const financeReportGenerate = {
    report_type:  { type: 'str', required: false, max: 20 },
    period_start: { type: 'dateStr', required: true },
    period_end:   { type: 'dateStr', required: true }
};

// POST /api/orders
const clinicalOrderCreate = {
    patient_id:   { type: 'id', required: true },
    type:         { type: 'str', required: true, max: 80 },
    description:  { type: 'str', required: true, max: 2000 },
    quantity:     { type: 'int', required: false, min: 1, max: 1000 },
    status:       { type: 'str', required: false, max: 80 },
    notes:        { type: 'str', required: false, max: 2000 },
    urgency:      { type: 'str', required: false, max: 40 }
};

// POST /api/prescriptions
const prescriptionCreate = {
    patient_id:        { type: 'id', required: true },
    medication_name:   { type: 'str', required: true, max: 300 },
    dosage:            { type: 'str', required: false, max: 200 },
    quantity_per_day:  { type: 'str', required: false, max: 20 },
    frequency:         { type: 'str', required: false, max: 100 },
    duration:          { type: 'str', required: false, max: 100 },
    override_reason:   { type: 'str', required: false, max: 1000 }
};

// PUT /api/pharmacy/queue/:id
const pharmacyQueueUpdate = {
    status:         { type: 'str', required: false, max: 40 },
    price:          { type: 'num', required: false, min: 0 },
    payment_method: { type: 'str', required: false, max: 80 },
    patient_id:     { type: 'id', required: false }
};

module.exports = {
    invoiceCreate,
    journalCreate,
    invoiceRefund,
    invoicePay,
    paymentMoyasarInitiate,
    invoiceCancel,
    invoicePartialPay,
    patientCreate,
    integrationSettingsSave,
    integrationPing,
    zatcaSubmit,
    financeApCreate,
    financeApPay,
    financeArCreate,
    financeArCollect,
    financeReportGenerate,
    clinicalOrderCreate,
    prescriptionCreate,
    pharmacyQueueUpdate
};
