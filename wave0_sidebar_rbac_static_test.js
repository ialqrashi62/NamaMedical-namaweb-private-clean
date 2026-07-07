const fs = require('fs');
const path = require('path');

const appJsPath = path.join(__dirname, 'public', 'js', 'app.js');
const source = fs.readFileSync(appJsPath, 'utf8');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const navItemsMatch = source.match(/const NAV_ITEMS = \[([\s\S]*?)\];/);
assert(navItemsMatch, 'NAV_ITEMS array was not found');

const navItemsBody = navItemsMatch[1];
const navItemCount = (navItemsBody.match(/\{\s*icon:/g) || []).length;
assert(navItemCount === 48, `Expected 48 NAV_ITEMS entries, found ${navItemCount}`);

assert(/44:\s*\{[\s\S]*?clinical\.specialties\.view[\s\S]*?\}/.test(source), 'Specialties access rule is missing');
assert(/45:\s*\{[\s\S]*?quality\.ovr\.view[\s\S]*?Quality Manager[\s\S]*?\}/.test(source), 'OVR access rule is missing quality governance permissions');
assert(/46:\s*\{[\s\S]*?audit\.read[\s\S]*?IT[\s\S]*?\}/.test(source), 'Audit Trail access rule is missing audit permissions');

assert(/function canAccessNavItem\(index, options = \{\}\)/.test(source), 'canAccessNavItem guard was not found');
assert(/function buildNav\(\)[\s\S]*?canAccessNavItem\(i\)/.test(source), 'buildNav does not use canAccessNavItem');
assert(/async function navigateTo\(page\)[\s\S]*?canAccessNavItem\(page, \{ allowHidden: true \}\)/.test(source), 'navigateTo does not guard direct navigation');
assert(/const isHiddenDirectAccess = item\.hidden && options\.allowHidden/.test(source), 'Hidden direct access handling is missing');
assert(/en:\s*'Specialties'[\s\S]*?hidden:\s*true/.test(source), 'Specialties must remain hidden from the sidebar');

console.log('wave0_sidebar_rbac_static_test: PASS');
