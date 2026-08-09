'use strict';

const NPHIES_FHIR_VERSIONS = new Set(['R4']);
const CBAHI_FREQUENCIES = new Set(['monthly', 'quarterly', 'semiannual', 'annual']);

function _trim(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function _bool(value, fallback) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    if (v === 'true' || v === '1') return true;
    if (v === 'false' || v === '0') return false;
  }
  if (typeof value === 'number') {
    if (value === 1) return true;
    if (value === 0) return false;
  }
  return fallback;
}

function normalizeNphiesConfig(input) {
  const src = (input && typeof input === 'object') ? input : {};
  const fhirVersion = _trim(src.fhir_version || src.fhirVersion).toUpperCase();
  return {
    sandbox_mode: _bool(src.sandbox_mode, true),
    fhir_version: NPHIES_FHIR_VERSIONS.has(fhirVersion) ? fhirVersion : 'R4',
    provider_license: _trim(src.provider_license || src.providerLicense),
    payer_license: _trim(src.payer_license || src.payerLicense),
    eligibility_path: _trim(src.eligibility_path || src.eligibilityPath) || '/CoverageEligibilityRequest',
    prior_auth_path: _trim(src.prior_auth_path || src.priorAuthPath) || '/Claim/$prior-auth',
    claim_submit_path: _trim(src.claim_submit_path || src.claimSubmitPath) || '/Claim/$submit',
    communication_path: _trim(src.communication_path || src.communicationPath) || '/Communication',
    use_oauth2: _bool(src.use_oauth2, true)
  };
}

function redactNphiesConfig(input) {
  const n = normalizeNphiesConfig(input);
  const masked = { ...n };
  if (Object.prototype.hasOwnProperty.call(input || {}, 'client_secret') && _trim(input.client_secret)) {
    masked.client_secret = '***REDACTED***';
  }
  return masked;
}

function validateNphiesConfig(input, options) {
  const opts = options || {};
  const src = (input && typeof input === 'object') ? input : {};
  const n = normalizeNphiesConfig(src);
  const errors = [];

  const rawFhir = _trim(src.fhir_version || src.fhirVersion).toUpperCase();
  if (rawFhir && !NPHIES_FHIR_VERSIONS.has(rawFhir)) {
    errors.push('NPHIES_UNSUPPORTED_FHIR_VERSION');
  }

  if (!_trim(n.eligibility_path).startsWith('/')) errors.push('NPHIES_INVALID_ELIGIBILITY_PATH');
  if (!_trim(n.prior_auth_path).startsWith('/')) errors.push('NPHIES_INVALID_PRIOR_AUTH_PATH');
  if (!_trim(n.claim_submit_path).startsWith('/')) errors.push('NPHIES_INVALID_CLAIM_SUBMIT_PATH');
  if (!_trim(n.communication_path).startsWith('/')) errors.push('NPHIES_INVALID_COMMUNICATION_PATH');

  if (opts.requireProfile) {
    if (!n.provider_license) errors.push('NPHIES_MISSING_PROVIDER_LICENSE');
    if (!n.payer_license) errors.push('NPHIES_MISSING_PAYER_LICENSE');
  }

  return { ok: errors.length === 0, errors, normalized: n };
}

function normalizeCbahiConfig(input) {
  const src = (input && typeof input === 'object') ? input : {};
  const frequency = _trim(src.self_assessment_frequency || src.selfAssessmentFrequency).toLowerCase();
  return {
    standards_version: _trim(src.standards_version || src.standardsVersion),
    facility_license_number: _trim(src.facility_license_number || src.facilityLicenseNumber),
    self_assessment_frequency: CBAHI_FREQUENCIES.has(frequency) ? frequency : 'quarterly',
    sentinel_reporting_enabled: _bool(src.sentinel_reporting_enabled, true),
    quality_committee_owner: _trim(src.quality_committee_owner || src.qualityCommitteeOwner)
  };
}

function redactCbahiConfig(input) {
  return normalizeCbahiConfig(input);
}

function validateCbahiConfig(input, options) {
  const opts = options || {};
  const src = (input && typeof input === 'object') ? input : {};
  const n = normalizeCbahiConfig(src);
  const errors = [];

  const rawFrequency = _trim(src.self_assessment_frequency || src.selfAssessmentFrequency).toLowerCase();
  if (rawFrequency && !CBAHI_FREQUENCIES.has(rawFrequency)) {
    errors.push('CBAHI_INVALID_ASSESSMENT_FREQUENCY');
  }

  if (opts.requireProfile) {
    if (!n.standards_version) errors.push('CBAHI_MISSING_STANDARDS_VERSION');
    if (!n.facility_license_number) errors.push('CBAHI_MISSING_FACILITY_LICENSE_NUMBER');
  }

  return { ok: errors.length === 0, errors, normalized: n };
}

module.exports = {
  NPHIES_FHIR_VERSIONS,
  CBAHI_FREQUENCIES,
  normalizeNphiesConfig,
  redactNphiesConfig,
  validateNphiesConfig,
  normalizeCbahiConfig,
  redactCbahiConfig,
  validateCbahiConfig
};