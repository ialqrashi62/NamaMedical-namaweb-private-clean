const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const Autowire = require('./autowire');
const { execSync } = require('child_process');

// Routes list (must match ROUTES_V21, V22, V23)
const ROUTES = [
  // ROUTES_V21 — 8
  { module: './routes/bi', base: '/api/v4/bi', role: 'doctor' },
  { module: './routes/voice', base: '/api/v4/voice', role: 'doctor' },
  { module: './routes/dr', base: '/api/v4/dr', role: 'doctor' },
  { module: './routes/trials', base: '/api/v4/trials', role: 'researcher' },
  { module: './routes/populationHealth', base: '/api/v4/population', role: 'doctor' },
  { module: './routes/salesforce', base: '/api/v4/salesforce', role: 'admin' },
  { module: './routes/mobile', base: '/api/v4/mobile', role: 'any_authed' },
  { module: './routes/homeHealth', base: '/api/v4/homeHealth', role: 'nurse_home' },
  // ROUTES_V22 — 10
  { module: './routes/telehealth', base: '/api/v4/telehealth', role: 'doctor' },
  { module: './routes/genomic', base: '/api/v4/genomic', role: 'specialist' },
  { module: './routes/compounding', base: '/api/v4/compounding', role: 'pharmacist' },
  { module: './routes/oncology', base: '/api/v4/oncology', role: 'oncologist' },
  { module: './routes/cardiology', base: '/api/v4/cardiology', role: 'cardiologist' },
  { module: './routes/er', base: '/api/v4/er', role: 'doctor' },
  { module: './routes/surgery', base: '/api/v4/surgery', role: 'doctor' },
  { module: './routes/icu', base: '/api/v4/icu', role: 'doctor' },
  { module: './routes/anesthesia', base: '/api/v4/anesthesia', role: 'anesthesiologist' },
  { module: './routes/inpatient', base: '/api/v4/inpatient', role: 'doctor' },
  // ROUTES_V23 — 10
  { module: './routes/pgx', base: '/api/v4/pgx', role: 'doctor' },
  { module: './routes/infection', base: '/api/v4/infection', role: 'quality' },
  { module: './routes/quality', base: '/api/v4/quality', role: 'quality' },
  { module: './routes/him', base: '/api/v4/him', role: 'doctor' },
  { module: './routes/specialist', base: '/api/v4/specialist', role: 'specialist' },
  { module: './routes/researcher', base: '/api/v4/researcher', role: 'researcher' },
  { module: './routes/integrative', base: '/api/v4/integrative', role: 'doctor' },
  { module: './routes/nephrology', base: '/api/v4/nephrology', role: 'doctor' },
  { module: './routes/radiology_adv', base: '/api/v4/radiologyAdv', role: 'radiologist' },
  { module: './routes/pathology', base: '/api/v4/pathology', role: 'doctor' },
];

// First strip the existing autowire block
const serverPath = path.resolve(__dirname, '..', 'server.js');
let src = fs.readFileSync(serverPath, 'utf8');

// Find the autowire marker block and remove it
const marker = '// ===== autowire_all_v23';
const idx = src.indexOf(marker);
if (idx > 0) {
  // Walk back to find the start of the banner comment
  const before = src.lastIndexOf('\n// ===== ', idx);
  const cutFrom = before > 0 ? before + 1 : idx;
  // Find the end: search for the end of the autowire block (no clear marker, find next '// =' or end)
  // Actually find the mount sequence end
  // Heuristic: find next blank line followed by non-mount code
  let cutTo = src.length;
  // Find '})(); } catch' — pattern at end of each mount block; the autowire block ends with multiple of these
  // Easier: find the line where the autowire stops being added.
  // Use: find the start of the last '})(); } catch' for last route
  const lastRouteEnd = src.lastIndexOf('})(); } catch (e) { console.warn(', cutTo);
  // But also need to find the end of that line
  const eol = src.indexOf('\n', lastRouteEnd);
  cutTo = eol > 0 ? eol + 1 : src.length;
  // Verify: between cutFrom and cutTo should be autowire content
  const slice = src.slice(cutFrom, cutTo);
  if (slice.includes('autowire_all_v23')) {
    src = src.slice(0, cutFrom) + src.slice(cutTo);
    console.log('[remount] stripped old autowire block: lines', (slice.split('\n').length));
  } else {
    console.warn('[remount] marker not in slice, aborting');
    process.exit(1);
  }
}

fs.writeFileSync(serverPath, src);

// Backup
fs.writeFileSync(serverPath + '.pre_remount2.bak', fs.readFileSync(serverPath));

// Now mount
const res = Autowire.mount({
  serverPath,
  routes: ROUTES,
  anchor: "app.use('/api/v4/dept', require('./routes/dept_router'));\r\n} catch (e) { console.warn('[mount] /api/v4/dept not mounted:', e.message); }",
  label: 'autowire_all_v24',
});

console.log('[remount]', JSON.stringify(res, null, 2));