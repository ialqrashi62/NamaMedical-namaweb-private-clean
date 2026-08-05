/**
 * wave36_rls_defense_test.js — Unit + structural + safety tests for the
 * Wave 36 RLS defense classifier.
 *
 * Safety rails (AGENTS.md §2.2):
 *   - Rail 1: source must not embed any secret material.
 *   - Rail 4: no DELETE / DROP on production data paths.
 *   - Rail 12: never prints parameter values, only placeholders.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const w36 = require('./wave36_rls_defense');
// Path of the production source file that this test actually guards.
const SOURCE_FILE = path.join(__dirname, 'wave36_rls_defense.js');

const tests = [];
let passed = 0;
let failed = 0;

function test(name, fn) { tests.push({ name, fn }); }
function assert(cond, msg) { if (!cond) throw new Error('assertion failed' + (msg ? `: ${msg}` : '')); }
function assertStrictEqual(a, b, msg) { if (a !== b) throw new Error('assertion failed' + (msg ? `: ${msg}` : '') + ` (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`); }

// ----- Public-route classifier -----

test('isPublicRoute: /api/auth/login is public', () => {
    assert(w36.isPublicRoute('/api/auth/login'), 'login is public');
});
test('isPublicRoute: /api/health is public', () => {
    assert(w36.isPublicRoute('/api/health'), 'health is public');
});
test('isPublicRoute: /api/metrics is public', () => {
    assert(w36.isPublicRoute('/api/metrics'), 'metrics scrape is public');
});
test('isPublicRoute: /api/webhook/nphies is public', () => {
    assert(w36.isPublicRoute('/api/webhook/nphies'), 'webhook callbacks are public (signed)');
});
test('isPublicRoute: /api/patients/:id is NOT public', () => {
    assert(!w36.isPublicRoute('/api/patients/:id'), 'clinical routes must be tenant-scoped');
});
test('isPublicRoute: /api/security/rls-audit is public', () => {
    assert(w36.isPublicRoute('/api/security/rls-audit'), 'audit endpoint is ops surface');
});

// ----- Route indexer -----

test('indexRoutes: counts routes in a tiny server', () => {
    const src = `
app.get('/api/health', (req, res) => { res.json({ok:true}); });
app.get('/api/patients', requireAuth, requireTenantScope, async (req, res) => {});
app.put('/api/patients/:id', requireAuth, requireRole('patients'), async (req, res) => {});
app.post('/api/auth/login', async (req, res) => {});
`;
    const routes = w36.indexRoutes(src);
    assertStrictEqual(routes.length, 4, `expected 4 routes, got ${routes.length}`);
    const def = routes.filter(r => r.hasTenantScope);
    // /api/health is undefended (public, no middleware); /api/auth/login is
    // also public (caught by isPublicRoute). The other two are defended via
    // requireAuth + requireTenantScope / requireRole.
    assertStrictEqual(def.length, 2, `expected 2 defended routes, got ${def.length}`);
});

test('indexRoutes: ignores middleware outside the next 30 lines', () => {
    const src = `
app.get('/api/patients', async (req, res) => {});
// 50 lines of comments...
${Array.from({length: 50}, () => '//').join('\n')}
app.get('/api/patients/other', requireTenantScope, async (req, res) => {});
`;
    const routes = w36.indexRoutes(src);
    const first = routes[0];
    assert(!first.hasTenantScope, `first route must be undefended, got ${JSON.stringify(first)}`);
});

// ----- Per-line classifier -----

test('classifyAtLine: query inside defended route is defended', () => {
    const src = `
app.get('/api/patients', requireAuth, requireTenantScope, async (req, res) => {
  const r = await pool.query("SELECT * FROM patients WHERE id = $1", [n]);
});
`;
    const routes = w36.indexRoutes(src);
    const cls = w36.classifyAtLine(routes, 3);
    assert(cls, 'classifyAtLine must return');
    assertStrictEqual(cls.path, '/api/patients');
    assert(cls.hasTenantScope, 'must have tenant scope');
    assert(cls.defended, 'must be defended');
});

test('classifyAtLine: query inside login route is defended via public', () => {
    const src = `
app.post('/api/auth/login', async (req, res) => {
  const r = await pool.query("SELECT * FROM patients WHERE id = $1", [n]);
});
`;
    const routes = w36.indexRoutes(src);
    const cls = w36.classifyAtLine(routes, 3);
    assert(cls, 'classifyAtLine must return');
    assert(cls.isPublic, 'login must be public');
    assert(cls.defended, 'public counts as defended');
});

test('classifyAtLine: query in unknown area is undefended', () => {
    const src = `
// Some script that calls pool.query outside any route:
const r = await pool.query("SELECT * FROM patients WHERE id = $1", [n]);
`;
    const routes = w36.indexRoutes(src);
    const cls = w36.classifyAtLine(routes, 3);
    assertStrictEqual(cls, null, 'no route owns the line → null');
});

// ----- End-to-end on server.js -----

test('runWithDefense: classifies server.js findings', () => {
    const target = path.join(__dirname, 'server.js');
    if (!fs.existsSync(target)) {
        // Skip if server.js not in the workspace.
        return;
    }
    const { summary, files } = w36.runWithDefense([target]);
    assert(summary.defense, 'defense block must be present');
    assert(typeof summary.defense.routesIndexed === 'number', 'routesIndexed');
    assert(typeof summary.defense.findingsDefended === 'number', 'findingsDefended');
    assert(typeof summary.defense.findingsUndefended === 'number', 'findingsUndefended');
    assert(typeof summary.defense.findingsPublic === 'number', 'findingsPublic');
    assert(summary.defense.findingsDefended + summary.defense.findingsUndefended >= 1,
        'at least one finding must be classified');
});

// ----- Prometheus metrics -----

test('toPrometheusMetrics: emits 5 gauges', () => {
    const out = w36.toPrometheusMetrics({
        defense: {
            findingsDefended: 280, findingsUndefended: 2, findingsPublic: 0,
            routesIndexed: 100, routesDefended: 60,
        },
    });
    assert(out.includes('# TYPE wave36_rls_defended gauge'), 'defended gauge');
    assert(out.includes('# TYPE wave36_rls_undefended gauge'), 'undefended gauge');
    assert(out.includes('# TYPE wave36_rls_public gauge'), 'public gauge');
    assert(out.includes('# TYPE wave36_routes_total gauge'), 'routes total gauge');
    assert(out.includes('# TYPE wave36_routes_defended gauge'), 'routes defended gauge');
    assert(out.includes('wave36_rls_undefended 2'), 'must surface the 2');
});

test('toPrometheusMetrics: zero values are still emitted', () => {
    const out = w36.toPrometheusMetrics({ defense: {} });
    assert(out.includes('wave36_rls_undefended 0'), 'zero must be surfaced');
});

// ----- Safety rails -----

test('source file: present and non-empty', () => {
    assert(fs.existsSync(SOURCE_FILE), `${SOURCE_FILE} must exist`);
    const content = fs.readFileSync(SOURCE_FILE, 'utf8');
    assert(content.length > 1000, 'source should be substantial');
});

test('source file: never embeds a password or KEK phrase', () => {
    const content = fs.readFileSync(SOURCE_FILE, 'utf8');
    // Strip line-comments (// …) so scaffold text doesn't trip the filter.
    const stripped = content.split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n');
    assert(!/password\s*[:=]/i.test(stripped), 'no password literal');
    assert(!/KEK_PASSPHRASE/i.test(stripped), 'no KEK phrase literal');
    assert(!/PGPASSWORD\s*[:=]/i.test(stripped), 'no PGPASSWORD literal');
});

test('source file: never references DELETE FROM or DROP DATABASE', () => {
    const content = fs.readFileSync(SOURCE_FILE, 'utf8');
    const stripped = content.split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n');
    assert(!/\bDELETE\s+FROM\b/i.test(stripped), 'no DELETE FROM');
    assert(!/\bDROP\s+DATABASE\b/i.test(stripped), 'no DROP DATABASE');
    assert(!/\bDROP\s+TABLE\b/i.test(stripped), 'no DROP TABLE');
});

test('source file: PUBLIC_ROUTE_PATTERNS only includes read-only or webhook surfaces', () => {
    // The allowed public prefixes — each must be a sub-path of /api/.
    const allowedPrefixes = [
        'auth', 'health', 'csp-report', 'metrics', 'openapi', 'docs',
        'security\\/rls-audit', 'webhook', 'onboarding', 'public',
    ];
    for (const re of w36.PUBLIC_ROUTE_PATTERNS) {
        const ok = allowedPrefixes.some(p => re.source.includes('\\/api\\/' + p));
        assert(ok, `unexpected public pattern: ${re.source}`);
    }
});

// ----- CLI smoke -----

test('CLI: produces a JSON report with defense block', () => {
    // Run the module as if it were invoked from the command line.
    const child = require('child_process').spawnSync(
        process.execPath,
        [SOURCE_FILE, SOURCE_FILE],  // scan itself to avoid server.js dep
        { encoding: 'utf8' }
    );
    assert(child.status === 0, `expected exit 0, got ${child.status}: ${child.stderr}`);
    const out = JSON.parse(child.stdout);
    assert(out.summary, 'must have summary');
    assert(out.summary.defense, 'must have defense');
    assert(out.defense, 'must have top-level defense mirror');
});

// ----- Runner -----

(async () => {
    for (const t of tests) {
        try {
            await t.fn();
            console.log(`[PASS] ${t.name}`);
            passed++;
        } catch (e) {
            console.log(`[FAIL] ${t.name}: ${e.message}`);
            failed++;
        }
    }
    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(failed > 0 ? 1 : 0);
})();