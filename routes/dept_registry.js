'use strict';

/**
 * Engine registry — autoloads all Tier-1 dept engines.
 *
 * Used by:
 *   - routes/dept_router.js (Express handlers)
 *   - tests
 *   - admin "engine list"
 *
 * SAFETY: all engines instantiated via safe defaults (in-mem RAG,
 * default red-flag rules, default drug rules). PG-backed adapters
 * must be wired through `bindPool(...)` ONCE at boot.
 */
const { ExecutionContext } = require('../lib/ExecutionContext');
const AuditServiceModule = require('../lib/AuditService');
const AuditService = (typeof AuditServiceModule === 'function') ? AuditServiceModule : AuditServiceModule.AuditService;
const { RAGService } = require('../lib/RAGService');
const RedFlagMod = require('../lib/RedFlagService');
const RedFlagService = (typeof RedFlagMod === 'function') ? RedFlagMod : RedFlagMod.RedFlagService;
const DEFAULT_RULES = RedFlagMod.DEFAULT_RULES || [];
const DrugMod = require('../lib/DrugCheckService');
const DrugCheckService = (typeof DrugMod === 'function') ? DrugMod : DrugMod.DrugCheckService;
const RedactorMod = require('../lib/Redactor');
const Redactor = (typeof RedactorMod === 'function') ? RedactorMod : RedactorMod.Redactor;
const PromptRegistry = require('../lib/PromptRegistry');

const DEPT_REGISTRY = {
  CARD: { module: null, name: 'Cardiology',        enginePath: '../engines/card/initial_assessment.engine' },
  PULM: { module: null, name: 'Pulmonology',       enginePath: '../engines/pulm/initial_assessment.engine' },
  GI:   { module: null, name: 'Gastroenterology',  enginePath: '../engines/gi/initial_assessment.engine' },
  NEPH: { module: null, name: 'Nephrology',        enginePath: '../engines/neph/initial_assessment.engine' },
  ONC:  { module: null, name: 'Heme-Onc',          enginePath: '../engines/onc/initial_assessment.engine' },
  ENDO: { module: null, name: 'Endocrinology',     enginePath: '../engines/endo/initial_assessment.engine' },
  ID:   { module: null, name: 'Infectious Diseases', enginePath: '../engines/id/initial_assessment.engine' },
  DERM: { module: null, name: 'Dermatology',       enginePath: '../engines/derm/initial_assessment.engine' },
  RHEUM:{ module: null, name: 'Rheumatology',      enginePath: '../engines/rheum/initial_assessment.engine' },
  ER:   { module: null, name: 'Emergency',         enginePath: '../engines/er/initial_assessment.engine' },
  OBG:  { module: null, name: 'OB/GYN',            enginePath: '../engines/obg/initial_assessment.engine' },
  PEDS: { module: null, name: 'Pediatrics',        enginePath: '../engines/peds/initial_assessment.engine' },
  SURG: { module: null, name: 'General Surgery',   enginePath: '../engines/surg/initial_assessment.engine' },
  NEURO:{ module: null, name: 'Neurology',         enginePath: '../engines/neuro/initial_assessment.engine' },
  ORTHO:{ module: null, name: 'Orthopedics',       enginePath: '../engines/ortho/initial_assessment.engine' },
  OPHTH:{ module: null, name: 'Ophthalmology',     enginePath: '../engines/ophth/initial_assessment.engine' },
  ENT:  { module: null, name: 'Otolaryngology',    enginePath: '../engines/ent/initial_assessment.engine' },
  URO:  { module: null, name: 'Urology',           enginePath: '../engines/uro/initial_assessment.engine' },
  ANES: { module: null, name: 'Anesthesia',        enginePath: '../engines/anes/initial_assessment.engine' },
  ICU:  { module: null, name: 'Intensive Care',    enginePath: '../engines/icu/initial_assessment.engine' },
  PSYC: { module: null, name: 'Psychiatry',        enginePath: '../engines/psyc/initial_assessment.engine' },
};

let _initialized = false;
let _audit = null;
let _rag  = null;
let _redFlag = null;
let _drugChecker = null;
let _redactor = null;
let _promptRegistry = null;
let _pgPool = null;

function bindPool(pool) {
  _pgPool = pool;
  _audit = new AuditService({ pool, dryRun: false });
}

function init(opts = {}) {
  if (_initialized) return;
  if (!_audit) _audit = new AuditService({ dryRun: true });
  if (!_rag)   _rag   = new RAGService(opts.rag || {});
  if (!_redFlag) _redFlag = new RedFlagService({ rules: opts.redFlagRules || DEFAULT_RULES });
  if (!_drugChecker) _drugChecker = new DrugCheckService(opts.drugChecker || {});
  if (!_redactor) _redactor = new Redactor();
  if (!_promptRegistry) _promptRegistry = PromptRegistry;

  for (const deptId of Object.keys(DEPT_REGISTRY)) {
    const r = DEPT_REGISTRY[deptId];
    try {
      r.module = require(r.enginePath);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[engine-registry] failed to load ' + r.enginePath + ': ' + e.message);
    }
  }

  // Auto-discover Tier-2/Tier-3/Tier-4 depts by scanning ../engines/<dept>/initial_assessment.engine.js
  try {
    const fs = require('fs');
    const path = require('path');
    const root = path.resolve(__dirname, '..', 'engines');
    if (fs.existsSync(root)) {
      for (const sub of fs.readdirSync(root)) {
        const full = path.join(root, sub);
        if (!fs.statSync(full).isDirectory()) continue;
        if (sub === 'utils') continue;
        // Tier-6 procedural bundles (parent/workflows/<wf>/bundle.engine.js)
        const wfDir = path.join(full, 'workflows');
        if (fs.existsSync(wfDir) && fs.statSync(wfDir).isDirectory()) {
          for (const wf of fs.readdirSync(wfDir)) {
            const wfull = path.join(wfDir, wf);
            if (!fs.statSync(wfull).isDirectory()) continue;
            const wJs = path.join(wfull, 'bundle.engine.js');
            if (!fs.existsSync(wJs)) continue;
            const id = (sub + '::' + wf).toUpperCase().replace(/[^A-Z0-9]/g, '_');
            if (!DEPT_REGISTRY[id]) {
              DEPT_REGISTRY[id] = {
                module: null,
                name: sub + ' : ' + wf,
                enginePath: '../engines/' + sub + '/workflows/' + wf + '/bundle.engine',
                isWorkflow: true,
                parent: sub,
                workflow: wf,
              };
            }
          }
        }
        // Tier-5 sub-units (parent/sub/subunit)
        const subDir = path.join(full, 'sub');
        if (fs.existsSync(subDir) && fs.statSync(subDir).isDirectory()) {
          for (const unit of fs.readdirSync(subDir)) {
            const ufull = path.join(subDir, unit);
            if (!fs.statSync(ufull).isDirectory()) continue;
            const uJs = path.join(ufull, 'initial_assessment.engine.js');
            if (!fs.existsSync(uJs)) continue;
            const id = (sub + '__' + unit).toUpperCase().replace(/[^A-Z0-9]/g, '_');
            if (!DEPT_REGISTRY[id]) {
              DEPT_REGISTRY[id] = {
                module: null,
                name: sub + '::' + unit,
                enginePath: '../engines/' + sub + '/sub/' + unit + '/initial_assessment.engine',
                isSubUnit: true,
                parent: sub,
                subunit: unit,
              };
            }
          }
        }
        // Tier-1..4 root dept
        const engineJs = path.join(full, 'initial_assessment.engine.js');
        if (!fs.existsSync(engineJs)) continue;
        const id = sub.toUpperCase().replace(/[^A-Z0-9]/g, '_');
        if (!DEPT_REGISTRY[id]) {
          DEPT_REGISTRY[id] = {
            module: null,
            name: sub.split('_').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' '),
            enginePath: '../engines/' + sub + '/initial_assessment.engine',
          };
        }
      }
    }
    for (const deptId of Object.keys(DEPT_REGISTRY)) {
      const r = DEPT_REGISTRY[deptId];
      if (!r.module) {
        try { r.module = require(r.enginePath); } catch (e) {
          // eslint-disable-next-line no-console
          console.warn('[engine-registry] failed to load ' + r.enginePath + ': ' + e.message);
        }
      }
    }
  } catch (e) { /* discovery is best-effort */ }

  _initialized = true;
}

function getEngineInstance(deptId) {
  init();
  const r = DEPT_REGISTRY[deptId];
  if (!r || !r.module) throw new Error('UNKNOWN_DEPT: ' + deptId);
  const mod = r.module;
  // Resolve the engine class — handles:
  // 1. default export: module.exports = ClassName
  // 2. namespace: module.exports = { ClassName }
  let cls = null;
  if (typeof mod === 'function' && mod.prototype) {
    cls = mod;
  } else if (mod && typeof mod === 'object') {
    cls = Object.values(mod).find(v => typeof v === 'function' && v.prototype && v.prototype.execute);
  }
  if (!cls) throw new Error('NO_ENGINE_CLASS: ' + deptId);
  return new cls({
    audit: _audit,
    rag:   _rag,
    redFlag: _redFlag,
    drugChecker: _drugChecker,
    redact: _redactor,
    promptRegistry: _promptRegistry,
  });
}

function list() {
  init();
  return Object.entries(DEPT_REGISTRY).map(([id, r]) => ({
    deptId: id,
    name: r.name,
    loaded: !!r.module,
    enginePath: r.enginePath,
  }));
}

function depts() {
  return Object.keys(DEPT_REGISTRY);
}

module.exports = {
  init,
  bindPool,
  getEngineInstance,
  list,
  depts,
};
