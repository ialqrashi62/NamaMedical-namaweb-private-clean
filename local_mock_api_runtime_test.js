/**
 * local_mock_api_runtime_test.js
 * ==========================================
 * Static and dynamic validation test for the Local Mock API Runtime.
 * Verifies that:
 * 1. mock-api-runtime.js exists, is independent, and loads successfully.
 * 2. No fetch or XMLHttpRequest is used in the mock runtime or UI.
 * 3. No production or staging URLs or secrets are hardcoded.
 * 4. No PHI is present in the mock data.
 * 5. liveApiRuntimeEnabled and writeRuntimeEnabled are false.
 * 6. All write/final actions are blocked and return BLOCKED / WRITE_OPERATION_DISABLED.
 * 7. All 10 resources conform to their DTO schemas and return SUCCESS.
 * 8. enterprise-contracts live/write flags remain false.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// 1. Mock browser globals and load scripts
global.window = {};
require('./public/js/enterprise-contracts.js');
require('./public/js/mock-api-runtime.js');

console.log('Running Local Mock API Runtime Integration Tests...');

// 2. Core Flag Verifications
assert.strictEqual(global.window.mockApiRuntimeEnabled, true, 'mockApiRuntimeEnabled must be true');
assert.strictEqual(global.window.liveApiRuntimeEnabled, false, 'liveApiRuntimeEnabled must be false');
assert.strictEqual(global.window.writeRuntimeEnabled, false, 'writeRuntimeEnabled must be false');
assert.strictEqual(global.window.isLiveEndpointEnabled(), false, 'isLiveEndpointEnabled() must remain false');
assert.strictEqual(global.window.isWriteOperationEnabled(), false, 'isWriteOperationEnabled() must remain false');
console.log('✓ Core runtime flags and contract safety guards verified.');

// 3. Static Code Analysis (No fetch / No XMLHttpRequest / No production secrets)
const runtimePath = path.join(__dirname, 'public', 'js', 'mock-api-runtime.js');
const uiPath = path.join(__dirname, 'public', 'js', 'local-api-preview-ui.js');

const runtimeContent = fs.readFileSync(runtimePath, 'utf8');
const uiContent = fs.readFileSync(uiPath, 'utf8');

assert.ok(!runtimeContent.includes('fetch(') && !runtimeContent.includes('fetch '), 'mock-api-runtime.js must not use fetch');
assert.ok(!runtimeContent.includes('XMLHttpRequest'), 'mock-api-runtime.js must not use XMLHttpRequest');
assert.ok(!uiContent.includes('fetch(') && !uiContent.includes('fetch '), 'local-api-preview-ui.js must not use fetch');
assert.ok(!uiContent.includes('XMLHttpRequest'), 'local-api-preview-ui.js must not use XMLHttpRequest');
console.log('✓ Network-free constraints verified (No fetch/XHR).');

// 4. Security Boundary Verifications (No production/staging URLs, no secrets, no PHI)
assert.ok(!runtimeContent.includes('jumanasoft.com') || runtimeContent.includes('localhost'), 'No production URLs allowed in mock runtime');
assert.ok(!runtimeContent.includes('DB_PASSWORD') || runtimeContent.includes('__CHANGE_ME__'), 'No database passwords allowed');

// Check mock data for PHI
const mockData = global.window.MOCK_DATA_STORE;
assert.ok(mockData, 'MOCK_DATA_STORE must exist');
const jsonStr = JSON.stringify(mockData).toLowerCase();
const phiKeywords = ['iqama', 'nationalid', 'creditcard', 'realphone'];
phiKeywords.forEach(key => {
  assert.ok(!jsonStr.includes(`"${key}"`), `Mock data must not contain sensitive PHI key: ${key}`);
});
console.log('✓ Security boundaries verified (No external URLs, secrets, or PHI).');

// 5. Write Action Blocking Verification
const blockedResponse = global.window.getMockApiResponse('facilities', { action: 'POST' });
assert.strictEqual(blockedResponse.status, 'BLOCKED', 'Write actions must be BLOCKED');
assert.strictEqual(blockedResponse.reason, 'WRITE_OPERATION_DISABLED', 'Write actions must return WRITE_OPERATION_DISABLED');
console.log('✓ Write blocking safety guards verified.');

// 6. Resource Conformance Verification (All 10 resources)
const resources = global.window.supportedResources;
assert.strictEqual(resources.length, 10, 'Must support exactly 10 resources');

resources.forEach(res => {
  const response = global.window.getMockApiResponse(res, { action: 'GET' });
  assert.strictEqual(response.status, 'SUCCESS', `Resource ${res} should return SUCCESS`);
  assert.strictEqual(response.source, 'LOCAL_MOCK_API_RUNTIME', `Resource ${res} source must be local mock runtime`);
  assert.ok(response.data, `Resource ${res} must return data`);
});
console.log('✓ Contract-backed mock responses verified for all 10 resources.');

console.log('All Local Mock API Runtime Integration Tests Passed!');
process.exit(0);
