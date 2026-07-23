/**
 * routing-patch.js
 * Dispatches NAV indices 48-75 to specialist Stitch station renderers.
 * Loaded after app.js to extend routing without editing the 1.7MB app.js.
 *
 * Bridges #app-content (legacy) to #pageContent (current) so all stations
 * render correctly. Also handles dynamic NAV_ITEMS 55-77 that were added.
 */

(function () {
  'use strict';

  // 28 specialist station routes with their global class name.
  var STATION_PAGES = {
    // Surgical (48-55)
    48: { name: 'Orthopedics',      klass: 'OrthopedicsStation' },
    49: { name: 'Neurosurgery',     klass: 'NeurosurgeryStation' },
    50: { name: 'Cardiothoracic',   klass: 'CardiothoracicStation' },
    51: { name: 'ENT',              klass: 'ENTStation' },
    52: { name: 'Ophthalmology',    klass: 'OphthalmologyStation' },
    53: { name: 'Urology',          klass: 'UrologyStation' },
    54: { name: 'PlasticSurgery',   klass: 'PlasticSurgeryStation' },
    55: { name: 'GeneralSurgery',   klass: 'SurgeryStation' },
    // Internal medicine (56-64)
    56: { name: 'Cardiology',       klass: 'CardiologyStation' },
    57: { name: 'Pulmonology',      klass: 'PulmonologyStation' },
    58: { name: 'Gastroenterology', klass: 'GastroStation' },
    59: { name: 'Nephrology',       klass: 'NephrologyStation' },
    60: { name: 'Endocrinology',    klass: 'EndocrineStation' },
    61: { name: 'Rheumatology',     klass: 'RheumaStation' },
    62: { name: 'Dermatology',      klass: 'DermStation' },
    63: { name: 'Infectious',       klass: 'InfectiousStation' },
    64: { name: 'Oncology',         klass: 'OncologyStation' },
    // OBGYN + Critical (65-66)
    65: { name: 'OBGYN-Peds',       klass: 'ObgynPedsStation' },
    66: { name: 'CriticalCare',     klass: 'CriticalStation' },
    // Diagnostics (67-70)
    67: { name: 'Lab',              klass: 'LabStation' },
    68: { name: 'Radiology',        klass: 'RadiologyStation' },
    69: { name: 'Functional',       klass: 'FunctionalTestsStation' },
    70: { name: 'Diagnostics',      klass: 'DiagnosticsStation' },
    // Critical care (71-75)
    71: { name: 'ER',               klass: 'ERStation' },
    72: { name: 'ICU',              klass: 'ICUStation' },
    73: { name: 'Anesthesia',       klass: 'AnesthesiaStation' },
    74: { name: 'PACU',             klass: 'PACUStation' },
    75: { name: 'NICU',             klass: 'NICUStation' }
    // NOTE: Phase 3 Engines gallery appended to NAV_ITEMS[75] in app.js as the last item.
    // It is rendered by renderPhase3Engines() below, NOT by the Stitch STATION_PAGES map.
  };

  // Render the Phase 3 Engines UI gallery (page 75 = last NAV_ITEMS index).
  // The Phase3EnginesUI module exposes a global with autoMount + render functions.
  function renderPhase3Engines(page) {
    var el = document.getElementById('pageContent');
    if (!el) return false;
    var UI = window.Phase3EnginesUI;
    if (!UI || typeof UI.render !== 'function') {
      el.innerHTML = '<div class="page-title">🧮 Phase 3 Engines</div>' +
        '<div class="card" style="padding:24px;text-align:center">' +
          '<p>Phase 3 Engines module is loading. Please refresh once if needed.</p>' +
        '</div>';
      return true;
    }
    try {
      el.innerHTML = '<div id="phase3EnginesGallery"></div>';
      UI.renderWithSearch(document.getElementById('phase3EnginesGallery'));
      return true;
    } catch (err) {
      console.error('[routing-patch] Phase3EnginesUI.render failed', err);
      el.innerHTML = '<div class="page-title">🧮 Phase 3 Engines</div>' +
        '<div class="card" style="padding:24px;text-align:center">' +
          '<p>Error loading Phase 3 Engines: ' + String(err && err.message || err) + '</p>' +
        '</div>';
      return true;
    }
  }

  function renderPlaceholder(page, meta) {
    var el = document.getElementById('pageContent');
    if (!el) return;
    var tr = window.tr || function (e) { return e; };
    el.innerHTML =
      '<div class="page-title">🩺 ' + tr(meta.name, meta.name) + '</div>' +
      '<div class="card" style="padding:24px;text-align:center">' +
        '<p style="font-size:14px;color:#475569">' +
          tr('Module is loading. Please refresh once if needed.',
             'الوحدة قيد التحميل. يرجى التحديث مرة واحدة عند الحاجة.') +
        '</p>' +
      '</div>';
  }

  function renderStation(page) {
    // Phase 3 Engines gallery: handled by renderPhase3Engines, not a Stitch station class.
    if (page === 75) return renderPhase3Engines(page);
    var meta = STATION_PAGES[page];
    if (!meta) return false;

    var StationClass = window[meta.klass];
    if (!StationClass || typeof StationClass.render !== 'function') {
      renderPlaceholder(page, meta);
      return true;
    }

    var real = document.getElementById('pageContent');
    if (!real) return false;

    // Forward 'app-content' to the real pageContent during render.
    var origGetById = document.getElementById.bind(document);
    document.getElementById = function (id) {
      if (id === 'app-content') return real;
      return origGetById(id);
    };

    try {
      StationClass.render(null);
      return true;
    } catch (err) {
      console.error('[routing-patch] ' + meta.klass + '.render failed', err);
      renderPlaceholder(page, meta);
      return true;
    } finally {
      document.getElementById = origGetById;
    }
  }

  // Expose routes globally so other code (NAV_ACCESS_RULES, ACL, etc.) can query.
  window.__stitchStationRoutes = STATION_PAGES;

  // Public helper that callers (loadPage, custom nav) can invoke.
  window.handlePageRender = function (page) {
    if (page === 75) return renderPhase3Engines(page);
    if (STATION_PAGES[page]) return renderStation(page);
    return false;
  };

  // Patch navigateTo to short-circuit for our pages.
  function tryPatchNavigateTo() {
    if (typeof window.navigateTo !== 'function') return false;
    if (window.navigateTo.__stitchPatched) return true;
    var orig = window.navigateTo;
    var patched = function (page) {
      if (page === 75) {
        if (renderPhase3Engines(page)) {
          try {
            if (window.currentPage !== page) window.currentPage = page;
            document.querySelectorAll('.nav-item').forEach(function (el) {
              el.classList.toggle('active', parseInt(el.dataset.page, 10) === page);
            });
            var item = (window.NAV_ITEMS || [])[page];
            var hdr = document.getElementById('headerTitle');
            if (hdr && item) {
              hdr.textContent = (window.tr || function (e) { return e; })(item.en, item.ar);
            }
            var sb = document.getElementById('sidebar');
            var ov = document.getElementById('sidebarOverlay');
            if (sb) sb.classList.remove('open');
            if (ov) ov.classList.remove('show');
          } catch (e) { /* best-effort */ }
          return;
        }
      }
      if (STATION_PAGES[page] && renderStation(page)) {
        try {
          if (window.currentPage !== page) window.currentPage = page;
          document.querySelectorAll('.nav-item').forEach(function (el) {
            el.classList.toggle('active', parseInt(el.dataset.page, 10) === page);
          });
          var item = (window.NAV_ITEMS || [])[page];
          var hdr = document.getElementById('headerTitle');
          if (hdr && item) {
            hdr.textContent = (window.tr || function (e) { return e; })(item.en, item.ar);
          }
          var sb = document.getElementById('sidebar');
          var ov = document.getElementById('sidebarOverlay');
          if (sb) sb.classList.remove('open');
          if (ov) ov.classList.remove('show');
        } catch (e) { /* best-effort */ }
        return;
      }
      return orig.apply(this, arguments);
    };
    patched.__stitchPatched = true;
    window.navigateTo = patched;
    return true;
  }

  // navigateTo may appear after this script if app.js loads async; poll briefly.
  var patchAttempts = 0;
  var patchTimer = setInterval(function () {
    patchAttempts += 1;
    if (tryPatchNavigateTo() || patchAttempts > 200) clearInterval(patchTimer);
  }, 25);

  console.info('[routing-patch] Loaded ' + Object.keys(STATION_PAGES).length + ' stitch station routes (48-75).');
})();
