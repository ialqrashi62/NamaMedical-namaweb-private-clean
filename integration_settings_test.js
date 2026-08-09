'use strict';

const assert = require('assert');
const S = require('./lib/compliance/integration_settings');

function ok(name, cond) {
  if (!cond) throw new Error(name);
  process.stdout.write(`PASS ${name}\n`);
}

(function run() {
  const nDefault = S.normalizeNphiesConfig();
  ok('nphies defaults are stable', nDefault.fhir_version === 'R4' && nDefault.sandbox_mode === true);

  const nBadVersion = S.validateNphiesConfig({ fhir_version: 'R5' }, { requireProfile: false });
  ok('nphies invalid fhir version rejected', nBadVersion.errors.includes('NPHIES_UNSUPPORTED_FHIR_VERSION'));

  const nBadPaths = S.validateNphiesConfig({
    eligibility_path: 'CoverageEligibilityRequest',
    prior_auth_path: 'Claim/$prior-auth',
    claim_submit_path: 'Claim/$submit',
    communication_path: 'Communication'
  }, { requireProfile: false });
  ok('nphies invalid endpoint paths rejected',
    nBadPaths.errors.includes('NPHIES_INVALID_ELIGIBILITY_PATH') &&
    nBadPaths.errors.includes('NPHIES_INVALID_PRIOR_AUTH_PATH') &&
    nBadPaths.errors.includes('NPHIES_INVALID_CLAIM_SUBMIT_PATH') &&
    nBadPaths.errors.includes('NPHIES_INVALID_COMMUNICATION_PATH'));

  const nMissingProfile = S.validateNphiesConfig({}, { requireProfile: true });
  ok('nphies profile fields required when enabled',
    nMissingProfile.errors.includes('NPHIES_MISSING_PROVIDER_LICENSE') &&
    nMissingProfile.errors.includes('NPHIES_MISSING_PAYER_LICENSE'));

  const nGood = S.validateNphiesConfig({
    fhir_version: 'R4',
    provider_license: 'PRV-12345',
    payer_license: 'PAY-98765',
    eligibility_path: '/CoverageEligibilityRequest',
    prior_auth_path: '/Claim/$prior-auth',
    claim_submit_path: '/Claim/$submit',
    communication_path: '/Communication'
  }, { requireProfile: true });
  ok('nphies valid config accepted', nGood.ok);

  const cDefault = S.normalizeCbahiConfig();
  ok('cbahi default assessment frequency is quarterly', cDefault.self_assessment_frequency === 'quarterly');

  const cBadFrequency = S.validateCbahiConfig({ self_assessment_frequency: 'weekly' }, { requireProfile: false });
  ok('cbahi invalid assessment frequency rejected', cBadFrequency.errors.includes('CBAHI_INVALID_ASSESSMENT_FREQUENCY'));

  const cMissingProfile = S.validateCbahiConfig({}, { requireProfile: true });
  ok('cbahi profile fields required when enabled',
    cMissingProfile.errors.includes('CBAHI_MISSING_STANDARDS_VERSION') &&
    cMissingProfile.errors.includes('CBAHI_MISSING_FACILITY_LICENSE_NUMBER'));

  const cGood = S.validateCbahiConfig({
    standards_version: 'CBAHI-HOSPITAL-2026',
    facility_license_number: 'MOH-123456',
    self_assessment_frequency: 'quarterly',
    sentinel_reporting_enabled: true
  }, { requireProfile: true });
  ok('cbahi valid config accepted', cGood.ok);

  process.stdout.write('integration_settings_test: all pass\n');
})();