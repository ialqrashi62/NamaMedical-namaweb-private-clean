/**
 * ent-station.js
 * ENT (Otolaryngology) Specialist Station
 * Focus: Audiometry, sinus surgery, cochlear implants
 */
const ENTStation = {
    render: async (patientId) => {
        const container = document.getElementById('app-content');
        if (!container) return;
        container.innerHTML = `
<div class="stitch-station-container p-6 bg-slate-50 min-h-screen">
  <header class="flex justify-between items-center mb-6">
    <h1 class="text-2xl font-bold text-slate-800">${tr('ENT Command Center', 'مركز قيادة الأنف والأذن والحنجرة')}</h1>
    <div class="flex gap-2">
      <button onclick="ENTStation.openAudiogram()" class="stitch-btn-primary px-4 py-2 bg-orange-600 text-white rounded-lg shadow-sm hover:bg-orange-700">${tr('Log Audiogram', 'تسجيل قياس سمع')}</button>
      <button onclick="ENTStation.openSinus()" class="stitch-btn-secondary px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg shadow-sm hover:bg-slate-100">${tr('Sinus Procedure', 'إجراء جيوب أنفية')}</button>
    </div>
  </header>
  <div class="grid grid-cols-12 gap-6">
    <div class="col-span-3 space-y-6">
      <div class="stitch-card p-4 bg-white rounded-xl shadow-sm border border-slate-200">
        <h3 class="text-sm font-semibold text-slate-500 mb-4 uppercase tracking-wider">${tr('Audiogram', 'قياس السمع')}</h3>
        <div class="space-y-2 text-sm">
          <div class="flex justify-between"><span>500 Hz</span><span class="font-mono">20 dB</span></div>
          <div class="flex justify-between"><span>1 kHz</span><span class="font-mono">15 dB</span></div>
          <div class="flex justify-between"><span>2 kHz</span><span class="font-mono">25 dB</span></div>
          <div class="flex justify-between"><span>4 kHz</span><span class="font-mono text-red-600">50 dB</span></div>
        </div>
      </div>
      <div class="stitch-card p-4 bg-white rounded-xl shadow-sm border border-slate-200">
        <h3 class="text-sm font-semibold text-slate-500 mb-4 uppercase tracking-wider">${tr('Side', 'الجانب')}</h3>
        <div class="text-center text-lg font-bold text-slate-700">${tr('Right', 'أيمن')}</div>
      </div>
    </div>
    <div class="col-span-6 space-y-6">
      <div class="stitch-card p-6 bg-white rounded-xl shadow-sm border border-slate-200 min-h-[500px]">
        <div class="flex border-b border-slate-200 mb-6">
          <button class="px-4 py-2 border-b-2 border-orange-600 text-orange-600 font-medium">${tr('Audiogram', 'قياس السمع')}</button>
          <button class="px-4 py-2 text-slate-500 hover:text-slate-800">${tr('Sinus View', 'منظر الجيوب')}</button>
          <button class="px-4 py-2 text-slate-500 hover:text-slate-800">${tr('Implant Map', 'خريطة الزرعة')}</button>
        </div>
        <div id="ent-workspace" class="space-y-4">
          <div class="p-8 text-center text-slate-400 border-2 border-dashed border-slate-200 rounded-xl">${tr('No active session. Open Audiogram to begin.', 'لا توجد جلسة نشطة. افتح قياس السمع للبدء.')}</div>
        </div>
      </div>
    </div>
    <div class="col-span-3 space-y-6">
      <div class="stitch-card p-4 bg-orange-50 rounded-xl shadow-sm border border-orange-200">
        <div class="flex items-center gap-2 mb-4">
          <span class="text-xl">👂</span>
          <h3 class="text-sm font-bold text-slate-900 uppercase tracking-wider">${tr('ENT AI', 'ذكاء أنف أذن حنجرة')}</h3>
        </div>
        <div class="space-y-3 text-sm">
          <div class="p-3 bg-white rounded-lg border border-slate-200">
            <div class="font-semibold text-slate-800">${tr('SSNHL Alert', 'تنبيه SSNHL')}</div>
            <div class="text-xs text-emerald-600 mt-1">${tr('No sudden loss', 'لا فقدان مفاجئ')}</div>
          </div>
          <div class="p-3 bg-white rounded-lg border border-slate-200">
            <div class="font-semibold text-slate-800">${tr('Cochlear Candidacy', 'صلاحية القوقعة')}</div>
            <div class="text-xs text-slate-600 mt-1">${tr('Under evaluation', 'قيد التقييم')}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>`;
    },
    openAudiogram: () => alert('Audiogram log (POST /api/ent/audiogram)'),
    openSinus: () => alert('Sinus procedure (POST /api/ent/log)')
};
if (typeof window !== 'undefined') window.ENTStation = ENTStation;
