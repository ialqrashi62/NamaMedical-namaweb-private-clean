// ============================================================
// finance_engine.js  —  E10 Finance / General Ledger + ZATCA E-Invoice engine
// ------------------------------------------------------------
// PURE, DB-FREE, DETERMINISTIC helpers used by the /api/finance/* and /api/zatca/* routes.
// Everything here is unit-testable in isolation (no pool, no session, no clock unless injected).
//
// Responsibilities:
//   - GL double-entry validation: a journal entry is balanced iff sum(debit)==sum(credit)
//     per entry AND every line has exactly one non-zero side (no negative, no both-sided line).
//   - Money math in integer "halalas" (minor units) to avoid binary float drift, then formatted
//     back to 2dp strings — the ledger never trusts client-side float arithmetic.
//   - VAT 15% (KSA standard rate) computed server-side from a VAT-EXCLUSIVE or VAT-INCLUSIVE base.
//   - ZATCA Phase-2 e-invoice artifacts: deterministic UBL 2.1 XML + TLV-encoded base64 QR
//     (ZATCA spec tags 1..5) + a stamp PLACEHOLDER (real cryptographic stamp requires a CSID —
//     gated; we record intent only).
//
// NOTE: This module performs NO posting, NO network I/O, and NO DB writes. Posting to the ledger
//       and any external ZATCA clearance are gated behind explicit flags in server.js.
// ============================================================
'use strict';

const VAT_RATE = 0.15; // KSA standard VAT rate (15%)

// ---- money: work in integer minor units (halalas) to kill float drift --------------------
function toHalalas(v) {
    // Accept number or numeric string. Returns integer halalas. Non-finite -> NaN sentinel via throw upstream.
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    // round half-away-from-zero at 2dp
    return Math.round(n * 100);
}
function halalasToStr(h) {
    const sign = h < 0 ? '-' : '';
    const abs = Math.abs(h);
    const major = Math.floor(abs / 100);
    const minor = String(abs % 100).padStart(2, '0');
    return `${sign}${major}.${minor}`;
}
function money2(v) {
    const h = toHalalas(v);
    if (h === null) return null;
    return halalasToStr(h);
}

// ---- VAT 15% (server-authoritative; client-supplied vat never trusted) --------------------
// from a VAT-EXCLUSIVE base: vat = base * 0.15 ; total = base + vat
function vatFromExclusive(baseExclusive) {
    const baseH = toHalalas(baseExclusive);
    if (baseH === null || baseH < 0) return null;
    const vatH = Math.round(baseH * VAT_RATE);
    const totalH = baseH + vatH;
    return {
        base_excl: halalasToStr(baseH),
        vat_amount: halalasToStr(vatH),
        total_incl: halalasToStr(totalH),
        rate: VAT_RATE
    };
}
// from a VAT-INCLUSIVE total: base = total / 1.15 ; vat = total - base
function vatFromInclusive(totalInclusive) {
    const totalH = toHalalas(totalInclusive);
    if (totalH === null || totalH < 0) return null;
    const baseH = Math.round(totalH / (1 + VAT_RATE));
    const vatH = totalH - baseH;
    return {
        base_excl: halalasToStr(baseH),
        vat_amount: halalasToStr(vatH),
        total_incl: halalasToStr(totalH),
        rate: VAT_RATE
    };
}

// ---- GL double-entry validation ----------------------------------------------------------
// lines: [{ account_id, debit, credit }]. Returns { ok, reason, debit, credit, lines } where
// debit/credit are 2dp strings of the totals. A balanced entry: >=2 lines, each line exactly
// one positive side (the other 0), no negatives, totals equal and > 0.
function validateBalancedEntry(rawLines) {
    if (!Array.isArray(rawLines) || rawLines.length < 2) {
        return { ok: false, reason: 'min_two_lines' };
    }
    let debitH = 0, creditH = 0;
    const norm = [];
    for (const ln of rawLines) {
        const accId = Number(ln && ln.account_id);
        if (!Number.isInteger(accId) || accId <= 0) return { ok: false, reason: 'bad_account_id' };
        const dH = toHalalas(ln.debit == null ? 0 : ln.debit);
        const cH = toHalalas(ln.credit == null ? 0 : ln.credit);
        if (dH === null || cH === null) return { ok: false, reason: 'non_numeric_amount' };
        if (dH < 0 || cH < 0) return { ok: false, reason: 'negative_amount' };
        if (dH > 0 && cH > 0) return { ok: false, reason: 'both_sides_nonzero' };
        if (dH === 0 && cH === 0) return { ok: false, reason: 'zero_line' };
        debitH += dH; creditH += cH;
        norm.push({ account_id: accId, debit: halalasToStr(dH), credit: halalasToStr(cH) });
    }
    if (debitH <= 0 || creditH <= 0) return { ok: false, reason: 'zero_total' };
    if (debitH !== creditH) {
        return { ok: false, reason: 'unbalanced', debit: halalasToStr(debitH), credit: halalasToStr(creditH) };
    }
    return { ok: true, debit: halalasToStr(debitH), credit: halalasToStr(creditH), lines: norm };
}

// A posted entry is immutable; the only mutation is a REVERSAL entry that swaps debit<->credit.
function buildReversalLines(originalLines) {
    return (originalLines || []).map(l => ({
        account_id: Number(l.account_id),
        debit: money2(l.credit || 0),
        credit: money2(l.debit || 0),
        notes: 'Reversal'
    }));
}

// ---- AR aging buckets --------------------------------------------------------------------
// invoices: [{ id, balance, age_days }] (balance & age already computed server-side, tenant-scoped).
// Buckets: 0-30, 31-60, 61-90, 90+ . Returns { '0-30':str, '31-60':str, '61-90':str, '90+':str, total:str }.
function bucketLabel(ageDays) {
    const d = Number(ageDays);
    if (!Number.isFinite(d) || d <= 30) return '0-30';
    if (d <= 60) return '31-60';
    if (d <= 90) return '61-90';
    return '90+';
}
function ageInvoices(invoices) {
    const acc = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
    let totalH = 0;
    for (const inv of (invoices || [])) {
        const balH = toHalalas(inv.balance == null ? 0 : inv.balance);
        if (balH === null || balH <= 0) continue; // only outstanding (positive) balances age
        acc[bucketLabel(inv.age_days)] += balH;
        totalH += balH;
    }
    return {
        '0-30': halalasToStr(acc['0-30']),
        '31-60': halalasToStr(acc['31-60']),
        '61-90': halalasToStr(acc['61-90']),
        '90+': halalasToStr(acc['90+']),
        total: halalasToStr(totalH)
    };
}

// ---- ZATCA Phase-2 QR (TLV base64) -------------------------------------------------------
// ZATCA simplified-invoice QR carries 5 TLV tags:
//   1=Seller name, 2=Seller VAT, 3=Invoice timestamp (ISO8601), 4=Invoice total (with VAT),
//   5=VAT amount. Each: [tag(1B)][len(1B)][value(UTF-8)]; concatenated; base64-encoded.
function tlv(tag, valueStr) {
    const val = Buffer.from(valueStr == null ? '' : String(valueStr), 'utf8');
    if (val.length > 255) throw new Error('TLV value too long for tag ' + tag);
    return Buffer.concat([Buffer.from([tag & 0xff, val.length & 0xff]), val]);
}
// fields: { sellerName, sellerVat, timestamp(ISO), total, vat }
function buildZatcaQR(fields) {
    const buf = Buffer.concat([
        tlv(1, fields.sellerName || ''),
        tlv(2, fields.sellerVat || ''),
        tlv(3, fields.timestamp || ''),
        tlv(4, fields.total == null ? '0.00' : String(fields.total)),
        tlv(5, fields.vat == null ? '0.00' : String(fields.vat))
    ]);
    return buf.toString('base64');
}

// ---- ZATCA UBL 2.1 invoice XML (deterministic) -------------------------------------------
function xmlEscape(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
// inv: { invoiceNumber, issueDate(YYYY-MM-DD), issueTime(HH:MM:SS), invoiceTypeCode('388'),
//        sellerName, sellerVat, buyerName, buyerVat, baseExcl, vat, total, currency='SAR',
//        stampPlaceholder }
function buildUBLInvoice(inv) {
    const cur = inv.currency || 'SAR';
    // deterministic ordering; no timestamps generated internally (caller injects)
    return [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"',
        '  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"',
        '  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">',
        `  <cbc:ProfileID>reporting:1.0</cbc:ProfileID>`,
        `  <cbc:ID>${xmlEscape(inv.invoiceNumber)}</cbc:ID>`,
        `  <cbc:IssueDate>${xmlEscape(inv.issueDate)}</cbc:IssueDate>`,
        `  <cbc:IssueTime>${xmlEscape(inv.issueTime || '00:00:00')}</cbc:IssueTime>`,
        `  <cbc:InvoiceTypeCode>${xmlEscape(inv.invoiceTypeCode || '388')}</cbc:InvoiceTypeCode>`,
        `  <cbc:DocumentCurrencyCode>${xmlEscape(cur)}</cbc:DocumentCurrencyCode>`,
        '  <cac:AccountingSupplierParty><cac:Party>',
        `    <cac:PartyTaxScheme><cbc:CompanyID>${xmlEscape(inv.sellerVat)}</cbc:CompanyID></cac:PartyTaxScheme>`,
        `    <cac:PartyLegalEntity><cbc:RegistrationName>${xmlEscape(inv.sellerName)}</cbc:RegistrationName></cac:PartyLegalEntity>`,
        '  </cac:Party></cac:AccountingSupplierParty>',
        '  <cac:AccountingCustomerParty><cac:Party>',
        `    <cac:PartyTaxScheme><cbc:CompanyID>${xmlEscape(inv.buyerVat || '')}</cbc:CompanyID></cac:PartyTaxScheme>`,
        `    <cac:PartyLegalEntity><cbc:RegistrationName>${xmlEscape(inv.buyerName || '')}</cbc:RegistrationName></cac:PartyLegalEntity>`,
        '  </cac:Party></cac:AccountingCustomerParty>',
        '  <cac:TaxTotal>',
        `    <cbc:TaxAmount currencyID="${xmlEscape(cur)}">${xmlEscape(inv.vat)}</cbc:TaxAmount>`,
        '    <cac:TaxSubtotal>',
        `      <cbc:TaxableAmount currencyID="${xmlEscape(cur)}">${xmlEscape(inv.baseExcl)}</cbc:TaxableAmount>`,
        `      <cbc:TaxAmount currencyID="${xmlEscape(cur)}">${xmlEscape(inv.vat)}</cbc:TaxAmount>`,
        '      <cac:TaxCategory><cbc:Percent>15.00</cbc:Percent>',
        '        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>',
        '      </cac:TaxCategory>',
        '    </cac:TaxSubtotal>',
        '  </cac:TaxTotal>',
        '  <cac:LegalMonetaryTotal>',
        `    <cbc:LineExtensionAmount currencyID="${xmlEscape(cur)}">${xmlEscape(inv.baseExcl)}</cbc:LineExtensionAmount>`,
        `    <cbc:TaxExclusiveAmount currencyID="${xmlEscape(cur)}">${xmlEscape(inv.baseExcl)}</cbc:TaxExclusiveAmount>`,
        `    <cbc:TaxInclusiveAmount currencyID="${xmlEscape(cur)}">${xmlEscape(inv.total)}</cbc:TaxInclusiveAmount>`,
        `    <cbc:PayableAmount currencyID="${xmlEscape(cur)}">${xmlEscape(inv.total)}</cbc:PayableAmount>`,
        '  </cac:LegalMonetaryTotal>',
        `  <cac:Signature><cbc:ID>${xmlEscape(inv.stampPlaceholder || 'UNSIGNED-NO-CSID')}</cbc:ID></cac:Signature>`,
        '</Invoice>'
    ].join('\n');
}

// SHA-256 hash of the UBL (used as the document hash; the real cryptographic stamp needs a CSID).
function ublHash(xml) {
    return require('crypto').createHash('sha256').update(String(xml), 'utf8').digest('hex');
}

// ---- H-5 GL POSTING POLICY GUARDS (pure, DB-free) ----------------------------------------
// These helpers enforce the accounting posting policy BEFORE any journal creation.
// They are called by routes/hooks to reject invalid posting attempts at the application layer.
// CRITICAL: no journal entry is ever created unless ALL preconditions pass.

const VALID_SOURCE_TYPES = ['INVOICE', 'PAYMENT', 'REFUND', 'MANUAL', 'SYSTEM', 'REVERSAL'];
const VALID_EVENT_TYPES = ['ISSUED', 'CANCELLED', 'FULL_PAYMENT', 'PARTIAL_PAYMENT', 'REFUND', 'REVERSAL', 'ADJUSTMENT'];

// validateSourceDocument: ensures a posting request carries a valid source document reference.
// Returns { ok, reason? }. Rejects missing/invalid source_type, source_id, or event_type.
function validateSourceDocument(doc) {
    if (!doc || typeof doc !== 'object') return { ok: false, reason: 'missing_document' };
    if (!VALID_SOURCE_TYPES.includes(doc.source_type)) return { ok: false, reason: 'invalid_source_type' };
    if (doc.source_type !== 'MANUAL' && doc.source_type !== 'SYSTEM') {
        // non-manual postings MUST reference a concrete source row
        const sid = Number(doc.source_id);
        if (!Number.isInteger(sid) || sid <= 0) return { ok: false, reason: 'invalid_source_id' };
    }
    if (!VALID_EVENT_TYPES.includes(doc.event_type)) return { ok: false, reason: 'invalid_event_type' };
    return { ok: true };
}

// idempotencyKey: derives a deterministic key from source_type + source_id + event_type.
// The caller uses this to prevent duplicate journal entries for the same financial event.
// Returns null if any component is missing (fail-closed — no key = no posting).
function idempotencyKey(source_type, source_id, event_type) {
    if (!source_type || source_id == null || !event_type) return null;
    return `${String(source_type).toUpperCase()}:${source_id}:${String(event_type).toUpperCase()}`;
}

// checkPostingPreconditions: master guard that validates ALL preconditions before creating
// a journal entry. Returns { ok, reasons[] }. ANY failure => the entire posting is blocked.
// DOES NOT create entries — pure validation only.
//   accountingEnabled: boolean (from e10PostingEnabled())
//   tenantId:          number|null (from getRequestTenantContext)
//   sourceDoc:         { source_type, source_id, event_type }
//   lines:             [{ account_id, debit, credit }]
function checkPostingPreconditions(accountingEnabled, tenantId, sourceDoc, lines) {
    const reasons = [];
    // 1. Accounting flag must be ON
    if (!accountingEnabled) reasons.push('accounting_disabled');
    // 2. Tenant scope required (server-derived, never client-supplied)
    if (!tenantId) reasons.push('missing_tenant');
    // 3. Source document must be valid
    const docCheck = validateSourceDocument(sourceDoc);
    if (!docCheck.ok) reasons.push('source_doc_' + (docCheck.reason || 'invalid'));
    // 4. Journal lines must be balanced
    const balanceCheck = validateBalancedEntry(lines);
    if (!balanceCheck.ok) reasons.push('lines_' + (balanceCheck.reason || 'invalid'));
    // 5. Idempotency key must be derivable
    if (sourceDoc) {
        const key = idempotencyKey(sourceDoc.source_type, sourceDoc.source_id, sourceDoc.event_type);
        if (!key) reasons.push('no_idempotency_key');
    }
    return { ok: reasons.length === 0, reasons, ...(reasons.length === 0 ? { balanceCheck } : {}) };
}

module.exports = {
    VAT_RATE,
    toHalalas, halalasToStr, money2,
    vatFromExclusive, vatFromInclusive,
    validateBalancedEntry, buildReversalLines,
    bucketLabel, ageInvoices,
    tlv, buildZatcaQR,
    xmlEscape, buildUBLInvoice, ublHash,
    // H-5 GL posting policy guards
    VALID_SOURCE_TYPES, VALID_EVENT_TYPES,
    validateSourceDocument, idempotencyKey, checkPostingPreconditions
};
