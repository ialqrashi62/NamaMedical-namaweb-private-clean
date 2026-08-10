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

// POST /api/social-work/cases
const socialWorkCaseCreate = {
    patient_id:    { type: 'id', required: false },
    patient_name:  { type: 'str', required: false, max: 300 },
    case_type:     { type: 'str', required: false, max: 120 },
    assessment:    { type: 'str', required: false, max: 4000 },
    plan:          { type: 'str', required: false, max: 4000 },
    priority:      { type: 'str', required: false, max: 80 }
};

// PUT /api/social-work/cases/:id
const socialWorkCaseUpdate = {
    status:         { type: 'str', required: false, max: 80 },
    interventions:  { type: 'str', required: false, max: 4000 },
    referrals:      { type: 'str', required: false, max: 4000 },
    follow_up_date: { type: 'dateStr', required: false }
};

// POST /api/mortuary/cases
const mortuaryCaseCreate = {
    patient_id:                { type: 'id', required: false },
    deceased_name:             { type: 'str', required: false, max: 300 },
    date_of_death:             { type: 'dateStr', required: false },
    time_of_death:             { type: 'str', required: false, max: 20 },
    cause_of_death:            { type: 'str', required: false, max: 2000 },
    attending_physician:       { type: 'str', required: false, max: 300 },
    next_of_kin:               { type: 'str', required: false, max: 300 },
    next_of_kin_phone:         { type: 'phone', required: false },
    notes:                     { type: 'str', required: false, max: 4000 }
};

// PUT /api/mortuary/cases/:id
const mortuaryCaseUpdate = {
    release_status:            { type: 'str', required: false, max: 80 },
    released_to:               { type: 'str', required: false, max: 300 },
    death_certificate_number:  { type: 'str', required: false, max: 120 }
};

// POST /api/cme/activities
const cmeActivityCreate = {
    title:             { type: 'str', required: false, max: 300 },
    category:          { type: 'str', required: false, max: 120 },
    provider:          { type: 'str', required: false, max: 300 },
    credit_hours:      { type: 'num', required: false, min: 0 },
    activity_date:     { type: 'dateStr', required: false },
    location:          { type: 'str', required: false, max: 300 },
    max_participants:  { type: 'int', required: false, min: 1 },
    description:       { type: 'str', required: false, max: 4000 }
};

// POST /api/cme/registrations
const cmeRegistrationCreate = {
    activity_id:    { type: 'id', required: true },
    employee_name:  { type: 'str', required: false, max: 300 }
};

// POST /api/cme/events
const cmeEventCreate = {
    title:       { type: 'str', required: false, max: 300 },
    speaker:     { type: 'str', required: false, max: 300 },
    event_date:  { type: 'dateStr', required: false },
    cme_hours:   { type: 'num', required: false, min: 0 },
    category:    { type: 'str', required: false, max: 120 },
    department:  { type: 'str', required: false, max: 120 },
    status:      { type: 'str', required: false, max: 80 }
};

// POST /api/cssd/instruments
const cssdInstrumentSetCreate = {
    set_name:          { type: 'str', required: false, max: 300 },
    set_name_ar:       { type: 'str', required: false, max: 300 },
    set_code:          { type: 'str', required: false, max: 120 },
    category:          { type: 'str', required: false, max: 120 },
    instrument_count:  { type: 'int', required: false, min: 0 },
    department:        { type: 'str', required: false, max: 120 }
};

// POST /api/cssd/cycles
const cssdCycleCreate = {
    cycle_number:      { type: 'str', required: false, max: 120 },
    machine_name:      { type: 'str', required: false, max: 300 },
    cycle_type:        { type: 'str', required: false, max: 120 },
    temperature:       { type: 'num', required: false },
    pressure:          { type: 'num', required: false },
    duration_minutes:  { type: 'int', required: false, min: 0 },
    operator:          { type: 'str', required: false, max: 300 }
};

// PUT /api/cssd/cycles/:id
const cssdCycleStatusUpdate = {
    status: { type: 'str', required: true, max: 80 }
};

// POST /api/cssd/load-items
const cssdLoadItemCreate = {
    cycle_id:  { type: 'id', required: false },
    set_id:    { type: 'id', required: false },
    set_name:  { type: 'str', required: false, max: 300 },
    barcode:   { type: 'str', required: false, max: 300 }
};

// POST /api/cssd/batches
const cssdBatchCreate = {
    batch_number: { type: 'str', required: false, max: 120 },
    department:   { type: 'str', required: false, max: 120 },
    method:       { type: 'str', required: false, max: 120 },
    temperature:  { type: 'num', required: false },
    operator:     { type: 'str', required: false, max: 300 }
};

// PUT /api/cssd/batches/:id
const cssdBatchUpdate = {
    status: { type: 'str', required: true, max: 80 }
};

// POST /api/infection-control/reports
const infectionControlReportCreate = {
    patient_name:      { type: 'str', required: false, max: 300 },
    infection_type:    { type: 'str', required: false, max: 300 },
    ward:              { type: 'str', required: false, max: 120 },
    isolation_type:    { type: 'str', required: false, max: 120 },
    culture_results:   { type: 'str', required: false, max: 4000 },
    action_taken:      { type: 'str', required: false, max: 4000 },
    status:            { type: 'str', required: false, max: 80 }
};

// PUT /api/infection-control/reports/:id
const infectionControlReportUpdate = {
    status: { type: 'str', required: true, max: 80 }
};

// PUT /api/cssd/cycles/:id/bi-result
const cssdCycleBiResultUpdate = {
    bi_test_result:    { type: 'str', required: true, max: 80 },
    ci_result:         { type: 'str', required: false, max: 80 },
    bi_indicator_lot:  { type: 'str', required: false, max: 120 }
};

// POST /api/cssd/trays
const cssdTrayCreate = {
    tray_code:          { type: 'str', required: false, max: 300 },
    set_id:             { type: 'id', required: false },
    cycle_id:           { type: 'id', required: false },
    department:         { type: 'str', required: false, max: 120 },
    notes:              { type: 'str', required: false, max: 4000 }
};

// PUT /api/cssd/trays/:id/issue
const cssdTrayIssue = {
    issued_to:           { type: 'str', required: false, max: 300 },
    used_in_surgery_id:  { type: 'id', required: false }
};

// POST /api/bloodbank/units
const bloodbankUnitCreate = {
    bag_number:         { type: 'str', required: false, max: 120 },
    blood_type:         { type: 'str', required: false, max: 8 },
    rh_factor:          { type: 'str', required: false, max: 8 },
    component:          { type: 'str', required: false, max: 120 },
    donor_id:           { type: 'id', required: false },
    collection_date:    { type: 'dateStr', required: false },
    expiry_date:        { type: 'dateStr', required: false },
    volume_ml:          { type: 'num', required: false, min: 0 },
    storage_location:   { type: 'str', required: false, max: 300 },
    notes:              { type: 'str', required: false, max: 4000 }
};

// POST /api/bloodbank/crossmatch
const bloodbankCrossmatchCreate = {
    patient_id:    { type: 'id', required: true },
    units_needed:  { type: 'int', required: false, min: 1 },
    unit_id:       { type: 'id', required: false },
    surgery_id:    { type: 'id', required: false },
    notes:         { type: 'str', required: false, max: 4000 }
};

// PUT /api/bloodbank/crossmatch/:id/validate
const bloodbankCrossmatchValidate = {
    unit_id: { type: 'id', required: true }
};

// POST /api/bloodbank/transfuse
const bloodbankTransfuse = {
    patient_id:    { type: 'id', required: true },
    unit_id:       { type: 'id', required: true },
    volume_ml:     { type: 'num', required: false, min: 0 },
    start_time:    { type: 'str', required: false, max: 80 },
    notes:         { type: 'str', required: false, max: 4000 },
    crossmatch_id: { type: 'id', required: false }
};

// POST /api/bloodbank/transfusions/:id/reaction
const bloodbankTransfusionReactionCreate = {
    reaction_type:      { type: 'str', required: false, max: 300 },
    severity:           { type: 'str', required: false, max: 80 },
    reaction_details:   { type: 'str', required: false, max: 4000 },
    vital_signs_after:  { type: 'str', required: false, max: 2000 },
    action_taken:       { type: 'str', required: false, max: 4000 }
};

// POST /api/bloodbank/donors
const bloodbankDonorCreate = {
    donor_name:      { type: 'str', required: false, max: 300 },
    donor_name_ar:   { type: 'str', required: false, max: 300 },
    national_id:     { type: 'nationalId', required: false },
    phone:           { type: 'phone', required: false },
    blood_type:      { type: 'str', required: false, max: 8 },
    rh_factor:       { type: 'str', required: false, max: 8 },
    age:             { type: 'int', required: false, min: 0 },
    gender:          { type: 'str', required: false, max: 40 },
    medical_history: { type: 'str', required: false, max: 4000 },
    notes:           { type: 'str', required: false, max: 4000 }
};

// PUT /api/surgeries/:id
const surgeryUpdate = {
    status:          { type: 'str', required: false, max: 80 },
    operating_room:  { type: 'str', required: false, max: 300 },
    scheduled_date:  { type: 'dateStr', required: false },
    scheduled_time:  { type: 'str', required: false, max: 20 },
    actual_start:    { type: 'str', required: false, max: 80 },
    actual_end:      { type: 'str', required: false, max: 80 },
    post_op_notes:   { type: 'str', required: false, max: 4000 },
    preop_status:    { type: 'str', required: false, max: 80 }
};

// POST /api/surgeries/:id/preop
const surgeryPreopUpsert = {
    npo_confirmed:         { type: 'bool', required: false },
    allergies_reviewed:    { type: 'bool', required: false },
    allergies_notes:       { type: 'str', required: false, max: 2000 },
    medications_reviewed:  { type: 'bool', required: false },
    medications_notes:     { type: 'str', required: false, max: 2000 },
    labs_reviewed:         { type: 'bool', required: false },
    labs_notes:            { type: 'str', required: false, max: 2000 },
    imaging_reviewed:      { type: 'bool', required: false },
    imaging_notes:         { type: 'str', required: false, max: 2000 },
    blood_type_confirmed:  { type: 'bool', required: false },
    blood_reserved:        { type: 'bool', required: false },
    consent_signed:        { type: 'bool', required: false },
    anesthesia_clearance:  { type: 'bool', required: false },
    nursing_assessment:    { type: 'bool', required: false },
    nursing_notes:         { type: 'str', required: false, max: 2000 },
    cardiac_clearance:     { type: 'bool', required: false },
    cardiac_notes:         { type: 'str', required: false, max: 2000 },
    pulmonary_clearance:   { type: 'bool', required: false },
    infection_screening:   { type: 'bool', required: false },
    dvt_prophylaxis:       { type: 'bool', required: false }
};

// POST /api/surgeries/:id/preop-tests
const surgeryPreopTestCreate = {
    test_type: { type: 'str', required: false, max: 120 },
    test_name: { type: 'str', required: false, max: 300 },
    notes:     { type: 'str', required: false, max: 2000 }
};

// POST /api/surgeries/:id/anesthesia
const surgeryAnesthesiaUpsert = {
    anesthetist_name:   { type: 'str', required: false, max: 300 },
    asa_class:          { type: 'str', required: false, max: 80 },
    anesthesia_type:    { type: 'str', required: false, max: 120 },
    airway_assessment:  { type: 'str', required: false, max: 1000 },
    mallampati_score:   { type: 'str', required: false, max: 40 },
    premedication:      { type: 'str', required: false, max: 1000 },
    induction_agents:   { type: 'str', required: false, max: 1000 },
    maintenance_agents: { type: 'str', required: false, max: 1000 },
    muscle_relaxants:   { type: 'str', required: false, max: 1000 },
    monitors_used:      { type: 'str', required: false, max: 1000 },
    iv_access:          { type: 'str', required: false, max: 300 },
    fluid_given:        { type: 'str', required: false, max: 300 },
    blood_loss_ml:      { type: 'num', required: false, min: 0 },
    complications:      { type: 'str', required: false, max: 2000 },
    recovery_notes:     { type: 'str', required: false, max: 2000 },
    notes:              { type: 'str', required: false, max: 4000 }
};

// POST /api/or/slots/reserve
const orSlotReserve = {
    surgery_id:        { type: 'id', required: true },
    room_id:           { type: 'id', required: true },
    surgeon_id:        { type: 'id', required: true },
    slot_date:         { type: 'dateStr', required: true },
    slot_start_time:   { type: 'str', required: true, max: 20 },
    slot_end_time:     { type: 'str', required: true, max: 20 },
    duration_minutes:  { type: 'int', required: false, min: 1 }
};

// PUT /api/or/surgeries/:id/status
const orSurgeryStatusUpdate = {
    status:                   { type: 'str', required: true, max: 80 },
    consent_override_reason:  { type: 'str', required: false, max: 2000 },
    override_reason:          { type: 'str', required: false, max: 2000 },
    pacu_override_reason:     { type: 'str', required: false, max: 2000 }
};

// POST /api/or/surgeries/:id/pacu
const orPacuUpsert = {
    start_time:        { type: 'str', required: false, max: 80 },
    end_time:          { type: 'str', required: false, max: 80 },
    pain_score:        { type: 'int', required: false, min: 0 },
    bp:                { type: 'str', required: false, max: 80 },
    hr:                { type: 'str', required: false, max: 40 },
    spo2:              { type: 'str', required: false, max: 40 },
    temp:              { type: 'str', required: false, max: 40 },
    activity:          { type: 'int', required: false, min: 0 },
    respiration:       { type: 'int', required: false, min: 0 },
    circulation:       { type: 'int', required: false, min: 0 },
    consciousness:     { type: 'int', required: false, min: 0 },
    oxygen:            { type: 'int', required: false, min: 0 },
    discharge_status:  { type: 'str', required: false, max: 80 },
    notes:             { type: 'str', required: false, max: 4000 }
};

// POST /api/or/surgeries/:id/operative-note
const orOperativeNoteUpsert = {
    counts_verified: { type: 'bool', required: false },
    note_text:       { type: 'str', required: false, max: 12000 },
    procedure_done:  { type: 'str', required: false, max: 2000 },
    complications:   { type: 'str', required: false, max: 4000 },
    postop_plan:     { type: 'str', required: false, max: 4000 }
};

// POST /api/appointments
const appointmentCreate = {
    patient_name: { type: 'str', required: false, max: 300 },
    patient_id:   { type: 'id', required: false },
    doctor_name:  { type: 'str', required: false, max: 300 },
    department:   { type: 'str', required: false, max: 120 },
    appt_date:    { type: 'dateStr', required: false },
    appt_time:    { type: 'str', required: false, max: 20 },
    notes:        { type: 'str', required: false, max: 4000 },
    fee:          { type: 'num', required: false, min: 0 }
};

// POST /api/queue/checkin
const queueCheckinCreate = {
    patient_id:     { type: 'id', required: true },
    doctor:         { type: 'str', required: false, max: 300 },
    department:     { type: 'str', required: false, max: 120 },
    triage_level:   { type: 'int', required: false, min: 1 },
    exam_room_id:   { type: 'str', required: false, max: 120 },
    acuity_notes:   { type: 'str', required: false, max: 2000 }
};

// PUT /api/queue/patients/:id/status
const queueStatusUpdate = {
    status: { type: 'str', required: true, max: 80 }
};

// PUT /api/queue/patients/:id/triage
const queueTriageUpdate = {
    triage_level: { type: 'int', required: false, min: 1 },
    acuity_notes: { type: 'str', required: false, max: 2000 },
    exam_room_id: { type: 'str', required: false, max: 120 }
};

// PUT /api/patients/:id/referral
const patientReferralUpdate = {
    department: { type: 'str', required: true, max: 120 }
};

// PUT /api/bookings/:id
const bookingUpdate = {
    status: { type: 'str', required: true, max: 80 }
};

// POST /api/referrals
const patientReferralCreate = {
    patient_id:    { type: 'id', required: false },
    patient_name:  { type: 'str', required: false, max: 300 },
    to_department: { type: 'str', required: false, max: 120 },
    to_doctor:     { type: 'str', required: false, max: 300 },
    reason:        { type: 'str', required: false, max: 2000 },
    urgency:       { type: 'str', required: false, max: 80 },
    notes:         { type: 'str', required: false, max: 4000 }
};

// PUT /api/referrals/:id
const patientReferralStatusUpdate = {
    status: { type: 'str', required: true, max: 80 }
};

// POST /api/appointments/followup
const appointmentFollowupCreate = {
    patient_id:   { type: 'id', required: false },
    patient_name: { type: 'str', required: false, max: 300 },
    doctor_name:  { type: 'str', required: false, max: 300 },
    appt_date:    { type: 'dateStr', required: false },
    appt_time:    { type: 'str', required: false, max: 20 },
    notes:        { type: 'str', required: false, max: 4000 }
};

// POST /api/appointments/check-duplicate
const appointmentDuplicateCheck = {
    patient_id: { type: 'id', required: true },
    date:       { type: 'dateStr', required: true },
    doctor:     { type: 'str', required: true, max: 300 }
};

// POST /api/medical/certificates
const medicalCertificateCreate = {
    patient_id:   { type: 'id', required: false },
    patient_name: { type: 'str', required: false, max: 300 },
    cert_type:    { type: 'str', required: false, max: 120 },
    diagnosis:    { type: 'str', required: false, max: 4000 },
    notes:        { type: 'str', required: false, max: 4000 },
    start_date:   { type: 'dateStr', required: false },
    end_date:     { type: 'dateStr', required: false },
    days:         { type: 'int', required: false, min: 0 }
};

// PUT /api/medical/services/:id
const medicalServiceUpdate = {
    service_name_ar: { type: 'str', required: false, max: 300 },
    service_name_en: { type: 'str', required: false, max: 300 },
    price:           { type: 'num', required: false, min: 0 },
    is_active:       { type: 'bool', required: false }
};

// AI orchestrators use a permissive generic schema (PHI signals body fields)
const aiOrchestratorInvoke = {
    patient_id:      { type: 'id', required: false },
    patientId:       { type: 'id', required: false },
    notes:           { type: 'str', required: false, max: 8000 }
};

// PUT /api/patients/:id
const patientUpdate = {
    name_ar:                   { type: 'str', required: false, max: 200 },
    name_en:                   { type: 'str', required: false, max: 200 },
    national_id:               { type: 'str', required: false, max: 30 },
    nationality:               { type: 'str', required: false, max: 80 },
    gender:                    { type: 'enumOf', allowed: ['Male','Female','male','female','M','F','ذكر','أنثى',''], required: false },
    phone:                     { type: 'phone', required: false },
    dob:                       { type: 'str', required: false, max: 30 },
    dob_hijri:                 { type: 'str', required: false, max: 30 },
    department:                { type: 'str', required: false, max: 120 },
    status:                    { type: 'str', required: false, max: 80 },
    blood_type:                { type: 'str', required: false, max: 8 },
    allergies:                 { type: 'str', required: false, max: 4000 },
    chronic_diseases:          { type: 'str', required: false, max: 4000 },
    emergency_contact_name:    { type: 'str', required: false, max: 200 },
    emergency_contact_phone:   { type: 'phone', required: false },
    address:                   { type: 'str', required: false, max: 2000 },
    insurance_company:         { type: 'str', required: false, max: 300 },
    insurance_policy_number:   { type: 'str', required: false, max: 120 },
    insurance_class:           { type: 'str', required: false, max: 120 }
};

// POST /api/patients/:id/problems
const patientProblemCreate = {
    problem_name: { type: 'str', required: true, max: 300 },
    icd_code:     { type: 'str', required: false, max: 60 },
    status:       { type: 'str', required: false, max: 80 },
    onset_date:   { type: 'dateStr', required: false }
};

// POST /api/patients/:id/social-history
const patientSocialHistoryUpsert = {
    smoking_status:    { type: 'str', required: false, max: 80 },
    alcohol_use:       { type: 'bool', required: false },
    exercise_frequency:{ type: 'str', required: false, max: 80 },
    occupation:        { type: 'str', required: false, max: 200 },
    marital_status:    { type: 'str', required: false, max: 80 },
    education_level:   { type: 'str', required: false, max: 80 },
    notes:             { type: 'str', required: false, max: 4000 }
};

// POST /api/patients/:id/family-history
const patientFamilyHistoryCreate = {
    relation:      { type: 'str', required: false, max: 80 },
    condition:     { type: 'str', required: false, max: 300 },
    icd_code:      { type: 'str', required: false, max: 60 },
    age_at_onset:  { type: 'int', required: false, min: 0 },
    notes:         { type: 'str', required: false, max: 4000 }
};

// POST /api/cardiology/procedures
const cardiologyProcedureCreate = {
    patient_id:       { type: 'id', required: true },
    procedure_type:   { type: 'str', required: true, max: 120 },
    findings:         { type: 'str', required: false, max: 4000 },
    recommendations:  { type: 'str', required: false, max: 4000 }
};

// POST /api/cardiology/ecg
const cardiologyEcgCreate = {
    patient_id:     { type: 'id', required: true },
    leads_data:     { type: 'str', required: true, max: 8000 },
    heart_rate:     { type: 'int', required: false, min: 0, max: 400 },
    interpretation: { type: 'str', required: false, max: 4000 }
};

// POST /api/cardiology/cath-reports
const cardiologyCathReportCreate = {
    patient_id:        { type: 'id', required: true },
    procedure_type:    { type: 'str', required: false, max: 120 },
    findings:          { type: 'str', required: false, max: 8000 },
    recommendations:   { type: 'str', required: false, max: 8000 },
    stent_size:        { type: 'str', required: false, max: 40 },
    contrast_volume:   { type: 'num', required: false, min: 0 },
    fluoroscopy_time:  { type: 'num', required: false, min: 0 },
    blockage_lad:      { type: 'int', required: false, min: 0, max: 100 },
    blockage_lcx:      { type: 'int', required: false, min: 0, max: 100 },
    blockage_rca:      { type: 'int', required: false, min: 0, max: 100 }
};

// POST /api/gastro/endoscopy
const gastroEndoscopyCreate = {
    patient_id:     { type: 'id', required: true },
    procedure_type: { type: 'str', required: true, max: 120 },
    findings:       { type: 'str', required: false, max: 8000 },
    recommendations:{ type: 'str', required: false, max: 4000 }
};

// POST /api/gastro/biopsy
const gastroBiopsyCreate = {
    patient_id:  { type: 'id', required: true },
    site:        { type: 'str', required: true, max: 120 },
    findings:    { type: 'str', required: false, max: 4000 }
};

// PUT /api/gastro/biopsy/:id/result
const gastroBiopsyResultUpdate = {
    result_text:  { type: 'str', required: false, max: 8000 },
    diagnosis:    { type: 'str', required: false, max: 2000 },
    malignant:    { type: 'bool', required: false }
};

// POST /api/endocrine/glucose
const endocrineGlucoseCreate = {
    patient_id: { type: 'id', required: true },
    value_mg:   { type: 'num', required: true, min: 0, max: 1500 },
    timestamp:  { type: 'dateStr', required: false },
    notes:      { type: 'str', required: false, max: 1000 }
};

// POST /api/endocrine/insulin
const endocrineInsulinCreate = {
    patient_id: { type: 'id', required: true },
    insulin_type: { type: 'str', required: true, max: 80 },
    dose_units: { type: 'num', required: true, min: 0, max: 500 },
    timestamp:  { type: 'dateStr', required: false }
};

// PUT /api/endocrine/insulin/:id/deactivate
const endocrineInsulinDeactivate = {
    reason: { type: 'str', required: false, max: 500 }
};

// POST /api/nephrology/dialysis
const nephrologyDialysisCreate = {
    patient_id:      { type: 'id', required: true },
    session_type:    { type: 'str', required: true, max: 80 },
    duration_hours:  { type: 'num', required: false, min: 0, max: 12 },
    pre_weight:      { type: 'num', required: false, min: 0 },
    post_weight:     { type: 'num', required: false, min: 0 },
    notes:           { type: 'str', required: false, max: 4000 }
};

// POST /api/ophthalmology/exams
const ophthalmologyExamCreate = {
    patient_id:        { type: 'id', required: true },
    eye_side:          { type: 'enumOf', allowed: ['OD', 'OS', 'OU', 'RE', 'LE', 'Both', ''], required: false },
    visual_acuity:     { type: 'str', required: false, max: 20 },
    intraocular_pressure: { type: 'num', required: false, min: 0, max: 80 },
    findings:          { type: 'str', required: false, max: 4000 }
};

// POST /api/surgery/checklists
const surgeryChecklistCreate = {
    patient_id:           { type: 'id', required: true },
    procedure_name:       { type: 'str', required: true, max: 200 },
    surgery_date:         { type: 'dateStr', required: false },
    sign_in_confirmed:    { type: 'bool', required: false },
    time_out_confirmed:   { type: 'bool', required: false },
    sign_out_confirmed:   { type: 'bool', required: false },
    notes:                { type: 'str', required: false, max: 4000 }
};

// POST /api/surgery/timelogs
const surgeryTimelogCreate = {
    patient_id:              { type: 'id', required: true },
    procedure_name:          { type: 'str', required: true, max: 200 },
    anesthesia_start_time:   { type: 'dateStr', required: false },
    incision_time:           { type: 'dateStr', required: false },
    closure_time:            { type: 'dateStr', required: false },
    anesthesia_end_time:     { type: 'dateStr', required: false }
};

// POST /api/surgery/cpb (cardiopulmonary bypass)
const surgeryCpbCreate = {
    patient_id:        { type: 'id', required: true },
    bypass_date:       { type: 'dateStr', required: false },
    pump_time:         { type: 'int', required: false, min: 0 },
    cross_clamp_time:  { type: 'int', required: false, min: 0 },
    flow_rate:         { type: 'num', required: false, min: 0 },
    min_temp:          { type: 'num', required: false, min: 20, max: 42 },
    notes:             { type: 'str', required: false, max: 4000 }
};

// PUT /api/surgery-preop-tests/:id
const surgeryPreopTestUpdate = {
    is_completed:    { type: 'bool', required: false },
    result_summary:  { type: 'str', required: false, max: 4000 }
};

// POST /api/surgery/count-sheet
const surgeryCountSheetCreate = {
    surgery_id:               { type: 'id', required: true },
    sponge_count_initial:     { type: 'int', required: false, min: 0 },
    sponge_count_final:       { type: 'int', required: false, min: 0 },
    needle_count_initial:     { type: 'int', required: false, min: 0 },
    needle_count_final:       { type: 'int', required: false, min: 0 },
    instrument_count_initial: { type: 'int', required: false, min: 0 },
    instrument_count_final:   { type: 'int', required: false, min: 0 },
    witness1_name:            { type: 'str', required: false, max: 200 },
    witness2_name:            { type: 'str', required: false, max: 200 },
    notes:                    { type: 'str', required: false, max: 4000 }
};

// POST /api/urology/urodynamics
const urologyUrodynamicsCreate = {
    patient_id:           { type: 'id', required: true },
    study_date:           { type: 'dateStr', required: false },
    max_flow_rate:        { type: 'num', required: false, min: 0 },
    voided_volume:        { type: 'num', required: false, min: 0 },
    post_void_residual:   { type: 'num', required: false, min: 0 },
    detrusor_pressure:    { type: 'num', required: false, min: 0 },
    interpretation:       { type: 'str', required: false, max: 4000 }
};

// POST /api/anesthesia/pain
const anesthesiaPainCreate = {
    patient_id:        { type: 'id', required: true },
    assessment_time:   { type: 'dateStr', required: false },
    pain_score_vas:    { type: 'int', required: false, min: 0, max: 10 },
    pca_pump_used:     { type: 'bool', required: false },
    pca_demands:       { type: 'int', required: false, min: 0 },
    pca_deliveries:    { type: 'int', required: false, min: 0 },
    notes:             { type: 'str', required: false, max: 4000 }
};

// POST /api/pediatrics/growth
const pediatricsGrowthCreate = {
    patient_id:      { type: 'id', required: true },
    record_date:     { type: 'dateStr', required: false },
    apgar_1min:      { type: 'int', required: false, min: 0, max: 10 },
    apgar_5min:      { type: 'int', required: false, min: 0, max: 10 },
    weight_kg:       { type: 'num', required: false, min: 0, max: 500 },
    height_cm:       { type: 'num', required: false, min: 0, max: 250 },
    head_circ_cm:    { type: 'num', required: false, min: 0, max: 100 }
};

// POST /api/pediatrics/immunization
const pediatricsImmunizationCreate = {
    patient_id:    { type: 'id', required: true },
    vaccine_name:  { type: 'str', required: true, max: 200 },
    dose_number:   { type: 'int', required: false, min: 1, max: 20 },
    given_date:    { type: 'dateStr', required: false },
    batch_number:  { type: 'str', required: false, max: 80 },
    site:          { type: 'str', required: false, max: 40 },
    route:         { type: 'enumOf', allowed: ['IM', 'SC', 'Oral', 'ID', 'IN', ''], required: false },
    next_due:      { type: 'dateStr', required: false },
    notes:         { type: 'str', required: false, max: 4000 }
};

// POST /api/pediatrics/apgar
const pediatricsApgarCreate = {
    patient_id:  { type: 'id', required: true },
    mother_id:   { type: 'id', required: false },
    apgar_1min:  { type: 'int', required: false, min: 0, max: 10 },
    apgar_5min:  { type: 'int', required: false, min: 0, max: 10 },
    apgar_10min: { type: 'int', required: false, min: 0, max: 10 },
    details:     { type: 'str', required: false, max: 4000 },
    notes:       { type: 'str', required: false, max: 4000 }
};

// POST /api/obgyn/pregnancies (OB-engine module, line ~16307)
const obgynPregnancyCreate = {
    patient_id:               { type: 'id', required: true },
    lmp:                      { type: 'dateStr', required: false },
    gravida:                  { type: 'int', required: false, min: 0, max: 30 },
    para:                     { type: 'int', required: false, min: 0, max: 30 },
    abortions:                { type: 'int', required: false, min: 0, max: 30 },
    living_children:          { type: 'int', required: false, min: 0, max: 30 },
    blood_group:              { type: 'enumOf', allowed: ['A', 'B', 'AB', 'O', ''], required: false },
    rh_factor:                { type: 'enumOf', allowed: ['+', '-', 'Positive', 'Negative', ''], required: false },
    risk_level:               { type: 'enumOf', allowed: ['Low', 'Medium', 'High', ''], required: false },
    pre_pregnancy_weight:     { type: 'num', required: false, min: 0, max: 300 },
    height:                   { type: 'num', required: false, min: 0, max: 250 },
    allergies:                { type: 'str', required: false, max: 1000 },
    chronic_conditions:       { type: 'str', required: false, max: 1000 },
    previous_cs:              { type: 'bool', required: false },
    previous_complications:   { type: 'str', required: false, max: 1000 },
    husband_name:             { type: 'str', required: false, max: 200 },
    husband_blood_group:      { type: 'str', required: false, max: 10 },
    attending_doctor:         { type: 'str', required: false, max: 200 }
};

// PUT /api/obgyn/pregnancies/:id
const obgynPregnancyUpdate = {
    blood_group:              { type: 'enumOf', allowed: ['A', 'B', 'AB', 'O', ''], required: false },
    rh_factor:                { type: 'enumOf', allowed: ['+', '-', 'Positive', 'Negative', ''], required: false },
    risk_level:               { type: 'enumOf', allowed: ['Low', 'Medium', 'High', ''], required: false },
    pre_pregnancy_weight:     { type: 'num', required: false, min: 0, max: 300 },
    height:                   { type: 'num', required: false, min: 0, max: 250 },
    allergies:                { type: 'str', required: false, max: 1000 },
    chronic_conditions:       { type: 'str', required: false, max: 1000 },
    previous_cs:              { type: 'bool', required: false },
    previous_complications:   { type: 'str', required: false, max: 1000 },
    husband_name:             { type: 'str', required: false, max: 200 },
    husband_blood_group:      { type: 'str', required: false, max: 10 },
    attending_doctor:         { type: 'str', required: false, max: 200 }
};

// POST /api/obgyn/antenatal
const obgynAntenatalCreate = {
    pregnancy_id:        { type: 'id', required: true },
    gestational_age:     { type: 'int', required: false, min: 0, max: 50 },
    weight:              { type: 'num', required: false, min: 0, max: 300 },
    systolic:            { type: 'int', required: false, min: 0, max: 300 },
    diastolic:           { type: 'int', required: false, min: 0, max: 200 },
    fundal_height:       { type: 'num', required: false, min: 0, max: 60 },
    fetal_heart_rate:    { type: 'int', required: false, min: 0, max: 250 },
    fetal_presentation:  { type: 'str', required: false, max: 60 },
    fetal_movement:      { type: 'str', required: false, max: 200 },
    edema:               { type: 'str', required: false, max: 40 },
    proteinuria:         { type: 'str', required: false, max: 40 },
    glucose_urine:       { type: 'str', required: false, max: 40 },
    hemoglobin:          { type: 'num', required: false, min: 0, max: 30 },
    complaints:          { type: 'str', required: false, max: 4000 },
    examination_notes:   { type: 'str', required: false, max: 4000 },
    plan:                { type: 'str', required: false, max: 4000 },
    next_visit:          { type: 'dateStr', required: false }
};

// POST /api/obgyn/partogram
const obgynPartogramCreate = {
    pregnancy_id:                  { type: 'id', required: true },
    cervical_dilation:             { type: 'num', required: false, min: 0, max: 10 },
    cervical_effacement:           { type: 'num', required: false, min: 0, max: 100 },
    descent_station:               { type: 'num', required: false, min: -5, max: 5 },
    contractions_per_10min:        { type: 'int', required: false, min: 0, max: 20 },
    contraction_duration:          { type: 'int', required: false, min: 0, max: 300 },
    contraction_intensity:         { type: 'str', required: false, max: 40 },
    fetal_heart_rate_baseline:     { type: 'int', required: false, min: 0, max: 250 },
    fetal_heart_rate_variability:  { type: 'str', required: false, max: 40 },
    decelerations:                 { type: 'str', required: false, max: 100 },
    molding:                       { type: 'str', required: false, max: 40 },
    caput_succedaneum:             { type: 'str', required: false, max: 40 },
    meconium:                      { type: 'str', required: false, max: 40 },
    amniotic_fluid:                { type: 'str', required: false, max: 40 },
    maternal_bp:                   { type: 'str', required: false, max: 20 },
    maternal_hr:                   { type: 'int', required: false, min: 0, max: 250 },
    maternal_temp:                 { type: 'num', required: false, min: 30, max: 45 },
    oxytocin_units:                { type: 'num', required: false, min: 0 },
    notes:                         { type: 'str', required: false, max: 4000 }
};

// POST /api/obgyn/ultrasounds
const obgynUltrasoundCreate = {
    pregnancy_id:          { type: 'id', required: true },
    scan_type:             { type: 'str', required: false, max: 80 },
    gestational_age:       { type: 'str', required: false, max: 40 },
    bpd:                   { type: 'num', required: false, min: 0, max: 200 },
    hc:                    { type: 'num', required: false, min: 0, max: 500 },
    ac:                    { type: 'num', required: false, min: 0, max: 500 },
    fl:                    { type: 'num', required: false, min: 0, max: 200 },
    efw:                   { type: 'num', required: false, min: 0, max: 10000 },
    amniotic_fluid_index:  { type: 'num', required: false, min: 0, max: 100 },
    placenta_location:     { type: 'str', required: false, max: 40 },
    placenta_grade:        { type: 'enumOf', allowed: ['0', 'I', 'II', 'III', ''], required: false },
    fetal_heart_rate:      { type: 'int', required: false, min: 0, max: 250 },
    fetal_presentation:    { type: 'str', required: false, max: 60 },
    fetal_gender:          { type: 'enumOf', allowed: ['Male', 'Female', 'Not determined', ''], required: false },
    number_of_fetuses:     { type: 'int', required: false, min: 1, max: 10 },
    cervical_length:       { type: 'num', required: false, min: 0, max: 100 },
    anomalies:             { type: 'str', required: false, max: 4000 },
    findings:              { type: 'str', required: false, max: 4000 },
    impression:            { type: 'str', required: false, max: 4000 }
};

// POST /api/obgyn/deliveries
const obgynDeliveryCreate = {
    pregnancy_id:           { type: 'id', required: true },
    delivery_date:          { type: 'dateStr', required: false },
    delivery_mode:          { type: 'enumOf', allowed: ['Vaginal', 'C-section', 'Vacuum', 'Forceps', 'VBAC', 'Other', ''], required: false },
    presentation:           { type: 'str', required: false, max: 60 },
    anesthesia_type:        { type: 'str', required: false, max: 80 },
    labor_duration_hours:   { type: 'num', required: false, min: 0, max: 100 },
    oxytocin_used:          { type: 'bool', required: false },
    episiotomy:             { type: 'bool', required: false },
    perineal_laceration:    { type: 'str', required: false, max: 40 },
    blood_loss_ml:          { type: 'int', required: false, min: 0, max: 10000 },
    placenta_complete:      { type: 'bool', required: false },
    placenta_abnormalities: { type: 'str', required: false, max: 400 },
    umbilical_cord:         { type: 'str', required: false, max: 200 },
    notes:                  { type: 'str', required: false, max: 4000 }
};

// POST /api/obgyn/neonatal
const obgynNeonatalCreate = {
    delivery_id:                 { type: 'id', required: true },
    baby_patient_id:             { type: 'id', required: false },
    apgar_1min_components:       { type: 'str', required: false, max: 4000 },
    apgar_5min_components:       { type: 'str', required: false, max: 4000 },
    apgar_10min_components:      { type: 'str', required: false, max: 4000 },
    birth_weight_grams:          { type: 'int', required: false, min: 0, max: 10000 },
    length_cm:                   { type: 'num', required: false, min: 0, max: 100 },
    head_circumference_cm:       { type: 'num', required: false, min: 0, max: 100 },
    blood_group:                 { type: 'str', required: false, max: 10 },
    coombs_test:                 { type: 'enumOf', allowed: ['Positive', 'Negative', 'Not Done', ''], required: false },
    resuscitation_needed:        { type: 'bool', required: false },
    resuscitation_type:          { type: 'str', required: false, max: 200 },
    birth_injury:                { type: 'str', required: false, max: 400 },
    jaundice_onset:              { type: 'str', required: false, max: 40 },
    phototherapy_needed:         { type: 'bool', required: false },
    hypoglycemia:                { type: 'bool', required: false },
    hypothermia:                 { type: 'bool', required: false },
    congenital_abnormalities:    { type: 'str', required: false, max: 1000 },
    feeding_type:                { type: 'enumOf', allowed: ['Breast', 'Formula', 'Mixed', ''], required: false },
    feeding_established:         { type: 'bool', required: false },
    discharge_destination:       { type: 'str', required: false, max: 80 },
    discharge_status:            { type: 'str', required: false, max: 80 },
    follow_up_plan:              { type: 'str', required: false, max: 1000 }
};

// POST /api/obgyn/nst
const obgynNstCreate = {
    pregnancy_id:        { type: 'id', required: true },
    duration_minutes:    { type: 'int', required: false, min: 1, max: 120 },
    baseline_fhr:        { type: 'int', required: false, min: 0, max: 250 },
    variability:         { type: 'str', required: false, max: 40 },
    accelerations:       { type: 'int', required: false, min: 0, max: 50 },
    decelerations:       { type: 'str', required: false, max: 100 },
    contractions:        { type: 'int', required: false, min: 0, max: 20 },
    result:              { type: 'enumOf', allowed: ['Reactive', 'Non-reactive', 'Inconclusive', ''], required: false },
    interpretation:      { type: 'str', required: false, max: 4000 },
    action_taken:        { type: 'str', required: false, max: 1000 }
};

// POST /api/psychiatry/evaluations
const psychiatryEvaluationCreate = {
    patient_id:       { type: 'id', required: true },
    evaluation_type:  { type: 'enumOf', allowed: ['Initial', 'Follow-up', 'Crisis', 'Discharge', 'Other', ''], required: false },
    mood:             { type: 'str', required: false, max: 200 },
    affect:           { type: 'str', required: false, max: 200 },
    thought_process:  { type: 'str', required: false, max: 4000 },
    thought_content:  { type: 'str', required: false, max: 4000 },
    perception:       { type: 'str', required: false, max: 2000 },
    cognition:        { type: 'str', required: false, max: 2000 },
    insight:          { type: 'str', required: false, max: 1000 },
    judgement:        { type: 'str', required: false, max: 1000 },
    risk_assessment:  { type: 'str', required: false, max: 4000 },
    phq9_score:       { type: 'int', required: false, min: 0, max: 27 },
    gad7_score:       { type: 'int', required: false, min: 0, max: 21 },
    notes:            { type: 'str', required: false, max: 8000 }
};

// POST /api/dermatology/lesions
const dermatologyLesionCreate = {
    patient_id:    { type: 'id', required: true },
    body_location: { type: 'str', required: false, max: 200 },
    size_mm:       { type: 'num', required: false, min: 0, max: 500 },
    color:         { type: 'str', required: false, max: 80 },
    shape:         { type: 'str', required: false, max: 80 },
    borders:       { type: 'str', required: false, max: 80 },
    description:   { type: 'str', required: false, max: 4000 },
    abcde_score:   { type: 'str', required: false, max: 40 }
};

// POST /api/ent/audiograms
const entAudiogramCreate = {
    patient_id:           { type: 'id', required: true },
    test_date:            { type: 'dateStr', required: false },
    right_ear_500hz:      { type: 'int', required: false, min: -20, max: 120 },
    right_ear_1000hz:     { type: 'int', required: false, min: -20, max: 120 },
    right_ear_2000hz:     { type: 'int', required: false, min: -20, max: 120 },
    right_ear_4000hz:     { type: 'int', required: false, min: -20, max: 120 },
    left_ear_500hz:       { type: 'int', required: false, min: -20, max: 120 },
    left_ear_1000hz:      { type: 'int', required: false, min: -20, max: 120 },
    left_ear_2000hz:      { type: 'int', required: false, min: -20, max: 120 },
    left_ear_4000hz:      { type: 'int', required: false, min: -20, max: 120 },
    interpretation:       { type: 'str', required: false, max: 4000 }
};

// POST /api/plastic-burns/assessments
const plasticBurnAssessmentCreate = {
    patient_id:           { type: 'id', required: true },
    burn_type:            { type: 'enumOf', allowed: ['Thermal', 'Chemical', 'Electrical', 'Radiation', 'Friction', 'Other', ''], required: false },
    body_surface_area:    { type: 'num', required: false, min: 0, max: 100 },
    burn_degree:          { type: 'enumOf', allowed: ['First', 'Second', 'Third', 'Fourth', ''], required: false },
    rule_of_nines:        { type: 'str', required: false, max: 200 },
    inhalation_injury:    { type: 'bool', required: false },
    treatment_plan:       { type: 'str', required: false, max: 4000 },
    notes:                { type: 'str', required: false, max: 4000 }
};

// POST /api/plastic-burns/photos
const plasticBurnPhotoCreate = {
    patient_id:     { type: 'id', required: true },
    photo_url:      { type: 'str', required: false, max: 2000 },
    body_location:  { type: 'str', required: false, max: 200 },
    consent_signed: { type: 'bool', required: false },
    notes:          { type: 'str', required: false, max: 2000 }
};

// POST /api/icu/assessments
const icuAssessmentCreate = {
    patient_id:           { type: 'id', required: true },
    assessment_type:      { type: 'str', required: false, max: 80 },
    gcs_total:            { type: 'int', required: false, min: 3, max: 15 },
    apache_ii_score:      { type: 'int', required: false, min: 0, max: 71 },
    sofa_score:           { type: 'int', required: false, min: 0, max: 24 },
    notes:                { type: 'str', required: false, max: 4000 }
};

// POST /api/icu/flowsheet + /api/icu/monitoring
const icuFlowsheetCreate = {
    admission_id:   { type: 'id', required: true },
    recorded_at:    { type: 'dateStr', required: false },
    parameter:      { type: 'str', required: true, max: 80 },
    value:          { type: 'num', required: false, min: -1000, max: 10000 },
    unit:           { type: 'str', required: false, max: 20 },
    notes:          { type: 'str', required: false, max: 1000 }
};

// POST /api/icu/ventilator
const icuVentilatorCreate = {
    admission_id:        { type: 'id', required: true },
    recorded_at:         { type: 'dateStr', required: false },
    mode:                { type: 'str', required: false, max: 40 },
    fio2:                { type: 'num', required: false, min: 21, max: 100 },
    peep:                { type: 'num', required: false, min: 0, max: 30 },
    tidal_volume:        { type: 'num', required: false, min: 0, max: 1500 },
    respiratory_rate:    { type: 'int', required: false, min: 0, max: 80 },
    pressure_support:    { type: 'num', required: false, min: 0, max: 60 },
    notes:               { type: 'str', required: false, max: 2000 }
};

// POST /api/icu/infusion
const icuInfusionCreate = {
    admission_id:     { type: 'id', required: true },
    drug_name:        { type: 'str', required: true, max: 200 },
    dose:             { type: 'num', required: false, min: 0 },
    unit:             { type: 'str', required: false, max: 20 },
    rate_ml_hr:       { type: 'num', required: false, min: 0, max: 1000 },
    started_at:       { type: 'dateStr', required: false },
    notes:            { type: 'str', required: false, max: 2000 }
};

// POST /api/icu/score + /api/icu/scores
const icuScoreCreate = {
    admission_id:    { type: 'id', required: true },
    score_type:      { type: 'enumOf', allowed: ['SOFA', 'APACHE_II', 'GCS', 'SAPS_II', 'MODS', 'LODS', 'qSOFA', ''], required: true },
    score_value:     { type: 'num', required: true, min: 0, max: 100 },
    components:      { type: 'str', required: false, max: 4000 },
    recorded_at:     { type: 'dateStr', required: false }
};

// POST /api/icu/fluid-balance
const icuFluidBalanceCreate = {
    admission_id:    { type: 'id', required: true },
    recorded_at:     { type: 'dateStr', required: false },
    iv_fluids:       { type: 'int', required: false, min: 0, max: 10000 },
    oral_intake:     { type: 'int', required: false, min: 0, max: 10000 },
    blood_products:  { type: 'int', required: false, min: 0, max: 10000 },
    medications_iv:  { type: 'int', required: false, min: 0, max: 10000 },
    urine:           { type: 'int', required: false, min: 0, max: 10000 },
    drains:          { type: 'int', required: false, min: 0, max: 10000 },
    ngt_output:      { type: 'int', required: false, min: 0, max: 10000 },
    stool:           { type: 'int', required: false, min: 0, max: 10000 },
    vomit:           { type: 'int', required: false, min: 0, max: 10000 },
    insensible:      { type: 'int', required: false, min: 0, max: 10000 }
};

// POST /api/icu/daily-goals
const icuDailyGoalsCreate = {
    admission_id:       { type: 'id', required: true },
    goals_date:         { type: 'dateStr', required: false },
    pain_goal:          { type: 'str', required: false, max: 1000 },
    sedation_goal:      { type: 'str', required: false, max: 1000 },
    delirium_goal:      { type: 'str', required: false, max: 1000 },
    mobility_goal:      { type: 'str', required: false, max: 1000 },
    respiratory_goal:   { type: 'str', required: false, max: 1000 },
    hemodynamic_goal:   { type: 'str', required: false, max: 1000 },
    nutrition_goal:     { type: 'str', required: false, max: 1000 },
    wound_goal:         { type: 'str', required: false, max: 1000 },
    line_tubing_goal:   { type: 'str', required: false, max: 1000 },
    medication_goal:     { type: 'str', required: false, max: 1000 },
    disposition_plan:   { type: 'str', required: false, max: 1000 },
    communicated_with_family: { type: 'bool', required: false }
};

// POST /api/icu/prevention-bundles
const icuPreventionBundlesCreate = {
    admission_id:        { type: 'id', required: true },
    bundle_type:         { type: 'enumOf', allowed: ['VAP', 'CLABSI', 'CAUTI', 'Pressure_Injury', 'DVT', 'Stress_Ulcer', ''], required: false },
    head_of_bed_elevated:{ type: 'bool', required: false },
    sedation_vacation:   { type: 'bool', required: false },
    oral_care:           { type: 'bool', required: false },
    peptic_ulcer_prophylaxis: { type: 'bool', required: false },
    dvt_prophylaxis:     { type: 'bool', required: false },
    central_line_removal_review: { type: 'bool', required: false },
    notes:               { type: 'str', required: false, max: 4000 }
};

// POST /api/orthopedics/implants
const orthopedicsImplantCreate = {
    patient_id:         { type: 'id', required: true },
    implant_date:       { type: 'dateStr', required: false },
    implant_type:       { type: 'str', required: true, max: 120 },
    manufacturer:       { type: 'str', required: true, max: 200 },
    model_name:         { type: 'str', required: false, max: 200 },
    serial_number:      { type: 'str', required: true, max: 120 },
    size_dimension:     { type: 'str', required: false, max: 80 },
    batch_lot_number:   { type: 'str', required: false, max: 80 },
    clinical_notes:     { type: 'str', required: false, max: 4000 }
};

// POST /api/orthopedics/rom
const orthopedicsRomCreate = {
    patient_id:        { type: 'id', required: true },
    assessment_date:   { type: 'dateStr', required: false },
    joint_name:        { type: 'str', required: true, max: 80 },
    lateral_side:      { type: 'enumOf', allowed: ['Left', 'Right', 'Bilateral', ''], required: true },
    movement_type:     { type: 'str', required: true, max: 80 },
    angle_degrees:     { type: 'num', required: true, min: -30, max: 360 },
    is_restricted:     { type: 'bool', required: false }
};

// POST /api/pulmonology/pft
const pulmonologyPftCreate = {
    patient_id:        { type: 'id', required: true },
    test_date:         { type: 'dateStr', required: false },
    fev1:              { type: 'num', required: false, min: 0, max: 12 },
    fvc:               { type: 'num', required: false, min: 0, max: 12 },
    pef:               { type: 'num', required: false, min: 0, max: 1000 },
    interpretation:    { type: 'str', required: false, max: 4000 },
    notes:             { type: 'str', required: false, max: 4000 }
};

// POST /api/rheumatology/joints
const rheumatologyJointCreate = {
    patient_id:               { type: 'id', required: true },
    assessment_date:          { type: 'dateStr', required: false },
    tender_joint_count:       { type: 'int', required: false, min: 0, max: 28 },
    swollen_joint_count:      { type: 'int', required: false, min: 0, max: 28 },
    vas_pain:                 { type: 'int', required: false, min: 0, max: 100 },
    esr:                      { type: 'num', required: false, min: 0, max: 200 },
    crp:                      { type: 'num', required: false, min: 0, max: 500 },
    gh:                       { type: 'int', required: false, min: 0, max: 100 },
    notes:                    { type: 'str', required: false, max: 4000 }
};

// POST /api/neurology/assessments
const neurologyAssessmentCreate = {
    patient_id:          { type: 'id', required: true },
    assessment_date:     { type: 'dateStr', required: false },
    gcs_eye:             { type: 'int', required: false, min: 1, max: 4 },
    gcs_verbal:          { type: 'int', required: false, min: 1, max: 5 },
    gcs_motor:           { type: 'int', required: false, min: 1, max: 6 },
    nihss_score:         { type: 'int', required: false, min: 0, max: 42 },
    reflexes_status:     { type: 'str', required: false, max: 1000 },
    notes:               { type: 'str', required: false, max: 4000 }
};

// POST /api/forms (template create)
const formTemplateCreate = {
    template_name:   { type: 'str', required: true, max: 200 },
    department:      { type: 'str', required: false, max: 120 },
    form_fields:     { type: 'str', required: false, max: 100000 }
};

// POST /api/queue/ads
const queueAdCreate = {
    title:            { type: 'str', required: true, max: 200 },
    image_path:       { type: 'str', required: false, max: 2000 },
    duration_seconds: { type: 'int', required: false, min: 1, max: 600 }
};

// POST /api/referrals
const referralCreate = {
    patient_id:   { type: 'id', required: true },
    patient_name: { type: 'str', required: false, max: 200 },
    from_doctor:  { type: 'str', required: false, max: 200 },
    from_dept:    { type: 'str', required: false, max: 120 },
    to_dept:      { type: 'str', required: true, max: 120 },
    to_doctor:    { type: 'str', required: false, max: 200 },
    reason:       { type: 'str', required: true, max: 1000 },
    urgency:      { type: 'enumOf', allowed: ['Routine', 'Urgent', 'STAT', 'Emergency', ''], required: false },
    notes:        { type: 'str', required: false, max: 4000 }
};

// POST /api/settings/rooms
const settingsRoomCreate = {
    name:             { type: 'str', required: true, max: 200 },
    room_number:      { type: 'str', required: false, max: 40 },
    department:       { type: 'str', required: false, max: 120 },
    floor:            { type: 'str', required: false, max: 40 },
    capacity:         { type: 'int', required: false, min: 0, max: 1000 },
    room_type:        { type: 'enumOf', allowed: ['Exam', 'Procedure', 'OR', 'Recovery', 'Consultation', 'Ward', 'ICU', 'Other', ''], required: false },
    is_active:        { type: 'bool', required: false }
};

// PUT /api/settings/rooms/:id
const settingsRoomUpdate = {
    name:             { type: 'str', required: false, max: 200 },
    room_number:      { type: 'str', required: false, max: 40 },
    department:       { type: 'str', required: false, max: 120 },
    floor:            { type: 'str', required: false, max: 40 },
    capacity:         { type: 'int', required: false, min: 0, max: 1000 },
    room_type:        { type: 'enumOf', allowed: ['Exam', 'Procedure', 'OR', 'Recovery', 'Consultation', 'Ward', 'ICU', 'Other', ''], required: false },
    is_active:        { type: 'bool', required: false }
};

// POST /api/mfa/enroll — body may be empty
// (no schema)

// POST /api/mfa/verify
const mfaVerify = {
    token: { type: 'str', required: true, max: 20 }
};

// POST /api/mfa/disable (step-up: password + TOTP)
const mfaDisable = {
    token:    { type: 'str', required: true, max: 20 },
    password: { type: 'str', required: true, max: 200 }
};

// POST /api/mfa/admin-reset
const mfaAdminReset = {
    userId: { type: 'id', required: true }
};

// POST /api/employees + /api/hr/employees
const employeeCreate = {
    name_ar:           { type: 'str', required: false, max: 200 },
    name_en:           { type: 'str', required: true, max: 200 },
    national_id:       { type: 'str', required: false, max: 30 },
    phone:             { type: 'phone', required: false },
    email:             { type: 'str', required: false, max: 200 },
    role:              { type: 'str', required: true, max: 80 },
    department:        { type: 'str', required: false, max: 120 },
    speciality:        { type: 'str', required: false, max: 120 },
    hire_date:         { type: 'dateStr', required: false },
    employee_number:   { type: 'str', required: false, max: 40 }
};

// POST /api/admissions
const admissionCreate = {
    patient_id:        { type: 'id', required: true },
    admission_date:    { type: 'dateStr', required: false },
    admission_type:    { type: 'enumOf', allowed: ['Emergency', 'Elective', 'Transfer', 'Day-care', ''], required: false },
    ward_id:           { type: 'id', required: false },
    bed_id:            { type: 'id', required: false },
    attending_doctor:  { type: 'id', required: false },
    diagnosis:         { type: 'str', required: false, max: 4000 },
    notes:             { type: 'str', required: false, max: 4000 }
};

// PUT /api/admissions/:id/discharge
const admissionDischargeUpdate = {
    discharge_date:    { type: 'dateStr', required: false },
    discharge_type:    { type: 'enumOf', allowed: ['Home', 'Transfer', 'AMA', 'Deceased', 'Referred', ''], required: false },
    discharge_notes:   { type: 'str', required: false, max: 4000 },
    follow_up_plan:    { type: 'str', required: false, max: 4000 }
};

// POST /api/admissions/:id/rounds
const admissionRoundCreate = {
    round_time:        { type: 'dateStr', required: false },
    clinical_notes:    { type: 'str', required: false, max: 8000 },
    plan:              { type: 'str', required: false, max: 4000 },
    vitals_summary:    { type: 'str', required: false, max: 1000 }
};

// POST /api/hr/licenses
const hrLicenseCreate = {
    employee_id:   { type: 'id', required: true },
    license_type:  { type: 'str', required: true, max: 200 },
    license_number:{ type: 'str', required: true, max: 200 },
    issued_by:     { type: 'str', required: false, max: 200 },
    issue_date:    { type: 'dateStr', required: false },
    expiry_date:   { type: 'dateStr', required: false }
};

// POST /api/hr/shifts
const hrShiftCreate = {
    employee_id:  { type: 'id', required: true },
    shift_date:   { type: 'dateStr', required: true },
    start_time:   { type: 'str', required: true, max: 20 },
    end_time:     { type: 'str', required: true, max: 20 },
    department:   { type: 'str', required: false, max: 120 },
    notes:        { type: 'str', required: false, max: 1000 }
};

// POST /api/hr/attendance
const hrAttendanceCreate = {
    employee_id:  { type: 'id', required: true },
    attendance_date: { type: 'dateStr', required: true },
    check_in:     { type: 'str', required: false, max: 20 },
    check_out:    { type: 'str', required: false, max: 20 },
    status:       { type: 'enumOf', allowed: ['Present', 'Absent', 'Late', 'Leave', 'Holiday', ''], required: false }
};

// POST /api/hr/leave-requests
const hrLeaveRequestCreate = {
    employee_id:  { type: 'id', required: true },
    leave_type:   { type: 'enumOf', allowed: ['Annual', 'Sick', 'Emergency', 'Maternity', 'Paternity', 'Unpaid', ''], required: true },
    start_date:   { type: 'dateStr', required: true },
    end_date:     { type: 'dateStr', required: true },
    reason:       { type: 'str', required: false, max: 2000 }
};

// PUT /api/hr/leave-requests/:id/status
const hrLeaveRequestStatusUpdate = {
    status:       { type: 'enumOf', allowed: ['Pending', 'Approved', 'Rejected', 'Cancelled', ''], required: true },
    approver_notes: { type: 'str', required: false, max: 2000 }
};

// POST /api/hr/payroll-slips
const hrPayrollSlipCreate = {
    employee_id:  { type: 'id', required: true },
    pay_period_start: { type: 'dateStr', required: true },
    pay_period_end:   { type: 'dateStr', required: true },
    basic_salary:     { type: 'num', required: false, min: 0 },
    allowances:       { type: 'num', required: false, min: 0 },
    deductions:       { type: 'num', required: false, min: 0 },
    net_pay:          { type: 'num', required: true, min: 0 }
};

// PUT /api/hr/payroll-slips/:id/status
const hrPayrollSlipStatusUpdate = {
    status:       { type: 'enumOf', allowed: ['Draft', 'Approved', 'Paid', 'Cancelled', ''], required: true },
    payment_date: { type: 'dateStr', required: false },
    payment_ref:  { type: 'str', required: false, max: 200 }
};

// POST /api/hr/competencies
const hrCompetencyCreate = {
    employee_id:    { type: 'id', required: true },
    competency_name:{ type: 'str', required: true, max: 200 },
    level:          { type: 'enumOf', allowed: ['Beginner', 'Intermediate', 'Advanced', 'Expert', ''], required: false },
    assessment_date:{ type: 'dateStr', required: false },
    expiry_date:    { type: 'dateStr', required: false },
    notes:          { type: 'str', required: false, max: 4000 }
};

// POST /api/hr/credentialing
const hrCredentialingCreate = {
    employee_id:      { type: 'id', required: true },
    document_type:    { type: 'str', required: true, max: 200 },
    document_number:  { type: 'str', required: false, max: 200 },
    issued_by:        { type: 'str', required: false, max: 200 },
    issue_date:       { type: 'dateStr', required: false },
    expiry_date:      { type: 'dateStr', required: false },
    file_url:         { type: 'str', required: false, max: 2000 }
};

// PUT /api/hr/credentialing/:id/verify
const hrCredentialingVerify = {
    verification_status: { type: 'enumOf', allowed: ['Verified', 'Rejected', 'Pending', ''], required: true },
    verifier_notes:      { type: 'str', required: false, max: 2000 }
};

// POST /api/hr/gosi/calculate
const hrGosiCalculate = {
    employee_id:      { type: 'id', required: true },
    pay_period_start: { type: 'dateStr', required: true },
    pay_period_end:   { type: 'dateStr', required: true },
    basic_salary:     { type: 'num', required: true, min: 0 }
};

// POST /api/hr/wps/generate
const hrWpsGenerate = {
    pay_period_start: { type: 'dateStr', required: true },
    pay_period_end:   { type: 'dateStr', required: true }
};

// PUT /api/hr/wps/:id/submit
const hrWpsSubmit = {
    submission_ref: { type: 'str', required: false, max: 200 },
    submission_date:{ type: 'dateStr', required: false }
};

// POST /api/hr/nitaqat/calculate
const hrNitaqatCalculate = {
    calculation_date: { type: 'dateStr', required: false },
    sector:           { type: 'enumOf', allowed: ['Health', 'Education', 'Other', ''], required: false }
};

// POST /api/dept-requests
const deptRequestCreate = {
    department:  { type: 'str', required: true, max: 120 },
    request_type:{ type: 'enumOf', allowed: ['Maintenance', 'IT', 'Housekeeping', 'Supply', 'Other', ''], required: false },
    priority:    { type: 'enumOf', allowed: ['Low', 'Medium', 'High', 'Urgent', ''], required: false },
    description: { type: 'str', required: true, max: 4000 }
};

// PUT /api/dept-requests/:id
const deptRequestUpdate = {
    status:      { type: 'enumOf', allowed: ['Open', 'In Progress', 'Resolved', 'Cancelled', 'Closed', ''], required: false },
    assigned_to: { type: 'str', required: false, max: 200 },
    notes:       { type: 'str', required: false, max: 4000 }
};

// PUT /api/catalog/lab/:id
const catalogLabUpdate = {
    test_code:    { type: 'str', required: false, max: 80 },
    test_name:    { type: 'str', required: false, max: 200 },
    price:        { type: 'num', required: false, min: 0 },
    is_active:    { type: 'bool', required: false },
    reference_range: { type: 'str', required: false, max: 1000 }
};

// PUT /api/catalog/radiology/:id
const catalogRadiologyUpdate = {
    study_code:   { type: 'str', required: false, max: 80 },
    study_name:   { type: 'str', required: false, max: 200 },
    price:        { type: 'num', required: false, min: 0 },
    is_active:    { type: 'bool', required: false }
};

// POST /api/results/:type/:id/acknowledge
const resultAcknowledge = {
    comment: { type: 'str', required: false, max: 4000 }
};

// POST /api/inventory/items
const inventoryItemCreate = {
    item_code:    { type: 'str', required: true, max: 80 },
    item_name:    { type: 'str', required: true, max: 200 },
    category:     { type: 'enumOf', allowed: ['Drug', 'Supply', 'Equipment', 'Consumable', 'Other', ''], required: false },
    unit:         { type: 'str', required: false, max: 40 },
    unit_price:   { type: 'num', required: false, min: 0 },
    min_stock:    { type: 'num', required: false, min: 0 },
    max_stock:    { type: 'num', required: false, min: 0 }
};

// POST /api/inventory (legacy)
const inventoryLegacyCreate = {
    item_code:    { type: 'str', required: true, max: 80 },
    item_name:    { type: 'str', required: true, max: 200 },
    unit:         { type: 'str', required: false, max: 40 },
    unit_price:   { type: 'num', required: false, min: 0 }
};

// PUT /api/inventory/:id
const inventoryItemUpdate = {
    item_name:    { type: 'str', required: false, max: 200 },
    unit:         { type: 'str', required: false, max: 40 },
    unit_price:   { type: 'num', required: false, min: 0 },
    min_stock:    { type: 'num', required: false, min: 0 },
    max_stock:    { type: 'num', required: false, min: 0 }
};

// POST /api/inventory/purchase-orders
const inventoryPurchaseOrderCreate = {
    supplier_id:     { type: 'id', required: true },
    order_date:      { type: 'dateStr', required: false },
    expected_date:   { type: 'dateStr', required: false },
    total_amount:    { type: 'num', required: true, min: 0 },
    notes:           { type: 'str', required: false, max: 4000 },
    items:           { type: 'str', required: false, max: 20000 }
};

// PUT /api/inventory/purchase-orders/:id/status
const inventoryPurchaseOrderStatusUpdate = {
    status:          { type: 'enumOf', allowed: ['Draft', 'Submitted', 'Approved', 'Received', 'Cancelled', 'Closed', ''], required: true },
    approval_notes:  { type: 'str', required: false, max: 2000 }
};

// POST /api/inventory/goods-receipts
const inventoryGoodsReceiptCreate = {
    purchase_order_id: { type: 'id', required: true },
    receipt_date:      { type: 'dateStr', required: false },
    received_by:       { type: 'str', required: false, max: 200 },
    notes:             { type: 'str', required: false, max: 4000 }
};

// POST /api/inventory/movements
const inventoryMovementCreate = {
    item_id:        { type: 'id', required: true },
    movement_type:  { type: 'enumOf', allowed: ['IN', 'OUT', 'TRANSFER', 'ADJUSTMENT', 'EXPIRED', 'DAMAGED', ''], required: true },
    quantity:       { type: 'num', required: true, min: 0 },
    from_location:  { type: 'str', required: false, max: 200 },
    to_location:    { type: 'str', required: false, max: 200 },
    reason:         { type: 'str', required: false, max: 1000 }
};

// POST /api/inventory/stock-counts
const inventoryStockCountCreate = {
    count_date:    { type: 'dateStr', required: false },
    location:      { type: 'str', required: false, max: 200 },
    notes:         { type: 'str', required: false, max: 4000 },
    items:         { type: 'str', required: false, max: 20000 }
};

// POST /api/settings/users
const settingsUserCreate = {
    username:      { type: 'str', required: true, max: 80 },
    password:      { type: 'str', required: true, max: 200 },
    display_name:  { type: 'str', required: true, max: 200 },
    role:          { type: 'str', required: true, max: 80 },
    speciality:    { type: 'str', required: false, max: 120 },
    email:         { type: 'str', required: false, max: 200 },
    phone:         { type: 'phone', required: false }
};

// PUT /api/settings/users/:id
const settingsUserUpdate = {
    display_name:  { type: 'str', required: false, max: 200 },
    role:          { type: 'str', required: false, max: 80 },
    speciality:    { type: 'str', required: false, max: 120 },
    email:         { type: 'str', required: false, max: 200 },
    phone:         { type: 'phone', required: false },
    is_active:     { type: 'bool', required: false }
};

// POST /api/messages
const messageCreate = {
    recipient_role: { type: 'str', required: false, max: 80 },
    recipient_id:   { type: 'id', required: false },
    title:          { type: 'str', required: true, max: 200 },
    body:           { type: 'str', required: true, max: 8000 },
    priority:       { type: 'enumOf', allowed: ['Low', 'Normal', 'High', 'Urgent', ''], required: false }
};

// WAVE C hardening: medical/AI/infection/messages/patient_DELETE
const medicalBillProcedureCreate = {
    patient_id:      { type: 'id', required: true },
    encounter_id:    { type: 'id', required: false },
    procedure_code:  { type: 'str', required: true, max: 64 },
    procedure_name:  { type: 'str', required: false, max: 255 },
    quantity:        { type: 'int', required: false, min: 1, max: 1000 },
    unit_price:      { type: 'num', required: false, min: 0 },
    notes:           { type: 'str', required: false, max: 2000 }
};

const systemSettingsUpdate = {
    key:             { type: 'str', required: true, max: 128 },
    value:           { type: 'str', required: false, max: 8000 },
    category:        { type: 'enumOf', allowed: ['general', 'security', 'clinical', 'billing', 'integration', 'notification', 'tenant', ''], required: false }
};

const medicalReportCreate = {
    patient_id:      { type: 'id', required: true },
    encounter_id:    { type: 'id', required: false },
    report_type:     { type: 'enumOf', allowed: ['discharge', 'consultation', 'operative', 'radiology', 'lab', 'pathology', 'other', ''], required: true },
    title:           { type: 'str', required: false, max: 255 },
    body:            { type: 'str', required: false, max: 50000 },
    status:          { type: 'enumOf', allowed: ['draft', 'final', 'amended', 'cancelled', ''], required: false }
};

const patientDelete = {
    reason:          { type: 'str', required: false, max: 1000 },
    confirm:         { type: 'bool', required: true }
};

const opdEncounterStart = {
    patient_id:      { type: 'id', required: true },
    chief_complaint: { type: 'str', required: false, max: 1000 },
    specialty:       { type: 'enumOf', allowed: ['general', 'internal', 'peds', 'surgery', 'ent', 'derm', 'ortho', 'gyn', 'other', ''], required: false },
    triage_level:    { type: 'enumOf', allowed: ['ESI-1', 'ESI-2', 'ESI-3', 'ESI-4', 'ESI-5', ''], required: false }
};

const cdsHookInvoke = {
    hook:            { type: 'enumOf', allowed: ['patient-view', 'medication-prescribe', 'order-select', 'order-sign', ''], required: true },
    hookInstance:    { type: 'str', required: false, max: 128 },
    context:         { type: 'str', required: false, max: 8000 },
    patientId:       { type: 'id', required: false }
};

const infectionExposureCreate = {
    patient_id:      { type: 'id', required: false },
    source_type:     { type: 'enumOf', allowed: ['staff', 'patient', 'visitor', 'environment', 'other', ''], required: false },
    exposure_type:   { type: 'str', required: false, max: 255 },
    exposure_date:   { type: 'dateStr', required: false },
    severity:        { type: 'enumOf', allowed: ['low', 'moderate', 'high', 'critical', ''], required: false },
    notes:           { type: 'str', required: false, max: 4000 }
};

const infectionHandHygieneCreate = {
    unit:            { type: 'str', required: false, max: 128 },
    audit_type:      { type: 'enumOf', allowed: ['observation', 'self-report', 'audit', ''], required: false },
    observed_count:  { type: 'int', required: false, min: 0, max: 100000 },
    compliant_count: { type: 'int', required: false, min: 0, max: 100000 },
    notes:           { type: 'str', required: false, max: 4000 }
};

const infectionIsolationCreate = {
    patient_id:      { type: 'id', required: true },
    isolation_type:  { type: 'enumOf', allowed: ['contact', 'droplet', 'airborne', 'protective', 'standard', ''], required: true },
    start_date:      { type: 'dateStr', required: false },
    notes:           { type: 'str', required: false, max: 4000 }
};

const infectionIsolationUpdate = {
    isolation_type:  { type: 'enumOf', allowed: ['contact', 'droplet', 'airborne', 'protective', 'standard', ''], required: false },
    end_date:        { type: 'dateStr', required: false },
    status:          { type: 'enumOf', allowed: ['active', 'ended', 'cancelled', ''], required: false },
    notes:           { type: 'str', required: false, max: 4000 }
};

const infectionAmsCreate = {
    patient_id:      { type: 'id', required: false },
    antibiotic:      { type: 'str', required: false, max: 255 },
    culture_id:      { type: 'id', required: false },
    indication:      { type: 'str', required: false, max: 1000 },
    recommendation:  { type: 'enumOf', allowed: ['continue', 'discontinue', 'de-escalate', 'escalate', 'switch', ''], required: false },
    notes:           { type: 'str', required: false, max: 4000 }
};

const infectionAmsUpdate = {
    recommendation:  { type: 'enumOf', allowed: ['continue', 'discontinue', 'de-escalate', 'escalate', 'switch', ''], required: false },
    status:          { type: 'enumOf', allowed: ['pending', 'accepted', 'rejected', 'completed', ''], required: false },
    notes:           { type: 'str', required: false, max: 4000 }
};

const voiceDictationStart = {
    patientId:       { type: 'id', required: true },
    encounterId:     { type: 'id', required: false },
    language:        { type: 'enumOf', allowed: ['ar-SA', 'en-US', 'fr-FR', 'ur-PK', ''], required: false }
};

const voiceDictationFinalize = {
    transcript:      { type: 'str', required: false, max: 50000 },
    encounterId:     { type: 'id', required: false }
};

const infectionSurveillanceCreate = {
    patient_id:      { type: 'id', required: false },
    encounter_id:    { type: 'id', required: false },
    organism:        { type: 'str', required: false, max: 255 },
    infection_type:  { type: 'enumOf', allowed: ['hai', 'hai-uti', 'hai-ssi', 'hai-pneumonia', 'hai-bsi', 'c-diff', 'mrsa', 'vre', 'other', ''], required: false },
    reported_at:     { type: 'dateStr', required: false },
    notes:           { type: 'str', required: false, max: 4000 }
};

const infectionOutbreakCreate = {
    outbreak_name:   { type: 'str', required: true, max: 255 },
    onset_date:      { type: 'dateStr', required: false },
    suspected_source:{ type: 'str', required: false, max: 255 },
    case_count:      { type: 'int', required: false, min: 0, max: 100000 },
    notes:           { type: 'str', required: false, max: 4000 }
};

const infectionOutbreakUpdate = {
    outbreak_name:   { type: 'str', required: false, max: 255 },
    status:          { type: 'enumOf', allowed: ['active', 'contained', 'closed', ''], required: false },
    case_count:      { type: 'int', required: false, min: 0, max: 100000 },
    notes:           { type: 'str', required: false, max: 4000 }
};

// WAVE D hardening: surgery/OR/consent/ER/ADT/dietary/quality/maintenance/transport
const surgeryCreate = {
    patient_id:        { type: 'id', required: true },
    encounter_id:      { type: 'id', required: false },
    surgery_type:      { type: 'str', required: false, max: 200 },
    scheduled_date:    { type: 'dateStr', required: false },
    urgency:           { type: 'enumOf', allowed: ['elective', 'urgent', 'emergency', ''], required: false },
    surgeon_id:        { type: 'id', required: false },
    notes:             { type: 'str', required: false, max: 4000 }
};

const surgeryDelete = {
    reason:            { type: 'str', required: false, max: 1000 },
    confirm:           { type: 'bool', required: true }
};

const operatingRoomCreate = {
    room_code:         { type: 'str', required: true, max: 64 },
    room_name:         { type: 'str', required: false, max: 200 },
    location:          { type: 'str', required: false, max: 200 },
    capacity:          { type: 'int', required: false, min: 1, max: 100 }
};

const consentFormCreate = {
    patient_id:        { type: 'id', required: true },
    encounter_id:      { type: 'id', required: false },
    procedure_type:    { type: 'str', required: false, max: 200 },
    procedure_name:    { type: 'str', required: false, max: 200 },
    notes:             { type: 'str', required: false, max: 4000 }
};

const consentFormSign = {
    signer_name:       { type: 'str', required: false, max: 200 },
    signer_role:       { type: 'enumOf', allowed: ['patient', 'guardian', 'witness', 'doctor', 'nurse', ''], required: false },
    signature_data:    { type: 'str', required: false, max: 200000 },
    witness_name:      { type: 'str', required: false, max: 200 }
};

const erTriage = {
    patient_id:        { type: 'id', required: true },
    encounter_id:      { type: 'id', required: false },
    triage_level:      { type: 'enumOf', allowed: ['ESI-1', 'ESI-2', 'ESI-3', 'ESI-4', 'ESI-5', ''], required: true },
    chief_complaint:   { type: 'str', required: false, max: 1000 },
    arrival_time:      { type: 'dateStr', required: false }
};

const erAssignProvider = {
    encounter_id:      { type: 'id', required: true },
    provider_id:       { type: 'id', required: true },
    role:              { type: 'enumOf', allowed: ['primary', 'consulting', 'attending', 'resident', ''], required: false }
};

const erDisposition = {
    encounter_id:      { type: 'id', required: true },
    disposition:       { type: 'enumOf', allowed: ['discharge', 'admit', 'transfer', 'observation', 'ama', 'expired', ''], required: true },
    notes:             { type: 'str', required: false, max: 4000 }
};

const bedTransferCreate = {
    patient_id:        { type: 'id', required: true },
    from_bed_id:       { type: 'id', required: false },
    to_bed_id:         { type: 'id', required: true },
    reason:            { type: 'str', required: false, max: 1000 },
    transfer_time:     { type: 'dateStr', required: false }
};

const adtAdmit = {
    patient_id:        { type: 'id', required: true },
    bed_id:            { type: 'id', required: false },
    ward_id:           { type: 'id', required: false },
    admission_type:    { type: 'enumOf', allowed: ['elective', 'emergency', 'urgent', 'observation', ''], required: false },
    attending_doctor_id: { type: 'id', required: false },
    notes:             { type: 'str', required: false, max: 4000 }
};

const adtTransfer = {
    encounter_id:      { type: 'id', required: true },
    from_bed_id:       { type: 'id', required: false },
    to_bed_id:         { type: 'id', required: false },
    reason:            { type: 'str', required: false, max: 1000 }
};

const adtDischarge = {
    encounter_id:      { type: 'id', required: true },
    discharge_type:    { type: 'enumOf', allowed: ['home', 'transfer', 'ama', 'expired', 'against_advice', ''], required: false },
    discharge_notes:   { type: 'str', required: false, max: 4000 }
};

const adtBedStatus = {
    bed_id:            { type: 'id', required: true },
    status:            { type: 'enumOf', allowed: ['available', 'occupied', 'cleaning', 'maintenance', 'reserved', 'dirty', ''], required: true },
    notes:             { type: 'str', required: false, max: 1000 }
};

const dietaryOrderCreate = {
    patient_id:        { type: 'id', required: true },
    encounter_id:      { type: 'id', required: false },
    diet_type:         { type: 'enumOf', allowed: ['regular', 'soft', 'liquid', 'clear-liquid', 'diabetic', 'low-sodium', 'low-fat', 'renal', 'cardiac', 'vegan', 'vegetarian', 'other', ''], required: true },
    start_date:        { type: 'dateStr', required: false },
    notes:             { type: 'str', required: false, max: 2000 }
};

const dietaryOrderUpdate = {
    diet_type:         { type: 'enumOf', allowed: ['regular', 'soft', 'liquid', 'clear-liquid', 'diabetic', 'low-sodium', 'low-fat', 'renal', 'cardiac', 'vegan', 'vegetarian', 'other', ''], required: false },
    end_date:          { type: 'dateStr', required: false },
    status:            { type: 'enumOf', allowed: ['active', 'completed', 'cancelled', ''], required: false },
    notes:             { type: 'str', required: false, max: 2000 }
};

const dietaryMealCreate = {
    dietary_order_id:  { type: 'id', required: false },
    patient_id:        { type: 'id', required: false },
    meal_type:         { type: 'enumOf', allowed: ['breakfast', 'lunch', 'dinner', 'snack', ''], required: true },
    scheduled_time:    { type: 'dateStr', required: false },
    notes:             { type: 'str', required: false, max: 1000 }
};

const dietaryMealDeliver = {
    delivered_at:      { type: 'dateStr', required: false },
    delivered_by:      { type: 'str', required: false, max: 200 },
    notes:             { type: 'str', required: false, max: 1000 }
};

const nutritionAssessmentCreate = {
    patient_id:        { type: 'id', required: true },
    encounter_id:      { type: 'id', required: false },
    assessment_date:   { type: 'dateStr', required: false },
    bmi:               { type: 'num', required: false, min: 0, max: 200 },
    weight_kg:         { type: 'num', required: false, min: 0, max: 1000 },
    height_cm:         { type: 'num', required: false, min: 0, max: 300 },
    risk_level:        { type: 'enumOf', allowed: ['low', 'moderate', 'high', 'critical', ''], required: false },
    notes:             { type: 'str', required: false, max: 4000 }
};

const qualityIncidentCreate = {
    incident_date:     { type: 'dateStr', required: true },
    incident_type:     { type: 'enumOf', allowed: ['patient-safety', 'medication-error', 'fall', 'equipment', 'documentation', 'near-miss', 'other', ''], required: true },
    severity:          { type: 'enumOf', allowed: ['low', 'moderate', 'high', 'critical', 'sentinel', ''], required: false },
    description:       { type: 'str', required: false, max: 4000 },
    patient_id:        { type: 'id', required: false },
    reporter_id:       { type: 'id', required: false }
};

const qualityIncidentUpdate = {
    status:            { type: 'enumOf', allowed: ['open', 'investigating', 'resolved', 'closed', ''], required: false },
    severity:          { type: 'enumOf', allowed: ['low', 'moderate', 'high', 'critical', 'sentinel', ''], required: false },
    root_cause:        { type: 'str', required: false, max: 4000 },
    corrective_action: { type: 'str', required: false, max: 4000 }
};

const qualitySatisfactionCreate = {
    patient_id:        { type: 'id', required: false },
    encounter_id:      { type: 'id', required: false },
    score:             { type: 'int', required: true, min: 1, max: 10 },
    feedback:          { type: 'str', required: false, max: 4000 },
    survey_date:       { type: 'dateStr', required: false }
};

const qualityKpiCreate = {
    kpi_name:          { type: 'str', required: true, max: 200 },
    kpi_value:         { type: 'num', required: true },
    target_value:      { type: 'num', required: false },
    period:            { type: 'enumOf', allowed: ['daily', 'weekly', 'monthly', 'quarterly', 'yearly', ''], required: true },
    notes:             { type: 'str', required: false, max: 2000 }
};

const qualityCapaCreate = {
    incident_id:       { type: 'id', required: false },
    action_type:       { type: 'enumOf', allowed: ['corrective', 'preventive', ''], required: true },
    description:       { type: 'str', required: true, max: 4000 },
    due_date:          { type: 'dateStr', required: false },
    responsible_id:    { type: 'id', required: false }
};

const qualityCapaUpdate = {
    status:            { type: 'enumOf', allowed: ['open', 'in-progress', 'completed', 'verified', 'closed', ''], required: false },
    completion_notes:  { type: 'str', required: false, max: 4000 }
};

const qualityRiskCreate = {
    risk_name:         { type: 'str', required: true, max: 200 },
    category:          { type: 'enumOf', allowed: ['clinical', 'operational', 'financial', 'compliance', 'safety', 'other', ''], required: false },
    likelihood:        { type: 'enumOf', allowed: ['low', 'moderate', 'high', ''], required: false },
    impact:            { type: 'enumOf', allowed: ['low', 'moderate', 'high', ''], required: false },
    mitigation:        { type: 'str', required: false, max: 4000 }
};

const qualityRiskUpdate = {
    likelihood:        { type: 'enumOf', allowed: ['low', 'moderate', 'high', ''], required: false },
    impact:            { type: 'enumOf', allowed: ['low', 'moderate', 'high', ''], required: false },
    status:            { type: 'enumOf', allowed: ['identified', 'assessed', 'mitigated', 'accepted', 'closed', ''], required: false },
    mitigation:        { type: 'str', required: false, max: 4000 }
};

const maintenanceWorkOrderCreate = {
    equipment_id:      { type: 'id', required: false },
    work_type:         { type: 'enumOf', allowed: ['corrective', 'preventive', 'inspection', 'calibration', 'installation', 'other', ''], required: true },
    priority:          { type: 'enumOf', allowed: ['low', 'normal', 'high', 'urgent', ''], required: false },
    description:       { type: 'str', required: true, max: 4000 },
    requested_by:      { type: 'id', required: false }
};

const maintenanceWorkOrderUpdate = {
    status:            { type: 'enumOf', allowed: ['open', 'assigned', 'in-progress', 'completed', 'cancelled', ''], required: false },
    assigned_to:       { type: 'id', required: false },
    completion_notes:  { type: 'str', required: false, max: 4000 }
};

const maintenanceEquipmentCreate = {
    equipment_code:    { type: 'str', required: true, max: 64 },
    equipment_name:    { type: 'str', required: true, max: 200 },
    category:          { type: 'str', required: false, max: 120 },
    manufacturer:      { type: 'str', required: false, max: 200 },
    model:             { type: 'str', required: false, max: 200 },
    serial_number:     { type: 'str', required: false, max: 200 },
    location:          { type: 'str', required: false, max: 200 }
};

const maintenancePmScheduleCreate = {
    equipment_id:      { type: 'id', required: true },
    frequency:         { type: 'enumOf', allowed: ['daily', 'weekly', 'monthly', 'quarterly', 'yearly', ''], required: true },
    next_due:          { type: 'dateStr', required: false },
    description:       { type: 'str', required: false, max: 2000 }
};

const transportRequestCreate = {
    patient_id:        { type: 'id', required: false },
    encounter_id:      { type: 'id', required: false },
    origin:            { type: 'str', required: true, max: 200 },
    destination:       { type: 'str', required: true, max: 200 },
    transport_type:    { type: 'enumOf', allowed: ['wheelchair', 'stretcher', 'ambulatory', 'bed', 'other', ''], required: false },
    priority:          { type: 'enumOf', allowed: ['low', 'normal', 'high', 'urgent', ''], required: false },
    requested_time:    { type: 'dateStr', required: false },
    notes:             { type: 'str', required: false, max: 2000 }
};

const maintenanceOrderCreate = {
    equipment_id:      { type: 'id', required: false },
    order_type:        { type: 'enumOf', allowed: ['corrective', 'preventive', 'inspection', 'calibration', 'other', ''], required: true },
    description:       { type: 'str', required: true, max: 4000 },
    priority:          { type: 'enumOf', allowed: ['low', 'normal', 'high', 'urgent', ''], required: false }
};

const maintenanceOrderUpdate = {
    status:            { type: 'enumOf', allowed: ['open', 'assigned', 'in-progress', 'completed', 'cancelled', ''], required: false },
    completion_notes:  { type: 'str', required: false, max: 4000 }
};

const maintenanceCalibrationCreate = {
    equipment_id:      { type: 'id', required: true },
    calibration_date:  { type: 'dateStr', required: true },
    result:            { type: 'enumOf', allowed: ['pass', 'fail', 'conditional', ''], required: true },
    notes:             { type: 'str', required: false, max: 4000 }
};

const orSlotCancel = {
    reason:            { type: 'str', required: false, max: 1000 },
    cancel_by:         { type: 'id', required: false }
};

const orWhoChecklist = {
    phase:             { type: 'enumOf', allowed: ['sign-in', 'time-out', 'sign-out', ''], required: true },
    items:             { type: 'str', required: false, max: 8000 },
    confirmed_by:      { type: 'str', required: false, max: 200 }
};

// WAVE E+F hardening: cosmetic/portal/ews/ovr/rehab/dental/oncology/visits/zatca/vendors/fhir/hl7/safety/mfa/auth + many validateBody-only additions
const mfaEnroll = {
    factor_type:       { type: 'enumOf', allowed: ['totp', 'sms', 'email', 'fido', ''], required: true },
    phone:             { type: 'phone', required: false },
    email:             { type: 'str', required: false, max: 200 }
};

const cosmeticCaseCreate = {
    patient_id:        { type: 'id', required: true },
    procedure_type:    { type: 'str', required: false, max: 200 },
    procedure_name:    { type: 'str', required: false, max: 200 },
    consultation_date: { type: 'dateStr', required: false },
    notes:             { type: 'str', required: false, max: 4000 }
};

const cosmeticCaseUpdate = {
    status:            { type: 'enumOf', allowed: ['consultation', 'scheduled', 'in-progress', 'completed', 'cancelled', ''], required: false },
    procedure_type:    { type: 'str', required: false, max: 200 },
    notes:             { type: 'str', required: false, max: 4000 }
};

const cosmeticConsentCreate = {
    patient_id:        { type: 'id', required: true },
    case_id:           { type: 'id', required: false },
    procedure_name:    { type: 'str', required: false, max: 200 },
    signature_data:    { type: 'str', required: false, max: 200000 }
};

const cosmeticFollowupCreate = {
    case_id:           { type: 'id', required: true },
    patient_id:        { type: 'id', required: false },
    followup_date:     { type: 'dateStr', required: false },
    notes:             { type: 'str', required: false, max: 4000 }
};

const portalUserCreate = {
    email:             { type: 'str', required: true, max: 200 },
    password:          { type: 'str', required: true, max: 200 },
    display_name:      { type: 'str', required: false, max: 200 },
    phone:             { type: 'phone', required: false }
};

const portalAppointmentUpdate = {
    status:            { type: 'enumOf', allowed: ['pending', 'confirmed', 'cancelled', 'rescheduled', 'completed', ''], required: false },
    notes:             { type: 'str', required: false, max: 2000 }
};

const portalMessageCreate = {
    recipient_id:      { type: 'id', required: false },
    subject:           { type: 'str', required: false, max: 200 },
    body:              { type: 'str', required: true, max: 8000 }
};

const zatcaGenerate = {
    invoice_id:        { type: 'id', required: true },
    format:            { type: 'enumOf', allowed: ['xml', 'json', 'pdf', ''], required: false }
};

const ewsAssess = {
    patient_id:        { type: 'id', required: true },
    encounter_id:      { type: 'id', required: false },
    vitals:            { type: 'str', required: false, max: 4000 },
    score:             { type: 'num', required: false, min: 0, max: 30 }
};

const ovrIncidentCreate = {
    incident_date:     { type: 'dateStr', required: true },
    incident_type:     { type: 'enumOf', allowed: ['patient-safety', 'medication-error', 'fall', 'equipment', 'documentation', 'near-miss', 'other', ''], required: true },
    severity:          { type: 'enumOf', allowed: ['low', 'moderate', 'high', 'critical', 'sentinel', ''], required: false },
    description:       { type: 'str', required: false, max: 4000 },
    patient_id:        { type: 'id', required: false }
};

const ovrIncidentUpdate = {
    status:            { type: 'enumOf', allowed: ['open', 'investigating', 'resolved', 'closed', ''], required: false },
    root_cause:        { type: 'str', required: false, max: 4000 },
    corrective_action: { type: 'str', required: false, max: 4000 }
};

const rehabPatientCreate = {
    patient_id:        { type: 'id', required: true },
    diagnosis:         { type: 'str', required: false, max: 1000 },
    program_type:      { type: 'enumOf', allowed: ['physical', 'occupational', 'speech', 'cardiac', 'pulmonary', 'neuro', 'other', ''], required: false }
};

const rehabSessionCreate = {
    patient_id:        { type: 'id', required: true },
    session_date:      { type: 'dateStr', required: false },
    duration_minutes:  { type: 'int', required: false, min: 1, max: 600 },
    notes:             { type: 'str', required: false, max: 4000 }
};

const rehabGoalCreate = {
    patient_id:        { type: 'id', required: true },
    goal_description:  { type: 'str', required: true, max: 1000 },
    target_date:       { type: 'dateStr', required: false },
    priority:          { type: 'enumOf', allowed: ['low', 'normal', 'high', ''], required: false }
};

const rehabGoalUpdate = {
    status:            { type: 'enumOf', allowed: ['active', 'achieved', 'on-hold', 'cancelled', ''], required: false },
    progress_notes:    { type: 'str', required: false, max: 4000 }
};

const rehabAssessmentCreate = {
    patient_id:        { type: 'id', required: true },
    assessment_date:   { type: 'dateStr', required: false },
    assessment_type:   { type: 'enumOf', allowed: ['initial', 'progress', 'discharge', 're-assessment', ''], required: false },
    findings:          { type: 'str', required: false, max: 4000 }
};

const dentalRecordCreate = {
    patient_id:        { type: 'id', required: true },
    encounter_id:      { type: 'id', required: false },
    tooth_number:      { type: 'str', required: false, max: 20 },
    procedure:         { type: 'str', required: false, max: 200 },
    notes:             { type: 'str', required: false, max: 4000 }
};

const dentalPeriodontalCreate = {
    patient_id:        { type: 'id', required: true },
    pocket_depths:     { type: 'str', required: false, max: 4000 },
    bleeding_index:    { type: 'num', required: false, min: 0, max: 100 },
    notes:             { type: 'str', required: false, max: 4000 }
};

const dentalImageCreate = {
    patient_id:        { type: 'id', required: true },
    image_type:        { type: 'enumOf', allowed: ['xray', 'panoramic', 'photo', 'scan', 'other', ''], required: false },
    tooth_number:      { type: 'str', required: false, max: 20 },
    notes:             { type: 'str', required: false, max: 1000 }
};

const oncologyRegimenCreate = {
    patient_id:        { type: 'id', required: true },
    encounter_id:      { type: 'id', required: false },
    regimen_name:      { type: 'str', required: true, max: 200 },
    cycle_number:      { type: 'int', required: false, min: 1, max: 100 },
    start_date:        { type: 'dateStr', required: false },
    notes:             { type: 'str', required: false, max: 4000 }
};

const visitCreate = {
    patient_id:        { type: 'id', required: true },
    visit_type:        { type: 'enumOf', allowed: ['opd', 'ipd', 'emergency', 'observation', 'day-care', 'other', ''], required: true },
    visit_date:        { type: 'dateStr', required: false },
    notes:             { type: 'str', required: false, max: 4000 }
};

const visitLifecycleCreate = {
    patient_id:        { type: 'id', required: true },
    stage:             { type: 'enumOf', allowed: ['check-in', 'triage', 'consultation', 'waiting', 'investigation', 'treatment', 'discharge', 'admission', 'other', ''], required: true },
    timestamp:         { type: 'dateStr', required: false }
};

const visitLifecycleUpdate = {
    stage:             { type: 'enumOf', allowed: ['check-in', 'triage', 'consultation', 'waiting', 'investigation', 'treatment', 'discharge', 'admission', 'other', ''], required: false },
    notes:             { type: 'str', required: false, max: 2000 }
};

const consentSign = {
    consent_id:        { type: 'id', required: true },
    signer_name:       { type: 'str', required: false, max: 200 },
    signer_role:       { type: 'enumOf', allowed: ['patient', 'guardian', 'witness', 'doctor', 'nurse', ''], required: false },
    signature_data:    { type: 'str', required: false, max: 200000 }
};

const drugInteractionsCheck = {
    patient_id:        { type: 'id', required: false },
    medications:       { type: 'str', required: true, max: 8000 }
};

const allergyCheck = {
    patient_id:        { type: 'id', required: false },
    medications:       { type: 'str', required: false, max: 8000 },
    substances:        { type: 'str', required: false, max: 8000 }
};

const cashDrawerOpen = {
    terminal_id:       { type: 'str', required: true, max: 64 },
    opening_amount:    { type: 'num', required: true, min: 0 },
    opened_by:         { type: 'id', required: false }
};

const cashDrawerClose = {
    terminal_id:       { type: 'str', required: true, max: 64 },
    closing_amount:    { type: 'num', required: true, min: 0 },
    expected_amount:   { type: 'num', required: false, min: 0 },
    notes:             { type: 'str', required: false, max: 2000 }
};

const authChangePassword = {
    current_password:  { type: 'str', required: true, max: 200 },
    new_password:      { type: 'str', required: true, max: 200 }
};

const vendorCreate = {
    vendor_name:       { type: 'str', required: true, max: 200 },
    vendor_code:       { type: 'str', required: false, max: 64 },
    contact_email:     { type: 'str', required: false, max: 200 },
    contact_phone:     { type: 'phone', required: false },
    address:           { type: 'str', required: false, max: 500 }
};

const fhirResourceCreate = {
    resourceType:      { type: 'str', required: true, max: 64 },
    resource:          { type: 'str', required: true, max: 200000 }
};

const hl7MessageSend = {
    message_type:      { type: 'enumOf', allowed: ['ADT', 'ORM', 'ORU', 'SIU', 'MDM', 'DFT', 'BAR', 'other', ''], required: true },
    payload:           { type: 'str', required: true, max: 200000 },
    external_system:   { type: 'str', required: false, max: 200 }
};

const safetyWasteLogCreate = {
    waste_type:        { type: 'enumOf', allowed: ['infectious', 'sharps', 'pharmaceutical', 'chemical', 'radioactive', 'general', 'other', ''], required: true },
    weight_kg:         { type: 'num', required: false, min: 0, max: 100000 },
    pickup_location:   { type: 'str', required: false, max: 200 },
    notes:             { type: 'str', required: false, max: 2000 }
};

const notificationRead = {};

const adminBackup = {
    backup_type:       { type: 'enumOf', allowed: ['full', 'incremental', 'differential', 'snapshot', ''], required: false },
    destination:       { type: 'str', required: false, max: 200 },
    notes:             { type: 'str', required: false, max: 1000 }
};

const appointmentDelete = {
    reason:            { type: 'str', required: false, max: 1000 }
};

const appointmentCheckin = {
    checkin_time:      { type: 'dateStr', required: false },
    notes:             { type: 'str', required: false, max: 1000 }
};

const appointmentNoShow = {
    reason:            { type: 'str', required: false, max: 1000 }
};

const employeeDelete = {
    reason:            { type: 'str', required: false, max: 1000 },
    confirm:           { type: 'bool', required: true }
};

const nphiesClaimSubmit = {
    submission_notes:  { type: 'str', required: false, max: 2000 },
    force_submit:      { type: 'bool', required: false }
};

const medicalRecordSign = {
    signature_data:    { type: 'str', required: false, max: 200000 },
    signed_by:         { type: 'id', required: false },
    notes:             { type: 'str', required: false, max: 2000 }
};

const labResultVerify = {
    verified_by:       { type: 'id', required: false },
    notes:             { type: 'str', required: false, max: 2000 }
};

const labResultReport = {
    reported_by:       { type: 'id', required: false },
    report_text:       { type: 'str', required: false, max: 50000 }
};

const radiologyOrderUpload = {
    image_type:        { type: 'enumOf', allowed: ['dicom', 'jpeg', 'png', 'pdf', 'other', ''], required: false },
    notes:             { type: 'str', required: false, max: 2000 }
};

const radiologyReportSign = {
    signature_data:    { type: 'str', required: false, max: 200000 },
    notes:             { type: 'str', required: false, max: 2000 }
};

const financeJournalPost = {
    posted_by:         { type: 'id', required: false },
    posting_notes:     { type: 'str', required: false, max: 2000 }
};

const financeJournalReverse = {
    reversal_reason:   { type: 'str', required: false, max: 2000 },
    reversed_by:       { type: 'id', required: false }
};

const settingsUserDelete = {
    reason:            { type: 'str', required: false, max: 1000 },
    confirm:           { type: 'bool', required: true }
};

const patientConsentCreate = {
    consent_type:      { type: 'enumOf', allowed: ['general', 'surgical', 'anesthesia', 'research', 'data-sharing', 'other', ''], required: true },
    signature_data:    { type: 'str', required: false, max: 200000 },
    expiration_date:   { type: 'dateStr', required: false }
};

const clinicalRecordCreate = {
    patient_id:        { type: 'id', required: true },
    encounter_id:      { type: 'id', required: false },
    template_id:       { type: 'id', required: false },
    recorded_values:   { type: 'str', required: false, max: 50000 }
};

const clinicalRecordLock = {
    lock_reason:       { type: 'str', required: false, max: 1000 }
};

const clinicalNoteLock = {
    lock_reason:       { type: 'str', required: false, max: 1000 }
};

const formDelete = {
    reason:            { type: 'str', required: false, max: 1000 }
};

const encounterSign = {
    signature_data:    { type: 'str', required: false, max: 200000 },
    notes:             { type: 'str', required: false, max: 2000 }
};

const queuePatientCall = {
    called_by:         { type: 'id', required: false },
    room:              { type: 'str', required: false, max: 80 }
};

const settingsRoomDelete = {
    reason:            { type: 'str', required: false, max: 1000 }
};

const transportRequestUpdate = {
    status:            { type: 'enumOf', allowed: ['pending', 'assigned', 'in-transit', 'completed', 'cancelled', ''], required: false },
    notes:             { type: 'str', required: false, max: 2000 }
};

const messageRead = {};
const messageDelete = {
    reason:            { type: 'str', required: false, max: 1000 }
};

const pathologySpecimenSignout = {
    signed_out_by:     { type: 'id', required: false },
    destination:       { type: 'str', required: false, max: 200 }
};

const inventoryDelete = {
    reason:            { type: 'str', required: false, max: 1000 }
};

const cssdCycleRelease = {
    released_by:       { type: 'id', required: false },
    release_notes:     { type: 'str', required: false, max: 2000 }
};

const smartTemplateDelete = {
    reason:            { type: 'str', required: false, max: 1000 }
};

const nphiesRemittancePostToAr = {
    posting_date:      { type: 'dateStr', required: false },
    notes:             { type: 'str', required: false, max: 2000 }
};

const zatcaCreditNote = {
    invoice_id:        { type: 'id', required: true },
    reason:            { type: 'str', required: false, max: 1000 },
    amount:            { type: 'num', required: false, min: 0 }
};

const zatcaCreditNoteSubmit = {
    submission_notes:  { type: 'str', required: false, max: 2000 }
};

const bloodbankUnitDiscard = {
    reason:            { type: 'str', required: false, max: 1000 },
    discard_method:    { type: 'enumOf', allowed: ['expired', 'damaged', 'contaminated', 'recalled', 'other', ''], required: false }
};

const bloodbankUnitRecall = {
    reason:            { type: 'str', required: false, max: 1000 }
};


const cardiologyGraceCreate = {
    patient_id:                  { type: 'id', required: true },
    encounter_id:                { type: 'id', required: false },
    age:                         { type: 'int', required: true, min: 18, max: 120 },
    heart_rate:                  { type: 'int', required: true, min: 20, max: 250 },
    systolic_bp:                 { type: 'int', required: true, min: 30, max: 280 },
    creatinine_mg_dl:            { type: 'num', required: true, min: 0.1, max: 20 },
    killip_class:                { type: 'int', required: true, min: 1, max: 4 },
    cardiac_arrest_at_admission: { type: 'bool', required: false },
    st_deviation:                { type: 'bool', required: false },
    elevated_enzymes:            { type: 'bool', required: false }
};

const cardiologyCha2ds2vascCreate = {
    patient_id:        { type: 'id', required: true },
    encounter_id:      { type: 'id', required: false },
    age:               { type: 'int', required: true, min: 18, max: 120 },
    sex:               { type: 'enumOf', allowed: ['male','female'], required: true },
    chf:               { type: 'bool', required: false },
    hypertension:      { type: 'bool', required: false },
    diabetes:          { type: 'bool', required: false },
    stroke_history:    { type: 'bool', required: false },
    vascular_disease:  { type: 'bool', required: false }
};

const cardiologyHasbledCreate = {
    patient_id:               { type: 'id', required: true },
    encounter_id:             { type: 'id', required: false },
    uncontrolled_hypertension:{ type: 'bool', required: false },
    abnormal_renal:           { type: 'bool', required: false },
    abnormal_liver:           { type: 'bool', required: false },
    stroke_history:           { type: 'bool', required: false },
    bleeding_history:         { type: 'bool', required: false },
    labile_inr:               { type: 'bool', required: false },
    age:                      { type: 'int', required: true, min: 18, max: 120 },
    concomitant_drugs:        { type: 'bool', required: false },
    alcohol_use:              { type: 'bool', required: false }
};

const cardiologyHfClassCreate = {
    patient_id:               { type: 'id', required: true },
    encounter_id:             { type: 'id', required: false },
    nyha_class:               { type: 'int', required: true, min: 1, max: 4 },
    lvef_pct:                 { type: 'num', required: false, min: 5, max: 80 },
    structural_heart_disease: { type: 'bool', required: false }
};

const cardiologyTroponinInterpretCreate = {
    patient_id:        { type: 'id', required: true },
    encounter_id:      { type: 'id', required: false },
    troponin_value:    { type: 'num', required: true, min: 0, max: 100000 },
    cutoff:            { type: 'num', required: true, min: 0, max: 100000 },
    delta_pct:         { type: 'num', required: true, min: -100, max: 1000 },
    hours_since_onset: { type: 'num', required: false, min: 0, max: 168 }
};



const glycemicAssessCreate = {
    patient_id:        { type: 'id', required: true },
    encounter_id:      { type: 'id', required: false },
    patient_type:      { type: 'enumOf', allowed: ['type1','type2','pregnancy','elderly','frail','pediatric'], required: true },
    age:               { type: 'int', required: true, min: 0, max: 120 },
    tir_pct:           { type: 'num', required: true, min: 0, max: 100 },
    gmi_pct:           { type: 'num', required: false, min: 3, max: 20 },
    hba1c:             { type: 'num', required: true, min: 3, max: 20 },
    time_below_70:     { type: 'num', required: false, min: 0, max: 100 },
    time_below_54:     { type: 'num', required: false, min: 0, max: 100 },
    notes:             { type: 'str', required: false, max: 2000 }
};

const insulinDoseCreate = {
    patient_id:           { type: 'id', required: true },
    encounter_id:         { type: 'id', required: false },
    current_glucose_mg_dl:{ type: 'num', required: true, min: 0, max: 1500 },
    target_glucose_mg_dl: { type: 'num', required: false, min: 70, max: 200 },
    total_daily_dose_units:{ type: 'num', required: false, min: 0, max: 300 },
    sensitivity_factor:   { type: 'num', required: false, min: 1, max: 1000 },
    notes:                { type: 'str', required: false, max: 1000 }
};

const thyroidInterpretCreate = {
    patient_id:   { type: 'id', required: true },
    encounter_id: { type: 'id', required: false },
    tsh_uIuml:    { type: 'num', required: true, min: 0, max: 1000 },
    ft4_ngdl:     { type: 'num', required: false, min: 0, max: 10 },
    ft3_pgml:     { type: 'num', required: false, min: 0, max: 20 },
    notes:        { type: 'str', required: false, max: 1000 }
};

const erTriageCreate = {
    patient_id:     { type: 'id', required: false },
    chief_complaint:{ type: 'str', required: true, max: 500 },
    age:            { type: 'int', required: false, min: 0, max: 130 },
    sex:            { type: 'enumOf', allowed: ['male','female','unknown'], required: false },
    heart_rate:     { type: 'int', required: false, min: 0, max: 300 },
    systolic_bp:    { type: 'int', required: false, min: 0, max: 300 },
    spo2_pct:       { type: 'num', required: false, min: 0, max: 100 },
    rr_per_min:     { type: 'int', required: false, min: 0, max: 80 },
    temp_c:         { type: 'num', required: false, min: 20, max: 46 },
    pain_score:     { type: 'int', required: false, min: 0, max: 10 },
    gcs_total:      { type: 'int', required: false, min: 3, max: 15 },
    arrival_mode:   { type: 'enumOf', allowed: ['walk-in','ambulance','wheelchair','transfer'], required: false },
    notes:          { type: 'str', required: false, max: 2000 }
};




const pediatricsVitalsCreate = {
    patient_id:    { type: 'id', required: true },
    encounter_id:  { type: 'id', required: false },
    age_years:     { type: 'num', required: true, min: 0, max: 18 },
    heart_rate:    { type: 'int', required: false, min: 0, max: 300 },
    rr_per_min:    { type: 'int', required: false, min: 0, max: 100 },
    systolic_bp:   { type: 'int', required: false, min: 0, max: 250 }
};

const pediatricsFluidCreate = {
    patient_id:  { type: 'id', required: true },
    encounter_id:{ type: 'id', required: false },
    weight_kg:   { type: 'num', required: true, min: 0.5, max: 150 },
    age_years:   { type: 'num', required: false, min: 0, max: 18 }
};

const pediatricsCroupCreate = {
    patient_id:    { type: 'id', required: true },
    encounter_id:  { type: 'id', required: false },
    stridor:       { type: 'int', required: true, min: 0, max: 3 },
    retractions:   { type: 'int', required: true, min: 0, max: 3 },
    air_entry:     { type: 'int', required: true, min: 0, max: 2 },
    cyanosis:      { type: 'int', required: true, min: 0, max: 4 },
    consciousness: { type: 'int', required: true, min: 0, max: 5 }
};

const pediatricsPewsCreate = {
    patient_id:     { type: 'id', required: true },
    encounter_id:   { type: 'id', required: false },
    behavior:       { type: 'int', required: true, min: 0, max: 3 },
    cardiovascular: { type: 'int', required: true, min: 0, max: 3 },
    respiratory:    { type: 'int', required: true, min: 0, max: 3 }
};

const surgeryAsaCreate = {
    patient_id:   { type: 'id', required: true },
    encounter_id: { type: 'id', required: false },
    asa_class:    { type: 'int', required: true, min: 1, max: 6 },
    emergency:    { type: 'bool', required: false }
};

const surgeryRiskCreate = {
    patient_id:        { type: 'id', required: true },
    encounter_id:      { type: 'id', required: false },
    age:               { type: 'int', required: true, min: 0, max: 120 },
    asa_class:         { type: 'int', required: true, min: 1, max: 6 },
    procedure_risk:    { type: 'enumOf', allowed: ['low','moderate','high','very_high'], required: true },
    emergency:         { type: 'bool', required: false }
};

const surgeryTimeoutCreate = {
    patient_id:      { type: 'id', required: true },
    encounter_id:    { type: 'id', required: false },
    phase:           { type: 'enumOf', allowed: ['sign_in','time_out','sign_out'], required: true },
    completed_items: { type: 'str', required: true, max: 5000 }
};

const surgeryCapriniCreate = {
    patient_id:               { type: 'id', required: true },
    encounter_id:             { type: 'id', required: false },
    age_41_60:                { type: 'bool', required: false },
    age_61_74:                { type: 'bool', required: false },
    age_75_plus:              { type: 'bool', required: false },
    prior_vte:                { type: 'bool', required: false },
    family_vte:               { type: 'bool', required: false },
    known_thrombophilia:      { type: 'bool', required: false },
    surgery_within_30d:       { type: 'bool', required: false },
    immobility_3d:            { type: 'bool', required: false },
    central_line:             { type: 'bool', required: false },
    malignancy:               { type: 'bool', required: false },
    chemotherapy:             { type: 'bool', required: false },
    bmi_above_40:             { type: 'bool', required: false },
    smoking:                  { type: 'bool', required: false },
    oral_contraceptives:      { type: 'bool', required: false },
    hrt:                      { type: 'bool', required: false },
    pregnancy_postpartum:     { type: 'bool', required: false }
};

const pharmacyInteractionsCreate = {
    patient_id:   { type: 'id', required: true },
    encounter_id: { type: 'id', required: false },
    drugs:        { type: 'str', required: true, max: 4000 }
};

const pharmacyRenalDoseCreate = {
    patient_id:                { type: 'id', required: true },
    encounter_id:              { type: 'id', required: false },
    drug_name:                 { type: 'str', required: true, max: 200 },
    standard_dose_mg:          { type: 'num', required: true, min: 0.01, max: 5000 },
    frequency_per_day:         { type: 'int', required: true, min: 1, max: 24 },
    age:                       { type: 'int', required: true, min: 0, max: 120 },
    weight_kg:                 { type: 'num', required: true, min: 0.5, max: 300 },
    serum_creatinine_mg_dl:    { type: 'num', required: true, min: 0.1, max: 30 },
    sex:                       { type: 'enumOf', allowed: ['male','female'], required: true }
};

const pharmacyPregnancyCreate = {
    patient_id:   { type: 'id', required: true },
    encounter_id: { type: 'id', required: false },
    drugs:        { type: 'str', required: true, max: 4000 }
};


module.exports = {
    invoiceCreate,
    pediatricsFluidCreate, pediatricsCroupCreate, pediatricsPewsCreate, surgeryRiskCreate, surgeryTimeoutCreate, surgeryCapriniCreate, pharmacyInteractionsCreate, pharmacyRenalDoseCreate, pharmacyPregnancyCreate,

    glycemicAssessCreate, insulinDoseCreate, thyroidInterpretCreate, erTriageCreate,
    cardiologyGraceCreate, cardiologyCha2ds2vascCreate, cardiologyHasbledCreate, cardiologyHfClassCreate, cardiologyTroponinInterpretCreate,
    journalCreate,
    invoiceRefund,
    medicalCertificateCreate,
    medicalServiceUpdate,
    aiOrchestratorInvoke,
    medicalBillProcedureCreate,
    systemSettingsUpdate,
    medicalReportCreate,
    patientDelete,
    messageCreate,
    opdEncounterStart,
    cdsHookInvoke,
    voiceDictationStart,
    voiceDictationFinalize,
    infectionSurveillanceCreate,
    infectionOutbreakCreate,
    infectionOutbreakUpdate,
    infectionExposureCreate,
    infectionHandHygieneCreate,
    infectionIsolationCreate,
    infectionIsolationUpdate,
    infectionAmsCreate,
    infectionAmsUpdate,
    surgeryCreate,
    surgeryDelete,
    operatingRoomCreate,
    consentFormCreate,
    consentFormSign,
    erTriage,
    erAssignProvider,
    erDisposition,
    bedTransferCreate,
    adtAdmit,
    adtTransfer,
    adtDischarge,
    adtBedStatus,
    dietaryOrderCreate,
    dietaryOrderUpdate,
    dietaryMealCreate,
    dietaryMealDeliver,
    nutritionAssessmentCreate,
    qualityIncidentCreate,
    qualityIncidentUpdate,
    qualitySatisfactionCreate,
    qualityKpiCreate,
    qualityCapaCreate,
    qualityCapaUpdate,
    qualityRiskCreate,
    qualityRiskUpdate,
    maintenanceWorkOrderCreate,
    maintenanceWorkOrderUpdate,
    maintenanceEquipmentCreate,
    maintenancePmScheduleCreate,
    transportRequestCreate,
    maintenanceOrderCreate,
    maintenanceOrderUpdate,
    maintenanceCalibrationCreate,
    orSlotCancel,
    orWhoChecklist,
    mfaEnroll,
    cosmeticCaseCreate,
    cosmeticCaseUpdate,
    cosmeticConsentCreate,
    cosmeticFollowupCreate,
    portalUserCreate,
    portalAppointmentUpdate,
    portalMessageCreate,
    zatcaGenerate,
    ewsAssess,
    ovrIncidentCreate,
    ovrIncidentUpdate,
    rehabPatientCreate,
    rehabSessionCreate,
    rehabGoalCreate,
    rehabGoalUpdate,
    rehabAssessmentCreate,
    dentalRecordCreate,
    dentalPeriodontalCreate,
    dentalImageCreate,
    oncologyRegimenCreate,
    visitCreate,
    visitLifecycleCreate,
    visitLifecycleUpdate,
    consentSign,
    drugInteractionsCheck,
    allergyCheck,
    cashDrawerOpen,
    cashDrawerClose,
    authChangePassword,
    vendorCreate,
    fhirResourceCreate,
    hl7MessageSend,
    safetyWasteLogCreate,
    notificationRead,
    adminBackup,
    appointmentDelete,
    appointmentCheckin,
    appointmentNoShow,
    employeeDelete,
    nphiesClaimSubmit,
    medicalRecordSign,
    labResultVerify,
    labResultReport,
    radiologyOrderUpload,
    radiologyReportSign,
    financeJournalPost,
    financeJournalReverse,
    settingsUserDelete,
    patientConsentCreate,
    clinicalRecordCreate,
    clinicalRecordLock,
    clinicalNoteLock,
    formDelete,
    encounterSign,
    queuePatientCall,
    settingsRoomDelete,
    transportRequestUpdate,
    messageRead,
    messageDelete,
    pathologySpecimenSignout,
    inventoryDelete,
    cssdCycleRelease,
    smartTemplateDelete,
    nphiesRemittancePostToAr,
    zatcaCreditNote,
    zatcaCreditNoteSubmit,
    bloodbankUnitDiscard,
    bloodbankUnitRecall,
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
    pathologyAddendumCreate,
    socialWorkCaseCreate,
    socialWorkCaseUpdate,
    mortuaryCaseCreate,
    mortuaryCaseUpdate,
    cmeActivityCreate,
    cmeRegistrationCreate,
    cmeEventCreate,
    cssdInstrumentSetCreate,
    cssdCycleCreate,
    cssdCycleStatusUpdate,
    cssdLoadItemCreate,
    cssdBatchCreate,
    cssdBatchUpdate,
    infectionControlReportCreate,
    infectionControlReportUpdate,
    cssdCycleBiResultUpdate,
    cssdTrayCreate,
    cssdTrayIssue,
    bloodbankUnitCreate,
    bloodbankCrossmatchCreate,
    bloodbankCrossmatchValidate,
    bloodbankTransfuse,
    bloodbankTransfusionReactionCreate,
    bloodbankDonorCreate
    ,surgeryUpdate
    ,surgeryPreopUpsert
    ,surgeryPreopTestCreate
    ,surgeryAnesthesiaUpsert
    ,orSlotReserve
    ,orSurgeryStatusUpdate
    ,orPacuUpsert
    ,orOperativeNoteUpsert
    ,appointmentCreate
    ,queueCheckinCreate
    ,queueStatusUpdate
    ,queueTriageUpdate
    ,patientReferralUpdate
    ,bookingUpdate
    ,patientReferralCreate
    ,patientReferralStatusUpdate
    ,appointmentFollowupCreate
    ,appointmentDuplicateCheck
    ,patientUpdate
    ,patientProblemCreate
    ,patientSocialHistoryUpsert
    ,patientFamilyHistoryCreate
    ,cardiologyProcedureCreate
    ,cardiologyEcgCreate
    ,cardiologyCathReportCreate
    ,gastroEndoscopyCreate
    ,gastroBiopsyCreate
    ,gastroBiopsyResultUpdate
    ,endocrineGlucoseCreate
    ,endocrineInsulinCreate
    ,endocrineInsulinDeactivate
    ,nephrologyDialysisCreate
    ,ophthalmologyExamCreate
    ,surgeryChecklistCreate
    ,surgeryTimelogCreate
    ,surgeryCpbCreate
    ,surgeryPreopTestUpdate
    ,surgeryCountSheetCreate
    ,urologyUrodynamicsCreate
    ,anesthesiaPainCreate
    ,pediatricsGrowthCreate
    ,pediatricsImmunizationCreate
    ,pediatricsApgarCreate
    ,obgynPregnancyCreate
    ,obgynPregnancyUpdate
    ,obgynAntenatalCreate
    ,obgynPartogramCreate
    ,obgynUltrasoundCreate
    ,obgynDeliveryCreate
    ,obgynNeonatalCreate
    ,obgynNstCreate
    ,psychiatryEvaluationCreate
    ,dermatologyLesionCreate
    ,entAudiogramCreate
    ,plasticBurnAssessmentCreate
    ,plasticBurnPhotoCreate
    ,icuAssessmentCreate
    ,icuFlowsheetCreate
    ,icuVentilatorCreate
    ,icuInfusionCreate
    ,icuScoreCreate
    ,icuFluidBalanceCreate
    ,icuDailyGoalsCreate
    ,icuPreventionBundlesCreate
    ,orthopedicsImplantCreate
    ,orthopedicsRomCreate
    ,pulmonologyPftCreate
    ,rheumatologyJointCreate
    ,neurologyAssessmentCreate
    ,formTemplateCreate
    ,queueAdCreate
    ,referralCreate
    ,settingsRoomCreate
    ,settingsRoomUpdate
    ,mfaVerify
    ,mfaDisable
    ,mfaAdminReset
    ,employeeCreate
    ,admissionCreate
    ,admissionDischargeUpdate
    ,admissionRoundCreate
    ,hrLicenseCreate
    ,hrShiftCreate
    ,hrAttendanceCreate
    ,hrLeaveRequestCreate
    ,hrLeaveRequestStatusUpdate
    ,hrPayrollSlipCreate
    ,hrPayrollSlipStatusUpdate
    ,hrCompetencyCreate
    ,hrCredentialingCreate
    ,hrCredentialingVerify
    ,hrGosiCalculate
    ,hrWpsGenerate
    ,hrWpsSubmit
    ,hrNitaqatCalculate
    ,deptRequestCreate
    ,deptRequestUpdate
    ,catalogLabUpdate
    ,catalogRadiologyUpdate
    ,resultAcknowledge
    ,inventoryItemCreate
    ,inventoryLegacyCreate
    ,inventoryItemUpdate
    ,inventoryPurchaseOrderCreate
    ,inventoryPurchaseOrderStatusUpdate
    ,inventoryGoodsReceiptCreate
    ,inventoryMovementCreate
    ,inventoryStockCountCreate
    ,settingsUserCreate
    ,settingsUserUpdate
    ,messageCreate
};
