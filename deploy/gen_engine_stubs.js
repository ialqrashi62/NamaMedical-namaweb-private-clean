'use strict';
// Generate stub initial_assessment.engine files for all engines subdirs.
// Each stub returns a minimal valid response so dept registry can register.

const fs = require('fs');
const path = require('path');

const ENGINES_DIR = path.resolve(__dirname, '../engines');
if (!fs.existsSync(ENGINES_DIR)) {
  console.log('NO engines dir');
  process.exit(0);
}

const subdirs = fs.readdirSync(ENGINES_DIR).filter(d => {
  const full = path.join(ENGINES_DIR, d);
  return fs.existsSync(full) && fs.statSync(full).isDirectory();
});

let created = 0;
let skipped = 0;
for (const d of subdirs) {
  const target = path.join(ENGINES_DIR, d, 'initial_assessment.engine');
  if (fs.existsSync(target)) {
    skipped++;
    continue;
  }
  const banner = `'use strict';
// Auto-generated stub (Wave 6) — ${d}/initial_assessment.engine
// Returns a minimal valid initial assessment for the ${d} department.

const INITIAL_ASSESSMENT = function () {
  return {
    ok: true,
    dept: '${d}',
    note: 'stub initial_assessment',
    fields: [
      { id: 'chief_complaint', type: 'text', required: true },
      { id: 'history_present_illness', type: 'textarea' },
      { id: 'vitals', type: 'vitals_block' },
      { id: 'physical_exam', type: 'textarea' },
      { id: 'assessment', type: 'textarea' },
      { id: 'plan', type: 'textarea' },
    ],
    generated_at: new Date().toISOString(),
  };
};

module.exports = INITIAL_ASSESSMENT;
module.exports.INITIAL_ASSESSMENT = INITIAL_ASSESSMENT;
`;
  fs.writeFileSync(target, banner);
  created++;
}

console.log('created=' + created + ' skipped=' + skipped + ' total=' + subdirs.length);