// A3 — at-rest envelope encryption (AES-256-GCM) with a pluggable KEK provider.
// Phase 1 KEK provider = Windows DPAPI (CurrentUser): the 32-byte KEK is stored ONLY as a
// DPAPI-protected blob on disk (path in env NAMA_KEK_PATH, outside git). The plaintext KEK is
// derived in-memory once (lazy) by unprotecting the blob, then cached. Never logged/printed.
// Graceful: if no KEK is configured, isEnabled()=false and callers store/serve plaintext (no outage).
const fs = require('fs');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const PREFIX = 'ENCv1';
let _kek = null; // cached plaintext KEK (Buffer, 32 bytes) — process memory only

function kekPath() { return process.env.NAMA_KEK_PATH || ''; }

// is at-rest encryption configured & available?
function isEnabled() {
    const p = kekPath();
    return !!p && fs.existsSync(p);
}

// lazy-load the KEK by DPAPI-unprotecting the blob (PowerShell, CurrentUser). Cached. Throws on failure.
function loadKEK() {
    if (_kek) return _kek;
    const p = kekPath();
    if (!p || !fs.existsSync(p)) throw new Error('KEK blob not available');
    const ps = "$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Security; "
        + "$b=[IO.File]::ReadAllBytes($env:NAMA_KEK_PATH); "
        + "$k=[Security.Cryptography.ProtectedData]::Unprotect($b,$null,'CurrentUser'); "
        + "[Console]::Out.Write([Convert]::ToBase64String($k))";
    const out = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps],
        { env: process.env, encoding: 'utf8', windowsHide: true });
    const kek = Buffer.from(String(out).trim(), 'base64');
    if (kek.length !== 32) throw new Error('KEK invalid length');
    _kek = kek;
    return _kek;
}

// encrypt a Buffer/string -> compact string "ENCv1:iv:tag:ct" (base64 parts)
function encrypt(plain) {
    const buf = Buffer.isBuffer(plain) ? plain : Buffer.from(String(plain), 'utf8');
    const kek = loadKEK();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', kek, iv);
    const ct = Buffer.concat([cipher.update(buf), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${PREFIX}:${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`;
}

function isCiphertext(s) { return typeof s === 'string' && s.startsWith(PREFIX + ':'); }

// decrypt "ENCv1:..." -> Buffer. If not ciphertext, return the value as a Buffer (legacy plaintext passthrough).
function decryptToBuffer(stored) {
    if (!isCiphertext(stored)) return Buffer.from(stored == null ? '' : String(stored), 'utf8');
    const [, ivB64, tagB64, ctB64] = stored.split(':');
    const kek = loadKEK();
    const decipher = crypto.createDecipheriv('aes-256-gcm', kek, Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]);
}

// string helpers (for secrets like mfa_secret)
function encryptString(s) { return encrypt(s); }
function decryptString(stored) { return decryptToBuffer(stored).toString('utf8'); }

// one-time provisioning: generate a 32-byte KEK and write it ONLY as a DPAPI-protected blob to blobPath.
// The plaintext KEK is passed to PowerShell via stdin (never args/stdout), and is never printed/returned.
function provisionKEK(blobPath) {
    const kek = crypto.randomBytes(32);
    const ps = "$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Security; "
        + "$in=[Console]::In.ReadToEnd().Trim(); $k=[Convert]::FromBase64String($in); "
        + "$p=[Security.Cryptography.ProtectedData]::Protect($k,$null,'CurrentUser'); "
        + "[IO.File]::WriteAllBytes($env:NAMA_KEK_BLOB_OUT,$p)";
    execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps],
        { env: { ...process.env, NAMA_KEK_BLOB_OUT: blobPath }, input: kek.toString('base64'), windowsHide: true });
    // plaintext KEK leaves scope here; only the protected blob persists. Nothing returned/printed.
    return fs.existsSync(blobPath);
}

module.exports = { isEnabled, isCiphertext, encrypt, encryptString, decryptToBuffer, decryptString, provisionKEK, _resetCacheForTest() { _kek = null; } };
