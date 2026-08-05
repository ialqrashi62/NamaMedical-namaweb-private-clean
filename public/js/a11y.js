// --- A11Y HELPERS (Wave 13 — accessibility sweep) ---
// Pattern: small composable functions that emit safe ARIA markup.
// Hooks: prefer existing escapeHTML / jsStr / safeUrl from app.js.
(function () {
  'use strict';

  // Returns attribute string for a button: aria-label + role if specified.
  // Usage: <button ${a11y.btnAria('Close modal')} ...>
  function btnAria(label, extraRole) {
    var s = ' aria-label="' + window.escapeHTML(label || '') + '"';
    if (extraRole) s += ' role="' + window.escapeHTML(extraRole) + '"';
    return s;
  }

  // Returns attribute string for a dialog wrapper: role="dialog" + aria-modal + aria-labelledby.
  // Pass the id of the heading element to link.
  function dialogAria(labelledById, describedById) {
    var s = ' role="dialog" aria-modal="true"';
    if (labelledById) s += ' aria-labelledby="' + window.escapeHTML(labelledById) + '"';
    if (describedById) s += ' aria-describedby="' + window.escapeHTML(describedById) + '"';
    return s;
  }

  // Returns attribute string for an aria-live region.
  // politeness: 'polite' (default) | 'assertive' | 'off'
  function liveAria(politeness, atomic) {
    var p = politeness || 'polite';
    var a = (atomic === false) ? 'false' : 'true';
    return ' aria-live="' + p + '" aria-atomic="' + a + '"';
  }

  // Returns a visually-hidden inline span for screen readers only.
  // CSS: position absolute; clip; width 1px; height 1px; overflow hidden.
  function srOnly(text) {
    return '<span class="sr-only">' + window.escapeHTML(text || '') + '</span>';
  }

  // Build an icon-only close button (✕) that is screen-reader-friendly.
  // label: the accessible name (e.g. 'Close', 'إغلاق').
  // onClick: JS expression string (already escaped by caller if needed).
  function iconCloseBtn(label, onClickExpr) {
    var safeLabel = window.escapeHTML(label || 'Close');
    var safeClick = String(onClickExpr || '').replace(/"/g, '&quot;');
    return '<button type="button" aria-label="' + safeLabel + '"' +
      ' onclick="' + safeClick + '"' +
      ' style="border:none;background:none;font-size:20px;cursor:pointer;line-height:1" title="' + safeLabel + '">' +
      '<span aria-hidden="true">\u2715</span></button>';
  }

  // Build a labelled icon-prefixed button for action clarity.
  // icon: emoji or short string (e.g. '🚪'); ariaLabel: full accessible name.
  function actionBtn(label, ariaLabel, extraClass, onClickExpr) {
    var safeLabel = window.escapeHTML(label || '');
    var safeAria = window.escapeHTML(ariaLabel || label || '');
    var safeClick = String(onClickExpr || '').replace(/"/g, '&quot;');
    var cls = extraClass ? ' ' + window.escapeHTML(extraClass) : '';
    return '<button type="button" class="btn' + cls + '" aria-label="' + safeAria + '"' +
      ' onclick="' + safeClick + '">' + safeLabel + '</button>';
  }

  // Build the global live-status region markup (idempotent — safe to call many times).
  function ensureLiveStatus() {
    if (typeof document === 'undefined') return null;
    var existing = document.getElementById('nmLiveStatus');
    if (existing) return existing;
    var el = document.createElement('div');
    el.id = 'nmLiveStatus';
    el.className = 'sr-only';
    el.setAttribute('aria-live', 'polite');
    el.setAttribute('aria-atomic', 'true');
    // Insert at top of body so it is announced promptly.
    if (document.body && document.body.firstChild) {
      document.body.insertBefore(el, document.body.firstChild);
    } else if (document.body) {
      document.body.appendChild(el);
    }
    return el;
  }

  // Announce a message to screen readers via the live region.
  // Replaces content (so identical successive messages still re-announce).
  function announce(message) {
    if (!message) return;
    var el = ensureLiveStatus();
    if (!el) return;
    // Clear then set after a tick so successive identical messages are read.
    el.textContent = '';
    setTimeout(function () { el.textContent = String(message); }, 50);
  }

  // Trap focus within a modal element. Call after opening.
  function trapFocus(modalEl) {
    if (!modalEl) return function () {};
    var focusableSel = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
    var focusables = modalEl.querySelectorAll(focusableSel);
    if (!focusables.length) return function () {};
    var first = focusables[0];
    var last = focusables[focusables.length - 1];
    function onKey(e) {
      if (e.key !== 'Tab') return;
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    modalEl.addEventListener('keydown', onKey);
    try { first.focus(); } catch (_e) { /* noop */ }
    return function release() { modalEl.removeEventListener('keydown', onKey); };
  }

  // Expose.
  window.a11y = {
    btnAria: btnAria,
    dialogAria: dialogAria,
    liveAria: liveAria,
    srOnly: srOnly,
    iconCloseBtn: iconCloseBtn,
    actionBtn: actionBtn,
    ensureLiveStatus: ensureLiveStatus,
    announce: announce,
    trapFocus: trapFocus
  };
})();
