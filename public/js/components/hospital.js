'use strict';
// Hospital Component Library v1 — reusable hospital-specific UI components.

const escapeHTML = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const H = {};

H.patientIDCard = function ({ mrn, name, dob, photo, allergies = [], sex }) {
  const photoHtml = photo
    ? `<img src="${escapeHTML(photo)}" class="w-12 h-12 rounded-full object-cover" alt="" />`
    : `<div class="w-12 h-12 rounded-full bg-sky-100 text-sky-700 flex items-center justify-center font-bold">${escapeHTML((name || '?').charAt(0).toUpperCase())}</div>`;
  const allergyHtml = (allergies || []).slice(0, 3).map((a) =>
    `<span class="text-xs px-2 py-0.5 rounded bg-rose-100 text-rose-800">⚠ ${escapeHTML(a)}</span>`
  ).join('');
  return `
    <div class="bg-white rounded-lg shadow p-3 border-l-4 border-sky-500 flex items-start gap-3">
      ${photoHtml}
      <div class="flex-1">
        <div class="flex items-center gap-2">
          <span class="font-semibold text-slate-900">${escapeHTML(name)}</span>
          <span class="text-xs text-slate-500">${escapeHTML(sex)} · DOB ${escapeHTML(dob)}</span>
        </div>
        <div class="text-xs text-slate-500 mt-0.5">MRN: ${escapeHTML(mrn)}</div>
        ${allergyHtml ? `<div class="flex flex-wrap gap-1 mt-2">${allergyHtml}</div>` : ''}
      </div>
    </div>
  `;
};

H.vitalsPanel = function ({ vitals, ts }) {
  const v = vitals || {};
  const cell = (lbl, val, unit, color) => `
    <div class="bg-white rounded p-2 border">
      <div class="text-xs text-slate-500">${escapeHTML(lbl)}</div>
      <div class="text-lg font-bold text-${color || 'slate'}-700">${escapeHTML(val || '—')}<span class="text-xs font-normal text-slate-400">${escapeHTML(unit || '')}</span></div>
    </div>
  `;
  return `
    <div class="bg-slate-50 rounded-lg p-3 mb-3">
      <div class="grid grid-cols-3 md:grid-cols-6 gap-2">
        ${cell('HR', v.hr, 'bpm', 'rose')}
        ${cell('SBP', v.sbp, 'mmHg', 'sky')}
        ${cell('DBP', v.dbp, 'mmHg', 'sky')}
        ${cell('Temp', v.temp, '°C', 'amber')}
        ${cell('SpO₂', v.spo2, '%', 'emerald')}
        ${cell('RR', v.rr, '/min', 'violet')}
      </div>
      <div class="text-xs text-slate-400 mt-2">Updated ${escapeHTML(ts || 'now')}</div>
    </div>
  `;
};

H.allergyBanner = function ({ allergies, lang = 'en-US' }) {
  if (!allergies || !allergies.length) return '';
  const rtl = ['ar-SA', 'ur-PK', 'fa-IR', 'he-IL'].includes(lang);
  const label = lang === 'ar-SA' ? 'تحذير حساسية' : 'Allergy Alert';
  return `
    <div dir="${rtl ? 'rtl' : 'ltr'}" class="bg-rose-50 border-l-4 border-rose-500 rounded p-3 mb-3 flex items-center gap-3">
      <div class="text-2xl">⚠️</div>
      <div>
        <div class="text-sm font-bold text-rose-900">${escapeHTML(label)}</div>
        <div class="text-sm text-rose-700">${allergies.map((a) => escapeHTML(a)).join(' · ')}</div>
      </div>
    </div>
  `;
};

H.riskStratifier = function ({ score, tool = 'NEWS2', recommendation }) {
  let level = 'low', color = 'emerald';
  if (score >= 7) { level = 'high'; color = 'rose'; }
  else if (score >= 5) { level = 'moderate'; color = 'amber'; }
  return `
    <div class="bg-white rounded-lg shadow p-3 mb-3 border-l-4 border-${color}-500">
      <div class="flex items-center justify-between">
        <div>
          <div class="text-xs text-slate-500">${escapeHTML(tool)} Score</div>
          <div class="text-3xl font-bold text-${color}-700">${escapeHTML(String(score))}</div>
        </div>
        <div class="text-right">
          <span class="text-xs px-3 py-1 rounded bg-${color}-100 text-${color}-800 font-medium">${escapeHTML(level.toUpperCase())} RISK</span>
          <div class="text-xs text-slate-600 mt-1">${escapeHTML(recommendation || '')}</div>
        </div>
      </div>
    </div>
  `;
};

H.cdsAlertBar = function ({ severity = 'info', title, message, onAck }) {
  const map = { info: 'sky', warn: 'amber', critical: 'rose', success: 'emerald' };
  const color = map[severity] || 'sky';
  const icon = { info: 'ℹ️', warn: '⚠️', critical: '🚨', success: '✅' }[severity] || 'ℹ️';
  return `
    <div class="bg-${color}-50 border-l-4 border-${color}-500 rounded p-3 mb-3 flex items-start gap-3">
      <div class="text-xl">${icon}</div>
      <div class="flex-1">
        <div class="text-sm font-bold text-${color}-900">${escapeHTML(title)}</div>
        <div class="text-sm text-${color}-700">${escapeHTML(message)}</div>
      </div>
      ${onAck ? `<button onclick="${onAck}" class="text-xs px-2 py-1 rounded bg-${color}-100 text-${color}-800">Ack</button>` : ''}
    </div>
  `;
};

H.patientHeader = function ({ mrn, name, dob, sex, allergies, vitals, score, tool }) {
  return `
    ${H.allergyBanner({ allergies })}
    ${H.patientIDCard({ mrn, name, dob, sex })}
    ${vitals ? H.vitalsPanel({ vitals, ts: 'now' }) : ''}
    ${score !== undefined ? H.riskStratifier({ score, tool, recommendation: '' }) : ''}
  `;
};

window.H = H;
