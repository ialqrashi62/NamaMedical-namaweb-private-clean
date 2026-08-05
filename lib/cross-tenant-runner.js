// filepath: namaweb/lib/cross-tenant-runner.js
//
// Cross-tenant test runner (RAIL-5 tenant scope, RAIL-12 no PHI).
//
// Pure in-memory simulation. No HTTP server is spawned, no real network is
// touched, and no request bodies or responses are logged anywhere — the only
// data that round-trips through this module is the structural shape of each
// test case (path, tenant id, expected outcome).
//
// Browser + Node dual export:
//   - Node:    require('./cross-tenant-runner') -> { suite, _mockHandler, _deepEqual }
//   - Browser: window.CrossTenantRunner -> { suite, ... }
//
// API:
//   CT.suite({
//     name: 'ICU radiology cross-tenant',
//     ports: { tenantA: 3210, tenantB: 3211 },
//     cases: [
//       { name: 'same-tenant OK',     tenant: 'A', path: '/api/x',          expect: { ok: true  } },
//       { name: 'cross-tenant DENY',  tenant: 'B', path: '/api/x', tokenFrom: 'A',
//         expect: { ok: false, reason: 'cross_tenant' } },
//     ],
//   });
//   -> { passed, failed, total, suite, ports, cases: [{ name, passed, ... }] }
//
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module && module.exports) {
    module.exports = factory();
  } else {
    root.CrossTenantRunner = factory();
  }
}(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function () {
  'use strict';

  // ---- helpers -------------------------------------------------------------

  // Structural equality on plain JSON-shaped values. Sufficient for the
  // {ok, reason, ...} shape the suite uses; explicitly does NOT walk
  // prototypes, dates, or functions (RAIL-12: no PHI, no live refs).
  function deepEqual(a, b) {
    if (a === b) return true;
    if (a === null || b === null) return false;
    if (typeof a !== 'object' || typeof b !== 'object') return false;
    var ka = Object.keys(a);
    var kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    for (var i = 0; i < ka.length; i++) {
      var k = ka[i];
      if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
      if (!deepEqual(a[k], b[k])) return false;
    }
    return true;
  }

  // Compare every key in `expected` against `actual`; report per-key drift.
  // Direction is intentional: only expected.keys are checked — extra keys
  // on actual (e.g. port/path) are informational, not failures.
  function diffExpected(expected, actual) {
    var keys = Object.keys(expected || {});
    var mismatches = [];
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (!deepEqual(expected[k], actual[k])) {
        mismatches.push({ key: k, expected: expected[k], actual: actual[k] });
      }
    }
    return mismatches;
  }

  // ---- mock handler --------------------------------------------------------
  //
  // Simulates a tenant-scoped route guard. It is intentionally tiny — the
  // point of the runner is to exercise the *contract* (token vs tenant),
  // not to reimplement requireTenantScope on top of HTTP.
  //
  // Contract:
  //   - No tokenFrom           -> caller's own tenant -> ALLOW
  //   - tokenFrom === tenant   -> same tenant         -> ALLOW
  //   - tokenFrom !== tenant   -> cross-tenant        -> DENY ('cross_tenant')
  //
  function mockHandler(c, portByTenant) {
    var tenant = c.tenant;
    var path = c.path;
    var tokenFrom = c.tokenFrom || null;

    var port = (portByTenant && portByTenant[tenant]) || 0;

    // ALLOW paths
    if (!tokenFrom || tokenFrom === tenant) {
      return {
        ok: true,
        tenant: tenant,
        tokenFrom: tokenFrom,
        port: port,
        path: path,
        reason: null
      };
    }

    // DENY: cross-tenant attempt. RAIL-5 violation surface.
    return {
      ok: false,
      tenant: tenant,
      tokenFrom: tokenFrom,
      port: port,
      path: path,
      reason: 'cross_tenant'
    };
  }

  // ---- case runner ---------------------------------------------------------

  function runCase(c, ports) {
    // Defensive shallow copies so a malformed case can never mutate the
    // caller's ports object or leak through Object.prototype.
    var portByTenant = {};
    if (ports && typeof ports === 'object') {
      Object.keys(ports).forEach(function (k) { portByTenant[k] = ports[k]; });
    }

    var expected = (c && c.expect) || {};
    var actual = mockHandler(c || {}, portByTenant);
    var mismatches = diffExpected(expected, actual);

    return {
      name: (c && c.name) || 'unnamed-case',
      passed: mismatches.length === 0,
      tenant: c ? c.tenant : null,
      tokenFrom: (c && c.tokenFrom) || null,
      path: (c && c.path) || null,
      expected: expected,
      actual: {
        ok: actual.ok,
        tenant: actual.tenant,
        tokenFrom: actual.tokenFrom,
        reason: actual.reason,
        port: actual.port,
        path: actual.path
      },
      mismatches: mismatches
    };
  }

  // ---- suite ---------------------------------------------------------------

  function suite(opts) {
    if (!opts || typeof opts !== 'object') {
      throw new Error('cross-tenant-runner: suite() requires {name, ports, cases}');
    }
    var name = opts.name || 'unnamed-suite';
    var ports = (opts.ports && typeof opts.ports === 'object') ? opts.ports : {};
    var cases = Array.isArray(opts.cases) ? opts.cases : [];

    var results = cases.map(function (c) {
      try {
        return runCase(c, ports);
      } catch (err) {
        // A case that throws is a hard failure; we never re-throw out of the
        // suite — one bad case must not blank the whole batch.
        return {
          name: (c && c.name) || 'unnamed-case',
          passed: false,
          tenant: c ? c.tenant : null,
          tokenFrom: (c && c.tokenFrom) || null,
          path: (c && c.path) || null,
          expected: (c && c.expect) || {},
          actual: null,
          mismatches: [],
          error: (err && err.message) ? err.message : String(err)
        };
      }
    });

    var passed = 0;
    for (var i = 0; i < results.length; i++) if (results[i].passed) passed++;
    var failed = results.length - passed;

    return {
      suite: name,
      ports: ports,
      total: results.length,
      passed: passed,
      failed: failed,
      cases: results
    };
  }

  return {
    suite: suite,
    _mockHandler: mockHandler,
    _deepEqual: deepEqual
  };
}));
