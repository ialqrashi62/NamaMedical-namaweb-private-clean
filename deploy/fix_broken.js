const fs = require('fs');
const path = require('path');
const sp = path.resolve(__dirname, '../server.js');
let s = fs.readFileSync(sp, 'utf8');

// Remove the broken ", dept_api_v4);" line and the duplicate dept mount
// Find line starting with ", dept_api_v4);"
s = s.replace(/^, dept_api_v4\);\n/m, '');
console.log('removed broken line');
// Remove the duplicate "try { app.use('/api/v4/dept', require('./routes/dept_router')); }" line that sits after
// The current 20941 has the correct form, so we leave it.
// But if there's a leftover from a previous mount, the block has two of them. Let me count:
const matches = (s.match(/require\('\.\/routes\/dept_router'\)/g) || []);
console.log('dept_router occurrences:', matches.length);
if (matches.length > 1) {
  // Remove duplicates: keep only the first one
  let count = 0;
  s = s.replace(/try \{ app\.use\('\/api\/v4\/dept', require\('\.\/routes\/dept_router'\)\); \} catch \(e\) \{ console\.warn\('\[mount\] \/api\/v4\/dept not mounted:', e\.message\); \}\n/g, () => {
    count++;
    return count === 1 ? matches[0] + '\n' : '';
  });
  console.log('deduped, kept first');
}

fs.writeFileSync(sp, s);
console.log('done');