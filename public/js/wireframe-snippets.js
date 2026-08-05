'use strict';
// Wireframe Snippet Library v1 — reusable HTML/Tailwind patterns.

const escapeHTML = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const W = {};

W.queueCard = function ({ mrn, name, age, sex, wait, risk = 'normal', complaint, onOpen, lang = 'en-US' }) {
  const rtl = ['ar-SA', 'ur-PK', 'fa-IR', 'he-IL'].includes(lang);
  const riskColor = { high: 'rose', moderate: 'amber', normal: 'emerald', low: 'sky' }[risk] || 'emerald';
  return `
    <div class="bg-white rounded-lg shadow p-3 mb-2 border-l-4 border-${riskColor}-500 cursor-pointer hover:shadow-md transition" onclick="${onOpen || ''}" dir="${rtl ? 'rtl' : 'ltr'}">
      <div class="flex items-start justify-between">
        <div>
          <div class="text-sm font-semibold text-slate-900">${escapeHTML(name)}</div>
          <div class="text-xs text-slate-500">${escapeHTML(sex || '')} · ${age || '—'} · ${escapeHTML(mrn)}</div>
          <div class="text-xs text-slate-600 mt-1">${escapeHTML(complaint || '')}</div>
        </div>
        <div class="text-right">
          <div class="text-xs text-slate-500">Wait</div>
          <div class="text-sm font-bold text-${riskColor}-700">${escapeHTML(String(wait))}m</div>
        </div>
      </div>
    </div>
  `;
};

W.vitalsStrip = function ({ hr, sbp, dbp, temp, spo2, rr, time = 'now' }) {
  const cell = (label, val, unit, color) => `
    <div class="bg-white rounded p-2 border border-slate-200">
      <div class="text-xs text-slate-500">${escapeHTML(label)}</div>
      <div class="text-lg font-bold text-${color || 'slate'}-700">${escapeHTML(val || '—')}<span class="text-xs font-normal text-slate-400">${escapeHTML(unit || '')}</span></div>
    </div>
  `;
  return `
    <div class="grid grid-cols-3 md:grid-cols-6 gap-2 mb-3">
      ${cell('HR', hr, 'bpm', 'rose')}
      ${cell('SBP', sbp, 'mmHg', 'sky')}
      ${cell('DBP', dbp, 'mmHg', 'sky')}
      ${cell('Temp', temp, '°C', 'amber')}
      ${cell('SpO₂', spo2, '%', 'emerald')}
      ${cell('RR', rr, '/min', 'violet')}
    </div>
    <div class="text-xs text-slate-400 mb-2">Recorded ${escapeHTML(time)}</div>
  `;
};

W.orderRow = function ({ code, name, qty, priority = 'routine', status = 'pending', onCancel }) {
  const priColor = { stat: 'rose', urgent: 'amber', routine: 'sky' }[priority] || 'sky';
  const statusColor = { pending: 'amber', active: 'sky', done: 'emerald', cancelled: 'slate' }[status] || 'amber';
  return `
    <div class="bg-white border border-slate-200 rounded p-2 mb-1 flex items-center justify-between">
      <div>
        <div class="text-sm font-medium text-slate-900">${escapeHTML(name)}</div>
        <div class="text-xs text-slate-500">${escapeHTML(code)} · qty ${escapeHTML(String(qty))}</div>
      </div>
      <div class="flex items-center gap-2">
        <span class="text-xs px-2 py-0.5 rounded bg-${priColor}-100 text-${priColor}-800">${escapeHTML(priority)}</span>
        <span class="text-xs px-2 py-0.5 rounded bg-${statusColor}-100 text-${statusColor}-800">${escapeHTML(status)}</span>
        ${onCancel ? `<button onclick="${onCancel}" class="text-xs text-rose-600 hover:underline">Cancel</button>` : ''}
      </div>
    </div>
  `;
};

W.field = function ({ name, label, type = 'text', value = '', placeholder = '', required = false }) {
  const req = required ? '<span class="text-rose-500">*</span>' : '';
  const inputType = type === 'textarea' ? 'textarea' : 'input';
  if (type === 'textarea') {
    return `<div class="mb-3"><label class="block text-sm font-medium text-slate-700 mb-1">${escapeHTML(label)}${req}</label><textarea name="${escapeHTML(name)}" placeholder="${escapeHTML(placeholder)}" class="w-full border border-slate-300 rounded p-2 text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500" rows="3">${escapeHTML(value)}</textarea></div>`;
  }
  return `<div class="mb-3"><label class="block text-sm font-medium text-slate-700 mb-1">${escapeHTML(label)}${req}</label><input type="${escapeHTML(type)}" name="${escapeHTML(name)}" value="${escapeHTML(value)}" placeholder="${escapeHTML(placeholder)}" class="w-full border border-slate-300 rounded p-2 text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500" /></div>`;
};

W.tabs = function ({ tabs, active, onChange }) {
  return `
    <div class="flex border-b border-slate-200 mb-3 overflow-x-auto">
      ${tabs.map((t) => `
        <button onclick="${onChange}('${escapeHTML(t.id)}')" class="px-3 py-2 text-sm font-medium whitespace-nowrap ${active === t.id ? 'border-b-2 border-sky-500 text-sky-700' : 'text-slate-500 hover:text-slate-700'}">
          ${escapeHTML(t.label)}${t.badge ? `<span class="ml-1 text-xs bg-rose-100 text-rose-700 px-1 rounded">${escapeHTML(String(t.badge))}</span>` : ''}
        </button>
      `).join('')}
    </div>
  `;
};

W.actionBar = function ({ buttons }) {
  return `
    <div class="flex flex-wrap gap-2 mb-3">
      ${buttons.map((b) => `
        <button onclick="${b.onClick || ''}" class="px-3 py-2 text-sm rounded ${b.primary ? 'bg-sky-600 text-white hover:bg-sky-700' : b.danger ? 'bg-rose-600 text-white hover:bg-rose-700' : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'}">
          ${b.icon ? `<span class="mr-1">${b.icon}</span>` : ''}${escapeHTML(b.label)}
        </button>
      `).join('')}
    </div>
  `;
};

W.section = function ({ id, title, body, actions }) {
  return `
    <section id="${escapeHTML(id)}" class="bg-white rounded-lg shadow p-4 mb-3">
      <div class="flex items-center justify-between mb-2">
        <h3 class="text-md font-semibold text-slate-800">${escapeHTML(title)}</h3>
        ${actions ? `<div class="flex gap-1">${actions.map((a) => `<button onclick="${a.onClick}" class="text-xs px-2 py-1 rounded bg-sky-50 text-sky-700 border border-sky-200">${escapeHTML(a.label)}</button>`).join('')}</div>` : ''}
      </div>
      <div class="text-sm text-slate-700">${body || ''}</div>
    </section>
  `;
};

W.emptyState = function ({ title = 'No data yet', message = '', action }) {
  return `
    <div class="bg-white rounded-lg border border-dashed border-slate-300 p-8 text-center">
      <div class="text-4xl mb-2">📋</div>
      <div class="text-sm font-medium text-slate-700 mb-1">${escapeHTML(title)}</div>
      <div class="text-xs text-slate-500 mb-3">${escapeHTML(message)}</div>
      ${action ? `<button onclick="${action.onClick}" class="px-3 py-1 text-sm bg-sky-600 text-white rounded">${escapeHTML(action.label)}</button>` : ''}
    </div>
  `;
};

W.riskBadge = function ({ risk }) {
  const map = { high: { c: 'rose', t: 'High Risk' }, moderate: { c: 'amber', t: 'Moderate' }, low: { c: 'sky', t: 'Low Risk' }, normal: { c: 'emerald', t: 'Stable' } };
  const cfg = map[risk] || map.normal;
  return `<span class="text-xs px-2 py-0.5 rounded bg-${cfg.c}-100 text-${cfg.c}-800">${cfg.t}</span>`;
};

window.W = W;
