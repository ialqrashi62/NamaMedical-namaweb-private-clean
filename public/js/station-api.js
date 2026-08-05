'use strict';
// Station API Client — wraps fetch() with the exact middleware contract used by the
// 31 dept endpoints (auth+role+tenant). Auto-derived from snippet.api without
// inventing new routes.

const StationAPI = (() => {
  function escapeHTML(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '&gt;': '&gt;', '"': '&quot;' }[c])); }

  function getHeaders() {
    const t = (window.NAMAMEDICAL && window.NAMAMEDICAL.TENANT_ID) || (sessionStorage.getItem('tenantId') || 'demo');
    const token = (window.NAMAMEDICAL && window.NAMAMEDICAL.CSRF_TOKEN) || '';
    return {
      'Content-Type': 'application/json',
      'X-Tenant-Id': t,
      'X-CSRF-Token': token,
    };
  }

  async function call(method, url, body) {
    const opts = { method, headers: getHeaders(), credentials: 'same-origin' };
    if (body && method !== 'GET') opts.body = JSON.stringify(body);
    try {
      const res = await fetch(url, opts);
      const text = await res.text();
      let data;
      try { data = text ? JSON.parse(text) : {}; } catch (_) { data = { raw: text }; }
      if (!res.ok) throw new Error('HTTP ' + res.status + ' :: ' + (data && data.error || text || 'unknown'));
      return data;
    } catch (e) {
      console.warn('[StationAPI] ' + method + ' ' + url + ' failed:', e.message);
      throw e;
    }
  }

  function list(deptCode) {
    const snippet = (window.STATION_SNIPPETS || {})[deptCode];
    if (!snippet || !snippet.api) throw new Error('NOT_FOUND_API:' + deptCode);
    return call('GET', snippet.api + '/list?limit=50');
  }

  function get(deptCode, id) {
    const snippet = (window.STATION_SNIPPETS || {})[deptCode];
    if (!snippet || !snippet.api) throw new Error('NOT_FOUND_API:' + deptCode);
    return call('GET', snippet.api + '/' + encodeURIComponent(id));
  }

  function create(deptCode, payload) {
    const snippet = (window.STATION_SNIPPETS || {})[deptCode];
    if (!snippet || !snippet.api) throw new Error('NOT_FOUND_API:' + deptCode);
    return call('POST', snippet.api, payload);
  }

  function update(deptCode, id, payload) {
    const snippet = (window.STATION_SNIPPETS || {})[deptCode];
    if (!snippet || !snippet.api) throw new Error('NOT_FOUND_API:' + deptCode);
    return call('PUT', snippet.api + '/' + encodeURIComponent(id), payload);
  }

  function remove(deptCode, id) {
    const snippet = (window.STATION_SNIPPETS || {})[deptCode];
    if (!snippet || !snippet.api) throw new Error('NOT_FOUND_API:' + deptCode);
    return call('DELETE', snippet.api + '/' + encodeURIComponent(id));
  }

  // Score calculator — runs locally with NO PHI; safe to call from UI.
  function calculateScore(scoreKey, values) {
    const def = window.SCORE_DEFINITIONS && window.SCORE_DEFINITIONS[scoreKey];
    if (!def) throw new Error('SCORE_NOT_FOUND:' + scoreKey);
    let total = 0;
    for (const v of (values || [])) total += Number(v) || 0;
    return { scoreKey, total, max: def.max, pct: Math.min(100, Math.round((total / def.max) * 100)) };
  }

  // Diagnostic — checks that all 31 dept APIs resolve AND have a server.js route registered.
  async function healthCheck(serverRoutes) {
    const codes = Object.keys(window.STATION_SNIPPETS || {});
    const report = [];
    for (const code of codes) {
      const snippet = window.STATION_SNIPPETS[code];
      const api = (snippet && snippet.api) || '';
      const routeExists = !serverRoutes || serverRoutes.some((r) => r.startsWith('app.') && r.includes(api));
      report.push({ code, api, routeExists });
    }
    return report;
  }

  return { call, list, get, create, update, remove, calculateScore, healthCheck };
})();

window.StationAPI = StationAPI;
