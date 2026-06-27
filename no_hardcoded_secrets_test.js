/**
 * no_hardcoded_secrets_test.js
 * ==========================================
 * PHASE 1 C-1 — guard against hardcoded secrets in tracked deploy/restore shell scripts.
 * Scans the parent repo's *.sh files for password/secret LITERALS (values not sourced from
 * an environment variable). This test embeds NO secret of its own — it only detects the shape
 * of a hardcoded credential and fails if one reappears.
 *
 *   node no_hardcoded_secrets_test.js
 */
const fs = require('fs');
const path = require('path');

const RED = '\x1b[31m', GREEN = '\x1b[32m', BLUE = '\x1b[34m', RESET = '\x1b[0m', BOLD = '\x1b[1m';
let passed = 0, failed = 0; const failures = [];
function assert(cond, name, details = '') {
    if (cond) { console.log(`  ${GREEN}PASS${RESET} — ${name}`); passed++; }
    else { console.log(`  ${RED}FAIL${RESET} — ${name}${details ? ' | ' + details : ''}`); failed++; failures.push({ name, details }); }
}

console.log(`\n${BOLD}${BLUE}=== No Hardcoded Secrets in Deploy Scripts (C-1) ===${RESET}\n`);

const parentRoot = path.join(__dirname, '..');
let shFiles = [];
try { shFiles = fs.readdirSync(parentRoot).filter(f => f.endsWith('.sh')); }
catch (e) { console.log('  (could not read parent repo dir — skipping)'); process.exit(0); }

// Patterns that indicate a hardcoded credential literal (a value NOT starting with a $ expansion).
// We allow:  -P "$VAR"  |  WITH PASSWORD '${VAR}'  |  JWT_SECRET=${VAR}
// We flag:   -P 'literal' |  WITH PASSWORD 'literal' |  JWT_SECRET=literal  |  *_PASSWORD='literal'
const LITERAL_RULES = [
    { re: /-P\s+['"](?!\$)[^'"]+['"]/, what: "sqlcmd -P password literal" },
    { re: /WITH\s+PASSWORD\s+'(?!\$)[^']+'/i, what: "SQL WITH PASSWORD literal" },
    { re: /\b(JWT_SECRET|SESSION_SECRET)\s*=\s*(?!\$)(?!["']?__)[^\s"']+/, what: "JWT/SESSION secret literal" },
    { re: /\b[A-Z_]*PASSWORD\s*=\s*'(?!\$)(?!__)[^']+'/, what: "exported *PASSWORD literal" },
];

let totalFindings = 0;
for (const f of shFiles) {
    let content;
    try { content = fs.readFileSync(path.join(parentRoot, f), 'utf8'); } catch (e) { continue; }
    const lines = content.split(/\r?\n/);
    const hits = [];
    lines.forEach((line, i) => {
        if (/^\s*#/.test(line)) return;            // skip comments
        for (const rule of LITERAL_RULES) {
            if (rule.re.test(line)) hits.push(`${f}:${i + 1} (${rule.what})`);
        }
    });
    totalFindings += hits.length;
    assert(hits.length === 0, `no hardcoded secret in ${f}`, hits.join('; '));
}

assert(shFiles.length > 0, 'parent shell scripts were scanned', `found ${shFiles.length} .sh files`);
assert(totalFindings === 0, 'ZERO hardcoded secret literals across all deploy scripts', `${totalFindings} finding(s)`);

console.log(`\n${BOLD}Result: ${passed} passed, ${failed} failed${RESET}`);
if (failed > 0) { console.log(`${RED}Failures:${RESET}`); failures.forEach(f => console.log(`  - ${f.name}: ${f.details}`)); process.exit(1); }
process.exit(0);
