/* NamaMedical ERP — PWA registration
 * Registers /sw.js, manages meta tags, and bridges update / controllerchange events.
 * Loaded with `defer` from index.html. Defensive: never throws.
 */
(function () {
  'use strict';

  if (!('serviceWorker' in navigator)) return;

  // ---- Ensure required <head> tags (idempotent, XSS-safe) ----
  function ensureHeadTags() {
    try {
      var head = document.head;
      if (!head) return;

      if (!document.querySelector('link[rel="manifest"]')) {
        var link = document.createElement('link');
        link.rel = 'manifest';
        link.href = '/manifest.json';
        head.appendChild(link);
      }
      if (!document.querySelector('meta[name="theme-color"]')) {
        var meta = document.createElement('meta');
        meta.setAttribute('name', 'theme-color');
        meta.setAttribute('content', '#006970');
        head.appendChild(meta);
      }
      if (!document.querySelector('meta[name="apple-mobile-web-app-capable"]')) {
        var apple = document.createElement('meta');
        apple.setAttribute('name', 'apple-mobile-web-app-capable');
        apple.setAttribute('content', 'yes');
        head.appendChild(apple);
      }
      if (!document.querySelector('link[rel="apple-touch-icon"]')) {
        var ai = document.createElement('link');
        ai.rel = 'apple-touch-icon';
        ai.href = '/img/logo.png';
        head.appendChild(ai);
      }
    } catch (e) {
      // head ops are best-effort
    }
  }

  // ---- Toast bridge ----
  // Prefer the existing showToast from app.js if loaded; else inject a tiny one.
  function showUpdateToast(message) {
    try {
      if (typeof window.showToast === 'function') {
        window.showToast(message, 'success');
        return;
      }
    } catch (e) { /* fall through */ }
    try {
      var t = document.getElementById('namaPwaToast');
      if (!t) {
        t = document.createElement('div');
        t.id = 'namaPwaToast';
        t.setAttribute('role', 'status');
        t.setAttribute('aria-live', 'polite');
        t.style.cssText = 'position:fixed;bottom:20px;right:20px;left:20px;max-width:420px;margin:0 auto;'
          + 'background:#006970;color:#fff;padding:12px 18px;border-radius:10px;'
          + 'box-shadow:0 6px 20px rgba(0,0,0,0.25);font:14px/1.5 sans-serif;z-index:9999;'
          + 'opacity:0;transition:opacity .25s ease;text-align:center;';
        document.body.appendChild(t);
      }
      t.textContent = message;
      t.style.opacity = '1';
      setTimeout(function () { t.style.opacity = '0'; }, 4000);
    } catch (e) { /* silent */ }
  }

  // ---- Register SW on load ----
  window.addEventListener('load', function () {
    ensureHeadTags();
    try {
      navigator.serviceWorker.register('/sw.js', { scope: '/' })
        .then(function (reg) {
          reg.addEventListener('updatefound', function () {
            var nw = reg.installing;
            if (!nw) return;
            nw.addEventListener('statechange', function () {
              if (nw.state === 'installed' && navigator.serviceWorker.controller) {
                showUpdateToast('يتوفر تحديث جديد — سيتم التحديث تلقائياً');
              }
            });
          });
        })
        .catch(function (err) {
          // Fail-soft; do not break the app if SW is blocked (e.g. private mode)
          console.warn('[PWA] SW registration failed', err);
        });
    } catch (e) {
      console.warn('[PWA] SW unavailable', e);
    }
  });

  // ---- Reload once the new SW takes over ----
  var reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', function () {
    if (reloading) return;
    reloading = true;
    location.reload();
  });
})();
