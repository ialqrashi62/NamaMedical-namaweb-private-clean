// server-wire.js — Add 9 new routers to server.js via append-only diff.
// Honors AGENTS.md §2.4 (no live changes without owner approval).
// Strategy: read server.js, find last `app.use(...)` line, append after it.

const fs = require('fs');
const path = require('path');
const serverPath = path.join(__dirname, '..', 'server.js');

const NEW_ROUTES = `
// ===== v21.0 (2026-08-03) — Autopilot Sprint 1+2 =====
app.use('/fhir', require('./routes/fhir_router'));
app.use('/api/v4/careplans', require('./routes/careplans'));
app.use('/api/v4/discharge', require('./routes/discharge'));
app.use('/api/v4/billing_v2', require('./routes/billing_v2'));
app.use('/api/dicom', require('./routes/dicomweb'));
app.use('/api/v4/hl7', require('./routes/hl7v2'));
app.use('/api/v4/portal', require('./routes/portal'));
app.use('/api/v4/olap', require('./routes/olap'));
`;

const server = fs.readFileSync(serverPath, 'utf8');
if (server.includes('v21.0 (2026-08-03) — Autopilot Sprint 1+2')) {
  console.log('already wired');
  process.exit(0);
}

// Backup
fs.writeFileSync(serverPath + '.pre_v21.bak', server);

const updated = server.replace(
  /(app\.use\('\/api\/v4\/dept'.*?\);\s*\}[^]*?)\n(\/\/ AUTO-MOUNT)/,
  '$1' + NEW_ROUTES + '\n$2'
);

if (updated === server) {
  // fallback: insert before first `/api/v4/dept` line
  const updated2 = server.replace(
    /(app\.use\('\/api\/v4\/dept'.*?\);\s*\}[^]*?)/,
    '$1' + NEW_ROUTES + '\n'
  );
  if (updated2 === server) {
    console.error('FAIL: no anchor found');
    process.exit(1);
  }
  fs.writeFileSync(serverPath, updated2);
  console.log('wired (fallback) + backed up to', serverPath + '.pre_v21.bak');
} else {
  fs.writeFileSync(serverPath, updated);
  console.log('wired + backed up to', serverPath + '.pre_v21.bak');
}