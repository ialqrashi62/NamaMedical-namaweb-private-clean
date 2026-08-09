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

// POST /api/invoices/generate
const invoiceGenerate = {
    patient_id: { type: 'id', required: true }
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

// POST /api/finance/accounts
const financeAccountCreate = {
    account_code:    { type: 'str', required: true, max: 80 },
    account_name_ar: { type: 'str', required: false, max: 200 },
    account_name_en: { type: 'str', required: false, max: 200 },
    parent_id:       { type: 'int', required: false, min: 0 },
    account_class:   { type: 'enumOf', required: false, allowed: ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'] },
    account_type:    { type: 'enumOf', required: false, allowed: ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'] }
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

// POST /api/finance/daily-close
const financeDailyClose = {
    opening_balance: { type: 'num', required: false, min: 0 },
    closing_balance: { type: 'num', required: false, min: 0 },
    notes:           { type: 'str', required: false, max: 2000 }
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

// PUT /api/insurance/claims/:id (legacy status endpoint)
const insuranceClaimLegacyUpdate = {
    status: { type: 'enumOf', required: true, allowed: ['Approved', 'Rejected'] }
};

// PUT /api/insurance/denials/:id/appeal
const insuranceDenialAppealUpdate = {
    appeal_status: { type: 'enumOf', required: true, allowed: ['appealed', 'upheld', 'overturned', 'closed'] },
    appeal_notes:  { type: 'str', required: false, max: 2000 }
};

// POST /api/insurance/payer-pricing
const insurancePayerPricingCreate = {
    insurance_company_id: { type: 'id', required: true },
    service_id:           { type: 'id', required: true },
    payer_price:          { type: 'num', required: true, min: 0 }
};

// POST /api/insurance/companies
const insuranceCompanyCreate = {
    name_ar:      { type: 'str', required: false, max: 200 },
    name_en:      { type: 'str', required: false, max: 200 },
    contact_info: { type: 'str', required: false, max: 2000 }
};

// POST /api/insurance/eligibility and /api/nphies/eligibility
const insuranceEligibilityCreate = {
    patient_id:            { type: 'id', required: false },
    insurance_company_id:  { type: 'id', required: false },
    policy_number:         { type: 'str', required: false, max: 120 }
};

// POST /api/insurance/pre-auth
const insurancePreAuthCreate = {
    patient_id:             { type: 'id', required: false },
    admission_id:           { type: 'id', required: false },
    insurance_company_id:   { type: 'id', required: false },
    requested_amount:       { type: 'num', required: false, min: 0 },
    clinical_justification: { type: 'str', required: false, max: 3000 }
};

// PUT /api/insurance/pre-auth/:id/decision
const insurancePreAuthDecisionUpdate = {
    decision:        { type: 'enumOf', required: true, allowed: ['approved', 'denied', 'partial'] },
    approved_amount: { type: 'num', required: false, min: 0 },
    auth_number:     { type: 'str', required: false, max: 120 }
};

// POST /api/insurance/claims
const insuranceClaimCreate = {
    patient_id:             { type: 'id', required: false },
    invoice_id:             { type: 'id', required: false },
    insurance_company_id:   { type: 'id', required: false },
    claim_amount:           { type: 'num', required: false, min: 0 },
    patient_name:           { type: 'str', required: false, max: 200 },
    insurance_company:      { type: 'str', required: false, max: 200 }
};

// PUT /api/insurance/claims/:id/transition
const insuranceClaimTransitionUpdate = {
    target:          { type: 'enumOf', required: true, allowed: ['submitted', 'adjudicated', 'remittance_posted', 'denied', 'appealed'] },
    approved_amount: { type: 'num', required: false, min: 0 },
    paid_amount:     { type: 'num', required: false, min: 0 },
    patient_share:   { type: 'num', required: false, min: 0 },
    denial_reason:   { type: 'str', required: false, max: 2000 }
};

// POST /api/insurance/claims/:id/lines
const insuranceClaimLineCreate = {
    service_id:   { type: 'id', required: false },
    quantity:     { type: 'int', required: false, min: 1, max: 100000 },
    unit_price:   { type: 'num', required: false, min: 0 },
    description:  { type: 'str', required: false, max: 2000 }
};

// POST /api/nphies/claim-status-inquiry
const nphiesClaimStatusInquiry = {
    claim_id: { type: 'id', required: true }
};

// POST /api/nphies/remittance
const nphiesRemittanceCreate = {
    claim_id:            { type: 'id', required: true },
    payer_id:            { type: 'id', required: false },
    remittance_date:     { type: 'dateStr', required: false },
    payment_amount:      { type: 'num', required: false, min: 0 },
    adjustment_amount:   { type: 'num', required: false, min: 0 },
    denial_amount:       { type: 'num', required: false, min: 0 },
    payment_date:        { type: 'dateStr', required: false },
    payment_reference:   { type: 'str', required: false, max: 200 },
    adjudication_status: { type: 'str', required: false, max: 40 },
    denial_reason:       { type: 'str', required: false, max: 2000 },
    fhir_bundle_id:      { type: 'str', required: false, max: 200 }
};

// POST /api/medical-records/requests
const medicalRecordsRequestCreate = {
    patient_id:   { type: 'id', required: false },
    file_number:  { type: 'str', required: true, max: 120 },
    department:   { type: 'str', required: false, max: 120 },
    purpose:      { type: 'str', required: false, max: 300 },
    notes:        { type: 'str', required: false, max: 2000 }
};

// PUT /api/medical-records/requests/:id
const medicalRecordsRequestUpdate = {
    status: { type: 'enumOf', required: true, allowed: ['Requested', 'In Progress', 'Delivered', 'Returned', 'Cancelled'] }
};

// POST /api/medical-records/:id/amend
const medicalRecordAmend = {
    reason:             { type: 'str', required: true, max: 500 },
    new_values_summary: { type: 'str', required: false, max: 4000 }
};

// POST /api/medical/records
const medicalRecordCreate = {
    patient_id:   { type: 'id', required: true },
    doctor_id:    { type: 'id', required: false },
    diagnosis:    { type: 'str', required: false, max: 1000 },
    symptoms:     { type: 'str', required: false, max: 4000 },
    icd10_codes:  { type: 'str', required: false, max: 1000 },
    notes:        { type: 'str', required: false, max: 4000 }
};

// POST /api/medical-records/coding
const medicalRecordsCodingCreate = {
    patient_id:           { type: 'id', required: false },
    visit_id:             { type: 'id', required: false },
    primary_diagnosis:    { type: 'str', required: false, max: 500 },
    primary_icd10:        { type: 'str', required: false, max: 60 },
    secondary_diagnoses:  { type: 'str', required: false, max: 4000 },
    drg_code:             { type: 'str', required: false, max: 60 },
    notes:                { type: 'str', required: false, max: 4000 }
};

// POST /api/him/coding
const himCodingCreate = {
    patient_id:    { type: 'id', required: true },
    encounter_ref: { type: 'id', required: false },
    code_system:   { type: 'enumOf', required: false, allowed: ['ICD10', 'SNOMED', 'CPT'] },
    code:          { type: 'str', required: true, max: 80 },
    description:   { type: 'str', required: false, max: 1000 }
};

// POST /api/him/roi
const himRoiCreate = {
    patient_id: { type: 'id', required: true },
    requester:  { type: 'str', required: true, max: 300 },
    purpose:    { type: 'str', required: false, max: 1000 }
};

// PUT /api/him/roi/:id
const himRoiUpdate = {
    action: { type: 'enumOf', required: true, allowed: ['approve', 'deny', 'release'] }
};

// POST /api/him/break-glass
const himBreakGlass = {
    patient_id: { type: 'id', required: true },
    reason:     { type: 'str', required: true, max: 1000 }
};

// POST /api/clinical-pharmacy/reviews
const clinicalPharmacyReviewCreate = {
    patient_id:      { type: 'id', required: false },
    patient_name:    { type: 'str', required: false, max: 200 },
    prescription_id: { type: 'id', required: false },
    review_type:     { type: 'str', required: false, max: 120 },
    findings:        { type: 'str', required: false, max: 4000 },
    recommendations: { type: 'str', required: false, max: 4000 },
    interventions:   { type: 'str', required: false, max: 4000 },
    severity:        { type: 'enumOf', required: false, allowed: ['Low', 'Moderate', 'High', 'Critical'] }
};

// PUT /api/clinical-pharmacy/reviews/:id
const clinicalPharmacyReviewUpdate = {
    outcome: { type: 'str', required: false, max: 2000 },
    status:  { type: 'enumOf', required: false, allowed: ['Open', 'In Progress', 'Closed', 'Resolved'] }
};

// POST /api/clinical-pharmacy/education
const clinicalPharmacyEducationCreate = {
    patient_id:    { type: 'id', required: false },
    patient_name:  { type: 'str', required: false, max: 200 },
    medication:    { type: 'str', required: false, max: 300 },
    instructions:  { type: 'str', required: false, max: 4000 },
    side_effects:  { type: 'str', required: false, max: 4000 },
    precautions:   { type: 'str', required: false, max: 4000 }
};

// POST /api/pharmacy/drugs
const pharmacyDrugCreate = {
    drug_name:          { type: 'str', required: true, max: 300 },
    selling_price:      { type: 'num', required: false, min: 0 },
    stock_qty:          { type: 'int', required: false, min: 0 },
    category:           { type: 'str', required: false, max: 120 },
    active_ingredient:  { type: 'str', required: false, max: 300 }
};

// POST /api/pharmacy/batches
const pharmacyBatchCreate = {
    drug_id:        { type: 'id', required: false },
    drug_name:      { type: 'str', required: false, max: 300 },
    lot:            { type: 'str', required: false, max: 120 },
    expiry_date:    { type: 'dateStr', required: true },
    qty_received:   { type: 'int', required: true, min: 1 },
    cost_price:     { type: 'num', required: false, min: 0 },
    supplier_id:    { type: 'id', required: false }
};

// PUT /api/pharmacy/queue/:id/verify
const pharmacyQueueVerify = {
    override_reason: { type: 'str', required: false, max: 1000 }
};

// POST /api/pharmacy/dispense
const pharmacyDispense = {
    prescription_id: { type: 'id', required: true },
    barcode:         { type: 'str', required: false, max: 120 },
    drug_id:         { type: 'id', required: false },
    quantity:        { type: 'int', required: true, min: 1 },
    witness_user_id: { type: 'id', required: false },
    price:           { type: 'num', required: false, min: 0 },
    payment_method:  { type: 'str', required: false, max: 80 }
};

// POST /api/pharmacy/wasfaty/dispense-intent
const pharmacyWasfatyDispenseIntent = {
    prescription_id: { type: 'id', required: true }
};

// POST /api/pharmacy/deduct-stock
const pharmacyDeductStock = {
    drug_id:          { type: 'id', required: true },
    drug_name:        { type: 'str', required: false, max: 300 },
    quantity:         { type: 'int', required: true, min: 1 },
    patient_id:       { type: 'id', required: false },
    prescription_id:  { type: 'id', required: false },
    reason:           { type: 'str', required: false, max: 500 }
};

// POST /api/pharmacy/prescriptions
const pharmacyPrescriptionCreate = {
    patient_id:    { type: 'id', required: false },
    patient_name:  { type: 'str', required: false, max: 200 },
    medication:    { type: 'str', required: false, max: 300 },
    drug_name:     { type: 'str', required: false, max: 300 },
    dosage:        { type: 'str', required: false, max: 120 },
    frequency:     { type: 'str', required: false, max: 120 },
    duration:      { type: 'str', required: false, max: 120 },
    quantity:      { type: 'num', required: false, min: 0 },
    doctor:        { type: 'str', required: false, max: 200 },
    status:        { type: 'str', required: false, max: 60 },
    notes:         { type: 'str', required: false, max: 4000 }
};

// PUT /api/pharmacy/prescriptions/:id
const pharmacyPrescriptionUpdate = {
    status: { type: 'str', required: true, max: 60 }
};

// POST /api/pharmacy/controlled-substances/reconcile
const controlledSubstanceReconcile = {
    drug_name:        { type: 'str', required: true, max: 300 },
    drug_code:        { type: 'str', required: true, max: 120 },
    schedule_class:   { type: 'str', required: false, max: 40 },
    dosage_form:      { type: 'str', required: false, max: 120 },
    strength:         { type: 'str', required: false, max: 120 },
    unit:             { type: 'str', required: false, max: 40 },
    opening_balance:  { type: 'num', required: false, min: 0 },
    received_qty:     { type: 'num', required: false, min: 0 },
    dispensed_qty:    { type: 'num', required: false, min: 0 },
    wasted_qty:       { type: 'num', required: false, min: 0 },
    closing_balance:  { type: 'num', required: false, min: 0 },
    discrepancy:      { type: 'num', required: false, min: 0 },
    record_date:      { type: 'dateStr', required: false },
    location:         { type: 'str', required: false, max: 200 },
    witnessed_by:     { type: 'str', required: false, max: 200 },
    notes:            { type: 'str', required: false, max: 4000 }
};

// POST /api/pharmacy/controlled-substances/dispense
const controlledSubstanceDispense = {
    cs_id:            { type: 'id', required: true },
    prescription_id:  { type: 'id', required: false },
    patient_id:       { type: 'id', required: false },
    quantity:         { type: 'num', required: true, min: 0.000001 },
    witness2_name:    { type: 'str', required: false, max: 200 },
    witness2_id:      { type: 'id', required: false },
    reason:           { type: 'str', required: false, max: 1000 },
    waste_amount:     { type: 'num', required: false, min: 0 },
    waste_reason:     { type: 'str', required: false, max: 1000 }
};

// POST /api/clinical/medication-reconciliation
const clinicalMedicationReconciliationCreate = {
    patient_id:            { type: 'id', required: true },
    admission_id:          { type: 'id', required: false },
    reconciliation_type:   { type: 'str', required: false, max: 80 },
    status:                { type: 'str', required: false, max: 80 },
    allergy_verified:      { type: 'bool', required: false },
    high_alert_checked:    { type: 'bool', required: false },
    patient_counselled:    { type: 'bool', required: false },
    notes:                 { type: 'str', required: false, max: 4000 }
};

// POST /api/lab/microbiology
const labMicrobiologyCreate = {
    order_id:             { type: 'id', required: false },
    patient_id:           { type: 'id', required: true },
    admission_id:         { type: 'id', required: false },
    specimen_type:        { type: 'str', required: false, max: 120 },
    collection_date:      { type: 'dateStr', required: false },
    collection_time:      { type: 'str', required: false, max: 40 },
    collection_site:      { type: 'str', required: false, max: 200 },
    gram_stain:           { type: 'str', required: false, max: 1000 },
    preliminary_result:   { type: 'str', required: false, max: 4000 },
    final_result:         { type: 'str', required: false, max: 4000 },
    organism_identified:  { type: 'str', required: false, max: 300 },
    colony_count:         { type: 'str', required: false, max: 200 },
    antibiogram_profile:  { type: 'str', required: false, max: 4000 },
    report_status:        { type: 'str', required: false, max: 60 },
    critical_value:       { type: 'bool', required: false },
    critical_notified_to: { type: 'str', required: false, max: 200 },
    loinc_code:           { type: 'str', required: false, max: 60 }
};

// POST /api/clinical/problem-list
const clinicalProblemListCreate = {
    patient_id:         { type: 'id', required: true },
    admission_id:       { type: 'id', required: false },
    icd10_code:         { type: 'str', required: false, max: 60 },
    icd10_description:  { type: 'str', required: false, max: 1000 },
    snomed_code:        { type: 'str', required: false, max: 80 },
    problem_name:       { type: 'str', required: true, max: 300 },
    problem_type:       { type: 'str', required: false, max: 80 },
    onset_date:         { type: 'dateStr', required: false },
    resolved_date:      { type: 'dateStr', required: false },
    severity:           { type: 'str', required: false, max: 80 },
    status:             { type: 'str', required: false, max: 80 },
    notes:              { type: 'str', required: false, max: 4000 },
    principal_diagnosis:{ type: 'bool', required: false }
};

// POST /api/clinical/safety-check
const clinicalSafetyCheck = {
    patient_id: { type: 'id', required: true },
    drug_name:  { type: 'str', required: true, max: 300 }
};

// POST /api/nursing/risk-assessment
const nursingRiskAssessmentCreate = {
    patient_id:      { type: 'id', required: true },
    admission_id:    { type: 'id', required: false },
    assessment_type: { type: 'str', required: true, max: 120 },
    total_score:     { type: 'int', required: true, min: 0 },
    risk_level:      { type: 'str', required: true, max: 80 }
};

// POST /api/lab/orders and /api/radiology/orders
const labOrderCreate = {
    patient_id:  { type: 'id', required: true },
    order_type:  { type: 'str', required: true, max: 200 },
    description: { type: 'str', required: false, max: 4000 }
};

// POST /api/lab/orders/direct
const labOrderDirectCreate = {
    patient_id:  { type: 'id', required: false },
    order_type:  { type: 'str', required: true, max: 200 },
    description: { type: 'str', required: false, max: 4000 }
};

// PUT /api/lab/orders/:id
const labOrderUpdate = {
    status:  { type: 'str', required: false, max: 80 },
    results: { type: 'str', required: false, max: 8000 }
};

// PUT /api/orders/:id/approve-payment
const orderApprovePayment = {
    payment_method: { type: 'str', required: false, max: 80 },
    price:          { type: 'num', required: true, min: 0 }
};

// POST /api/clinical/knowledge
const clinicalKnowledgeCreate = {
    department_id: { type: 'id', required: false },
    content_chunk: { type: 'str', required: true, max: 20000 }
};

// POST /api/clinical/ai/ask
const clinicalAiAsk = {
    question:      { type: 'str', required: true, max: 3000 },
    department_id: { type: 'id', required: false }
};

// POST /api/clinical/departments
const clinicalDepartmentUpsert = {
    code:    { type: 'str', required: true, max: 80 },
    name_ar: { type: 'str', required: false, max: 300 },
    name_en: { type: 'str', required: false, max: 300 }
};

// POST /api/clinical/templates
const clinicalTemplateCreate = {
    department_id: { type: 'id', required: true },
    version:       { type: 'str', required: false, max: 40 }
};

// POST /api/clinical/notes
const clinicalNoteUpsert = {
    id:            { type: 'id', required: false },
    patient_id:    { type: 'id', required: true },
    encounter_ref: { type: 'id', required: false },
    type:          { type: 'str', required: false, max: 20 },
    subjective:    { type: 'str', required: false, max: 8000 },
    objective:     { type: 'str', required: false, max: 8000 },
    assessment:    { type: 'str', required: false, max: 8000 },
    plan:          { type: 'str', required: false, max: 8000 }
};

// POST /api/clinical/smart-templates
const clinicalSmartTemplateUpsert = {
    id:            { type: 'id', required: false },
    shortcut:      { type: 'str', required: true, max: 80 },
    template_text: { type: 'str', required: true, max: 12000 }
};

// POST /api/clinical/records (primary route)
const clinicalRecordUpsert = {
    id:         { type: 'id', required: false },
    patient_id: { type: 'id', required: true },
    template_id:{ type: 'id', required: false }
};

// POST /api/lab/samples
const labSampleCreate = {
    lab_order_id: { type: 'id', required: false },
    patient_id:   { type: 'id', required: false },
    notes:        { type: 'str', required: false, max: 2000 }
};

// PUT /api/lab/samples/:id
const labSampleTransition = {
    action:         { type: 'str', required: true, max: 40 },
    rejected_reason:{ type: 'str', required: false, max: 1000 }
};

// POST /api/lab/results
const labResultCreate = {
    lab_sample_id: { type: 'id', required: false },
    order_id:      { type: 'id', required: false },
    loinc:         { type: 'str', required: false, max: 80 },
    test_name:     { type: 'str', required: true, max: 300 },
    value:         { type: 'str', required: true, max: 200 },
    unit:          { type: 'str', required: false, max: 80 },
    normal_range:  { type: 'str', required: false, max: 200 },
    ref_low:       { type: 'num', required: false },
    ref_high:      { type: 'num', required: false }
};

// POST /api/lab/results/:id/callback
const labResultCriticalCallback = {
    notified_to: { type: 'str', required: true, max: 300 },
    ack:         { type: 'bool', required: false },
    notes:       { type: 'str', required: false, max: 2000 }
};

// POST /api/lab/hl7
const labHl7Ingest = {
    message: { type: 'str', required: false, max: 100000 }
};

// POST /api/lab/qc
const labQcCreate = {
    analyzer:    { type: 'str', required: false, max: 200 },
    analyte:     { type: 'str', required: false, max: 200 },
    level:       { type: 'str', required: false, max: 80 },
    value:       { type: 'num', required: false },
    target:      { type: 'num', required: false },
    sd:          { type: 'num', required: false },
    reagent_lot: { type: 'str', required: false, max: 120 }
};

// PUT /api/radiology/orders/:id
const radiologyOrderUpdate = {
    status: { type: 'str', required: false, max: 80 },
    result: { type: 'str', required: false, max: 8000 }
};

// POST /api/radiology/worklist
const radiologyWorklistCreate = {
    rad_order_id:  { type: 'id', required: true },
    modality:      { type: 'str', required: false, max: 40 },
    exam_name:     { type: 'str', required: false, max: 300 },
    accession:     { type: 'str', required: false, max: 120 },
    scheduled_at:  { type: 'str', required: false, max: 80 }
};

// PUT /api/radiology/worklist/:id/state
const radiologyWorklistStateUpdate = {
    state: { type: 'str', required: true, max: 40 }
};

// POST /api/radiology/dicom-studies
const radiologyDicomStudyCreate = {
    rad_exam_id:     { type: 'id', required: false },
    study_uid:       { type: 'str', required: false, max: 200 },
    accession:       { type: 'str', required: false, max: 120 },
    modality:        { type: 'str', required: false, max: 40 },
    study_desc:      { type: 'str', required: false, max: 1000 },
    series_count:    { type: 'int', required: false, min: 0 },
    instance_count:  { type: 'int', required: false, min: 0 },
    stored_ref:      { type: 'id', required: false }
};

// POST /api/radiology/reports
const radiologyReportCreate = {
    rad_exam_id:     { type: 'id', required: true },
    template:        { type: 'str', required: false, max: 120 },
    findings:        { type: 'str', required: false, max: 12000 },
    impression:      { type: 'str', required: false, max: 12000 },
    birads:          { type: 'str', required: false, max: 40 },
    is_critical:     { type: 'bool', required: false },
    prior_study_id:  { type: 'id', required: false }
};

// POST /api/radiology/reports/:id/critical-notify
const radiologyReportCriticalNotify = {
    notified_doctor_id: { type: 'id', required: false },
    note:               { type: 'str', required: false, max: 2000 }
};

// POST /api/radiology/reports/:id/addendum
const radiologyReportAddendum = {
    findings:    { type: 'str', required: false, max: 12000 },
    impression:  { type: 'str', required: false, max: 12000 },
    is_critical: { type: 'bool', required: false }
};

// POST /api/nursing/vitals
const nursingVitalsCreate = {
    patient_id:         { type: 'id', required: true },
    patient_name:       { type: 'str', required: false, max: 300 },
    bp:                 { type: 'str', required: false, max: 80 },
    temp:               { type: 'num', required: false },
    weight:             { type: 'num', required: false },
    height:             { type: 'num', required: false },
    pulse:              { type: 'int', required: false, min: 0 },
    o2_sat:             { type: 'int', required: false, min: 0 },
    respiratory_rate:   { type: 'int', required: false, min: 0 },
    blood_sugar:        { type: 'num', required: false },
    chronic_diseases:   { type: 'str', required: false, max: 2000 },
    current_medications:{ type: 'str', required: false, max: 2000 },
    allergies:          { type: 'str', required: false, max: 2000 },
    notes:              { type: 'str', required: false, max: 4000 }
};

// POST /api/emergency/visits
const emergencyVisitCreate = {
    patient_id:             { type: 'id', required: false },
    patient_name:           { type: 'str', required: false, max: 300 },
    arrival_mode:           { type: 'str', required: false, max: 80 },
    chief_complaint:        { type: 'str', required: false, max: 2000 },
    chief_complaint_ar:     { type: 'str', required: false, max: 2000 },
    triage_level:           { type: 'int', required: false, min: 1 },
    triage_color:           { type: 'str', required: false, max: 40 },
    triage_nurse:           { type: 'str', required: false, max: 300 },
    assigned_doctor:        { type: 'str', required: false, max: 300 },
    assigned_bed:           { type: 'str', required: false, max: 120 },
    acuity_notes:           { type: 'str', required: false, max: 4000 }
};

// PUT /api/emergency/visits/:id
const emergencyVisitUpdate = {
    status:                  { type: 'str', required: false, max: 80 },
    disposition:             { type: 'str', required: false, max: 80 },
    assigned_doctor:         { type: 'str', required: false, max: 300 },
    assigned_bed:            { type: 'str', required: false, max: 120 },
    discharge_diagnosis:     { type: 'str', required: false, max: 4000 },
    discharge_instructions:  { type: 'str', required: false, max: 4000 },
    discharge_medications:   { type: 'str', required: false, max: 4000 },
    followup_date:           { type: 'dateStr', required: false }
};

// POST /api/emergency/trauma/:visitId
const emergencyTraumaAssessmentCreate = {
    patient_id:              { type: 'id', required: false },
    airway:                  { type: 'str', required: false, max: 1000 },
    breathing:               { type: 'str', required: false, max: 1000 },
    circulation:             { type: 'str', required: false, max: 1000 },
    disability:              { type: 'str', required: false, max: 1000 },
    exposure:                { type: 'str', required: false, max: 1000 },
    gcs_eye:                 { type: 'int', required: false, min: 0 },
    gcs_verbal:              { type: 'int', required: false, min: 0 },
    gcs_motor:               { type: 'int', required: false, min: 0 },
    mechanism_of_injury:     { type: 'str', required: false, max: 2000 },
    trauma_team_activated:   { type: 'bool', required: false },
    assessed_by:             { type: 'str', required: false, max: 300 }
};

// POST /api/nursing/triage
const nursingTriageCreate = {
    patient_id:         { type: 'id', required: false },
    patient_name:       { type: 'str', required: false, max: 300 },
    triage_level:       { type: 'int', required: false, min: 1 },
    pain_score:         { type: 'int', required: false, min: 0 },
    chief_complaint:    { type: 'str', required: false, max: 2000 },
    notes:              { type: 'str', required: false, max: 4000 },
    visit_id:           { type: 'id', required: false }
};

// POST /api/nursing/pain-assessment
const nursingPainAssessmentCreate = {
    patient_id:           { type: 'id', required: true },
    patient_name:         { type: 'str', required: false, max: 300 },
    admission_id:         { type: 'id', required: false },
    pain_scale:           { type: 'str', required: false, max: 40 },
    pain_score:           { type: 'int', required: true, min: 0 },
    pain_location:        { type: 'str', required: false, max: 500 },
    pain_character:       { type: 'str', required: false, max: 500 },
    pain_radiation:       { type: 'str', required: false, max: 500 },
    pain_onset:           { type: 'str', required: false, max: 300 },
    pain_duration:        { type: 'str', required: false, max: 300 },
    aggravating_factors:  { type: 'str', required: false, max: 1000 },
    relieving_factors:    { type: 'str', required: false, max: 1000 },
    current_analgesia:    { type: 'str', required: false, max: 1000 },
    pain_goal:            { type: 'int', required: false, min: 0 },
    reassessment_time:    { type: 'str', required: false, max: 80 },
    notes:                { type: 'str', required: false, max: 4000 }
};

// POST /api/nursing/scores
const nursingScoreCreate = {
    patient_id: { type: 'id', required: true },
    score_type: { type: 'str', required: true, max: 40 },
    notes:      { type: 'str', required: false, max: 4000 }
};

// POST /api/nursing/care-plans
const nursingCarePlanCreate = {
    patient_id:         { type: 'id', required: true },
    patient_name:       { type: 'str', required: false, max: 300 },
    diagnosis:          { type: 'str', required: false, max: 1000 },
    priority:           { type: 'str', required: false, max: 80 },
    goals:              { type: 'str', required: false, max: 4000 },
    interventions:      { type: 'str', required: false, max: 4000 },
    expected_outcomes:  { type: 'str', required: false, max: 4000 }
};

// POST /api/nursing/assessments
const nursingAssessmentCreate = {
    patient_id:       { type: 'id', required: true },
    patient_name:     { type: 'str', required: false, max: 300 },
    assessment_type:  { type: 'str', required: false, max: 120 },
    pain_score:       { type: 'int', required: false, min: 0 },
    gcs_score:        { type: 'int', required: false, min: 0 },
    shift:            { type: 'str', required: false, max: 80 },
    notes:            { type: 'str', required: false, max: 4000 }
};

// POST /api/nursing/assessment
const nursingAssessmentScaleCreate = {
    patient_id: { type: 'id', required: true },
    pain_scale: { type: 'int', required: false, min: 0 },
    notes:      { type: 'str', required: false, max: 4000 }
};

// POST /api/nursing/io
const nursingIoCreate = {
    patient_id: { type: 'id', required: true },
    entry_type: { type: 'str', required: true, max: 40 },
    source:     { type: 'str', required: true, max: 120 },
    volume_ml:  { type: 'int', required: true, min: 1 },
    entry_time: { type: 'str', required: false, max: 20 },
    shift:      { type: 'str', required: false, max: 80 },
    notes:      { type: 'str', required: false, max: 2000 }
};

// POST /api/nursing/handover
const nursingHandoverCreate = {
    patient_id:   { type: 'id', required: true },
    sbar_s:       { type: 'str', required: false, max: 4000 },
    sbar_b:       { type: 'str', required: false, max: 4000 },
    sbar_a:       { type: 'str', required: false, max: 4000 },
    sbar_r:       { type: 'str', required: false, max: 4000 },
    shift:        { type: 'str', required: false, max: 80 },
    news2_score:  { type: 'int', required: false, min: 0 }
};

// POST /api/telemedicine/sessions
const telemedicineSessionCreate = {
    patient_id:        { type: 'id', required: false },
    patient_name:      { type: 'str', required: false, max: 300 },
    speciality:        { type: 'str', required: false, max: 120 },
    session_type:      { type: 'str', required: false, max: 80 },
    scheduled_date:    { type: 'dateStr', required: false },
    scheduled_time:    { type: 'str', required: false, max: 20 },
    duration_minutes:  { type: 'int', required: false, min: 1 },
    notes:             { type: 'str', required: false, max: 4000 }
};

// PUT /api/telemedicine/sessions/:id
const telemedicineSessionUpdate = {
    status:       { type: 'str', required: false, max: 80 },
    diagnosis:    { type: 'str', required: false, max: 4000 },
    prescription: { type: 'str', required: false, max: 4000 }
};

// POST /api/emar/orders
const emarOrderCreate = {
    patient_id:   { type: 'id', required: true },
    patient_name: { type: 'str', required: false, max: 300 },
    medication:   { type: 'str', required: false, max: 300 },
    dose:         { type: 'str', required: false, max: 120 },
    route:        { type: 'str', required: false, max: 80 },
    frequency:    { type: 'str', required: false, max: 80 },
    start_date:   { type: 'dateStr', required: false }
};

// POST /api/emar/administrations
const emarAdministrationNotGivenCreate = {
    emar_order_id:     { type: 'id', required: true },
    patient_id:        { type: 'id', required: true },
    medication:        { type: 'str', required: false, max: 300 },
    dose:              { type: 'str', required: false, max: 120 },
    scheduled_time:    { type: 'str', required: false, max: 80 },
    reason_not_given:  { type: 'str', required: true, max: 2000 },
    notes:             { type: 'str', required: false, max: 4000 }
};

// POST /api/mar/administer
const marAdminister = {
    prescription_ref:   { type: 'id', required: false },
    emar_order_id:      { type: 'id', required: false },
    patient_id:         { type: 'id', required: false },
    scanned_drug:       { type: 'str', required: false, max: 300 },
    scanned_dose:       { type: 'str', required: false, max: 120 },
    scanned_route:      { type: 'str', required: false, max: 80 },
    scanned_patient_id: { type: 'id', required: false },
    scheduled_at:       { type: 'str', required: false, max: 80 },
    override_reason:    { type: 'str', required: false, max: 2000 },
    witness_user_id:    { type: 'id', required: false },
    notes:              { type: 'str', required: false, max: 4000 }
};

// POST /api/pathology/cases
const pathologyCaseCreate = {
    patient_id:       { type: 'id', required: false },
    patient_name:     { type: 'str', required: false, max: 300 },
    specimen_type:    { type: 'str', required: false, max: 200 },
    collection_date:  { type: 'dateStr', required: false }
};

// PUT /api/pathology/cases/:id
const pathologyCaseUpdate = {
    gross_description:     { type: 'str', required: false, max: 4000 },
    microscopic_findings:  { type: 'str', required: false, max: 4000 },
    diagnosis:             { type: 'str', required: false, max: 4000 },
    icd_code:              { type: 'str', required: false, max: 80 },
    stage:                 { type: 'str', required: false, max: 120 },
    grade:                 { type: 'str', required: false, max: 120 },
    status:                { type: 'str', required: false, max: 80 }
};

// POST /api/pathology/specimens
const pathologySpecimenCreate = {
    patient_id:        { type: 'id', required: true },
    visit_id:          { type: 'id', required: false },
    specimen_type:     { type: 'str', required: false, max: 200 },
    site:              { type: 'str', required: false, max: 300 },
    clinical_details:  { type: 'str', required: false, max: 4000 },
    priority:          { type: 'str', required: false, max: 40 }
};

// POST /api/pathology/specimens/:id/blocks
const pathologyBlockCreate = {
    block_no:        { type: 'str', required: false, max: 32 },
    cassette_label:  { type: 'str', required: false, max: 300 },
    embedding_type:  { type: 'str', required: false, max: 80 }
};

// POST /api/pathology/blocks/:blockId/slides
const pathologySlideCreate = {
    slide_no:    { type: 'str', required: false, max: 32 },
    stain_type:  { type: 'str', required: false, max: 120 }
};

// PUT /api/pathology/specimens/:id/state
const pathologySpecimenStateUpdate = {
    state: { type: 'str', required: true, max: 80 }
};

// PUT /api/pathology/specimens/:id/report
const pathologyReportUpdate = {
    gross_text:  { type: 'str', required: false, max: 12000 },
    micro_text:  { type: 'str', required: false, max: 12000 },
    diagnosis:   { type: 'str', required: false, max: 8000 }
};

// POST /api/pathology/specimens/:id/addendum
const pathologyAddendumCreate = {
    text: { type: 'str', required: true, max: 8000 }
};

module.exports = {
    invoiceCreate,
    journalCreate,
    invoiceRefund,
    invoiceGenerate,
    invoicePay,
    paymentMoyasarInitiate,
    invoiceCancel,
    invoicePartialPay,
    patientCreate,
    integrationSettingsSave,
    integrationPing,
    zatcaSubmit,
    financeAccountCreate,
    financeApCreate,
    financeApPay,
    financeArCreate,
    financeArCollect,
    financeReportGenerate,
    financeDailyClose,
    clinicalOrderCreate,
    prescriptionCreate,
    pharmacyQueueUpdate,
    insuranceClaimLegacyUpdate,
    insuranceDenialAppealUpdate,
    insurancePayerPricingCreate,
    insuranceCompanyCreate,
    insuranceEligibilityCreate,
    insurancePreAuthCreate,
    insurancePreAuthDecisionUpdate,
    insuranceClaimCreate,
    insuranceClaimTransitionUpdate,
    insuranceClaimLineCreate,
    nphiesClaimStatusInquiry,
    nphiesRemittanceCreate,
    medicalRecordsRequestCreate,
    medicalRecordsRequestUpdate,
    medicalRecordAmend,
    medicalRecordCreate,
    medicalRecordsCodingCreate,
    himCodingCreate,
    himRoiCreate,
    himRoiUpdate,
    himBreakGlass,
    clinicalPharmacyReviewCreate,
    clinicalPharmacyReviewUpdate,
    clinicalPharmacyEducationCreate,
    pharmacyDrugCreate,
    pharmacyBatchCreate,
    pharmacyQueueVerify,
    pharmacyDispense,
    pharmacyWasfatyDispenseIntent,
    pharmacyDeductStock,
    pharmacyPrescriptionCreate,
    pharmacyPrescriptionUpdate,
    controlledSubstanceReconcile,
    controlledSubstanceDispense,
    clinicalMedicationReconciliationCreate,
    labMicrobiologyCreate,
    clinicalProblemListCreate,
    clinicalSafetyCheck,
    nursingRiskAssessmentCreate,
    labOrderCreate,
    labOrderDirectCreate,
    labOrderUpdate,
    orderApprovePayment,
    clinicalKnowledgeCreate,
    clinicalAiAsk,
    clinicalDepartmentUpsert,
    clinicalTemplateCreate,
    clinicalRecordUpsert,
    clinicalNoteUpsert,
    clinicalSmartTemplateUpsert,
    labSampleCreate,
    labSampleTransition,
    labResultCreate,
    labResultCriticalCallback,
    labHl7Ingest,
    labQcCreate,
    radiologyOrderUpdate,
    radiologyWorklistCreate,
    radiologyWorklistStateUpdate,
    radiologyDicomStudyCreate,
    radiologyReportCreate,
    radiologyReportCriticalNotify,
    radiologyReportAddendum,
    nursingVitalsCreate,
    emergencyVisitCreate,
    emergencyVisitUpdate,
    emergencyTraumaAssessmentCreate,
    nursingTriageCreate,
    nursingPainAssessmentCreate,
    nursingScoreCreate,
    nursingCarePlanCreate,
    nursingAssessmentCreate,
    nursingAssessmentScaleCreate,
    nursingIoCreate,
    nursingHandoverCreate,
    telemedicineSessionCreate,
    telemedicineSessionUpdate,
    emarOrderCreate,
    emarAdministrationNotGivenCreate,
    marAdminister,
    pathologyCaseCreate,
    pathologyCaseUpdate,
    pathologySpecimenCreate,
    pathologyBlockCreate,
    pathologySlideCreate,
    pathologySpecimenStateUpdate,
    pathologyReportUpdate,
    pathologyAddendumCreate
};
