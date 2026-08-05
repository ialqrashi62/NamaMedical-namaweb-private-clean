'use strict';
// Vital Trend — pure SVG, no CDN, 4 traces + 5 reference bands + RTL flip.

const VitalTrend = (() => {
  const RTL = ['ar-SA', 'ur-PK', 'fa-IR', 'he-IL'];

  function escapeHTML(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  function render({ target, data = [], traces = ['hr', 'sbp'], bands = {}, lang = 'en-US', width = 600, height = 220 } = {}) {
    const root = typeof target === 'string' ? document.querySelector(target) : target;
    if (!root) throw new Error('VITAL_TARGET_NOT_FOUND');
    if (!data.length) {
      root.innerHTML = '<div class="text-sm text-slate-400 p-4">No data</div>';
      return;
    }

    const isRtl = RTL.includes(lang);
    const padding = { left: 32, right: 16, top: 16, bottom: 28 };
    const W = width - padding.left - padding.right;
    const H = height - padding.top - padding.bottom;

    const tsMin = Math.min(...data.map((d) => d.ts));
    const tsMax = Math.max(...data.map((d) => d.ts));
    const tsRange = tsMax - tsMin || 1;

    const colors = { hr: '#ef4444', sbp: '#3b82f6', dbp: '#60a5fa', spo2: '#10b981', temp: '#f59e0b', rr: '#8b5cf6' };
    const labels = { hr: 'HR', sbp: 'SBP', dbp: 'DBP', spo2: 'SpO₂', temp: 'Temp', rr: 'RR' };

    const traceStats = traces.map((t) => {
      const vals = data.map((d) => Number(d[t])).filter((v) => Number.isFinite(v));
      return { key: t, min: Math.min(...vals, 0), max: Math.max(...vals, 100) };
    });

    function x(ts) { return padding.left + ((ts - tsMin) / tsRange) * W; }
    function y(v, min, max) {
      const r = max - min || 1;
      return padding.top + H - ((v - min) / r) * H;
    }

    let path = '';
    traces.forEach((t) => {
      const stats = traceStats.find((s) => s.key === t) || { min: 0, max: 100 };
      const d = data.filter((p) => Number.isFinite(Number(p[t]))).map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(p.ts).toFixed(1)} ${y(Number(p[t]), stats.min, stats.max).toFixed(1)}`).join(' ');
      path += `<path d="${d}" stroke="${colors[t] || '#64748b'}" stroke-width="2" fill="none" data-trace="${t}" />`;
    });

    let bandsSvg = '';
    for (const t of Object.keys(bands)) {
      const stats = traceStats.find((s) => s.key === t);
      if (!stats) continue;
      bands[t].forEach((band, i) => {
        const y1 = y(band[1], stats.min, stats.max);
        const y2 = y(band[0], stats.min, stats.max);
        const color = ['#ecfccb', '#fef3c7', '#fee2e2', '#fecaca', '#fca5a5'][i] || '#f1f5f9';
        bandsSvg += `<rect x="${padding.left}" y="${Math.min(y1, y2)}" width="${W}" height="${Math.abs(y2 - y1)}" fill="${color}" opacity="0.6" />`;
      });
    }

    let axis = '';
    for (let i = 0; i <= 4; i++) {
      const ty = padding.top + (H / 4) * i;
      axis += `<line x1="${padding.left}" y1="${ty}" x2="${padding.left + W}" y2="${ty}" stroke="#e2e8f0" stroke-width="1" />`;
    }
    const tsLabels = [tsMin, (tsMin + tsMax) / 2, tsMax].map((ts) => {
      const d = new Date(ts);
      return `<text x="${x(ts)}" y="${padding.top + H + 16}" text-anchor="middle" font-size="10" fill="#64748b">${d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</text>`;
    }).join('');

    const legend = traces.map((t) => `<span class="inline-flex items-center gap-1 text-xs"><span class="inline-block w-3 h-1 rounded" style="background:${colors[t] || '#64748b'}"></span>${labels[t] || t}</span>`).join(' ');

    root.innerHTML = `
      <div dir="${isRtl ? 'rtl' : 'ltr'}" class="bg-white rounded-lg border p-3">
        <div class="flex flex-wrap items-center gap-2 mb-2">${legend}</div>
        <svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" role="img" aria-label="Vital signs trend">
          ${bandsSvg}
          ${axis}
          ${path}
          ${tsLabels}
        </svg>
      </div>
    `;

    root.querySelectorAll('[data-trace]').forEach((pp) => {
      pp.addEventListener('click', (e) => {
        const trace = pp.getAttribute('data-trace');
        root.dispatchEvent(new CustomEvent('vital:click', { detail: { trace, target: e.target } }));
      });
    });
  }

  window.VitalTrend = { render };
  return { render };
})();