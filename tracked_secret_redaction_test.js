/**
 * tracked_secret_redaction_test.js
 * ==========================================
 * PHASE 1 C-1B — current-tree secret guard across ALL tracked files in BOTH repos
 * (namaweb + parent NamaMedical): scripts, docs, project_brain, markdown, txt, json, sh, js.
 *
 * Fails if any tracked file contains a hardcoded secret VALUE (password / connection string /
 * JWT or SESSION secret / API key). Detection is by SHAPE — this test embeds NO secret of its own.
 *
 * Per-MATCH allow-list (NOT whole-file exclusions): env-var expansions ($VAR / ${VAR}),
 * obvious placeholders (__CHANGE_ME__, <...>, [REDACTED...], CHANGE_ME, EXAMPLE/placeholder),
 * and the in-source dev-only fallbacks. *_test.js files and *.example files are skipped because
 * they legitimately contain detection patterns / placeholders.
 *
 *   node tracked_secret_redaction_test.js
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const RED = '\x1b[31m', GREEN = '\x1b[32m', BLUE = '\x1b[34m', RESET = '\x1b[0m', BOLD = '\x1b[1m';
let passed = 0, failed = 0; const failures = [];
function assert(cond, name, details = '') {
    if (cond) { console.log(`  ${GREEN}PASS${RESET} — ${name}`); passed++; }
    else { console.log(`  ${RED}FAIL${RESET} — ${name}${details ? ' | ' + details : ''}`); failed++; failures.push({ name, details }); }
}

const repos = [
    { name: 'namaweb', root: __dirname },
    { name: 'parent', root: path.join(__dirname, '..') },
];

// A matched value is acceptable (not a real secret) when it is a var / placeholder / redacted / dev-only.
function isAllowed(v) {
    if (!v) return true;
    const s = String(v).trim().replace(/^['"]|['"]$/g, '');
    if (s === '') return true;
    if (s.length <= 2) return true;                              // 1–2 chars cannot be a real secret (ellipsis/fragments)
    if (s.startsWith('$')) return true;                          // $VAR / ${VAR} / ${{ secrets.X }}
    if (/^[?\-]/.test(s)) return true;                           // ${VAR:?msg} / ${VAR:-default} expansion remainder
    if (/^__.*__$/.test(s)) return true;                         // __CHANGE_ME__
    if (/^[<\[(]/.test(s)) return true;                          // <placeholder> / [REDACTED...] / (code expr
    if (/REDACTED|CHANGE_ME|PLACEHOLDER|EXAMPLE|YOUR_|XXXX|\.\.\.$/i.test(s)) return true;
    if (s === 'dev-only-insecure-secret-change-me') return true; // in-source dev fallback (guarded in prod)
    if (/^postgres:postgres@localhost/.test(s)) return true;     // dev localhost default
    if (s === 'postgres') return true;                           // bare default dev value
    return false;
}

// Detection rules — each returns the captured secret VALUE (group) to test against isAllowed().
const RULES = [
    { what: 'connection-string password', re: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp):\/\/[^:\/\s'"]+:([^@\s'"`]+)@/ig, group: 1 },
    { what: 'SQL WITH PASSWORD literal', re: /\b(?:WITH PASSWORD|IDENTIFIED BY)\s+'([^']+)'/ig, group: 1 },
    { what: 'sqlcmd -P password literal', re: /-P\s+['"]([^'"]+)['"]/g, group: 1 },
    { what: 'JWT/SESSION/API secret assignment', re: /\b(?:JWT_SECRET|SESSION_SECRET|API_KEY|SECRET_KEY|ACCESS_KEY|PRIVATE_KEY|MSSQL_SA_PASSWORD)\b\s*[:=]\s*['"]?([^\s'"#`]+)/ig, group: 1 },
    { what: 'generic *PASSWORD literal', re: /\b[A-Za-z_]*PASSWORD\b\s*[:=]\s*'([^']+)'/ig, group: 1 },
];

const SKIP_EXT = new Set(['.bak', '.db', '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.ico', '.pdf', '.zip', '.gz', '.exe', '.msi', '.dll', '.lock']);
function shouldSkip(rel) {
    if (rel.includes('node_modules/')) return true;
    if (/\.example($|\.)/.test(rel) || /\.env\.example/.test(rel)) return true; // placeholder templates
    if (SKIP_EXT.has(path.extname(rel).toLowerCase())) return true;
    return false;
    // NOTE: *_test.js files are NOT skipped — a real password literal in a test file MUST fail.
    // (Detection-regex source lines are tolerated via isAllowed + isRegexDefLine, never real values.)
}

// A line that is a detection-rule definition (regex source / pattern keyword list), not a real secret.
function isRegexDefLine(line) {
    return /(\\s[*+]|\[\^|new RegExp|re:\s*\/|\.test\(|\.exec\(|\.replace\(|RULES|LITERAL_RULES|\.\.\.RULES)/.test(line);
}

console.log(`\n${BOLD}${BLUE}=== Tracked-Tree Secret Redaction Guard (C-1B) ===${RESET}\n`);

let scanned = 0, totalViolations = 0; const violationDetail = [];
for (const repo of repos) {
    let files = [];
    try { files = execSync('git ls-files', { cwd: repo.root, encoding: 'utf8' }).split(/\r?\n/).filter(Boolean); }
    catch (e) { console.log(`  (skip ${repo.name}: not a git repo)`); continue; }
    for (const rel of files) {
        if (shouldSkip(rel)) continue;
        const isTest = /(^|\/)[^\/]*_test\.js$/.test(rel);
        const abs = path.join(repo.root, rel);
        let st; try { st = fs.statSync(abs); } catch (e) { continue; }
        if (st.size > 2 * 1024 * 1024) continue;               // skip very large data files
        let content; try { content = fs.readFileSync(abs, 'utf8'); } catch (e) { continue; }
        scanned++;
        const lines = content.split(/\r?\n/);
        lines.forEach((line, i) => {
            // skip secret-GENERATION snippets (they derive a value, they don't hardcode one)
            if (/randomBytes|crypto\.|openssl\s+rand|node\s+-e/.test(line)) return;
            // skip detection-rule definition lines (regex sources / pattern keyword lists are not secrets)
            if (isRegexDefLine(line)) return;
            for (const rule of RULES) {
                rule.re.lastIndex = 0;
                let m;
                while ((m = rule.re.exec(line)) !== null) {
                    const val = m[rule.group];
                    if (isAllowed(val)) continue;
                    // In *_test.js, short fixtures (wrong-password / validation inputs, <16 chars) are
                    // legitimate test DATA, NOT secrets — but credential-grade values (>=16 chars, e.g. a
                    // real DB password / session secret / API key) STILL fail even inside a test file.
                    const clean = String(val).trim().replace(/^['"]|['"]$/g, '');
                    if (isTest && clean.length < 16) continue;
                    totalViolations++;
                    violationDetail.push(`${repo.name}:${rel}:${i + 1} (${rule.what})`);
                }
            }
        });
    }
}

assert(scanned > 0, 'tracked files were scanned across both repos', `scanned ${scanned} files`);
if (totalViolations > 0) {
    console.log(`  ${RED}Violations:${RESET}`);
    violationDetail.slice(0, 50).forEach(v => console.log(`    - ${v}`));
}
assert(totalViolations === 0, 'ZERO hardcoded secret values in the tracked tree', `${totalViolations} violation(s)`);

console.log(`\n${BOLD}Result: ${passed} passed, ${failed} failed (scanned ${scanned} tracked files)${RESET}`);
if (failed > 0) { process.exit(1); }
process.exit(0);
