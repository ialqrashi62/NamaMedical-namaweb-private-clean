const fs = require('fs');
const path = require('path');

const appJs = fs.readFileSync(path.join(__dirname, 'public', 'js', 'app.js'), 'utf8');
const ordersJs = fs.readFileSync(path.join(__dirname, 'orders.js'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(!appJs.includes('/ api / consent - forms'), 'Broken spaced consent API URL is still present');
assert(/async function renderConsentForms\(el\)[\s\S]*?\/api\/consent-forms\/templates\/list/.test(appJs), 'Consent page does not load real templates');
assert(/id="cfTemplate"[\s\S]*?loadConsentTemplate\(\)/.test(appJs), 'Consent template selector is missing');
assert(/id="cfSignSelect"[\s\S]*?loadConsentForSign\(\)/.test(appJs), 'Consent signing selector is missing');
assert(/API\.get\(`\/api\/consent-forms\/\$\{fid\}`\)/.test(appJs), 'Consent load URL is not fixed');
assert(/API\.put\(`\/api\/consent-forms\/\$\{fid\}\/sign`/.test(appJs), 'Consent sign URL is not fixed');

assert(/async function renderBloodBank\(el\)[\s\S]*?Promise\.allSettled/.test(appJs), 'Blood Bank does not use resilient loading');
assert(/bbLoadErrors/.test(appJs), 'Blood Bank missing partial-load error notice');

assert(/async function renderPatientAccounts\(el\)\s*\{\s*const content = el;/.test(appJs), 'Patient Accounts content binding is missing');

assert(/const orderTypeMeta = \{[\s\S]*?lab:[\s\S]*?rad:[\s\S]*?med:[\s\S]*?consult:/.test(appJs), 'CPOE order type metadata is missing');
assert(/const statusRank = \{ active: 1, pending: 2, completed: 3, cancelled: 4 \}/.test(appJs), 'CPOE status ordering is missing');
assert(/item_summary/.test(appJs), 'CPOE UI does not render item_summary');
assert(/Order placed using legacy workflow/.test(appJs), 'CPOE legacy workflow fallback is missing');

assert(/STRING_AGG\(NULLIF\(oi\.catalog_ref, ''\), ', ' ORDER BY oi\.id\)/.test(ordersJs), 'Orders API does not aggregate item_summary');
assert(/COUNT\(oi\.id\), 0\)::int AS item_count/.test(ordersJs), 'Orders API does not expose item_count');
assert(/function isMissingRelationError\(e\)/.test(ordersJs), 'Orders API missing relation fallback guard');
assert(/async function listLegacyOrders/.test(ordersJs), 'Orders API missing legacy order fallback');

console.log('wave0_workflow_repairs_static_test: PASS');
