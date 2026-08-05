'use strict';

/**
 * Dept-attachment shim.
 *
 * The live `namaweb/server.js` is huge and depends on the existing tenant/session
 * middleware. To run AUTOPILOT without editing it, we provide a tiny
 * Express sub-app that hosts the dept_router. Owners can later integrate it
 * via:
 *
 *   const deptAttach = require('./routes/dept_attach');
 *   app.use(deptAttach);   // or app.use('/api/v4/dept', deptAttach)
 *
 * Until owners approve live wiring, AUTOPILOT ships a STANDALONE server below
 * for smoke + dev. Production requires owner sign-off (AGENTS.md §2.4).
 */
const express = require('express');
const dept_router = require('./dept_router');
const PromptRegistryMod = require('../lib/PromptRegistry');
const PromptRegistry = (typeof PromptRegistryMod === 'function')
  ? PromptRegistryMod
  : (PromptRegistryMod.loadRegistry ? PromptRegistryMod : (PromptRegistryMod.default || null));
const registry = require('./dept_registry');

const app = express();
app.use(express.json({ limit: '2mb' }));

// Initialize registry in dry-run (no PG) at attach time.
registry.init();

app.use('/api/v4/dept', dept_router);

// Health
const promptPath = (PromptRegistry && typeof PromptRegistry.loadRegistry === 'function')
  ? PromptRegistry.loadRegistry().path
  : null;
app.get('/health', (req, res) => res.json({
  ok: true,
  version: 'p3-d.4.0',
  rails: 'preserved',
  depts: registry.list().length,
  promptRegistry: promptPath,
}));

module.exports = app;

// Convenience: standalone server for smoke tests.
if (require.main === module) {
  const port = parseInt(process.env.DEPT_SMOKE_PORT, 10) || 3210;
  app.listen(port, () => {
    process.stdout.write('[dept_attach] listening on http://127.0.0.1:' + port + '\n');
  });
}
