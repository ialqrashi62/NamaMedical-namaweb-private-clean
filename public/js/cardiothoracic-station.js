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
      <button onclick="CardiothoracicStation.openBypass()" class="stitch-btn-primary px-4 py-2 bg-red-700 text-white rounded-lg shadow-sm hover:bg-red-800">${tr('Start Bypass Timer', 'بدء مؤقت المجازة')}</button>
      <button onclick="CardiothoracicStation.openGraft()" class="stitch-btn-secondary px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg shadow-sm hover:bg-slate-100">${tr('Log Graft', 'تسجيل طعم')}</button>
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
          <button class="px-4 py-2 border-b-2 border-red-700 text-red-700 font-medium">${tr('Hemodynamics', 'ديناميكا الدم')}</button>
          <button class="px-4 py-2 text-slate-500 hover:text-slate-800">${tr('Graft Registry', 'سجل الطعوم')}</button>
          <button class="px-4 py-2 text-slate-500 hover:text-slate-800">${tr('Ischemia Risk', 'خطر الإقفار')}</button>
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
    openBypass: () => alert('Bypass timer (POST /api/cardio-thoracic/bypass)'),
    openGraft: () => alert('Graft log (POST /api/cardio-thoracic/graft)')
};
if (typeof window !== 'undefined') window.CardiothoracicStation = CardiothoracicStation;
