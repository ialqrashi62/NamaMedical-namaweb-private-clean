/**
 * lab-station.js
 * Laboratory (LIS) Specialist Station
 * Focus: Worklist, TAT, critical value alerting
 */
const LabStation = {
    render: async (patientId) => {
        const container = document.getElementById('app-content');
        if (!container) return;
        container.innerHTML = `
<div class="stitch-station-container p-6 bg-slate-50 min-h-screen">
  <header class="flex justify-between items-center mb-6">
    <h1 class="text-2xl font-bold text-slate-800">${tr('Lab Command Center', 'مركز قيادة المختبر')}</h1>
    <div class="flex gap-2">
      <button onclick="LabStation.openResultEntry()" class="stitch-btn-primary px-4 py-2 bg-teal-700 text-white rounded-lg shadow-sm hover:bg-teal-800">${tr('Enter Result', 'إدخال نتيجة')}</button>
      <button onclick="LabStation.openCriticalValues()" class="stitch-btn-secondary px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg shadow-sm hover:bg-slate-100">${tr('Critical Values', 'القيم الحرجة')}</button>
    </div>
  </header>
  <div class="grid grid-cols-12 gap-6">
    <div class="col-span-3 space-y-6">
      <div class="stitch-card p-4 bg-white rounded-xl shadow-sm border border-slate-200">
        <h3 class="text-sm font-semibold text-slate-500 mb-4 uppercase tracking-wider">${tr('Worklist', 'قائمة العمل')}</h3>
        <div class="space-y-2 text-sm">
          <div class="p-3 bg-amber-50 rounded border border-amber-200">
            <div class="font-semibold text-slate-800">CBC</div>
            <div class="text-xs text-amber-700">${tr('STAT', 'عاجل')}</div>
          </div>
          <div class="p-3 bg-slate-50 rounded border border-slate-200">
            <div class="font-semibold text-slate-800">BMP</div>
            <div class="text-xs text-slate-500">${tr('Routine', 'روتيني')}</div>
          </div>
        </div>
      </div>
    </div>
    <div class="col-span-6 space-y-6">
      <div class="stitch-card p-6 bg-white rounded-xl shadow-sm border border-slate-200 min-h-[500px]">
        <div class="flex border-b border-slate-200 mb-6">
          <button class="px-4 py-2 border-b-2 border-teal-700 text-teal-700 font-medium">${tr('Result Entry', 'إدخال النتائج')}</button>
          <button class="px-4 py-2 text-slate-500 hover:text-slate-800">${tr('Validation', 'اعتماد')}</button>
          <button class="px-4 py-2 text-slate-500 hover:text-slate-800">${tr('QC', 'مراقبة الجودة')}</button>
        </div>
        <div id="lab-workspace" class="space-y-4">
          <div class="p-8 text-center text-slate-400 border-2 border-dashed border-slate-200 rounded-xl">${tr('No active specimen. Open Result Entry to begin.', 'لا توجد عينة نشطة. افتح إدخال النتائج للبدء.')}</div>
        </div>
      </div>
    </div>
    <div class="col-span-3 space-y-6">
      <div class="stitch-card p-4 bg-teal-50 rounded-xl shadow-sm border border-teal-200">
        <div class="flex items-center gap-2 mb-4">
          <span class="text-xl">🧪</span>
          <h3 class="text-sm font-bold text-slate-900 uppercase tracking-wider">${tr('Lab AI', 'ذكاء مخبري')}</h3>
        </div>
        <div class="space-y-3 text-sm">
          <div class="p-3 bg-white rounded-lg border border-slate-200">
            <div class="font-semibold text-slate-800">${tr('TAT Dashboard', 'لوحة زمن الإنجاز')}</div>
            <div class="text-xs text-emerald-600 mt-1">${tr('On target: 92%', 'ضمن الهدف: 92%')}</div>
          </div>
          <div class="p-3 bg-white rounded-lg border border-slate-200">
            <div class="font-semibold text-slate-800">${tr('Critical Alerts', 'تنبيهات حرجة')}</div>
            <div class="text-xs text-red-600 mt-1">${tr('2 pending', '2 قيد الانتظار')}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>`;
    },
    openResultEntry: () => alert('Result entry (POST /api/lab/result)'),
    openCriticalValues: () => alert('Critical values (GET /api/lab/critical-values)')
};
if (typeof window !== 'undefined') window.LabStation = LabStation;
