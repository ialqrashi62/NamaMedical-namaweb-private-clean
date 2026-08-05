const fs = require('fs');
const path = require('path');
const sp = path.resolve(__dirname, '../server.js');
let s = fs.readFileSync(sp, 'utf8');
// Remove duplicate dept mounts (lines starting with ", require('./routes/dept_router'))" or duplicate app.use)
// Strategy: find every line that is just `, require('./routes/dept_router'));` and remove it + the line after if it's a catch
const lines = s.split('\n');
const out = [];
for (let i = 0; i < lines.length; i++) {
  const l = lines[i];
  if (/^, require\('\.\/routes\/dept_router'\)\);/.test(l)) {
    // skip this and the next if it's a catch
    if (i + 1 < lines.length && /catch \(e\) \{ console\.warn\('\[mount\] \/api\/v4\/dept not mounted:/.test(lines[i + 1])) {
      i++; // skip catch
    }
    continue;
  }
  // Skip duplicate catch that follows a Salesforce autowire catch
  if (/^}\)(); \} catch \(e\) \{ console\.warn\('\[autowire\] \/api\/v4\/integrations\/sf skipped:', e\.message\); \}/.test(l)) {
    if (out.length > 0 && /\)(); \} catch \(e\) \{ console\.warn\('\[autowire\] \/api\/v4\/integrations\/sf skipped:', e\.message\); \}/.test(out[out.length - 1])) {
      continue; // skip duplicate
    }
  }
  out.push(l);
}
fs.writeFileSync(sp, out.join('\n'));
console.log('lines:', lines.length, '→', out.length);