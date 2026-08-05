/**
 * pacu-station.js
 * PACU (Post-Anesthesia Care Unit) Station
 * Focus: Aldrete score, discharge gate
 */
const PACUStation = {
    render: async (patientId) => {
        const container = document.getElementById('app-content');
        if (!container) return;
        container.innerHTML = `
<div class="stitch-station-container p-6 bg-slate-50 min-h-screen">
  <header class="flex justify-between items-center mb-6">
    <h1 class="text-2xl font-bold text-slate-800">${tr('PACU Command Center', 'مركز قيادة الإفاقة')}</h1>
    <div class="flex gap-2">
      <button onclick="PACUStation.openAldrete()" class="stitch-btn-primary px-4 py-2 bg-emerald-700 text-white rounded-lg shadow-sm hover:bg-emerald-800"<button aria-label="${tr('Score Aldrete', 'تسجيل Aldrete')}" type="button" onclick="PACUStation.openAldrete()" class="stitch-btn-primary px-4 py-2 bg-emerald-700 text-white rounded-lg shadow-sm hover:bg-emerald-800">${tr('Score Aldrete', 'تسجيل Aldrete')}</button>
      <button onclick="PACUStation.openDischarge()" class="stitch-btn-secondary px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg shadow-sm hover:bg-slate-100"<button aria-label="${tr('Discharge', 'تخريج')}" type="button" onclick="PACUStation.openDischarge()" class="stitch-btn-secondary px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg shadow-sm hover:bg-slate-100">${tr('Discharge', 'تخريج')}</button>
    </div>
  </header>
  <div class="grid grid-cols-12 gap-6">
    <div class="col-span-3 space-y-6">
      <div class="stitch-card p-4 bg-white rounded-xl shadow-sm border border-slate-200">
        <h3 class="text-sm font-semibold text-slate-500 mb-4 uppercase tracking-wider">${tr('Aldrete Score', 'Aldrete')}</h3>
        <div class="text-center">
          <div class="text-4xl font-bold text-emerald-700">9</div>
          <div class="text-xs text-slate-500">${tr('Ready for discharge', 'جاهز للتخريج')}</div>
        </div>
      </div>
      <div class="stitch-card p-4 bg-white rounded-xl shadow-sm border border-slate-200">
        <h3 class="text-sm font-semibold text-slate-500 mb-4 uppercase tracking-wider">${tr('Pain (NRS)', 'الألم')}</h3>
        <div class="text-center text-2xl font-bold text-amber-600">3/10</div>
      </div>
    </div>
    <div class="col-span-6 space-y-6">
      <div class="stitch-card p-6 bg-white rounded-xl shadow-sm border border-slate-200 min-h-[500px]">
        <div class="flex border-b border-slate-200 mb-6">
          <button class="px-4 py-2 border-b-2 border-emerald-700 text-emerald-700 font-medium"<button aria-label="${tr('Flowsheet + Aldrete', 'تدفق + Aldrete')}" type="button" class="px-4 py-2 border-b-2 border-emerald-700 text-emerald-700 font-medium">${tr('Flowsheet + Aldrete', 'تدفق + Aldrete')}</button>
        </div>
        <div id="pacu-workspace" class="space-y-4">
          <div class="p-8 text-center text-slate-400 border-2 border-dashed border-slate-200 rounded-xl">${tr('No active patient. Open Aldrete to begin.', 'لا يوجد مريض نشط. افتح Aldrete للبدء.')}</div>
        </div>
      </div>
    </div>
    <div class="col-span-3 space-y-6">
      <div class="stitch-card p-4 bg-emerald-50 rounded-xl shadow-sm border border-emerald-200">
        <div class="flex items-center gap-2 mb-4">
          <span class="text-xl">🌿</span>
          <h3 class="text-sm font-bold text-slate-900 uppercase tracking-wider">${tr('PACU AI', 'ذكاء PACU')}</h3>
        </div>
        <div class="space-y-3 text-sm">
          <div class="p-3 bg-white rounded-lg border border-slate-200">
            <div class="font-semibold text-slate-800">${tr('Discharge Ready', 'جاهز للتخريج')}</div>
            <div class="text-xs text-emerald-600 mt-1">${tr('Yes', 'نعم')}</div>
          </div>
          <div class="p-3 bg-white rounded-lg border border-slate-200">
            <div class="font-semibold text-slate-800">${tr('PONV Risk', 'خطر PONV')}</div>
            <div class="text-xs text-slate-600 mt-1">${tr('Low', 'منخفض')}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>`;
    },
    openAldrete: () => Modal.open({ title: "Aldrete (POST /api/pacu/assessment)", body: "<p style=\"font-size:14px;color:#334155\">Aldrete (POST /api/pacu/assessment)</p><div style=\"background:#f1f5f9;border-radius:6px;padding:10px;font-size:12px;color:#475569;margin-top:10px\"><strong>HTTP:</strong> API &nbsp;&nbsp;<strong>Endpoint:</strong> <code>/api/pacu/assessment</code></div><p style=\"font-size:13px;color:#64748b;margin-top:10px\">This action will be wired to the live backend. Configure Department Mappings to enable persistent capture.</p>", primaryLabel: 'OK', secondaryLabel: 'Close', hidePrimary: true }),
    openDischarge: () => Modal.open({ title: "Discharge (PUT /api/pacu/discharge)", body: "<p style=\"font-size:14px;color:#334155\">Discharge (PUT /api/pacu/discharge)</p><div style=\"background:#f1f5f9;border-radius:6px;padding:10px;font-size:12px;color:#475569;margin-top:10px\"><strong>HTTP:</strong> API &nbsp;&nbsp;<strong>Endpoint:</strong> <code>/api/pacu/discharge</code></div><p style=\"font-size:13px;color:#64748b;margin-top:10px\">This action will be wired to the live backend. Configure Department Mappings to enable persistent capture.</p>", primaryLabel: 'OK', secondaryLabel: 'Close', hidePrimary: true })};
if (typeof window !== 'undefined') window.PACUStation = PACUStation;
