const fs = require('fs');
const s = fs.readFileSync('server.js', 'utf8');
let pass = 0, fail = 0;
function chk(name, cond) { if (cond) { pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name); } }
chk('uploadsDir outside public (phi_vault)', s.includes("path.join(__dirname, 'phi_vault', 'radiology')"));
chk('uploadsDir NOT under public', !s.includes("'public', 'uploads', 'radiology'"));
chk('upload registers phi_files', s.includes('INSERT INTO phi_files'));
chk('upload returns guarded path not public', s.includes('`/api/phi-files/${phi.id}`') && !s.includes('`/uploads/radiology/${req.file.filename}`'));
chk('sha256 computed on upload', s.includes("createHash('sha256')"));
chk('guarded route defined', s.includes("app.get('/api/phi-files/:id', requireAuth"));
chk('guarded route 404 when no row (RLS)', /phi_files WHERE id=\$1[\s\S]{0,120}status\(404\)/.test(s));
chk('path-traversal guard (startsWith vaultRoot)', s.includes('resolved.startsWith(vaultRoot'));
chk('id parsed as integer', s.includes('parseInt(req.params.id, 10)') && s.includes('Number.isInteger(id)'));
chk('PHI_FILE_DOWNLOAD audited', s.includes("'PHI_FILE_DOWNLOAD'"));
console.log(`\n${pass}/${pass+fail} PASS`);
process.exit(fail ? 1 : 0);
