/**
 * nphies_ksa_test.js — PURE unit test for Gate 8 (NPHIES KSA-conformant FHIR message bundles).
 * Run: node nphies_ksa_test.js   (no DB, no network; deterministic via injected `now`).
 *
 * Verifies the STRUCTURAL KSA-messaging requirements the previous minimal `collection`
 * bundles were missing: Bundle.type=message, a MessageHeader focus resource with an
 * NPHIES event code, urn:uuid fullUrls with references resolved to them, meta.profile on
 * every resource, and NPHIES/ICD-10-AM/SBS terminology systems. (Exact profile version
 * pins must still be confirmed against the live NPHIES IG before go-live — the builder
 * documents this.)
 */
'use strict';
const N = require('./nphies_client');

const GREEN = '\x1b[32m', RED = '\x1b[31m', RESET = '\x1b[0m', BOLD = '\x1b[1m';
let passed = 0, failed = 0; const fails = [];
function assert(cond, name, det = '') {
  if (cond) { console.log(`  ${GREEN}PASS${RESET} ${name}`); passed++; }
  else { console.log(`  ${RED}FAIL${RESET} ${name}${det ? ' | ' + det : ''}`); failed++; fails.push(name); }
}
const NOW = '2026-07-03T09:00:00.000Z';
const patient = { id: 42, national_id: '1012345678', name_en: 'Sara', gender: 'female', dob: '1992-05-01' };
const company = { id: 7, name_en: 'Bupa Arabia' };
const entryOfType = (b, t) => (b.entry || []).find(e => e.resource && e.resource.resourceType === t);

console.log(`${BOLD}Gate 8 — NPHIES KSA message-bundle conformance (pure unit test)${RESET}\n`);

// ---- Eligibility message ----
console.log('[1] buildEligibilityMessage — message bundle shape');
let b = N.buildEligibilityMessage({ patient, company, policy: 'POL-1', now: NOW });
assert(b.resourceType === 'Bundle' && b.type === 'message', 'type=message', b.type);
assert(b.timestamp === NOW, 'bundle.timestamp set from now', b.timestamp);
assert(b.identifier && typeof b.identifier.value === 'string', 'bundle.identifier present');
assert(b.entry[0].resource.resourceType === 'MessageHeader', 'first entry is MessageHeader', b.entry[0].resource.resourceType);
let mh = b.entry[0].resource;
assert(mh.eventCoding && /ksa-message-events/.test(mh.eventCoding.system) && mh.eventCoding.code === 'eligibility-request',
  'MessageHeader eventCoding = eligibility-request', JSON.stringify(mh.eventCoding));
assert(mh.source && mh.source.endpoint, 'MessageHeader has source.endpoint');
assert(Array.isArray(mh.destination) && mh.destination.length >= 1, 'MessageHeader has destination');
// every entry has a urn:uuid fullUrl
assert(b.entry.every(e => typeof e.fullUrl === 'string' && e.fullUrl.startsWith('urn:uuid:')), 'all entries have urn:uuid fullUrl');
// MessageHeader.focus points at the CoverageEligibilityRequest fullUrl
const cerEntry = b.entry.find(e => e.resource.resourceType === 'CoverageEligibilityRequest');
assert(mh.focus && mh.focus[0].reference === cerEntry.fullUrl, 'MessageHeader.focus -> CER fullUrl', JSON.stringify(mh.focus));
// references resolved to fullUrl (not "Patient/42")
const patEntry = entryOfType(b, 'Patient');
assert(cerEntry.resource.patient.reference === patEntry.fullUrl, 'CER.patient reference is the Patient fullUrl');
assert(!/^Patient\//.test(cerEntry.resource.patient.reference), 'reference is NOT relative ResourceType/id');
// every resource carries meta.profile
assert(b.entry.every(e => e.resource.meta && Array.isArray(e.resource.meta.profile) && e.resource.meta.profile.length > 0),
  'every resource has meta.profile');
assert(/nphies\.sa/.test(patEntry.resource.meta.profile[0]), 'profile URL is an nphies.sa StructureDefinition');
// KSA identifier systems
assert(/nphies\.sa/.test(patEntry.resource.identifier[0].system), 'patient national id system is nphies.sa');
const provEntry = (b.entry.map(e => e.resource).filter(r => r.resourceType === 'Organization'))
  .find(o => (o.identifier || []).some(i => /provider/.test(i.system)));
assert(!!provEntry, 'provider Organization has provider-license identifier');

// determinism
let b2 = N.buildEligibilityMessage({ patient, company, policy: 'POL-1', now: NOW });
assert(JSON.stringify(b) === JSON.stringify(b2), 'deterministic for same inputs+now (stable fullUrls)');

// ---- PreAuth message ----
console.log('\n[2] buildPreAuthMessage — priorauth event + Claim focus');
b = N.buildPreAuthMessage({ patient, company, preAuth: { id: 5, amount: 1200 }, now: NOW });
mh = b.entry[0].resource;
assert(b.type === 'message' && mh.eventCoding.code === 'priorauth-request', 'event=priorauth-request', JSON.stringify(mh.eventCoding));
const claimP = entryOfType(b, 'Claim');
assert(claimP && claimP.resource.use === 'preauthorization', "Claim.use=preauthorization", claimP && claimP.resource.use);
assert(mh.focus[0].reference === claimP.fullUrl, 'focus -> Claim fullUrl');
assert(/nphies\.sa\/terminology/.test(claimP.resource.type.coding[0].system), 'claim type uses NPHIES system');

// ---- Claim message with diagnoses + SBS items ----
console.log('\n[3] buildClaimMessage — ICD-10-AM diagnoses + SBS items');
b = N.buildClaimMessage({
  patient, company,
  claim: { id: 9, claim_amount: 500 },
  lines: [{ description: 'CBC', quantity: 1, unit_price: 500, line_amount: 500, sbs_code: '90001-00-10' }],
  diagnoses: [{ icd10: 'J06.9', description: 'Acute URI' }],
  now: NOW
});
mh = b.entry[0].resource;
assert(b.type === 'message' && mh.eventCoding.code === 'claim-request', 'event=claim-request', JSON.stringify(mh.eventCoding));
const claimC = entryOfType(b, 'Claim').resource;
assert(claimC.use === 'claim', 'Claim.use=claim');
assert(Array.isArray(claimC.diagnosis) && /icd-10-am/.test(claimC.diagnosis[0].diagnosisCodeableConcept.coding[0].system),
  'diagnosis uses ICD-10-AM system', JSON.stringify(claimC.diagnosis && claimC.diagnosis[0]));
assert(claimC.diagnosis[0].diagnosisCodeableConcept.coding[0].code === 'J06.9', 'diagnosis code carried through');
assert(/procedures|sbs/i.test(claimC.item[0].productOrService.coding[0].system), 'item productOrService uses SBS/procedures system',
  JSON.stringify(claimC.item[0].productOrService));
assert(claimC.item[0].productOrService.coding[0].code === '90001-00-10', 'SBS code carried through');
assert(claimC.total.currency === 'SAR' && claimC.total.value === 500, 'total in SAR');
// items missing an sbs_code must NOT fabricate a wrong code — fall back to text only (fail-safe)
b = N.buildClaimMessage({ patient, company, claim: { id: 9, claim_amount: 100 },
  lines: [{ description: 'Unmapped service', quantity: 1, unit_price: 100, line_amount: 100 }], diagnoses: [], now: NOW });
const item0 = entryOfType(b, 'Claim').resource.item[0];
assert(!item0.productOrService.coding && item0.productOrService.text === 'Unmapped service',
  'no SBS code -> text only, no fabricated coding', JSON.stringify(item0.productOrService));

// ---- back-compat: old collection builders still exported ----
console.log('\n[4] legacy collection builders remain (back-compat)');
assert(typeof N.buildEligibilityBundle === 'function' && typeof N.buildClaimBundle === 'function', 'legacy builders still exported');

console.log(`\n${BOLD}Result:${RESET} ${passed} passed, ${failed} failed`);
if (failed) { console.log(`${RED}FAILURES:${RESET} ${fails.join(', ')}`); process.exit(1); }
process.exit(0);
