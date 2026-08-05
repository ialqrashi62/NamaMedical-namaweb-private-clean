/**
 * urology-station.js
 * Urology Specialist Station
 * Focus: Stone management, PSA, urodynamic
 */
const UrologyStation = {
    render: async (patientId) => {
        const container = document.getElementById('app-content');
        if (!container) return;
        container.innerHTML = `
<div class="stitch-station-container p-6 bg-slate-50 min-h-screen">
  <header class="flex justify-between items-center mb-6">
    <h1 class="text-2xl font-bold text-slate-800">${tr('Urology Command Center', 'مركز قيادة المسالك البولية')}</h1>
    <div class="flex gap-2">
      <button onclick="UrologyStation.openStoneLog()" class="stitch-btn-primary px-4 py-2 bg-yellow-600 text-white rounded-lg shadow-sm hover:bg-yellow-700"<button aria-label="${tr('Log Stone', 'تسجيل حصوة')}" type="button" onclick="UrologyStation.openStoneLog()" class="stitch-btn-primary px-4 py-2 bg-yellow-600 text-white rounded-lg shadow-sm hover:bg-yellow-700">${tr('Log Stone', 'تسجيل حصوة')}</button>
      <button onclick="UrologyStation.openPSA()" class="stitch-btn-secondary px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg shadow-sm hover:bg-slate-100"<button aria-label="${tr('PSA Trend', 'اتجاه PSA')}" type="button" onclick="UrologyStation.openPSA()" class="stitch-btn-secondary px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg shadow-sm hover:bg-slate-100">${tr('PSA Trend', 'اتجاه PSA')}</button>
    </div>
  </header>
  <div class="grid grid-cols-12 gap-6">
    <div class="col-span-3 space-y-6">
      <div class="stitch-card p-4 bg-white rounded-xl shadow-sm border border-slate-200">
        <h3 class="text-sm font-semibold text-slate-500 mb-4 uppercase tracking-wider">${tr('Latest PSA', 'آخر PSA')}</h3>
        <div class="text-center">
          <div class="text-3xl font-bold text-amber-600">2.8</div>
          <div class="text-xs text-slate-500">${tr('ng/mL', 'نانوغرام/مل')}</div>
        </div>
      </div>
      <div class="stitch-card p-4 bg-white rounded-xl shadow-sm border border-slate-200">
        <h3 class="text-sm font-semibold text-slate-500 mb-4 uppercase tracking-wider">${tr('Stent Status', 'حالة الدعامة')}</h3>
        <div class="text-sm text-slate-700">${tr('No active stent', 'لا توجد دعامة نشطة')}</div>
      </div>
    </div>
    <div class="col-span-6 space-y-6">
      <div class="stitch-card p-6 bg-white rounded-xl shadow-sm border border-slate-200 min-h-[500px]">
        <div class="flex border-b border-slate-200 mb-6">
          <button class="px-4 py-2 border-b-2 border-yellow-600 text-yellow-600 font-medium"<button aria-label="${tr('Stone Log', 'سجل الحصوات')}" type="button" class="px-4 py-2 border-b-2 border-yellow-600 text-yellow-600 font-medium">${tr('Stone Log', 'سجل الحصوات')}</button>
          <button class="px-4 py-2 text-slate-500 hover:text-slate-800"<button aria-label="${tr('PSA Trend', 'اتجاه PSA')}" type="button" class="px-4 py-2 text-slate-500 hover:text-slate-800">${tr('PSA Trend', 'اتجاه PSA')}</button>
          <button class="px-4 py-2 text-slate-500 hover:text-slate-800"<button aria-label="${tr('Urodynamics', 'ديناميكا البول')}" type="button" class="px-4 py-2 text-slate-500 hover:text-slate-800">${tr('Urodynamics', 'ديناميكا البول')}</button>
        </div>
        <div id="urology-workspace" class="space-y-4">
          <div class="p-8 text-center text-slate-400 border-2 border-dashed border-slate-200 rounded-xl">${tr('No active session. Open Stone Log to begin.', 'لا توجد جلسة نشطة. افتح سجل الحصوات للبدء.')}</div>
        </div>
      </div>
    </div>
    <div class="col-span-3 space-y-6">
      <div class="stitch-card p-4 bg-yellow-50 rounded-xl shadow-sm border border-yellow-200">
        <div class="flex items-center gap-2 mb-4">
          <span class="text-xl">💧</span>
          <h3 class="text-sm font-bold text-slate-900 uppercase tracking-wider">${tr('Urology AI', 'ذكاء مسالك')}</h3>
        </div>
        <div class="space-y-3 text-sm">
          <div class="p-3 bg-white rounded-lg border border-slate-200">
            <div class="font-semibold text-slate-800">${tr('Stone-Free Probability', 'احتمال الخلو من الحصوات')}</div>
            <div class="text-xs text-emerald-600 mt-1">${tr('High', 'مرتفع')}</div>
          </div>
          <div class="p-3 bg-white rounded-lg border border-slate-200">
            <div class="font-semibold text-slate-800">${tr('PSA Doubling Time', 'وقت مضاعفة PSA')}</div>
            <div class="text-xs text-slate-600 mt-1">${tr('Stable', 'مستقر')}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>`;
    },
    openStoneLog: () => Modal.open({ title: "Stone log (POST /api/urology/stone-log)", body: "<p style=\"font-size:14px;color:#334155\">Stone log (POST /api/urology/stone-log)</p><div style=\"background:#f1f5f9;border-radius:6px;padding:10px;font-size:12px;color:#475569;margin-top:10px\"><strong>HTTP:</strong> API &nbsp;&nbsp;<strong>Endpoint:</strong> <code>/api/urology/stone-log</code></div><p style=\"font-size:13px;color:#64748b;margin-top:10px\">This action will be wired to the live backend. Configure Department Mappings to enable persistent capture.</p>", primaryLabel: 'OK', secondaryLabel: 'Close', hidePrimary: true }),
    openPSA: () => Modal.open({ title: "PSA log (POST /api/urology/oncology-metrics)", body: "<p style=\"font-size:14px;color:#334155\">PSA log (POST /api/urology/oncology-metrics)</p><div style=\"background:#f1f5f9;border-radius:6px;padding:10px;font-size:12px;color:#475569;margin-top:10px\"><strong>HTTP:</strong> API &nbsp;&nbsp;<strong>Endpoint:</strong> <code>/api/urology/oncology-metrics</code></div><p style=\"font-size:13px;color:#64748b;margin-top:10px\">This action will be wired to the live backend. Configure Department Mappings to enable persistent capture.</p>", primaryLabel: 'OK', secondaryLabel: 'Close', hidePrimary: true })};
if (typeof window !== 'undefined') window.UrologyStation = UrologyStation;
