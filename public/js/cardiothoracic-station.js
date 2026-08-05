/**
 * cardiothoracic-station.js
 * Cardiothoracic & Vascular Surgery Station
 * Focus: Bypass timer, hemodynamics, graft registry
 */
const CardiothoracicStation = {
    render: async (patientId) => {
        const container = document.getElementById('app-content');
        if (!container) return;
        container.innerHTML = `
<div class="stitch-station-container p-6 bg-slate-50 min-h-screen">
  <header class="flex justify-between items-center mb-6">
    <h1 class="text-2xl font-bold text-slate-800">${tr('Cardiothoracic Command Center', 'مركز قيادة جراحة القلب')}</h1>
    <div class="flex gap-2">
      <button onclick="CardiothoracicStation.openBypass()" class="stitch-btn-primary px-4 py-2 bg-red-700 text-white rounded-lg shadow-sm hover:bg-red-800"<button aria-label="${tr('Start Bypass Timer', 'بدء مؤقت المجازة')}" type="button" onclick="CardiothoracicStation.openBypass()" class="stitch-btn-primary px-4 py-2 bg-red-700 text-white rounded-lg shadow-sm hover:bg-red-800">${tr('Start Bypass Timer', 'بدء مؤقت المجازة')}</button>
      <button onclick="CardiothoracicStation.openGraft()" class="stitch-btn-secondary px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg shadow-sm hover:bg-slate-100"<button aria-label="${tr('Log Graft', 'تسجيل طعم')}" type="button" onclick="CardiothoracicStation.openGraft()" class="stitch-btn-secondary px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg shadow-sm hover:bg-slate-100">${tr('Log Graft', 'تسجيل طعم')}</button>
    </div>
  </header>
  <div class="grid grid-cols-12 gap-6">
    <div class="col-span-3 space-y-6">
      <div class="stitch-card p-4 bg-white rounded-xl shadow-sm border border-slate-200">
        <h3 class="text-sm font-semibold text-slate-500 mb-4 uppercase tracking-wider">${tr('CPB Time', 'وقت المجازة')}</h3>
        <div class="text-center">
          <div class="text-3xl font-mono font-bold text-red-700">00:00:00</div>
          <div class="text-xs text-slate-500 mt-1">${tr('Cardiopulmonary Bypass', 'مجازة قلبية رئوية')}</div>
        </div>
      </div>
      <div class="stitch-card p-4 bg-white rounded-xl shadow-sm border border-slate-200">
        <h3 class="text-sm font-semibold text-slate-500 mb-4 uppercase tracking-wider">${tr('Cross-Clamp', 'مشبك الأبهر')}</h3>
        <div class="text-center">
          <div class="text-3xl font-mono font-bold text-amber-600">00:00</div>
          <div class="text-xs text-slate-500 mt-1">${tr('Aortic Cross-Clamp', 'مشبك أبهر')}</div>
        </div>
      </div>
    </div>
    <div class="col-span-6 space-y-6">
      <div class="stitch-card p-6 bg-white rounded-xl shadow-sm border border-slate-200 min-h-[500px]">
        <div class="flex border-b border-slate-200 mb-6">
          <button class="px-4 py-2 border-b-2 border-red-700 text-red-700 font-medium"<button aria-label="${tr('Hemodynamics', 'ديناميكا الدم')}" type="button" class="px-4 py-2 border-b-2 border-red-700 text-red-700 font-medium">${tr('Hemodynamics', 'ديناميكا الدم')}</button>
          <button class="px-4 py-2 text-slate-500 hover:text-slate-800"<button aria-label="${tr('Graft Registry', 'سجل الطعوم')}" type="button" class="px-4 py-2 text-slate-500 hover:text-slate-800">${tr('Graft Registry', 'سجل الطعوم')}</button>
          <button class="px-4 py-2 text-slate-500 hover:text-slate-800"<button aria-label="${tr('Ischemia Risk', 'خطر الإقفار')}" type="button" class="px-4 py-2 text-slate-500 hover:text-slate-800">${tr('Ischemia Risk', 'خطر الإقفار')}</button>
        </div>
        <div id="cardio-workspace" class="space-y-4">
          <div class="p-8 text-center text-slate-400 border-2 border-dashed border-slate-200 rounded-xl">${tr('No active session. Start Bypass Timer to begin.', 'لا توجد جلسة نشطة. ابدأ مؤقت المجازة للبدء.')}</div>
        </div>
      </div>
    </div>
    <div class="col-span-3 space-y-6">
      <div class="stitch-card p-4 bg-red-50 rounded-xl shadow-sm border border-red-200">
        <div class="flex items-center gap-2 mb-4">
          <span class="text-xl">🫀</span>
          <h3 class="text-sm font-bold text-slate-900 uppercase tracking-wider">${tr('Cardiac AI', 'ذكاء قلبي')}</h3>
        </div>
        <div class="space-y-3 text-sm">
          <div class="p-3 bg-white rounded-lg border border-slate-200">
            <div class="font-semibold text-slate-800">${tr('Ischemia Risk', 'خطر الإقفار')}</div>
            <div class="text-xs text-emerald-600 mt-1">${tr('Low', 'منخفض')}</div>
          </div>
          <div class="p-3 bg-white rounded-lg border border-slate-200">
            <div class="font-semibold text-slate-800">${tr('Graft Patency', 'انفتاح الطعم')}</div>
            <div class="text-xs text-slate-600 mt-1">${tr('Pending echo', 'بانتظار الإيكو')}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>`;
    },
    openBypass: () => Modal.open({ title: "Bypass timer (POST /api/cardio-thoracic/bypass)", body: "<p style=\"font-size:14px;color:#334155\">Bypass timer (POST /api/cardio-thoracic/bypass)</p><div style=\"background:#f1f5f9;border-radius:6px;padding:10px;font-size:12px;color:#475569;margin-top:10px\"><strong>HTTP:</strong> API &nbsp;&nbsp;<strong>Endpoint:</strong> <code>/api/cardio-thoracic/bypass</code></div><p style=\"font-size:13px;color:#64748b;margin-top:10px\">This action will be wired to the live backend. Configure Department Mappings to enable persistent capture.</p>", primaryLabel: 'OK', secondaryLabel: 'Close', hidePrimary: true }),
    openGraft: () => Modal.open({ title: "Graft log (POST /api/cardio-thoracic/graft)", body: "<p style=\"font-size:14px;color:#334155\">Graft log (POST /api/cardio-thoracic/graft)</p><div style=\"background:#f1f5f9;border-radius:6px;padding:10px;font-size:12px;color:#475569;margin-top:10px\"><strong>HTTP:</strong> API &nbsp;&nbsp;<strong>Endpoint:</strong> <code>/api/cardio-thoracic/graft</code></div><p style=\"font-size:13px;color:#64748b;margin-top:10px\">This action will be wired to the live backend. Configure Department Mappings to enable persistent capture.</p>", primaryLabel: 'OK', secondaryLabel: 'Close', hidePrimary: true })};
if (typeof window !== 'undefined') window.CardiothoracicStation = CardiothoracicStation;
