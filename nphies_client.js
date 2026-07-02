/**
 * nphies_client.js — Saudi NPHIES (HL7 FHIR R4) integration client (GATE-INT: NPHIES).
 *
 * Provides pure mappers to generate FHIR R4 Bundles for eligibility checks, pre-authorizations,
 * and insurance claims, as well as an API client class to interact with the NPHIES Endpoint.
 */
'use strict';

const ref = (t, id) => ({ reference: `${t}/${id}` });

function buildEligibilityBundle({ patient, company, policy, providerId = 'provider-01' }) {
    const pId = patient ? String(patient.id) : 'dummy-patient';
    const cId = company ? String(company.id) : 'dummy-company';
    
    return {
        resourceType: 'Bundle',
        type: 'collection',
        entry: [
            {
                resource: {
                    resourceType: 'Patient',
                    id: pId,
                    identifier: [{ system: 'https://nama.sa/national-id', value: patient?.national_id || '1000000001' }],
                    name: [{ text: patient?.name_en || 'Ahmad' }],
                    gender: patient?.gender || 'male',
                    birthDate: patient?.dob || '1990-01-01'
                }
            },
            {
                resource: {
                    resourceType: 'Organization',
                    id: providerId,
                    name: 'Nama Medical Hospital',
                    identifier: [{ system: 'http://nphies.sa/license/provider', value: '7654321' }]
                }
            },
            {
                resource: {
                    resourceType: 'Organization',
                    id: cId,
                    name: company?.name_en || 'Insurance Company',
                    identifier: [{ system: 'http://nphies.sa/license/payer', value: '1234567' }]
                }
            },
            {
                resource: {
                    resourceType: 'Coverage',
                    id: `cov-${pId}`,
                    status: 'active',
                    beneficiary: ref('Patient', pId),
                    payor: [ref('Organization', cId)],
                    subscriber: ref('Patient', pId),
                    class: [
                        { type: { coding: [{ code: 'group' }] }, value: policy || 'POL-99999' }
                    ]
                }
            },
            {
                resource: {
                    resourceType: 'CoverageEligibilityRequest',
                    id: `req-${pId}`,
                    status: 'active',
                    purpose: ['validation'],
                    patient: ref('Patient', pId),
                    created: new Date().toISOString(),
                    provider: ref('Organization', providerId),
                    insurer: ref('Organization', cId),
                    insurance: [{ coverage: ref('Coverage', `cov-${pId}`) }]
                }
            }
        ]
    };
}

function buildPreAuthBundle({ patient, company, preAuth, providerId = 'provider-01' }) {
    const pId = patient ? String(patient.id) : 'dummy-patient';
    const cId = company ? String(company.id) : 'dummy-company';
    const paId = preAuth ? String(preAuth.id) : 'dummy-preauth';
    
    return {
        resourceType: 'Bundle',
        type: 'collection',
        entry: [
            {
                resource: {
                    resourceType: 'Patient',
                    id: pId,
                    name: [{ text: patient?.name_en || 'Ahmad' }],
                    gender: patient?.gender || 'male'
                }
            },
            {
                resource: {
                    resourceType: 'Organization',
                    id: providerId,
                    name: 'Nama Medical Hospital'
                }
            },
            {
                resource: {
                    resourceType: 'Organization',
                    id: cId,
                    name: company?.name_en || 'Insurance Company'
                }
            },
            {
                resource: {
                    resourceType: 'Claim',
                    id: paId,
                    status: 'active',
                    type: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/claim-type', code: 'institutional' }] },
                    use: 'preauthorization',
                    patient: ref('Patient', pId),
                    created: new Date().toISOString(),
                    provider: ref('Organization', providerId),
                    insurer: ref('Organization', cId),
                    total: { value: Number(preAuth?.requested_amount || 0), currency: 'SAR' }
                }
            }
        ]
    };
}

function buildClaimBundle({ patient, company, claim, lines, providerId = 'provider-01' }) {
    const pId = patient ? String(patient.id) : 'dummy-patient';
    const cId = company ? String(company.id) : 'dummy-company';
    const clId = claim ? String(claim.id) : 'dummy-claim';
    
    return {
        resourceType: 'Bundle',
        type: 'collection',
        entry: [
            {
                resource: {
                    resourceType: 'Patient',
                    id: pId,
                    name: [{ text: patient?.name_en || 'Ahmad' }],
                    gender: patient?.gender || 'male'
                }
            },
            {
                resource: {
                    resourceType: 'Organization',
                    id: providerId,
                    name: 'Nama Medical Hospital'
                }
            },
            {
                resource: {
                    resourceType: 'Organization',
                    id: cId,
                    name: company?.name_en || 'Insurance Company'
                }
            },
            {
                resource: {
                    resourceType: 'Claim',
                    id: clId,
                    status: 'active',
                    type: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/claim-type', code: 'institutional' }] },
                    use: 'claim',
                    patient: ref('Patient', pId),
                    created: new Date().toISOString(),
                    provider: ref('Organization', providerId),
                    insurer: ref('Organization', cId),
                    total: { value: Number(claim?.claim_amount || 0), currency: 'SAR' },
                    item: (lines || []).map((l, idx) => ({
                        sequence: idx + 1,
                        productOrService: { text: l.description || 'Medical Service' },
                        quantity: { value: Number(l.quantity || 1) },
                        unitPrice: { value: Number(l.unit_price || 0), currency: 'SAR' },
                        net: { value: Number(l.line_amount || 0), currency: 'SAR' }
                    }))
                }
            }
        ]
    };
}

class NphiesClient {
    constructor({ endpointUrl = null, apiKey = null, apiSecret = null, enabled = false, fetchImpl = null } = {}) {
        this.endpointUrl = endpointUrl;
        this.apiKey = apiKey;
        this.apiSecret = apiSecret;
        this.enabled = enabled;
        this._fetch = fetchImpl || (typeof fetch === 'function' ? fetch : null);
    }
    
    _assertReady() {
        if (!this.enabled) {
            const e = new Error('NPHIES disabled (set NPHIES_ENABLED=true to transmit)');
            e.statusCode = 503; e.code = 'NPHIES_GATED'; throw e;
        }
        if (!this.endpointUrl || !this.apiKey) {
            const e = new Error('NPHIES endpoint/API key not configured');
            e.statusCode = 503; e.code = 'NPHIES_NO_CONFIG'; throw e;
        }
        if (!this._fetch) {
            const e = new Error('no fetch implementation available');
            e.statusCode = 500; throw e;
        }
    }
    
    async _post(path, bundle) {
        this._assertReady();
        const res = await this._fetch(this.endpointUrl + path, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/fhir+json',
                'Authorization': 'Bearer ' + this.apiSecret
            },
            body: JSON.stringify(bundle)
        });
        const text = await res.text();
        let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
        return { status: res.status, ok: res.ok, body: json };
    }
    
    checkEligibility(bundle) { return this._post('/CoverageEligibilityRequest', bundle); }
    requestPreAuth(bundle) { return this._post('/Claim/preauth', bundle); }
    submitClaim(bundle) { return this._post('/Claim/submit', bundle); }
}

// ============================================================================
// Gate 8 — NPHIES KSA-conformant FHIR *message* bundles.
//
// The builders above emit minimal FHIR R4 `collection` bundles that are NOT
// NPHIES-conformant. NPHIES uses FHIR messaging: a `message` Bundle whose first
// entry is a MessageHeader (with a KSA event code), every entry addressed by a
// urn:uuid fullUrl with references resolved to those fullUrls, meta.profile on
// each resource, and KSA/ICD-10-AM/SBS terminology systems.
//
// These builders produce that structure. NOTE: the exact profile version pins and
// the full set of KSA extensions/value-sets must be reconciled against the LIVE
// NPHIES Implementation Guide before production submission — this is the structural
// scaffold, deterministic and unit-testable, not a certified end-to-end conformance.
// ============================================================================
const crypto = require('crypto');

const NPHIES = {
    eventSystem: 'http://nphies.sa/terminology/CodeSystem/ksa-message-events',
    profileBase: 'http://nphies.sa/fhir/ksa/nphies-fs/StructureDefinition',
    nationalId: 'http://nphies.sa/identifier/nationalid',
    providerLicense: 'http://nphies.sa/license/provider-license',
    payerLicense: 'http://nphies.sa/license/payer-license',
    claimType: 'http://nphies.sa/terminology/CodeSystem/claim-type',
    sbs: 'http://nphies.sa/terminology/CodeSystem/procedures',
    icd10am: 'http://hl7.org/fhir/sid/icd-10-am',
    defaultEndpoint: 'http://nphies.sa',
};

// Deterministic urn:uuid fullUrl derived from a stable seed (resourceType + id), so the
// same inputs always produce the same bundle (unit-testable) while remaining unique per
// resource within the bundle. Real end-to-end submission may swap this for random UUIDs.
function fullUrlFor(seed) {
    const h = crypto.createHash('sha1').update(String(seed)).digest('hex');
    const u = `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
    return `urn:uuid:${u}`;
}
function withProfile(resource, profileName) {
    return { ...resource, meta: { profile: [`${NPHIES.profileBase}/${profileName}`] } };
}
function messageBundle({ event, focusUrl, entries, now, providerId }) {
    const ts = now || new Date().toISOString();
    const header = withProfile({
        resourceType: 'MessageHeader',
        eventCoding: { system: NPHIES.eventSystem, code: event },
        source: { endpoint: NPHIES.defaultEndpoint + '/provider/' + providerId },
        destination: [{ endpoint: NPHIES.defaultEndpoint }],
        focus: [{ reference: focusUrl }],
    }, 'message-header');
    return {
        resourceType: 'Bundle',
        type: 'message',
        identifier: { system: 'urn:ietf:rfc:3986', value: fullUrlFor(`bundle/${event}/${focusUrl}/${ts}`) },
        timestamp: ts,
        entry: [{ fullUrl: fullUrlFor(`MessageHeader/${event}/${focusUrl}`), resource: header }, ...entries],
    };
}

function ksaPatient(patient) {
    const pId = patient ? String(patient.id) : 'dummy-patient';
    return withProfile({
        resourceType: 'Patient',
        id: pId,
        identifier: [{ system: NPHIES.nationalId, value: patient?.national_id || '1000000001' }],
        name: [{ text: patient?.name_en || patient?.name_ar || 'Unknown' }],
        gender: patient?.gender || 'unknown',
        birthDate: patient?.dob || undefined,
    }, 'patient');
}
function ksaProvider(providerId) {
    return withProfile({
        resourceType: 'Organization',
        id: providerId,
        identifier: [{ system: NPHIES.providerLicense, value: '7654321' }],
        name: 'Nama Medical Hospital',
    }, 'provider-organization');
}
function ksaPayer(company) {
    const cId = company ? String(company.id) : 'dummy-company';
    return withProfile({
        resourceType: 'Organization',
        id: cId,
        identifier: [{ system: NPHIES.payerLicense, value: '1234567' }],
        name: company?.name_en || 'Insurance Company',
    }, 'insurer-organization');
}

function buildEligibilityMessage({ patient, company, policy, providerId = 'provider-01', now } = {}) {
    const patRes = ksaPatient(patient), provRes = ksaProvider(providerId), payRes = ksaPayer(company);
    const patUrl = fullUrlFor(`Patient/${patRes.id}`), provUrl = fullUrlFor(`Organization/${provRes.id}`), payUrl = fullUrlFor(`Organization-payer/${payRes.id}`);
    const covRes = withProfile({
        resourceType: 'Coverage', id: `cov-${patRes.id}`, status: 'active',
        beneficiary: { reference: patUrl }, subscriber: { reference: patUrl }, payor: [{ reference: payUrl }],
        class: [{ type: { coding: [{ code: 'group' }] }, value: policy || 'POL-99999' }],
    }, 'coverage');
    const covUrl = fullUrlFor(`Coverage/${covRes.id}`);
    const cerRes = withProfile({
        resourceType: 'CoverageEligibilityRequest', id: `elig-${patRes.id}`, status: 'active',
        purpose: ['validation', 'benefits'], patient: { reference: patUrl }, created: now || new Date().toISOString(),
        provider: { reference: provUrl }, insurer: { reference: payUrl }, insurance: [{ coverage: { reference: covUrl } }],
    }, 'eligibility-request');
    const cerUrl = fullUrlFor(`CoverageEligibilityRequest/${cerRes.id}`);
    return messageBundle({
        event: 'eligibility-request', focusUrl: cerUrl, now, providerId,
        entries: [
            { fullUrl: cerUrl, resource: cerRes },
            { fullUrl: patUrl, resource: patRes },
            { fullUrl: provUrl, resource: provRes },
            { fullUrl: payUrl, resource: payRes },
            { fullUrl: covUrl, resource: covRes },
        ],
    });
}

function buildPreAuthMessage({ patient, company, preAuth, providerId = 'provider-01', now } = {}) {
    return buildClaimLikeMessage({ patient, company, claim: preAuth, lines: preAuth?.lines || [], diagnoses: preAuth?.diagnoses || [], use: 'preauthorization', event: 'priorauth-request', profile: 'priorauth', providerId, now, amount: preAuth?.amount });
}

function buildClaimMessage({ patient, company, claim, lines, diagnoses, providerId = 'provider-01', now } = {}) {
    return buildClaimLikeMessage({ patient, company, claim, lines: lines || [], diagnoses: diagnoses || [], use: 'claim', event: 'claim-request', profile: 'institutional-claim', providerId, now, amount: claim?.claim_amount });
}

function buildClaimLikeMessage({ patient, company, claim, lines, diagnoses, use, event, profile, providerId, now, amount }) {
    const patRes = ksaPatient(patient), provRes = ksaProvider(providerId), payRes = ksaPayer(company);
    const patUrl = fullUrlFor(`Patient/${patRes.id}`), provUrl = fullUrlFor(`Organization/${provRes.id}`), payUrl = fullUrlFor(`Organization-payer/${payRes.id}`);
    const clId = claim ? String(claim.id) : 'dummy-claim';
    const claimRes = withProfile({
        resourceType: 'Claim', id: clId, status: 'active',
        type: { coding: [{ system: NPHIES.claimType, code: 'institutional' }] },
        use, patient: { reference: patUrl }, created: now || new Date().toISOString(),
        provider: { reference: provUrl }, insurer: { reference: payUrl },
        priority: { coding: [{ code: 'normal' }] },
        // diagnoses coded with ICD-10-AM (NPHIES requirement); a diagnosis with no icd10
        // is emitted as text only rather than a fabricated code (fail-safe).
        diagnosis: (diagnoses || []).map((d, i) => ({
            sequence: i + 1,
            diagnosisCodeableConcept: d.icd10
                ? { coding: [{ system: NPHIES.icd10am, code: String(d.icd10) }], text: d.description || undefined }
                : { text: d.description || 'Unspecified' },
        })),
        insurance: [{ sequence: 1, focal: true, coverage: { reference: fullUrlFor(`Coverage/cov-${patRes.id}`) } }],
        total: { value: Number(amount || 0), currency: 'SAR' },
        // items coded with SBS where available; unmapped services stay text-only (no fabricated code).
        item: (lines || []).map((l, idx) => ({
            sequence: idx + 1,
            productOrService: l.sbs_code
                ? { coding: [{ system: NPHIES.sbs, code: String(l.sbs_code) }], text: l.description || undefined }
                : { text: l.description || 'Medical Service' },
            quantity: { value: Number(l.quantity || 1) },
            unitPrice: { value: Number(l.unit_price || 0), currency: 'SAR' },
            net: { value: Number(l.line_amount || 0), currency: 'SAR' },
        })),
    }, profile);
    const claimUrl = fullUrlFor(`Claim/${use}/${clId}`);
    const covRes = withProfile({
        resourceType: 'Coverage', id: `cov-${patRes.id}`, status: 'active',
        beneficiary: { reference: patUrl }, subscriber: { reference: patUrl }, payor: [{ reference: payUrl }],
    }, 'coverage');
    return messageBundle({
        event, focusUrl: claimUrl, now, providerId,
        entries: [
            { fullUrl: claimUrl, resource: claimRes },
            { fullUrl: patUrl, resource: patRes },
            { fullUrl: provUrl, resource: provRes },
            { fullUrl: payUrl, resource: payRes },
            { fullUrl: fullUrlFor(`Coverage/cov-${patRes.id}`), resource: covRes },
        ],
    });
}

module.exports = {
    buildEligibilityBundle,
    buildPreAuthBundle,
    buildClaimBundle,
    // Gate 8: KSA-conformant message bundles
    buildEligibilityMessage,
    buildPreAuthMessage,
    buildClaimMessage,
    NPHIES_SYSTEMS: NPHIES,
    NphiesClient
};
