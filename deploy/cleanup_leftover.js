const fs = require('fs');
const path = require('path');
const sp = path.resolve(__dirname, '../server.js');
let s = fs.readFileSync(sp, 'utf8');

// Remove all leftover lines after last autowire catch, including broken ", require(...)" and stale catch
const lines = s.split('\n');
// Find last 'autowire block' — end marker is the second-to-last [autowire] /api/v4/integrations/sf skipped:
// Actually we want to find all entries like:
// "})(); } catch (e) { console.warn('[autowire] /api/v4/integrations/sf skipped:', e.message); }"
// Then ", require('./routes/dept_router'));" and the duplicate catch

const result = [];
let skipUntil = -1;
for (let i = 0; i < lines.length; i++) {
  const l = lines[i];
  // Pattern: line starts with ", require('./routes/dept_router'));"
  if (/^, require\('\.\/routes\/dept_router'\)\);/.test(l)) {
    // Skip this line, the next "} catch (e) { console.warn('[mount] /api/v4/dept not mounted:', e.message); }", and the next "})(); } catch..."
    skipUntil = i + 2; // skip the catch + the duplicate
    continue;
  }
  // Pattern: "})(); } catch (e) { console.warn('[autowire] /api/v4/integrations/sf skipped:', e.message); }" appearing twice in a row at end
  if (skipUntil > 0 && i <= skipUntil) {
    continue;
  }
  result.push(l);
}
fs.writeFileSync(sp, result.join('\n'));
console.log('cleaned, was', lines.length, 'now', result.length);