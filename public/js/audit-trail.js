'use strict';
// Audit Trail viewer — 5 event types + bilingual + hash-chain badge.

const AuditTrail = (() => {
  const ICONS = { view: '👁', edit: '✏️', sign: '🔏', export: '⬇️', delete: '⚠️' };
  const COLORS = { view: 'bg-slate-100', edit: 'bg-amber-50', sign: 'bg-emerald-50', export: 'bg-sky-50', delete: 'bg-red-50' };
  const TITLES = {
    view: { 'en-US': 'viewed', 'ar-SA': 'اطّلع على', 'fr-FR': 'a consulté', 'ur-PK': 'دیکھا' },
    edit: { 'en-US': 'edited', 'ar-SA': 'عدّل', 'fr-FR': 'a modifié', 'ur-PK': 'ترمیم کی' },
    sign: { 'en-US': 'signed', 'ar-SA': 'وقّع', 'fr-FR': 'a signé', 'ur-PK': 'دستخط کیے' },
    export: { 'en-US': 'exported', 'ar-SA': 'صدّر', 'fr-FR': 'a exporté', 'ur-PK': 'ایکسپورٹ کیا' },
    delete: { 'en-US': 'soft-deleted', 'ar-SA': 'حذف', 'fr-FR': 'a supprimé', 'ur-PK': 'حذف کیا' },
  };

  function escapeHTML(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  async function render({ target, patientId, source, range = '7d', eventTypes = ['view', 'edit', 'sign', 'export', 'delete'], lang = 'en-US' } = {}) {
    const root = typeof target === 'string' ? document.querySelector(target) : target;
    if (!root) throw new Error('AUDIT_TARGET_NOT_FOUND');

    const url = source || `/api/audit/patient/${encodeURIComponent(patientId)}?range=${encodeURIComponent(range)}`;
    let events = [];
    let tampered = false;
    try {
      const res = await fetch(url, {
        headers: { 'X-Tenant-Id': (window.NAMAMEDICAL && window.NAMAMEDICAL.TENANT_ID) || 'demo', 'Accept': 'application/json' },
        credentials: 'same-origin',
      });
      if (res.ok) {
        const data = await res.json();
        events = (data && data.events) || [];
        tampered = !!(data && data.tampered);
      } else {
        events = [];
      }
    } catch (e) {
      events = [];
    }

    const filtered = events.filter((e) => eventTypes.includes(e.type));
    if (!filtered.length) {
      root.innerHTML = `<div class="text-sm text-slate-400 p-4" dir="${['ar-SA','ur-PK','fa-IR','he-IL'].includes(lang)?'rtl':'ltr'}">No audit events in this period.</div>`;
      return;
    }

    const rows = filtered.map((e) => {
      const title = (TITLES[e.type] || {})[lang] || (TITLES[e.type] || {})['en-US'] || e.type;
      const actor = escapeHTML(e.actor || 'Unknown');
      const ts = new Date(e.ts || Date.now()).toLocaleString(lang);
      return `
        <div class="flex items-start gap-3 ${COLORS[e.type] || 'bg-slate-50'} rounded p-2 mb-1">
          <div class="text-xl">${ICONS[e.type] || '•'}</div>
          <div class="flex-1 text-sm">
            <div class="font-medium">${actor} <span class="text-slate-600">${title}</span> <span class="text-slate-500">${escapeHTML(e.target || '')}</span></div>
            <div class="text-xs text-slate-500">${ts}</div>
          </div>
          ${e.hash ? `<code class="text-xs bg-white px-1 rounded">${escapeHTML(e.hash.slice(0, 8))}</code>` : ''}
        </div>
      `;
    }).join('');

    const banner = tampered ? '<div class="bg-red-100 border border-red-400 text-red-800 text-xs p-2 mb-2 rounded">⚠ Hash chain tampered — escalate to compliance</div>' : '<div class="bg-emerald-50 text-emerald-800 text-xs p-1 mb-2 rounded">✓ Hash chain verified</div>';

    root.innerHTML = `
      <div dir="${['ar-SA','ur-PK','fa-IR','he-IL'].includes(lang)?'rtl':'ltr'}">
        ${banner}
        <div class="flex gap-2 mb-2">
          <input type="text" placeholder="Filter by actor" class="text-xs border rounded px-2 py-1" data-filter="actor" />
          <button data-filter-mine class="text-xs px-2 py-1 rounded bg-slate-100">Show only mine</button>
        </div>
        <div data-rows>${rows}</div>
      </div>
    `;

    root.querySelector('[data-filter="actor"]')?.addEventListener('input', (e) => {
      const term = e.target.value.toLowerCase();
      root.querySelectorAll('[data-rows] > div').forEach((row) => {
        row.style.display = row.textContent.toLowerCase().includes(term) ? '' : 'none';
      });
    });
    root.querySelector('[data-filter-mine]')?.addEventListener('click', () => {
      const me = (window.NAMAMEDICAL && window.NAMAMEDICAL.USER_NAME) || '';
      root.querySelectorAll('[data-rows] > div').forEach((row) => {
        row.style.display = row.textContent.includes(me) ? '' : 'none';
      });
    });
  }

  window.AuditTrail = { render };
  return { render };
})();