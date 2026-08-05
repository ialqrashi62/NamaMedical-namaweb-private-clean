'use strict';
// Station Builder v1 — auto-generates a station from a snippet config.
// Used by the new PCC pipeline or for one-off stations.

const StationBuilder = (() => {
  function escapeHTML(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  function buildStation({ dept, lang = 'en-US', tenant = 'demo', api }) {
    const snippet = (window.STATION_SNIPPETS || {})[dept];
    if (!snippet) throw new Error('DEPT_SNIPPET_UNKNOWN:' + dept);
    const rtl = ['ar-SA', 'ur-PK', 'fa-IR', 'he-IL'].includes(lang);
    const title = lang === 'ar-SA' ? (snippet.titleAr || snippet.title) : snippet.title;

    const sections = (snippet.sections || []).map((s) => `
      <section data-section="${escapeHTML(s)}" class="bg-white rounded-lg shadow p-4 mb-3">
        <h3 class="text-md font-semibold mb-2 text-slate-700">${escapeHTML(s.replace(/[_-]/g, ' '))}</h3>
        <div data-section-body="${escapeHTML(s)}" class="text-sm text-slate-500">
          <em>Click a button below to capture data for this section.</em>
        </div>
      </section>
    `).join('');

    const forms = (snippet.forms || []).map((f) => `
      <button data-form="${escapeHTML(f.name)}" class="px-3 py-2 text-sm bg-sky-50 text-sky-700 border border-sky-200 rounded hover:bg-sky-100">
        + ${escapeHTML(f.label || f.name)}
      </button>
    `).join('');

    // Clinical Panel Enhancement — specialized panels, shortcuts, scores
    const clinical = window.STATION_CLINICAL && window.STATION_CLINICAL[dept];
    const panels = (clinical && clinical.panels) ? clinical.panels : [];
    const shortcuts = (clinical && clinical.shortcuts) ? clinical.shortcuts : [];
    const scores = (clinical && clinical.scores) ? clinical.scores : [];

    const panelsHtml = panels.length ? `
      <div class="bg-white rounded-lg shadow p-4 mb-4">
        <h3 class="text-sm font-semibold text-slate-700 mb-2">Specialized Panels</h3>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-2">
          ${panels.map((p) => `<div class="text-xs bg-indigo-50 text-indigo-700 rounded px-2 py-1.5 border border-indigo-200">${escapeHTML(p)}</div>`).join('')}
        </div>
      </div>
    ` : '';

    const shortcutsHtml = shortcuts.length ? `
      <div class="bg-white rounded-lg shadow p-4 mb-4">
        <h3 class="text-sm font-semibold text-slate-700 mb-2">Quick Shortcuts</h3>
        <div class="flex flex-wrap gap-2">
          ${shortcuts.map((s) => `<button data-shortcut="${escapeHTML(s)}" class="text-xs px-2 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded hover:bg-amber-100">⚡ ${escapeHTML(s)}</button>`).join('')}
        </div>
      </div>
    ` : '';

    const scoresHtml = scores.length ? `
      <div class="bg-white rounded-lg shadow p-4 mb-4">
        <h3 class="text-sm font-semibold text-slate-700 mb-2">Clinical Scores</h3>
        <div class="flex flex-wrap gap-2">
          ${scores.map((s) => `<button data-score="${escapeHTML(s)}" class="text-xs px-2 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded hover:bg-emerald-100">📊 ${escapeHTML(s)}</button>`).join('')}
        </div>
      </div>
    ` : '';

    const html = `
      <div dir="${rtl ? 'rtl' : 'ltr'}" class="p-4 bg-slate-50 min-h-screen">
        <header class="bg-white rounded-lg shadow p-4 mb-4 flex items-center justify-between">
          <div>
            <h1 class="text-2xl font-bold text-slate-900">${escapeHTML(title)}</h1>
            <p class="text-sm text-slate-500">${escapeHTML(dept)} · ${escapeHTML(tenant)} · ${escapeHTML(lang)}</p>
          </div>
          <div class="text-sm text-slate-500">API: <code>${escapeHTML(api || snippet.api || '')}</code></div>
        </header>
        ${panelsHtml}
        <div class="flex flex-wrap gap-2 mb-4">${forms}</div>
        ${shortcutsHtml}
        ${scoresHtml}
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">${sections}</div>
      </div>
    `;

    function bind(root) {
      const snippet2 = (window.STATION_SNIPPETS || {})[dept];
      root.querySelectorAll('[data-form]').forEach((btn) => {
        btn.onclick = (e) => {
          e.preventDefault();
          const formName = btn.getAttribute('data-form');
          const form = (snippet2.forms || []).find((f) => f.name === formName);
          if (!form) return;
          const fieldDefs = (form.fields || []).map((fieldName) => ({
            name: fieldName,
            label: fieldName.replace(/[_-]/g, ' ').replace(/^./, (c) => c.toUpperCase()),
            type: 'text',
            required: true,
          }));
          Modal.open({
            title: btn.textContent.replace(/^\+\s*/, '').trim(),
            fields: fieldDefs,
            primaryLabel: 'Save',
            secondaryLabel: 'Cancel',
            onConfirm: (values) => {
              const target = root.querySelector(`[data-section-body="${form.section || dept.toLowerCase()}"]`);
              if (target) {
                const li = document.createElement('div');
                li.className = 'text-sm text-slate-700 mb-1 border-b border-slate-100 pb-1';
                li.textContent = `${btn.textContent.replace(/^\+\s*/, '').trim()}: ${Object.values(values).join(' | ')}`;
                target.appendChild(li);
              }
              Modal.toast('Saved to ' + (snippet2.api || api), { type: 'success' });
            },
          });
        };
      });
      root.querySelectorAll('[data-shortcut]').forEach((btn) => {
        btn.onclick = (e) => {
          e.preventDefault();
          const name = btn.getAttribute('data-shortcut');
          Modal.toast(`Shortcut: ${name}`, { type: 'info' });
        };
      });
      root.querySelectorAll('[data-score]').forEach((btn) => {
        btn.onclick = (e) => {
          e.preventDefault();
          const name = btn.getAttribute('data-score');
          const defKey = Object.keys(window.SCORE_DEFINITIONS || {}).find((k) => window.SCORE_DEFINITIONS[k].name === name);
          if (!defKey) {
            Modal.toast(`Score: ${name} (no builder)`, { type: 'info' });
            return;
          }
          const values = window.SCORE_DEFINITIONS[defKey].items.map(() => 0);
          Modal.open({
            title: `${name} calculator`,
            body: window.renderScoreCard(defKey, values, lang),
            fields: [
              { name: 'values', label: 'Score', type: 'hidden', value: values },
            ],
            primaryLabel: 'Save Score',
            secondaryLabel: 'Cancel',
            width: 'max-w-xl',
            onConfirm: (vals) => {
              const target = root.querySelector('[data-section-body="vitals"]');
              if (target) {
                const li = document.createElement('div');
                li.className = 'text-sm text-emerald-700 mb-1 border-b border-emerald-100 pb-1';
                li.textContent = `${name} = ${values.reduce((a, b) => a + (Number(b) || 0), 0)}`;
                target.appendChild(li);
              }
              Modal.toast(`${name} recorded`, { type: 'success' });
            },
          });
        };
      });
    }

    return { render: () => html, bind, snippet };
  }

  return { buildStation };
})();

window.StationBuilder = StationBuilder;
