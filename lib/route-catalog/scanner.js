'use strict';
// Scanner — walks ALL_ROUTES + their module's router, emits manifest.
const path = require('path');

const Scanner = {};

Scanner.scan = function ({ routes = [] } = {}) {
  const entries = [];
  for (const r of routes) {
    let mod;
    try {
      mod = require(path.resolve(r.module.replace(/^\.\//, '')));
    } catch (e) {
      entries.push({ base: r.base, module: r.module, error: e.message });
      continue;
    }
    let routers = [];
    if (typeof mod === 'function' && mod.stack) routers.push(mod);
    if (mod && mod.router && mod.router.stack) routers.push(mod.router);
    // For factory modules, instantiate and try
    for (const k of Object.keys(mod || {})) {
      if (typeof mod[k] === 'function' && /^new/i.test(k)) {
        try {
          const inst = mod[k]();
          if (inst && inst.stack) routers.push(inst);
          if (inst && inst.router && inst.router.stack) routers.push(inst.router);
          if (inst && inst.isoRouter && inst.isoRouter.stack) routers.push(inst.isoRouter);
          if (inst && inst.hipaaRouter && inst.hipaaRouter.stack) routers.push(inst.hipaaRouter);
          if (inst && inst.baaRouter && inst.baaRouter.stack) routers.push(inst.baaRouter);
        } catch (_e) {}
      }
    }
    for (const router of routers) {
      for (const layer of router.stack || []) {
        if (layer.route) {
          const methods = Object.keys(layer.route.methods).filter(m => m !== '_all');
          for (const m of methods) {
            entries.push({
              base: r.base,
              method: m.toUpperCase(),
              path: layer.route.path,
              full: r.base + layer.route.path,
            });
          }
        }
      }
    }
  }
  const byMount = {};
  for (const e of entries) {
    if (!byMount[e.base]) byMount[e.base] = 0;
    byMount[e.base]++;
  }
  return { total: entries.length, byMount, entries };
};

Scanner.report = function (manifest) {
  if (!manifest) return 'invalid';
  const counts = Object.entries(manifest.byMount)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => k + '=' + v)
    .join(', ');
  return `total=${manifest.total} (${counts})`;
};

module.exports = Scanner;