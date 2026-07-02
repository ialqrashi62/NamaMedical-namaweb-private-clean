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

module.exports = {
    buildEligibilityBundle,
    buildPreAuthBundle,
    buildClaimBundle,
    NphiesClient
};
