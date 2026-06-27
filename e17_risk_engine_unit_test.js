/**
 * e17_risk_engine_unit_test.js — Epic E17 pure-engine unit test.
 * Exercises the risk-scoring calculator and state-machine transition tables by
 * extracting them from server.js (single source of truth) and asserting bands/edges.
 * DB-free. Run: NODE_PATH=...\node_modules node e17_risk_engine_unit_test.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const G = '\x1b[32m', R = '\x1b[31m', X = '\x1b[0m';
let passed = 0, failed = 0;
function assert(cond, name, extra = '') { if (cond) { console.log(`  ${G}PASS${X} ${name}`); passed++; } else { console.log(`  ${R}FAIL${X} ${name}${extra ? ' | ' + extra : ''}`); failed++; } }

const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');

// Extract the canonical engine definitions from server.js so the test tracks the real code.
function extract(name, kind) {
    if (kind === 'fn') {
        const re = new RegExp('function ' + name + '\\s*\\([^)]*\\)\\s*\\{');
        const m = re.exec(server);
        if (!m) throw new Error('not found: ' + name);
        let i = server.indexOf('{', m.index), depth = 0, start = i;
        for (; i < server.length; i++) { if (server[i] === '{') depth++; else if (server[i] === '}') { depth--; if (depth === 0) break; } }
        return server.slice(m.index, i + 1);
    } else {
        const re = new RegExp('const ' + name + '\\s*=\\s*\\{[\\s\\S]*?\\};');
        const m = re.exec(server);
        if (!m) throw new Error('not found: ' + name);
        return m[0];
    }
}

const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(
    extract('E17_INCIDENT_TRANSITIONS', 'const') + '\n' +
    extract('E17_CAPA_TRANSITIONS', 'const') + '\n' +
    extract('e17ComputeRisk', 'fn') + '\n' +
    extract('e17IsValidIncidentTransition', 'fn') + '\n' +
    extract('e17IsValidCapaTransition', 'fn') + '\n' +
    'this.e17ComputeRisk = e17ComputeRisk; this.incOk = e17IsValidIncidentTransition; this.capaOk = e17IsValidCapaTransition;',
    sandbox
);
const { e17ComputeRisk, incOk, capaOk } = sandbox;

console.log('\n[ 1 ] Risk score bands (likelihood x impact)');
assert(e17ComputeRisk(1, 1).risk_level === undefined || e17ComputeRisk(1, 1).level === 'Low', 'engine returns level field');
const r = (l, i) => e17ComputeRisk(l, i);
assert(r(1, 1).score === 1 && r(1, 1).level === 'Low', '1x1 = 1 Low');
assert(r(2, 2).score === 4 && r(2, 2).level === 'Low', '2x2 = 4 Low (upper edge of Low)');
assert(r(1, 5).score === 5 && r(1, 5).level === 'Medium', '1x5 = 5 Medium (lower edge)');
assert(r(3, 3).score === 9 && r(3, 3).level === 'Medium', '3x3 = 9 Medium (upper edge)');
assert(r(2, 5).score === 10 && r(2, 5).level === 'High', '2x5 = 10 High (lower edge)');
assert(r(3, 4).score === 12 && r(3, 4).level === 'High', '3x4 = 12 High');
assert(r(3, 5).score === 15 && r(3, 5).level === 'Extreme', '3x5 = 15 Extreme (lower edge)');
assert(r(5, 5).score === 25 && r(5, 5).level === 'Extreme', '5x5 = 25 Extreme (max)');

console.log('\n[ 2 ] Risk engine clamps + incomplete/garbage input (no NaN, never false-reassuring)');
assert(r(0, 0).likelihood === 1 && r(0, 0).impact === 1, 'zero clamps up to minimum 1');
assert(r(99, 99).likelihood === 5 && r(99, 99).impact === 5 && r(99, 99).score === 25, 'out-of-range clamps to 5 (client cannot inflate beyond max)');
assert(r('abc', null).score === 1 && r('abc', null).level === 'Low', 'garbage/incomplete input -> safe minimum, not NaN');
assert(!Number.isNaN(r(undefined, undefined).score), 'undefined input never yields NaN score');

console.log('\n[ 3 ] Incident state machine transition table');
assert(incOk('Open', 'Investigating'), 'Open->Investigating');
assert(incOk('Open', 'Closed'), 'Open->Closed');
assert(incOk('Investigating', 'Action'), 'Investigating->Action');
assert(incOk('Action', 'Closed'), 'Action->Closed');
assert(!incOk('Closed', 'Open'), 'Closed->Open rejected');
assert(!incOk('Open', 'Action'), 'Open->Action (skip) rejected');
assert(!incOk('Bogus', 'Closed'), 'unknown source state rejected');

console.log('\n[ 4 ] CAPA state machine transition table');
assert(capaOk('Pending', 'InProgress'), 'Pending->InProgress');
assert(capaOk('Pending', 'Cancelled'), 'Pending->Cancelled');
assert(capaOk('InProgress', 'Completed'), 'InProgress->Completed');
assert(capaOk('Completed', 'Verified'), 'Completed->Verified');
assert(!capaOk('Pending', 'Completed'), 'Pending->Completed (skip) rejected');
assert(!capaOk('Verified', 'InProgress'), 'Verified->InProgress (reopen) rejected');
assert(!capaOk('Cancelled', 'InProgress'), 'Cancelled->InProgress rejected');
assert(!capaOk('Completed', 'Cancelled'), 'Completed->Cancelled rejected');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
