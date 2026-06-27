const fs = require('fs');
const s = fs.readFileSync('server.js', 'utf8');
const ce = fs.readFileSync('crypto_envelope.js', 'utf8');
let p = 0, f = 0; const chk = (n, c) => { if (c) { p++; console.log('PASS', n); } else { f++; console.log('FAIL', n); } };
// integration in server.js
chk('crypto_envelope required', s.includes("require('./crypto_envelope')"));
chk('mfa_secret encrypted on enroll (feature-gated)', s.includes('ce.isEnabled() ? ce.encryptString(secret) : secret'));
chk('mfa verify decrypts at-rest secret', s.includes('mfaVerify(ce.decryptString(row.mfa_secret)'));
chk('login 2FA decrypts at-rest secret', s.includes('mfaConsume(uid, ce.decryptString(mfa.mfa_secret)'));
chk('phi upload encrypts at-rest when enabled', s.includes('ce.encrypt(plainBuf)') && s.includes('encrypted = true'));
chk('phi_files INSERT records encrypted flag', s.includes('sha256, encrypted, uploaded_by_user_id'));
chk('phi download decrypts when encrypted', s.includes('if (row.encrypted)') && s.includes('ce.decryptToBuffer(fs.readFileSync(resolved'));
// crypto_envelope module invariants
chk('AES-256-GCM', ce.includes("'aes-256-gcm'"));
chk('DPAPI KEK provider (ProtectedData)', ce.includes('ProtectedData'));
chk('KEK provisioned via stdin (not args/stdout)', ce.includes('input: kek.toString'));
chk('graceful isEnabled() flag', ce.includes('function isEnabled'));
chk('GCM auth tag set/get (integrity)', ce.includes('getAuthTag') && ce.includes('setAuthTag'));
chk('legacy plaintext passthrough on decrypt', ce.includes('if (!isCiphertext(stored)) return'));
console.log(`\n${p}/${p + f} PASS`); process.exit(f ? 1 : 0);
