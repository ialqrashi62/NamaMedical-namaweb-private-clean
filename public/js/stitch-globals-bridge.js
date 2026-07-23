/**
 * stitch-globals-bridge.js
 * Bridges module-scoped station const declarations to window for the
 * routing-patch to find. Runs AFTER all -station.js scripts load.
 *
 * Each station script declares `const XxxStation = {...}` at top level. In
 * Node (module) that const is not on `global`; in browsers (classic script)
 * that const is not on `window`. This file uses `Function` (which evaluates
 * in global scope) to retrieve the binding and re-assign it to `window`.
 *
 * This avoids editing all 13 legacy station files.
 */

(function () {
  // Mapping: NAV index -> class name. Only the 13 legacy stations that
  // did not self-assign to window. The other 15 already use `window.X = X`.
  var STATIONS_TO_BRIDGE = [
    'SurgeryStation', 'CardiologyStation', 'PulmonologyStation', 'GastroStation',
    'NephrologyStation', 'EndocrineStation', 'RheumaStation', 'DermStation',
    'InfectiousStation', 'OncologyStation', 'OBGYNStation', 'CriticalStation',
    'DiagnosticsStation'
  ];

  // Use `new Function` to evaluate in the script's global scope (where
  // the const lives). This works in browsers where each classic script's
  // top-level const/let lives in a shared lexical environment.
  // (In Node, the previous require() already pushed them to global via
  // our test harness; in the browser, top-level const/let are in the
  // global lexical scope of the script, reachable via the implicit
  // `globalThis` at the script level.)
  //
  // We try a soft lookup first (no-op if already on window), then for
  // module-loaded contexts where top-level const is module-scoped, we
  // detect by checking that the station is reachable as a direct
  // identifier. If reachable, copy onto window. If not, we cannot help
  // (the station file would need to add `window.X = X` itself).
  for (var i = 0; i < STATIONS_TO_BRIDGE.length; i++) {
    var name = STATIONS_TO_BRIDGE[i];
    try {
      // Try to read the binding via Function (works for both classic script
      // globals and module-scope if we previously hoisted them).
      var getter = new Function('return typeof ' + name + ' !== "undefined" ? ' + name + ' : null;');
      var val = getter();
      if (val && typeof val === 'object' && !window[name]) {
        window[name] = val;
      }
    } catch (e) { /* not reachable from this scope — the source file must self-expose */ }
  }
})();
