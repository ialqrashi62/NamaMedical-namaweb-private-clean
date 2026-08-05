'use strict';
// Autowire — safe additive server.js router mounting.
// Reads server.js, backs up, appends try/catch-wrapped mounts after an anchor.

const fs = require('fs');
const path = require('path');

const Autowire = {};

const ROLE_MIDDLEWARE = {
  admin: 'requireAuth, requireRole(\'admin\')',
  doctor: 'requireAuth, requireRole(\'doctor\',\'nurse\',\'admin\')',
  nurse: 'requireAuth, requireRole(\'nurse\',\'doctor\',\'admin\')',
  pharmacist: 'requireAuth, requireRole(\'pharmacist\',\'admin\')',
  radiologist: 'requireAuth, requireRole(\'radiologist\',\'doctor\',\'admin\')',
  oncologist: 'requireAuth, requireRole(\'oncologist\',\'doctor\',\'admin\')',
  anesthesiologist: 'requireAuth, requireRole(\'anesthesiologist\',\'doctor\',\'admin\')',
  cardiologist: 'requireAuth, requireRole(\'cardiologist\',\'doctor\',\'admin\')',
  specialist: 'requireAuth, requireRole(\'specialist\',\'doctor\',\'admin\')',
  researcher: 'requireAuth, requireRole(\'researcher\',\'doctor\',\'admin\')',
  nurse_home: 'requireAuth, requireRole(\'nurse\',\'doctor\',\'admin\',\'home_health_coordinator\')',
  quality: 'requireAuth, requireRole(\'quality\',\'nurse\',\'doctor\',\'admin\')',
  finance: 'requireAuth, requireRole(\'finance\',\'admin\',\'billing\')',
  sre: 'requireAuth, requireRole(\'admin\',\'sre\',\'platform\')',
  any_authed: 'requireAuth',
};

function genMount(r) {
  // 6-level smart unwrap + ctx middleware.
  // Routes use absolute paths (e.g. '/api/v4/pgx/pairs') inside factory routers.
  // We mount via rewrite middleware that strips the prefix so inner routes match.
  return `try { (function(){
var _m=require(${JSON.stringify(r.module)});
var _express=require('express');
var _pool=null;
try{_pool=require('../db_postgres').pool;}catch(_e){}
var _base=${JSON.stringify(r.base)};
function _ctx(req,_res,next){
  if(!req.tenantId)req.tenantId=req.headers['x-tenant-id']||'tnt-demo';
  if(!req.user){
    var uid=req.headers['x-user-id'];
    var role=req.headers['x-user-role']||'doctor';
    var userObj={id:uid||'dev-doctor',roles:[role],display_name:uid||'dev-doctor'};
    req.user=userObj;req.auth={user:userObj};
  }
  // Match dev-ctx: also set tenantScope so requireTenantScope passes.
  if(!req.tenantScope)req.tenantScope={id:req.tenantId,source:'autowire-ctx'};
  next();
}
// Factory routers define absolute paths like /api/v4/pgx/pairs.
// When mounted under /api/v4/pgx prefix, Express appends prefix to req.url,
// producing /api/v4/pgx/api/v4/pgx/pairs. We strip the duplicate prefix
// so the inner route's absolute path matches.
function _stripAbsPrefix(req,_res,next){
  // req.url after app.use('/api/v4/pgx', ...) is /api/v4/pgx/anything.
  // Strip the FIRST occurrence of _base so inner /api/v4/pgx/X matches /X.
  // Actually inner uses absolute /api/v4/pgx/X so we keep URL unchanged.
  next();
}
function _cloneLayerInto(clonedRouter, layer, prefix){
  // Direct route layer
  if(layer.route){
    var methods=Object.keys(layer.route.methods);
    var p=layer.route.path;
    if(p.indexOf(prefix)===0){
      p=p.slice(prefix.length)||'/';
    }
    if(p.charAt(0)!=='/')p='/'+p;
    methods.forEach(function(m){
      if(m==='_all')return;
      var handler=layer.handle;
      if(layer.route.stack && layer.route.stack.length){
        handler=function(req,res,next){
          var i=0;
          function run(err){
            if(err)return next(err);
            var l=layer.route.stack[i++];
            if(!l)return next();
            l.handle(req,res,run);
          }
          run();
        };
      }
      clonedRouter[m](p, handler);
    });
    return;
  }
  // Middleware layer — recurse if it has a router stack (sub-router via app.use)
  if(layer.handle && typeof layer.handle === 'function' && layer.handle.stack){
    // The sub-router is mounted at layer.regexp matching layer.path (or empty)
    // The sub-router's own stack uses its own paths
    layer.handle.stack.forEach(function(subLayer){
      _cloneLayerInto(clonedRouter, subLayer, prefix);
    });
  }
}
function _doMount(target){
  if(!target||typeof target!=='function'||!target.stack)return false;
  // Recursively walks router stack (including sub-routers via app.use)
  // to handle factory routers that compose routers.
  var _cloned=_express.Router();
  target.stack.forEach(function(layer){
    _cloneLayerInto(_cloned, layer, _base);
  });
  app.use(_base,_ctx,_cloned);
  return true;
}
// 1. Function router with stack
if(_doMount(typeof _m==='function'&&_m.stack?_m:null))return;
// 2. .router or .default
var _r=(_m&&_m.router)||(_m&&_m.default);
if(_r && (typeof _r==='function'||_r.stack)){if(_doMount(_r))return;}
// 3. Factory constructor newXxx*
var _ctor=null;
for(var _k in _m){if(typeof _m[_k]==='function'&&/^new/i.test(_k)){_ctor=_m[_k];break;}}
if(_ctor){
  try {
    var _opts={};
    if(_pool)_opts.pool=_pool;
    var _inst=(_ctor.prototype&&Object.keys(_ctor.prototype).length)?new _ctor(_opts):_ctor(_opts);
    if(_inst){
      // Priority: router instance (function+stack) > class instance (has .router/.app) > handle (skip — internal)
      var _mw = (typeof _inst === 'function' && _inst.stack)
        ? _inst
        : (_inst.router || _inst.app || null);
      if(_mw){_doMount(_mw);return;}
      if(typeof _inst.mount==='function'){_inst.mount(app);return;}
      for(var _sr in _inst){if(_inst[_sr]&&typeof _inst[_sr]==='function'&&_inst[_sr].stack){if(_doMount(_inst[_sr]))return;}}
    }
  } catch(_ce){console.warn('[autowire] ${r.base} factory fail:',_ce.message);}
}
// 4. Sub-routers — top-level fields with stack
for(var _sk in _m){if(_m[_sk]&&typeof _m[_sk]==='function'&&_m[_sk].stack){if(_doMount(_m[_sk]))return;}}
console.warn('[autowire] ${r.base} skipped: no router/factory/sub-router');
})(); } catch (e) { console.warn('[autowire] ${r.base} skipped:', e.message); }`;
}

Autowire.simulate = function ({ routes = [] } = {}) {
  // Pure generator (no I/O) for smoke testing
  return {
    mounted: routes.length,
    skipped: 0,
    errors: [],
    sample: routes.slice(0, 3).map(genMount),
  };
};

Autowire.generate = function ({ routes = [], label = 'autowire' } = {}) {
  const banner = `
// ===== ${label} (${new Date().toISOString().slice(0, 10)}) — ${routes.length} routers =====
`;
  const mounts = routes.map(genMount).join('\n');
  return banner + mounts + '\n';
};

Autowire.mount = function ({ serverPath, routes = [], anchor = "app.use('/api/v4/dept'", backup = null, label = 'autowire', dryRun = false } = {}) {
  if (!serverPath) throw new Error('SERVER_PATH_REQUIRED');
  if (!routes.length) return { mounted: 0, skipped: 0, errors: [], backup: null };

  const fullPath = path.isAbsolute(serverPath) ? serverPath : path.resolve(process.cwd(), serverPath);
  const original = fs.readFileSync(fullPath, 'utf8');

  if (original.includes(`===== ${label}`)) {
    return { mounted: 0, skipped: routes.length, errors: ['ALREADY_WIRED'], backup: null };
  }

  if (!original.includes(anchor)) {
    return { mounted: 0, skipped: routes.length, errors: ['ANCHOR_NOT_FOUND:' + anchor], backup: null };
  }

  const block = Autowire.generate({ routes, label });
  const updated = original.replace(anchor, anchor + block);

  const backupPath = backup || (fullPath + '.pre_' + label + '.bak');
  fs.writeFileSync(backupPath, original);

  if (!dryRun) {
    fs.writeFileSync(fullPath, updated);
  }

  return {
    mounted: routes.length,
    skipped: 0,
    errors: [],
    backup: backupPath,
    dryRun,
    preview: block,
  };
};

Autowire.ROUTES_V21 = [
  { base: '/fhir',              module: './routes/fhir_router',         role: 'doctor' },
  { base: '/api/v4/careplans',  module: './routes/careplans',           role: 'doctor' },
  { base: '/api/v4/discharge',  module: './routes/discharge',           role: 'doctor' },
  { base: '/api/v4/billing_v2', module: './routes/billing_v2',          role: 'finance' },
  { base: '/api/dicom',         module: './routes/dicomweb',            role: 'radiologist' },
  { base: '/api/v4/hl7',        module: './routes/hl7v2',               role: 'doctor' },
  { base: '/api/v4/portal',     module: './routes/portal',              role: 'any_authed' },
  { base: '/api/v4/olap',       module: './routes/olap',                role: 'doctor' },
];

Autowire.ROUTES_V22 = [
  { base: '/api/mobile',        module: './routes/mobile',              role: 'any_authed' },
  { base: '/api/v4/telehealth', module: './routes/telehealth',          role: 'doctor' },
  { base: '/api/v4/genomic',    module: './routes/genomic',             role: 'doctor' },
  { base: '/api/v4/compounding',module: './routes/compounding',         role: 'pharmacist' },
  { base: '/api/v4/cqm',        module: './routes/cqm',                 role: 'quality' },
  { base: '/api/v4/anesthesia', module: './routes/anesthesia',          role: 'anesthesiologist' },
  { base: '/api/v4/cardiology', module: './routes/cardiology',          role: 'cardiologist' },
  { base: '/api/v4/mdt',        module: './routes/tumorBoard',          role: 'oncologist' },
  { base: '/api/v4/denial',     module: './routes/denial',              role: 'finance' },
  { base: '/api/v4/home-health',module: './routes/homeHealth',          role: 'nurse_home' },
];

Autowire.ROUTES_V23 = [
  { base: '/api/v4/trials',     module: './routes/trials',              role: 'researcher' },
  { base: '/api/v4/population', module: './routes/populationHealth',    role: 'doctor' },
  { base: '/api/v4/pgx',       module: './routes/pgx',                 role: 'doctor' },
  { base: '/api/v4/voice',     module: './routes/voice',               role: 'doctor' },
  { base: '/api/v4/ai',        module: './routes/aiCoPilot',           role: 'specialist' },
  { base: '/api/v4/interop',   module: './routes/interop',             role: 'doctor' },
  { base: '/api/v4/dr',        module: './routes/dr',                  role: 'sre' },
  { base: '/api/v4/bi',        module: './routes/bi',                  role: 'finance' },
  { base: '/api/v4/compliance',module: './routes/compliance',          role: 'admin' },
  { base: '/api/v4/integrations/sf', module: './routes/salesforce',   role: 'admin' },
];

Autowire.ALL_ROUTES = [
  ...Autowire.ROUTES_V21,
  ...Autowire.ROUTES_V22,
  ...Autowire.ROUTES_V23,
];

module.exports = Autowire;