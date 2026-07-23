/**
 * er-station.js
 * Emergency Department (ER) Specialist Station
 * Focus: ESI triage, bed board, disposition
 */
const ERStation = {
    render: async (patientId) => {
        const container = document.getElementById('app-content');
        if (!container) return;
        container.innerHTML = `
<div class="stitch-station-container p-6 bg-slate-50 min-h-screen">
  <header class="flex justify-between items-center mb-6">
    <h1 class="text-2xl font-bold text-slate-800">${tr('Emergency Command Center', 'مركز قيادة الطوارئ')}</h1>
    <div class="flex gap-2">
      <button onclick="ERStation.openTriage()" class="stitch-btn-primary px-4 py-2 bg-red-600 text-white rounded-lg shadow-sm hover:bg-red-700">${tr('Start Triage', 'بدء الفرز')}</button>
      <button onclick="ERStation.openDisposition()" class="stitch-btn-secondary px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg shadow-sm hover:bg-slate-100">${tr('Disposition', 'القرار')}</button>
    </div>
  </header>
  <div class="grid grid-cols-12 gap-6">
    <div class="col-span-3 space-y-6">
      <div class="stitch-card p-4 bg-white rounded-xl shadow-sm border border-slate-200">
        <h3 class="text-sm font-semibold text-slate-500 mb-4 uppercase tracking-wider">${tr('Triage Queue', 'طابور الفرز')}</h3>
        <div class="space-y-2 text-sm">
          <div class="p-3 bg-red-50 rounded border border-red-200 border-l-4 border-l-red-600">
            <div class="font-bold text-slate-800">ESI 1</div>
            <div class="text-xs text-slate-500">${tr('Resuscitation', 'إنعاش')}</div>
          </div>
          <div class="p-3 bg-amber-50 rounded border border-amber-200 border-l-4 border-l-amber-500">
            <div class="font-bold text-slate-800">ESI 2</div>
            <div class="text-xs text-slate-500">${tr('Emergent', 'عاجل')}</div>
          </div>
          <div class="p-3 bg-slate-50 rounded border border-slate-200">
            <div class="font-semibold text-slate-800">ESI 3</div>
          </div>
        </div>
      </div>
    </div>
    <div class="col-span-6 space-y-6">
      <div class="stitch-card p-6 bg-white rounded-xl shadow-sm border border-slate-200 min-h-[500px]">
        <div class="flex border-b border-slate-200 mb-6">
          <button class="px-4 py-2 border-b-2 border-red-600 text-red-600 font-medium">${tr('Triage / Workup', 'الفرز / التشخيص')}</button>
          <button class="px-4 py-2 text-slate-500 hover:text-slate-800">${tr('Treatment', 'العلاج')}</button>
          <button class="px-4 py-2 text-slate-500 hover:text-slate-800">${tr('Disposition', 'القرار')}</button>
        </div>
        <div id="er-workspace" class="space-y-4">
          <div class="p-8 text-center text-slate-400 border-2 border-dashed border-slate-200 rounded-xl">${tr('No active patient. Start Triage to begin.', 'لا يوجد مريض نشط. ابدأ الفرز للبدء.')}</div>
        </div>
      </div>
    </div>
    <div class="col-span-3 space-y-6">
      <div class="stitch-card p-4 bg-red-50 rounded-xl shadow-sm border border-red-200">
        <div class="flex items-center gap-2 mb-4">
          <span class="text-xl">🚨</span>
          <h3 class="text-sm font-bold text-slate-900 uppercase tracking-wider">${tr('ER AI', 'ذكاء طوارئ')}</h3>
        </div>
        <div class="space-y-3 text-sm">
          <div class="p-3 bg-white rounded-lg border border-slate-200">
            <div class="font-semibold text-slate-800">${tr('Door-to-Provider', 'باب إلى مزود')}</div>
            <div class="text-xs text-emerald-600 mt-1">${tr('Median 8 min', 'المتوسط 8 دقائق')}</div>
          </div>
          <div class="p-3 bg-white rounded-lg border border-slate-200">
            <div class="font-semibold text-slate-800">${tr('LWBS Rate', 'معدل مغادرة')}</div>
            <div class="text-xs text-slate-600 mt-1">${tr('2.1%', '2.1%')}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>`;
    },
    openTriage: () => alert('ESI triage (POST /api/er/triage)'),
    openDisposition: () => alert('Disposition (PUT /api/er/disposition)')
};
if (typeof window !== 'undefined') window.ERStation = ERStation;
