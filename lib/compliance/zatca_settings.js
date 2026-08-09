'use strict';

const VALID_ENVS = new Set(['sandbox', 'simulation', 'production']);
const CSR_SERIAL_PATTERN = /^1-[^|]+\|2-[^|]+\|3-[^|]+$/;

function _trim(v) {
  return typeof v === 'string' ? v.trim() : '';
}

function normalizeZatcaConfig(input) {
  const src = (input && typeof input === 'object') ? input : {};
  const csr = (src.csr_profile && typeof src.csr_profile === 'object') ? src.csr_profile : {};
  const env = _trim(src.environment).toLowerCase();

  return {
    environment: VALID_ENVS.has(env) ? env : 'sandbox',
    private_key_pem: _trim(src.private_key_pem),
    public_key_pem: _trim(src.public_key_pem),
    sdk_home_path: _trim(src.sdk_home_path),
    csr_profile: {
      commonName: _trim(csr.commonName),
      serialNumber: _trim(csr.serialNumber),
      organizationIdentifier: _trim(csr.organizationIdentifier),
      commercialRegistrationNumber: _trim(csr.commercialRegistrationNumber),
      organizationUnitName: _trim(csr.organizationUnitName),
      organizationName: _trim(csr.organizationName),
      countryName: _trim(csr.countryName) || 'SA',
      invoiceType: _trim(csr.invoiceType) || '1100',
      location: _trim(csr.location),
      industry: _trim(csr.industry) || 'Medical'
    }
  };
}

function redactZatcaConfig(input) {
  const n = normalizeZatcaConfig(input);
  const mask = (s) => (s ? '***REDACTED***' : '');
  return {
    ...n,
    private_key_pem: mask(n.private_key_pem),
    public_key_pem: mask(n.public_key_pem)
  };
}

function validateZatcaConfig(input, options) {
  const opts = options || {};
  const src = (input && typeof input === 'object') ? input : {};
  const rawEnv = _trim(src.environment).toLowerCase();
  const n = normalizeZatcaConfig(input);
  const errors = [];

  // If caller explicitly provided an environment value, require it to be valid.
  if (rawEnv && !VALID_ENVS.has(rawEnv)) {
    errors.push('INVALID_ENVIRONMENT');
  }

  if (opts.requireKeys) {
    if (!n.private_key_pem) errors.push('MISSING_PRIVATE_KEY_PEM');
    if (!n.public_key_pem) errors.push('MISSING_PUBLIC_KEY_PEM');
  }

  if (n.private_key_pem && !/BEGIN (EC )?PRIVATE KEY/.test(n.private_key_pem)) {
    // Accept both EC PRIVATE KEY and PRIVATE KEY blocks because upstream tooling may export either.
    errors.push('MALFORMED_PRIVATE_KEY_PEM');
  }
  if (n.public_key_pem && !/BEGIN PUBLIC KEY/.test(n.public_key_pem)) {
    errors.push('MALFORMED_PUBLIC_KEY_PEM');
  }

  const csr = n.csr_profile;
  if (opts.requireCsrProfile) {
    if (!csr.commonName) errors.push('MISSING_CSR_COMMON_NAME');
    if (!csr.serialNumber) {
      errors.push('MISSING_CSR_SERIAL_NUMBER');
    } else if (!CSR_SERIAL_PATTERN.test(csr.serialNumber)) {
      errors.push('INVALID_CSR_SERIAL_NUMBER_FORMAT');
    } else {
      const serialParts = csr.serialNumber.split('|');
      const modelToken = _trim(serialParts[1] || '').replace(/^2-/, '').toUpperCase();
      const unitToken = _trim(serialParts[2] || '').replace(/^3-/, '').toUpperCase();
      if (modelToken === 'CR' || unitToken === 'VAT') {
        errors.push('INVALID_CSR_SERIAL_PLACEHOLDER');
      }
    }
    if (!csr.organizationIdentifier) errors.push('MISSING_CSR_ORG_IDENTIFIER');
    if (!csr.commercialRegistrationNumber) errors.push('MISSING_CSR_COMMERCIAL_REGISTRATION');
    if (!csr.organizationName) errors.push('MISSING_CSR_ORG_NAME');
  }

  return { ok: errors.length === 0, errors, normalized: n };
}

function buildSdkPaths(sdkHomePath) {
  const home = _trim(sdkHomePath).replace(/\\/g, '/').replace(/\/+$/, '');
  if (!home) return null;
  return {
    home,
    appCli: `${home}/Apps/fatoora.bat`,
    config: `${home}/Configuration/config.json`,
    certPem: `${home}/Data/Certificates/cert.pem`,
    privatePem: `${home}/Data/Certificates/ec-secp256k1-priv-key.pem`,
    pih: `${home}/Data/PIH/pih.txt`,
    csrTemplate: `${home}/Data/Input/csr-config-template.properties`
  };
}

module.exports = {
  VALID_ENVS,
  CSR_SERIAL_PATTERN,
  normalizeZatcaConfig,
  validateZatcaConfig,
  redactZatcaConfig,
  buildSdkPaths
};
