const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const testDir = __dirname;
const hasDocs = fs.existsSync(path.join(__dirname, '../docs'));

// Filter out tests requiring full parent repo (docs) or database schema initialization if docs is missing
const files = fs.readdirSync(testDir).filter(f => {
  if (!f.endsWith('test.js') || f === 'e2e_local_smoke_test.js') return false;
  if (!hasDocs) {
    if (f === 'cross_tenant_catalog_override_test.js' || f === 'cross_tenant_surgery_or_test.js') {
      console.log(`Skipping ${f} (production environment, missing docs schema)`);
      return false;
    }
  }
  return true;
});

console.log(`Found ${files.length} test files to run.`);

let passed = 0;
let failed = 0;
const failures = [];

for (const file of files) {
  try {
    execSync(`node "${path.join(testDir, file)}"`, { stdio: 'ignore', env: process.env });
    passed++;
  } catch (err) {
    failed++;
    failures.push(file);
  }
}

console.log('\n--- TEST SUMMARY ---');
console.log(`Total test files run: ${files.length}`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
if (failures.length > 0) {
  console.log('Failing files:');
  failures.forEach(f => console.log(` - ${f}`));
  process.exit(1);
} else {
  console.log('All tests passed successfully!');
  process.exit(0);
}
