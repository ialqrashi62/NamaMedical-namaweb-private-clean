const fs = require('fs');
const path = require('path');

const serverPath = path.join(__dirname, 'server.js');
const source = fs.readFileSync(serverPath, 'utf8');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

assert(/function normalizeRoleName\(role\)/.test(source), 'normalizeRoleName helper is missing');
assert(/function canReviewOvr\(user\)[\s\S]*?Quality Manager[\s\S]*?Infection Control[\s\S]*?Director/.test(source), 'OVR reviewer role guard is incomplete');
assert(/function canViewAdminAuditTrail\(user\)[\s\S]*?Admin[\s\S]*?IT[\s\S]*?Quality Manager[\s\S]*?Director/.test(source), 'Audit Trail role guard is incomplete');

assert(/app\.get\('\/api\/incidents\/ovr'[\s\S]*?const isPrivileged = canReviewOvr\(user\)/.test(source), 'OVR list route does not use canReviewOvr');
assert(/app\.put\('\/api\/incidents\/ovr\/:id'[\s\S]*?!canReviewOvr\(user\)/.test(source), 'OVR update route does not use canReviewOvr');
assert(/const sacValue = sac_classification \|\| req\.body\.severity \|\| 'SAC4'/.test(source), 'OVR post route does not preserve UI severity alias');

assert(/app\.get\('\/api\/admin\/audit-log'[\s\S]*?!canViewAdminAuditTrail\(user\)/.test(source), 'Admin audit-log route does not use audit trail guard');
assert(/app\.get\('\/api\/admin\/audit-trail\/modules'[\s\S]*?canViewAdminAuditTrail\(req\.session\.user\)/.test(source), 'Audit Trail modules route is missing or unguarded');
assert(/app\.get\('\/api\/admin\/audit-trail'[\s\S]*?!canViewAdminAuditTrail\(req\.session\.user\)/.test(source), 'Admin audit-trail route does not use audit trail guard');

console.log('wave0_server_rbac_static_test: PASS');
