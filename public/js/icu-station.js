/**
 * icu-station.js
 * ICU Specialist Station
 * Focus: Bedside monitor, sepsis bundle, daily goals
 */
const ICUStation = {
    render: async (patientId) => {
        const container = document.getElementById('app-content');
        if (!container) return;
        container.innerHTML = `
<div class="stitch-station-container p-6 bg-slate-50 min-h-screen">
  <header class="flex justify-between items-center mb-6">
    <h1 class="text-2xl font-bold text-slate-800">${tr('ICU Command Center', 'مركز قيادة العناية المركزة')}</h1>
    <div class="flex gap-2">
      <button onclick="ICUStation.openSepsisBundle()" class="stitch-btn-primary px-4 py-2 bg-rose-700 text-white rounded-lg shadow-sm hover:bg-rose-800">${tr('Sepsis Bundle', 'حزمة الإنتان')}</button>
      <button onclick="ICUStation.openDailyGoals()" class="stitch-btn-secondary px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg shadow-sm hover:bg-slate-100">${tr('Daily Goals', 'أهداف يومية')}</button>
    </div>
  </header>
  <div class="grid grid-cols-12 gap-6">
    <div class="col-span-3 space-y-6">
      <div class="stitch-card p-4 bg-white rounded-xl shadow-sm border border-slate-200">
        <h3 class="text-sm font-semibold text-slate-500 mb-4 uppercase tracking-wider">${tr('Latest MAP', 'آخر MAP')}</h3>
        <div class="text-center">
          <div class="text-3xl font-bold text-rose-700">68</div>
          <div class="text-xs text-slate-500">${tr('mmHg', 'ملم زئبق')}</div>
        </div>
      </div>
      <div class="stitch-card p-4 bg-white rounded-xl shadow-sm border border-slate-200">
        <h3 class="text-sm font-semibold text-slate-500 mb-4 uppercase tracking-wider">${tr('Lactate', 'اللاكتات')}</h3>
        <div class="text-center">
          <div class="text-3xl font-bold text-emerald-600">1.8</div>
          <div class="text-xs text-slate-500">${tr('mmol/L', 'مليمول/لتر')}</div>
        </div>
      </div>
    </div>
    <div class="col-span-6 space-y-6">
      <div class="stitch-card p-6 bg-white rounded-xl shadow-sm border border-slate-200 min-h-[500px]">
        <div class="flex border-b border-slate-200 mb-6">
          <button class="px-4 py-2 border-b-2 border-rose-700 text-rose-700 font-medium">${tr('Bedside Monitor', 'مراقبة بجانب السرير')}</button>
          <button class="px-4 py-2 text-slate-500 hover:text-slate-800">${tr('Ventilator', 'جهاز التنفس')}</button>
          <button class="px-4 py-2 text-slate-500 hover:text-slate-800">${tr('Sepsis Checklist', 'قائمة الإنتان')}</button>
        </div>
        <div id="icu-workspace" class="space-y-4">
          <div class="p-8 text-center text-slate-400 border-2 border-dashed border-slate-200 rounded-xl">${tr('No active patient. Open Sepsis Bundle to begin.', 'لا يوجد مريض نشط. افتح حزمة الإنتان للبدء.')}</div>
        </div>
      </div>
    </div>
    <div class="col-span-3 space-y-6">
      <div class="stitch-card p-4 bg-rose-50 rounded-xl shadow-sm border border-rose-200">
        <div class="flex items-center gap-2 mb-4">
          <span class="text-xl">🛏️</span>
          <h3 class="text-sm font-bold text-slate-900 uppercase tracking-wider">${tr('ICU AI', 'ذكاء ICU')}</h3>
        </div>
        <div class="space-y-3 text-sm">
          <div class="p-3 bg-white rounded-lg border border-slate-200">
            <div class="font-semibold text-slate-800">${tr('Sepsis EWS', 'تنبيه إنتان مبكر')}</div>
            <div class="text-xs text-emerald-600 mt-1">${tr('No alert', 'لا تنبيه')}</div>
          </div>
          <div class="p-3 bg-white rounded-lg border border-slate-200">
            <div class="font-semibold text-slate-800">${tr('RSBI', 'مؤشر RSBI')}</div>
            <div class="text-xs text-slate-600 mt-1">${tr('78 - Ready', '78 - جاهز')}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>`;
    },
    openSepsisBundle: () => alert('Sepsis bundle (POST /api/icu/sepsis-bundle)'),
    openDailyGoals: () => alert('Daily goals (POST /api/icu/daily-goals)')
};
if (typeof window !== 'undefined') window.ICUStation = ICUStation;
