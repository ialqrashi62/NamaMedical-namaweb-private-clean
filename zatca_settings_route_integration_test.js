'use strict';

const Database = require('better-sqlite3');
const express = require('express');
const http = require('http');
const {
  normalizeZatcaConfig,
  redactZatcaConfig,
  validateZatcaConfig
} = require('./lib/compliance/zatca_settings');
const {
  normalizeNphiesConfig,
  redactNphiesConfig,
  validateNphiesConfig,
  normalizeCbahiConfig,
  redactCbahiConfig,
  validateCbahiConfig
} = require('./lib/compliance/integration_settings');

let pass = 0;
let fail = 0;

function ok(name, cond) {
  if (cond) {
    pass++;
    console.log(`  PASS: ${name}`);
  } else {
    fail++;
    console.error(`  FAIL: ${name}`);
  }
}

function buildMockPool(db) {
  return {
    query(sql, params = []) {
      let sqliteSql = sql;
      let sqliteParams = params;
      if (params.length > 0) {
        const orderedParams = [];
        sqliteSql = sql.replace(/\$(\d+)/g, (_match, index) => {
          orderedParams.push(params[parseInt(index, 10) - 1]);
          return '?';
        });
        sqliteParams = orderedParams;
      }
      try {
        if (sql.trim().toLowerCase().startsWith('select')) {
          const stmt = db.prepare(sqliteSql);
          return Promise.resolve({ rows: stmt.all(...sqliteParams) });
        }
        const stmt = db.prepare(sqliteSql);
        const info = stmt.run(...sqliteParams);
        return Promise.resolve({ rows: [], lastInsertRowid: info.lastInsertRowid, affectedRows: info.changes });
      } catch (err) {
        return Promise.reject(err);
      }
    }
  };
}

async function req(port, method, path, body = null, headers = {}) {
  return new Promise((resolve) => {
    const request = http.request({
      host: '127.0.0.1',
      port,
      method,
      path,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    }, (res) => {
      let resBody = '';
      res.on('data', (chunk) => { resBody += chunk; });
      res.on('end', () => {
        let json = {};
        try { json = JSON.parse(resBody); } catch (_) {}
        resolve({ status: res.statusCode, json });
      });
    });
    if (body) request.write(JSON.stringify(body));
    request.end();
  });
}

(async () => {
  console.log('Running ZATCA settings route integration tests...');

  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE IF NOT EXISTS integration_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER,
      integration_name TEXT DEFAULT '',
      provider TEXT DEFAULT '',
      api_key TEXT DEFAULT '',
      api_secret TEXT DEFAULT '',
      endpoint_url TEXT DEFAULT '',
      is_enabled INTEGER DEFAULT 0,
      config_json TEXT DEFAULT '',
      last_sync TEXT DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS zatca_invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER,
      invoice_number TEXT DEFAULT '',
      invoice_type TEXT DEFAULT 'Standard',
      seller_name TEXT DEFAULT '',
      seller_vat TEXT DEFAULT '',
      total_with_vat REAL DEFAULT 0,
      vat_amount REAL DEFAULT 0,
      ubl_xml TEXT DEFAULT '',
      xml_hash TEXT DEFAULT '',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      tenant_id INTEGER
    );
    CREATE TABLE IF NOT EXISTS company_settings (
      setting_key TEXT PRIMARY KEY,
      setting_value TEXT DEFAULT ''
    );
  `);

  db.prepare('INSERT INTO company_settings (setting_key, setting_value) VALUES (?, ?)').run('company_name_ar', 'مجمع نما الطبي');
  db.prepare('INSERT INTO company_settings (setting_key, setting_value) VALUES (?, ?)').run('company_name_en', 'Nama Medical Complex');
  db.prepare('INSERT INTO company_settings (setting_key, setting_value) VALUES (?, ?)').run('tax_number', '300000000000003');
  db.prepare('INSERT INTO company_settings (setting_key, setting_value) VALUES (?, ?)').run('cr_number', '1010101010');

  const pool = buildMockPool(db);
  const logAudit = () => {};
  const e10RequireTenant = (req) => req.tenantId;
  const e10IntId = (value) => parseInt(value, 10);
  const e10ZatcaEnabled = () => true;
  const idempotencyGuard = (_req, _res, next) => next();

  const app = express();
  app.use(express.json());

  const requireAuth = (req, _res, next) => {
    req.session = { user: { id: 7, display_name: 'Tester', role: 'Admin' } };
    next();
  };
  const requireRole = () => (_req, _res, next) => next();
  const requireTenantContext = (req, _res, next) => {
    req.tenantId = parseInt(req.headers['x-tenant-id'] || '1', 10);
    next();
  };
  const requireTenantScope = requireTenantContext;

  app.get('/api/settings', requireAuth, async (_req, res) => {
    try {
      const rows = (await pool.query('SELECT * FROM company_settings')).rows;
      const settings = {};
      rows.forEach((row) => {
        settings[row.setting_key] = row.setting_value;
      });
      res.json(settings);
    } catch (_e) {
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.put('/api/settings', requireAuth, requireRole('settings'), async (req, res) => {
    try {
      const updates = req.body;
      for (const [key, value] of Object.entries(updates)) {
        await pool.query('INSERT INTO company_settings (setting_key, setting_value) VALUES ($1, $2) ON CONFLICT (setting_key) DO UPDATE SET setting_value=$2', [key, value]);
      }
      res.json({ success: true });
    } catch (_e) {
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.get('/api/settings/integrations', requireAuth, requireTenantContext, async (req, res) => {
    try {
      const tenantId = req.tenantId;
      const result = await pool.query('SELECT * FROM integration_settings WHERE tenant_id = $1', [tenantId]);
      const rows = result.rows.map((row) => {
        const integrationName = String(row.integration_name || '').toUpperCase();
        if (!['ZATCA', 'NPHIES', 'CBAHI'].includes(integrationName)) return row;
        let parsed = {};
        try { parsed = JSON.parse(row.config_json || '{}'); } catch (_) { parsed = {}; }

        let redactedConfig = parsed;
        if (integrationName === 'ZATCA') redactedConfig = redactZatcaConfig(parsed);
        if (integrationName === 'NPHIES') redactedConfig = redactNphiesConfig(parsed);
        if (integrationName === 'CBAHI') redactedConfig = redactCbahiConfig(parsed);

        const safeRow = {
          ...row,
          config_json: JSON.stringify(redactedConfig)
        };
        if (integrationName === 'ZATCA' || integrationName === 'NPHIES') {
          safeRow.api_key = row.api_key ? '[REDACTED]' : '';
          safeRow.api_secret = row.api_secret ? '[REDACTED]' : '';
        }
        return safeRow;
      });
      res.json(rows);
    } catch (_e) {
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.post('/api/settings/integrations', requireAuth, requireTenantContext, async (req, res) => {
    try {
      const tenantId = req.tenantId;
      const { integration_name, provider, api_key, api_secret, endpoint_url, is_enabled, config_json } = req.body;
      if (!integration_name) return res.status(400).json({ error: 'Missing integration_name' });
      const normalizedName = String(integration_name).trim().toUpperCase();
      if (!normalizedName) return res.status(400).json({ error: 'Missing integration_name' });

      let parsedConfig = {};
      if (typeof config_json === 'string' || config_json == null) {
        try {
          parsedConfig = JSON.parse(config_json || '{}');
        } catch (_) {
          return res.status(400).json({ error: 'Invalid config_json format' });
        }
      } else if (typeof config_json === 'object') {
        parsedConfig = config_json;
      } else {
        return res.status(400).json({ error: 'Invalid config_json format' });
      }

      let configJsonToStore = JSON.stringify(parsedConfig || {});
      if (normalizedName === 'ZATCA') {
        const requiresCsr = parseInt(is_enabled, 10) === 1;
        const validation = validateZatcaConfig(parsedConfig, {
          requireCsrProfile: requiresCsr,
          requireKeys: false
        });
        if (!validation.ok) {
          return res.status(422).json({ error: 'Invalid ZATCA config_json', codes: validation.errors });
        }
        configJsonToStore = JSON.stringify(normalizeZatcaConfig(validation.normalized));
      } else if (normalizedName === 'NPHIES') {
        const requiresProfile = parseInt(is_enabled, 10) === 1;
        const validation = validateNphiesConfig(parsedConfig, { requireProfile: requiresProfile });
        if (!validation.ok) {
          return res.status(422).json({ error: 'Invalid NPHIES config_json', codes: validation.errors });
        }
        configJsonToStore = JSON.stringify(normalizeNphiesConfig(validation.normalized));
      } else if (normalizedName === 'CBAHI') {
        const requiresProfile = parseInt(is_enabled, 10) === 1;
        const validation = validateCbahiConfig(parsedConfig, { requireProfile: requiresProfile });
        if (!validation.ok) {
          return res.status(422).json({ error: 'Invalid CBAHI config_json', codes: validation.errors });
        }
        configJsonToStore = JSON.stringify(normalizeCbahiConfig(validation.normalized));
      }

      const exists = (await pool.query('SELECT id, api_key, api_secret FROM integration_settings WHERE tenant_id = $1 AND UPPER(integration_name) = $2', [tenantId, normalizedName])).rows[0];
      const nextApiKey = (typeof api_key === 'string' && api_key.trim() && api_key !== '***REDACTED***') ? api_key.trim() : (exists?.api_key || '');
      const nextApiSecret = (typeof api_secret === 'string' && api_secret.trim() && api_secret !== '***REDACTED***') ? api_secret.trim() : (exists?.api_secret || '');

      if (exists) {
        await pool.query(
          `UPDATE integration_settings
           SET provider = $1, api_key = $2, api_secret = $3, endpoint_url = $4, is_enabled = $5, config_json = $6, last_sync = 'MOCK_TIMESTAMP'
           WHERE tenant_id = $7 AND UPPER(integration_name) = $8`,
          [provider, nextApiKey, nextApiSecret, endpoint_url, parseInt(is_enabled, 10) || 0, configJsonToStore, tenantId, normalizedName]
        );
      } else {
        await pool.query(
          `INSERT INTO integration_settings (tenant_id, integration_name, provider, api_key, api_secret, endpoint_url, is_enabled, config_json, last_sync)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'MOCK_TIMESTAMP')`,
          [tenantId, normalizedName, provider, nextApiKey, nextApiSecret, endpoint_url, parseInt(is_enabled, 10) || 0, configJsonToStore]
        );
      }

      logAudit(req.session.user?.id, req.session.user?.display_name, 'UPDATE_INTEGRATION_SETTINGS', 'Settings', `Updated integration ${normalizedName} settings`, req.ip);
      res.json({ success: true });
    } catch (_e) {
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.post('/api/zatca/submit', requireAuth, requireRole('finance', 'accounts'), requireTenantScope, idempotencyGuard, async (req, res) => {
    try {
      const tenantId = e10RequireTenant(req);
      const invoiceId = e10IntId(req.body.invoice_id);
      if (!invoiceId) return res.status(422).json({ error: 'Invalid invoice_id' });

      const z = (await pool.query('SELECT * FROM zatca_invoices WHERE invoice_id=$1 AND tenant_id=$2', [invoiceId, tenantId])).rows[0];
      if (!z) return res.status(404).json({ error: 'E-invoice not generated yet' });

      const settings = (await pool.query('SELECT * FROM integration_settings WHERE tenant_id=$1 AND UPPER(integration_name)=$2', [tenantId, 'ZATCA'])).rows[0];
      const integrationEnabled = Boolean(settings && parseInt(settings.is_enabled, 10) === 1);
      const globalEnabled = e10ZatcaEnabled();
      if (!globalEnabled || !integrationEnabled) {
        return res.json({ success: true, clearance_status: 'RECORDED', submission_status: 'Submitted_Mock' });
      }

      if (!settings?.api_key || !settings?.api_secret) {
        return res.status(422).json({
          error: 'ZATCA onboarding incomplete: missing production credentials',
          code: 'ZATCA_ONBOARDING_INCOMPLETE'
        });
      }

      let configJson = {};
      try { configJson = JSON.parse(settings.config_json || '{}'); } catch (_) { configJson = {}; }
      const configValidation = validateZatcaConfig(configJson, {
        requireKeys: true,
        requireCsrProfile: true
      });
      if (!configValidation.ok) {
        return res.status(422).json({
          error: 'Invalid ZATCA configuration',
          codes: configValidation.errors
        });
      }

      res.json({ success: true, clearance_status: 'CLEARED', submission_status: 'Reported' });
    } catch (_e) {
      res.status(500).json({ error: 'Server error' });
    }
  });

  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const port = server.address().port;

  const fullConfig = {
    environment: 'sandbox',
    private_key_pem: '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----',
    public_key_pem: '-----BEGIN PUBLIC KEY-----\nabc\n-----END PUBLIC KEY-----',
    csr_profile: {
      commonName: 'Nama Medical EGS',
      serialNumber: '1-NamaERP|2-1010101010|3-300000000000003',
      organizationIdentifier: '300000000000003',
      commercialRegistrationNumber: '1010101010',
      organizationUnitName: 'Main Branch',
      organizationName: 'Nama Medical',
      countryName: 'SA',
      invoiceType: '1100',
      location: 'Riyadh',
      industry: 'Medical'
    }
  };

  const settingsGetResponse = await req(port, 'GET', '/api/settings');
  ok('GET settings exposes company profile fields used by ZATCA autofill', settingsGetResponse.status === 200 && settingsGetResponse.json.company_name_ar === 'مجمع نما الطبي' && settingsGetResponse.json.company_name_en === 'Nama Medical Complex' && settingsGetResponse.json.tax_number === '300000000000003' && settingsGetResponse.json.cr_number === '1010101010');

  const settingsUpdateResponse = await req(port, 'PUT', '/api/settings', {
    company_name_ar: 'مستشفى نما التخصصي',
    tax_number: '300000000000099',
    cr_number: '1010999999'
  });
  ok('PUT settings updates company profile fields consumed by ZATCA autofill', settingsUpdateResponse.status === 200 && settingsUpdateResponse.json.success === true);

  const settingsGetUpdatedResponse = await req(port, 'GET', '/api/settings');
  ok('GET settings returns updated company profile values after PUT', settingsGetUpdatedResponse.status === 200 && settingsGetUpdatedResponse.json.company_name_ar === 'مستشفى نما التخصصي' && settingsGetUpdatedResponse.json.tax_number === '300000000000099' && settingsGetUpdatedResponse.json.cr_number === '1010999999');

  const saveResponse = await req(port, 'POST', '/api/settings/integrations', {
    integration_name: 'zatca',
    provider: 'ZATCA Sandbox',
    api_key: 'live-csid',
    api_secret: 'live-secret',
    endpoint_url: 'https://gw-fatoora.zatca.gov.sa/e-invoicing',
    is_enabled: 1,
    config_json: fullConfig
  }, { 'x-tenant-id': '1' });
  ok('POST settings accepts enabled ZATCA payload with required business fields', saveResponse.status === 200 && saveResponse.json.success === true);

  const stored = db.prepare('SELECT * FROM integration_settings WHERE tenant_id = 1 AND integration_name = ?').get('ZATCA');
  const storedConfig = JSON.parse(stored.config_json || '{}');
  ok('settings save canonicalizes integration name to uppercase', stored.integration_name === 'ZATCA');
  ok('settings save persists commercial registration in config_json', storedConfig.csr_profile.commercialRegistrationNumber === '1010101010');

  const getResponse = await req(port, 'GET', '/api/settings/integrations', null, { 'x-tenant-id': '1' });
  const returned = getResponse.json.find((row) => row.integration_name === 'ZATCA');
  const returnedConfig = JSON.parse(returned.config_json || '{}');
  ok('GET settings redacts api_key and api_secret', returned.api_key === '[REDACTED]' && returned.api_secret === '[REDACTED]');
  ok('GET settings preserves commercial registration while redacting PEMs', returnedConfig.csr_profile.commercialRegistrationNumber === '1010101010' && returnedConfig.private_key_pem === '***REDACTED***' && returnedConfig.public_key_pem === '***REDACTED***');

  const nphiesSaveResponse = await req(port, 'POST', '/api/settings/integrations', {
    integration_name: 'NPHIES',
    provider: 'NPHIES Sandbox',
    api_key: 'nphies-client-id',
    api_secret: 'nphies-client-secret',
    endpoint_url: 'https://nphies.sa/api/v1',
    is_enabled: 1,
    config_json: {
      fhir_version: 'R4',
      provider_license: 'PRV-12345',
      payer_license: 'PAY-12345',
      eligibility_path: '/CoverageEligibilityRequest',
      prior_auth_path: '/Claim/$prior-auth',
      claim_submit_path: '/Claim/$submit',
      communication_path: '/Communication',
      sandbox_mode: true
    }
  }, { 'x-tenant-id': '1' });
  ok('POST settings accepts enabled NPHIES payload with required profile fields', nphiesSaveResponse.status === 200 && nphiesSaveResponse.json.success === true);

  const nphiesRow = (await req(port, 'GET', '/api/settings/integrations', null, { 'x-tenant-id': '1' })).json
    .find((row) => row.integration_name === 'NPHIES');
  const nphiesCfg = JSON.parse(nphiesRow.config_json || '{}');
  ok('GET settings redacts NPHIES api_key and api_secret', nphiesRow.api_key === '[REDACTED]' && nphiesRow.api_secret === '[REDACTED]');
  ok('GET settings preserves normalized NPHIES profile values', nphiesCfg.fhir_version === 'R4' && nphiesCfg.provider_license === 'PRV-12345');

  const nphiesInvalidResponse = await req(port, 'POST', '/api/settings/integrations', {
    integration_name: 'NPHIES',
    provider: 'NPHIES Broken',
    is_enabled: 1,
    config_json: {
      fhir_version: 'R5',
      provider_license: '',
      payer_license: '',
      eligibility_path: 'CoverageEligibilityRequest'
    }
  }, { 'x-tenant-id': '1' });
  ok('POST settings rejects enabled NPHIES config with missing profile and invalid paths/version',
    nphiesInvalidResponse.status === 422 &&
    Array.isArray(nphiesInvalidResponse.json.codes) &&
    nphiesInvalidResponse.json.codes.includes('NPHIES_UNSUPPORTED_FHIR_VERSION') &&
    nphiesInvalidResponse.json.codes.includes('NPHIES_MISSING_PROVIDER_LICENSE'));

  const cbahiSaveResponse = await req(port, 'POST', '/api/settings/integrations', {
    integration_name: 'CBAHI',
    provider: 'CBAHI Program',
    endpoint_url: 'https://portal.cbahi.gov.sa/',
    is_enabled: 1,
    config_json: {
      standards_version: 'CBAHI-HOSPITAL-2026',
      facility_license_number: 'MOH-7654321',
      self_assessment_frequency: 'quarterly',
      sentinel_reporting_enabled: true
    }
  }, { 'x-tenant-id': '1' });
  ok('POST settings accepts enabled CBAHI payload with required profile fields', cbahiSaveResponse.status === 200 && cbahiSaveResponse.json.success === true);

  const cbahiInvalidResponse = await req(port, 'POST', '/api/settings/integrations', {
    integration_name: 'CBAHI',
    provider: 'CBAHI Broken',
    is_enabled: 1,
    config_json: {
      standards_version: '',
      facility_license_number: '',
      self_assessment_frequency: 'weekly'
    }
  }, { 'x-tenant-id': '1' });
  ok('POST settings rejects enabled CBAHI config with missing profile and invalid frequency',
    cbahiInvalidResponse.status === 422 &&
    Array.isArray(cbahiInvalidResponse.json.codes) &&
    cbahiInvalidResponse.json.codes.includes('CBAHI_MISSING_STANDARDS_VERSION') &&
    cbahiInvalidResponse.json.codes.includes('CBAHI_INVALID_ASSESSMENT_FREQUENCY'));

  const updateResponse = await req(port, 'POST', '/api/settings/integrations', {
    integration_name: 'ZATCA',
    provider: 'ZATCA Production',
    api_key: '***REDACTED***',
    api_secret: '***REDACTED***',
    endpoint_url: 'https://prod.zatca.example',
    is_enabled: 1,
    config_json: JSON.stringify(fullConfig)
  }, { 'x-tenant-id': '1' });
  ok('POST settings preserves credentials when UI sends redacted placeholders', updateResponse.status === 200);
  const updated = db.prepare('SELECT * FROM integration_settings WHERE tenant_id = 1 AND integration_name = ?').get('ZATCA');
  ok('stored credentials remain unchanged after placeholder update', updated.api_key === 'live-csid' && updated.api_secret === 'live-secret');

  const invalidSaveResponse = await req(port, 'POST', '/api/settings/integrations', {
    integration_name: 'ZATCA',
    provider: 'Broken ZATCA',
    is_enabled: 1,
    config_json: {
      environment: 'sandbox',
      csr_profile: {
        commonName: 'Broken',
        serialNumber: '1-NamaERP|2-CR|3-VAT',
        organizationIdentifier: '300000000000003',
        commercialRegistrationNumber: '',
        organizationName: 'Nama Medical'
      }
    }
  }, { 'x-tenant-id': '1' });
  ok('POST settings rejects enabled ZATCA config without commercial registration', invalidSaveResponse.status === 422 && Array.isArray(invalidSaveResponse.json.codes) && invalidSaveResponse.json.codes.includes('MISSING_CSR_COMMERCIAL_REGISTRATION'));

  const invalidSerialSaveResponse = await req(port, 'POST', '/api/settings/integrations', {
    integration_name: 'ZATCA',
    provider: 'Broken Serial ZATCA',
    is_enabled: 1,
    config_json: {
      environment: 'sandbox',
      csr_profile: {
        commonName: 'Broken',
        serialNumber: 'EGS-001',
        organizationIdentifier: '300000000000003',
        commercialRegistrationNumber: '1010101010',
        organizationName: 'Nama Medical'
      }
    }
  }, { 'x-tenant-id': '1' });
  ok('POST settings rejects enabled ZATCA config with invalid CSR serial format', invalidSerialSaveResponse.status === 422 && Array.isArray(invalidSerialSaveResponse.json.codes) && invalidSerialSaveResponse.json.codes.includes('INVALID_CSR_SERIAL_NUMBER_FORMAT'));

  const placeholderSerialSaveResponse = await req(port, 'POST', '/api/settings/integrations', {
    integration_name: 'ZATCA',
    provider: 'Placeholder Serial ZATCA',
    is_enabled: 1,
    config_json: {
      environment: 'sandbox',
      csr_profile: {
        commonName: 'Broken',
        serialNumber: '1-NamaERP|2-CR|3-VAT',
        organizationIdentifier: '300000000000003',
        commercialRegistrationNumber: '1010101010',
        organizationName: 'Nama Medical'
      }
    }
  }, { 'x-tenant-id': '1' });
  ok('POST settings rejects enabled ZATCA config with placeholder CSR serial tokens', placeholderSerialSaveResponse.status === 422 && Array.isArray(placeholderSerialSaveResponse.json.codes) && placeholderSerialSaveResponse.json.codes.includes('INVALID_CSR_SERIAL_PLACEHOLDER'));

  db.prepare('INSERT INTO zatca_invoices (invoice_id, invoice_number, seller_name, seller_vat, total_with_vat, vat_amount, ubl_xml, xml_hash, tenant_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(11, 'INV-11', 'Nama Medical', '300000000000003', 115, 15, '<Invoice>demo-2</Invoice>', 'hash-demo-2', 3);
  db.prepare('INSERT INTO integration_settings (tenant_id, integration_name, provider, api_key, api_secret, endpoint_url, is_enabled, config_json, last_sync) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(3, 'ZATCA', 'Incomplete Onboarding', '', '', 'https://gw-fatoora.zatca.gov.sa/e-invoicing', 1, JSON.stringify(fullConfig), 'MOCK_TIMESTAMP');

  const onboardingIncompleteResponse = await req(port, 'POST', '/api/zatca/submit', { invoice_id: 11 }, { 'x-tenant-id': '3' });
  ok('submit route returns explicit onboarding-incomplete error when CSID credentials are missing', onboardingIncompleteResponse.status === 422 && onboardingIncompleteResponse.json.code === 'ZATCA_ONBOARDING_INCOMPLETE' && /missing production credentials/i.test(onboardingIncompleteResponse.json.error || ''));

  db.prepare('INSERT INTO zatca_invoices (invoice_id, invoice_number, seller_name, seller_vat, total_with_vat, vat_amount, ubl_xml, xml_hash, tenant_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(10, 'INV-10', 'Nama Medical', '300000000000003', 115, 15, '<Invoice>demo</Invoice>', 'hash-demo', 2);
  db.prepare('INSERT INTO integration_settings (tenant_id, integration_name, provider, api_key, api_secret, endpoint_url, is_enabled, config_json, last_sync) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(2, 'zatca', 'Legacy ZATCA', 'legacy-csid', 'legacy-secret', 'https://gw-fatoora.zatca.gov.sa/e-invoicing', 1, JSON.stringify({
      environment: 'sandbox',
      private_key_pem: '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----',
      public_key_pem: '-----BEGIN PUBLIC KEY-----\nabc\n-----END PUBLIC KEY-----',
      csr_profile: {
        commonName: 'Legacy EGS',
        serialNumber: '1-NamaERP|2-CR|3-VAT',
        organizationIdentifier: '300000000000003',
        commercialRegistrationNumber: '',
        organizationName: 'Nama Medical'
      }
    }), 'MOCK_TIMESTAMP');

  const submitResponse = await req(port, 'POST', '/api/zatca/submit', { invoice_id: 10 }, { 'x-tenant-id': '2' });
  ok('submit route finds legacy lowercase ZATCA row and fails closed on missing commercial registration', submitResponse.status === 422 && Array.isArray(submitResponse.json.codes) && submitResponse.json.codes.includes('MISSING_CSR_COMMERCIAL_REGISTRATION'));

  db.prepare('INSERT INTO zatca_invoices (invoice_id, invoice_number, seller_name, seller_vat, total_with_vat, vat_amount, ubl_xml, xml_hash, tenant_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(12, 'INV-12', 'Nama Medical', '300000000000003', 115, 15, '<Invoice>demo-3</Invoice>', 'hash-demo-3', 4);
  db.prepare('INSERT INTO integration_settings (tenant_id, integration_name, provider, api_key, api_secret, endpoint_url, is_enabled, config_json, last_sync) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(4, 'ZATCA', 'Invalid Serial On Submit', 'csid-4', 'secret-4', 'https://gw-fatoora.zatca.gov.sa/e-invoicing', 1, JSON.stringify({
      environment: 'sandbox',
      private_key_pem: '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----',
      public_key_pem: '-----BEGIN PUBLIC KEY-----\nabc\n-----END PUBLIC KEY-----',
      csr_profile: {
        commonName: 'Nama EGS',
        serialNumber: 'EGS-ONLY',
        organizationIdentifier: '300000000000003',
        commercialRegistrationNumber: '1010101010',
        organizationName: 'Nama Medical'
      }
    }), 'MOCK_TIMESTAMP');

  const submitInvalidSerialResponse = await req(port, 'POST', '/api/zatca/submit', { invoice_id: 12 }, { 'x-tenant-id': '4' });
  ok('submit route fails closed when enabled ZATCA config has invalid CSR serial format', submitInvalidSerialResponse.status === 422 && Array.isArray(submitInvalidSerialResponse.json.codes) && submitInvalidSerialResponse.json.codes.includes('INVALID_CSR_SERIAL_NUMBER_FORMAT'));

  db.prepare('INSERT INTO zatca_invoices (invoice_id, invoice_number, seller_name, seller_vat, total_with_vat, vat_amount, ubl_xml, xml_hash, tenant_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(13, 'INV-13', 'Nama Medical', '300000000000003', 115, 15, '<Invoice>demo-4</Invoice>', 'hash-demo-4', 5);
  db.prepare('INSERT INTO integration_settings (tenant_id, integration_name, provider, api_key, api_secret, endpoint_url, is_enabled, config_json, last_sync) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(5, 'ZATCA', 'Placeholder Serial On Submit', 'csid-5', 'secret-5', 'https://gw-fatoora.zatca.gov.sa/e-invoicing', 1, JSON.stringify({
      environment: 'sandbox',
      private_key_pem: '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----',
      public_key_pem: '-----BEGIN PUBLIC KEY-----\nabc\n-----END PUBLIC KEY-----',
      csr_profile: {
        commonName: 'Nama EGS',
        serialNumber: '1-NamaERP|2-CR|3-VAT',
        organizationIdentifier: '300000000000003',
        commercialRegistrationNumber: '1010101010',
        organizationName: 'Nama Medical'
      }
    }), 'MOCK_TIMESTAMP');

  const submitPlaceholderSerialResponse = await req(port, 'POST', '/api/zatca/submit', { invoice_id: 13 }, { 'x-tenant-id': '5' });
  ok('submit route fails closed when enabled ZATCA config has placeholder CSR serial tokens', submitPlaceholderSerialResponse.status === 422 && Array.isArray(submitPlaceholderSerialResponse.json.codes) && submitPlaceholderSerialResponse.json.codes.includes('INVALID_CSR_SERIAL_PLACEHOLDER'));

  server.close();
  console.log(`ZATCA settings route integration tests: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})();