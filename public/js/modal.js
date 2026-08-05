'use strict';
// Enhanced Modal Framework v2 — Modal.open, Modal.confirm, Modal.toast, Modal.close,
// Modal.list, Modal.asyncJob. AR/EN + RTL + focus trap + scroll lock.

const escapeHTML = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const getLang = () => (document.documentElement && document.documentElement.lang) || 'en-US';

const Modal = (() => {
  let backFocus = null;
  const root = () => (document.getElementById('modal-root') || ensureRoot());

  function ensureRoot() {
    let r = document.createElement('div');
    r.id = 'modal-root';
    r.className = 'fixed inset-0 z-[9999] pointer-events-none';
    document.body.appendChild(r);
    return r;
  }

  function trapFocus(container, onClose) {
    function keydown(e) {
      if (e.key === 'Escape') { onClose && onClose(true); return; }
      if (e.key !== 'Tab') return;
      const focusable = Array.from(container.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'));
      if (focusable.length === 0) return;
      const first = focusable[0]; const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    const focusable = container.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (focusable.length) focusable[0].focus();
    container.addEventListener('keydown', keydown);
  }

  function lockScroll(lock) {
    document.body.style.overflow = lock ? 'hidden' : '';
  }

  function renderFields(fields) {
    return (fields || []).map((f) => {
      const required = f.required ? ' <span class="text-rose-500">*</span>' : '';
      const req = f.required ? 'required' : '';
      if (f.type === 'textarea') {
        return `<div class="mb-3"><label class="block text-sm font-medium text-slate-700 mb-1">${escapeHTML(f.label)}${required}</label><textarea data-field="${escapeHTML(f.name)}" rows="${f.rows || 3}" placeholder="${escapeHTML(f.placeholder || '')}" class="w-full border border-slate-300 rounded p-2 text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500" ${req}>${escapeHTML(f.value || '')}</textarea></div>`;
      }
      if (f.type === 'select') {
        const opts = (f.options || []).map((o) => `<option value="${escapeHTML(o.value)}" ${o.value === f.value ? 'selected' : ''}>${escapeHTML(o.label)}</option>`).join('');
        return `<div class="mb-3"><label class="block text-sm font-medium text-slate-700 mb-1">${escapeHTML(f.label)}${required}</label><select data-field="${escapeHTML(f.name)}" class="w-full border border-slate-300 rounded p-2 text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500" ${req}>${opts}</select></div>`;
      }
      if (f.type === 'checkbox') {
        return `<div class="mb-3"><label class="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" data-field="${escapeHTML(f.name)}" ${f.value ? 'checked' : ''} class="rounded" />${escapeHTML(f.label)}</label></div>`;
      }
      return `<div class="mb-3"><label class="block text-sm font-medium text-slate-700 mb-1">${escapeHTML(f.label)}${required}</label><input type="${escapeHTML(f.type || 'text')}" data-field="${escapeHTML(f.name)}" value="${escapeHTML(f.value || '')}" placeholder="${escapeHTML(f.placeholder || '')}" class="w-full border border-slate-300 rounded p-2 text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500" ${req} /></div>`;
    }).join('');
  }

  function collectValues(wrap) {
    const out = {};
    wrap.querySelectorAll('[data-field]').forEach((el) => {
      out[el.getAttribute('data-field')] = (el.type === 'checkbox') ? el.checked : el.value;
    });
    return out;
  }

  function open(opts = {}) {
    const lang = opts.lang || getLang();
    const rtl = ['ar-SA', 'ur-PK', 'fa-IR', 'he-IL'].includes(lang);
    const title = opts.title || '';
    const html = opts.body || '';
    const hidePrimary = opts.hidePrimary === true;
    const danger = opts.danger === true;
    const fields = opts.fields || [];
    const onConfirm = opts.onConfirm || null;
    const onCancel = opts.onCancel || null;
    const primaryLabel = opts.primaryLabel || 'Save';
    const secondaryLabel = opts.secondaryLabel || 'Cancel';
    const width = opts.width || 'max-w-lg';

    backFocus = document.activeElement;
    lockScroll(true);

    const wrap = document.createElement('div');
    wrap.className = 'fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.setAttribute('aria-labelledby', 'modal-title');
    wrap.dir = rtl ? 'rtl' : 'ltr';
    wrap.innerHTML = `
      <div class="bg-white rounded-lg shadow-2xl w-full ${width} max-h-[90vh] overflow-y-auto">
        <div class="flex items-center justify-between px-5 py-3 border-b border-slate-200">
          <h3 id="modal-title" class="text-lg font-semibold text-slate-900">${escapeHTML(title)}</h3>
          <button data-action="cancel" aria-label="Close" class="text-slate-400 hover:text-slate-700 text-2xl leading-none">×</button>
        </div>
        <div class="px-5 py-4">
          ${html ? `<div class="mb-3 text-sm text-slate-700">${html}</div>` : ''}
          ${renderFields(fields)}
        </div>
        <div class="px-5 pb-4">
          <div class="flex items-center justify-${rtl ? 'start' : 'end'} gap-2">
            <button data-action="cancel" class="px-4 py-2 text-sm rounded border border-slate-300 text-slate-700 hover:bg-slate-50">${escapeHTML(secondaryLabel)}</button>
            ${hidePrimary ? '' : `<button data-action="confirm" class="px-4 py-2 text-sm rounded text-white ${danger ? 'bg-rose-600 hover:bg-rose-700' : 'bg-sky-600 hover:bg-sky-700'}">${escapeHTML(primaryLabel)}</button>`}
          </div>
        </div>
      </div>
    `;

    const rootEl = root();
    rootEl.innerHTML = '';
    rootEl.appendChild(wrap);
    rootEl.classList.remove('pointer-events-none');

    trapFocus(wrap, () => close());

    wrap.addEventListener('click', (e) => {
      const action = e.target.getAttribute('data-action');
      if (action === 'confirm') {
        const values = collectValues(wrap);
        const missing = fields.find((f) => f.required && !values[f.name]);
        if (missing) {
          const i = wrap.querySelector(`[data-field="${missing.name}"]`);
          if (i) { i.focus(); i.classList.add('ring-2', 'ring-rose-500'); }
          return;
        }
        if (onConfirm) onConfirm(values);
        close();
      } else if (action === 'cancel') {
        if (onCancel) onCancel();
        close();
      }
    });
    wrap.addEventListener('click', (e) => { if (e.target === wrap) { if (onCancel) onCancel(); close(); } });

    return { close: () => close(), values: () => collectValues(wrap) };
  }

  function close() {
    const r = root();
    r.innerHTML = '';
    r.classList.add('pointer-events-none');
    lockScroll(false);
    if (backFocus && backFocus.focus) backFocus.focus();
  }

  function confirm(message, opts = {}) {
    return new Promise((resolve) => {
      open({
        title: opts.title || 'Confirm',
        body: `<p>${escapeHTML(message)}</p>`,
        danger: opts.danger,
        primaryLabel: opts.primaryLabel || 'Confirm',
        secondaryLabel: opts.secondaryLabel || 'Cancel',
        onConfirm: () => resolve(true),
        onCancel: () => resolve(false),
      });
    });
  }

  function toast(message, opts = {}) {
    const t = document.createElement('div');
    const color = {
      success: 'bg-emerald-600',
      error: 'bg-rose-600',
      info: 'bg-sky-600',
      warn: 'bg-amber-600',
    }[opts.type || 'info'];
    t.className = `fixed bottom-4 right-4 ${color} text-white px-4 py-2 rounded shadow-lg z-[11000] text-sm flex items-center gap-2`;
    const icon = { success: '✓', error: '✕', warn: '!', info: 'i' }[opts.type || 'info'];
    t.innerHTML = `<span class="font-bold">${icon}</span><span>${escapeHTML(message)}</span>`;
    document.body.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity 0.3s'; setTimeout(() => t.remove(), 300); }, opts.durationMs || 3000);
  }

  function list(opts) {
    return new Promise((resolve) => {
      const items = (opts.items || []).map((it, i) => `
        <button data-id="${escapeHTML(String(it.id || i))}" class="w-full text-left px-3 py-2 rounded hover:bg-sky-50 border border-slate-200 mb-1 flex items-center justify-between">
          <span>${escapeHTML(it.label)}</span>
          ${it.badge ? `<span class="text-xs text-slate-500">${escapeHTML(it.badge)}</span>` : ''}
        </button>
      `).join('');

      const wrap = document.createElement('div');
      wrap.className = 'fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm';
      wrap.innerHTML = `
        <div class="bg-white rounded-lg shadow-2xl w-full max-w-md max-h-[80vh] overflow-y-auto">
          <div class="flex items-center justify-between px-5 py-3 border-b border-slate-200">
            <h3 class="text-lg font-semibold text-slate-900">${escapeHTML(opts.title || 'Select')}</h3>
            <button data-picker="cancel" class="text-slate-400 hover:text-slate-700 text-2xl leading-none">×</button>
          </div>
          <div class="px-2 py-2">${items || '<p class="text-sm text-slate-500 px-3 py-2">No items</p>'}</div>
        </div>
      `;
      const rootEl = root();
      rootEl.innerHTML = '';
      rootEl.appendChild(wrap);
      rootEl.classList.remove('pointer-events-none');
      lockScroll(true);
      backFocus = document.activeElement;

      wrap.addEventListener('click', (e) => {
        const pick = e.target.closest('[data-id]');
        if (pick) { resolve(items.find ? items.find(it => it.id === pick.getAttribute('data-id')) : { id: pick.getAttribute('data-id') }); close(); }
        if (e.target.getAttribute('data-picker') === 'cancel') { resolve(null); close(); }
      });
    });
  }

  function asyncJob(opts) {
    return new Promise((resolve) => {
      const wrap = document.createElement('div');
      wrap.className = 'fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm';
      wrap.innerHTML = `
        <div class="bg-white rounded-lg shadow-2xl w-full max-w-sm p-5 text-center">
          <h3 class="text-lg font-semibold text-slate-900 mb-2">${escapeHTML(opts.title || 'Processing')}</h3>
          <p class="text-sm text-slate-600 mb-3">${escapeHTML(opts.message || '')}</p>
          <div class="w-full h-2 bg-slate-200 rounded overflow-hidden"><div data-progress class="h-2 bg-sky-600" style="width:0%"></div></div>
          <p data-status class="text-xs text-slate-500 mt-2">Starting...</p>
        </div>
      `;
      const rootEl = root();
      rootEl.innerHTML = '';
      rootEl.appendChild(wrap);
      rootEl.classList.remove('pointer-events-none');
      lockScroll(true);
      backFocus = document.activeElement;

      const progressBar = wrap.querySelector('[data-progress]');
      const statusText = wrap.querySelector('[data-status]');
      let pct = 0;
      const tick = setInterval(() => {
        pct = Math.min(95, pct + Math.floor(Math.random() * 15) + 5);
        if (progressBar) progressBar.style.width = pct + '%';
        if (statusText) statusText.textContent = pct + '% complete';
      }, 200);

      Promise.resolve(opts.run()).then((result) => {
        clearInterval(tick);
        if (progressBar) progressBar.style.width = '100%';
        if (statusText) statusText.textContent = 'Done';
        setTimeout(() => { close(); resolve(result); }, 300);
      }).catch((err) => {
        clearInterval(tick);
        if (statusText) statusText.textContent = 'Failed: ' + err.message;
        setTimeout(() => { close(); resolve(null); }, 1500);
      });
    });
  }

  return { open, close, confirm, toast, list, asyncJob };
})();

window.Modal = Modal;

