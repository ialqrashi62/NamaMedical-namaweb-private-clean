/**
 * nicu-station.js
 * NICU (Neonatal ICU) Specialist Station
 * Focus: APGAR, incubator monitor, growth, parent-infant link
 */
const NICUStation = {
    render: async (patientId) => {
        const container = document.getElementById('app-content');
        if (!container) return;
        container.innerHTML = `
<div class="stitch-station-container p-6 bg-slate-50 min-h-screen">
  <header class="flex justify-between items-center mb-6">
    <h1 class="text-2xl font-bold text-slate-800">${tr('NICU Command Center', 'مركز قيادة حضانة الأطفال')}</h1>
    <div class="flex gap-2">
      <button onclick="NICUStation.openAPGAR()" class="stitch-btn-primary px-4 py-2 bg-fuchsia-700 text-white rounded-lg shadow-sm hover:bg-fuchsia-800">${tr('APGAR Score', 'APGAR')}</button>
      <button onclick="NICUStation.openGrowth()" class="stitch-btn-secondary px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg shadow-sm hover:bg-slate-100">${tr('Growth Chart', 'مخطط النمو')}</button>
    </div>
  </header>
  <div class="grid grid-cols-12 gap-6">
    <div class="col-span-3 space-y-6">
      <div class="stitch-card p-4 bg-white rounded-xl shadow-sm border border-slate-200">
        <h3 class="text-sm font-semibold text-slate-500 mb-4 uppercase tracking-wider">${tr('APGAR 1 min', 'APGAR 1 دقيقة')}</h3>
        <div class="text-center text-3xl font-bold text-fuchsia-700">8</div>
      </div>
      <div class="stitch-card p-4 bg-white rounded-xl shadow-sm border border-slate-200">
        <h3 class="text-sm font-semibold text-slate-500 mb-4 uppercase tracking-wider">${tr('APGAR 5 min', 'APGAR 5 دقائق')}</h3>
        <div class="text-center text-3xl font-bold text-fuchsia-700">9</div>
      </div>
      <div class="stitch-card p-4 bg-white rounded-xl shadow-sm border border-slate-200">
        <h3 class="text-sm font-semibold text-slate-500 mb-4 uppercase tracking-wider">${tr('Weight', 'الوزن')}</h3>
        <div class="text-center text-2xl font-bold text-slate-700">2,450 g</div>
      </div>
    </div>
    <div class="col-span-6 space-y-6">
      <div class="stitch-card p-6 bg-white rounded-xl shadow-sm border border-slate-200 min-h-[500px]">
        <div class="flex border-b border-slate-200 mb-6">
          <button class="px-4 py-2 border-b-2 border-fuchsia-700 text-fuchsia-700 font-medium">${tr('Incubator Monitor', 'مراقبة الحاضنة')}</button>
          <button class="px-4 py-2 text-slate-500 hover:text-slate-800">${tr('TPN', 'التغذية الوريدية')}</button>
          <button class="px-4 py-2 text-slate-500 hover:text-slate-800">${tr('Mother-Baby', 'أم - طفل')}</button>
        </div>
        <div id="nicu-workspace" class="space-y-4">
          <div class="p-8 text-center text-slate-400 border-2 border-dashed border-slate-200 rounded-xl">${tr('No active neonate. Open APGAR to begin.', 'لا يوجد مولود نشط. افتح APGAR للبدء.')}</div>
        </div>
      </div>
    </div>
    <div class="col-span-3 space-y-6">
      <div class="stitch-card p-4 bg-fuchsia-50 rounded-xl shadow-sm border border-fuchsia-200">
        <div class="flex items-center gap-2 mb-4">
          <span class="text-xl">👶</span>
          <h3 class="text-sm font-bold text-slate-900 uppercase tracking-wider">${tr('NICU AI', 'ذكاء NICU')}</h3>
        </div>
        <div class="space-y-3 text-sm">
          <div class="p-3 bg-white rounded-lg border border-slate-200">
            <div class="font-semibold text-slate-800">${tr('Sepsis EWS', 'تنبيه إنتان مبكر')}</div>
            <div class="text-xs text-emerald-600 mt-1">${tr('Stable', 'مستقر')}</div>
          </div>
          <div class="p-3 bg-white rounded-lg border border-slate-200">
            <div class="font-semibold text-slate-800">${tr('Growth Velocity', 'سرعة النمو')}</div>
            <div class="text-xs text-slate-600 mt-1">${tr('15 g/day', '15 غ/يوم')}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>`;
    },
    openAPGAR: () => alert('APGAR (POST /api/nicu/admit)'),
    openGrowth: () => alert('Growth (POST /api/nicu/growth)')
};
if (typeof window !== 'undefined') window.NICUStation = NICUStation;
