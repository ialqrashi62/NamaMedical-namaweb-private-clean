/**
 * neurosurgery-station.js
 * Neurosurgery & Spine Specialist Station
 * Focus: ICP monitoring, GCS tracking, spine stability
 */
const NeurosurgeryStation = {
    render: async (patientId) => {
        const container = document.getElementById('app-content');
        if (!container) return;
        container.innerHTML = `
<div class="stitch-station-container p-6 bg-slate-50 min-h-screen">
  <header class="flex justify-between items-center mb-6">
    <h1 class="text-2xl font-bold text-slate-800">${tr('Neurosurgery Command Center', 'مركز قيادة جراحة المخ')}</h1>
    <div class="flex gap-2">
      <button onclick="NeurosurgeryStation.openICPLog()" class="stitch-btn-primary px-4 py-2 bg-indigo-700 text-white rounded-lg shadow-sm hover:bg-indigo-800">${tr('Log ICP/CPP', 'تسجيل ICP/CPP')}</button>
      <button onclick="NeurosurgeryStation.openGCSTrend()" class="stitch-btn-secondary px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg shadow-sm hover:bg-slate-100">${tr('GCS Trend', 'اتجاه GCS')}</button>
    </div>
  </header>
  <div class="grid grid-cols-12 gap-6">
    <div class="col-span-3 space-y-6">
      <div class="stitch-card p-4 bg-white rounded-xl shadow-sm border border-slate-200">
        <h3 class="text-sm font-semibold text-slate-500 mb-4 uppercase tracking-wider">${tr('Current GCS', 'GCS الحالي')}</h3>
        <div class="text-center">
          <div class="text-4xl font-bold text-indigo-700">E4 V5 M6</div>
          <div class="text-2xl font-bold text-slate-700 mt-1">15/15</div>
        </div>
      </div>
      <div class="stitch-card p-4 bg-white rounded-xl shadow-sm border border-slate-200">
        <h3 class="text-sm font-semibold text-slate-500 mb-4 uppercase tracking-wider">${tr('Latest ICP', 'آخر قراءة ICP')}</h3>
        <div class="text-center">
          <div class="text-3xl font-bold text-emerald-600">12</div>
          <div class="text-xs text-slate-500">${tr('mmHg - Normal', 'ملم زئبق - طبيعي')}</div>
        </div>
      </div>
    </div>
    <div class="col-span-6 space-y-6">
      <div class="stitch-card p-6 bg-white rounded-xl shadow-sm border border-slate-200 min-h-[500px]">
        <div class="flex border-b border-slate-200 mb-6">
          <button class="px-4 py-2 border-b-2 border-indigo-700 text-indigo-700 font-medium">${tr('ICP Monitor', 'مراقبة ICP')}</button>
          <button class="px-4 py-2 text-slate-500 hover:text-slate-800">${tr('GCS Trend', 'اتجاه GCS')}</button>
          <button class="px-4 py-2 text-slate-500 hover:text-slate-800">${tr('Spine Stability', 'استقرار العمود الفقري')}</button>
        </div>
        <div id="neuro-workspace" class="space-y-4">
          <div class="p-8 text-center text-slate-400 border-2 border-dashed border-slate-200 rounded-xl">${tr('No active session. Open ICP Log to begin.', 'لا توجد جلسة نشطة. افتح تسجيل ICP للبدء.')}</div>
        </div>
      </div>
    </div>
    <div class="col-span-3 space-y-6">
      <div class="stitch-card p-4 bg-indigo-50 rounded-xl shadow-sm border border-indigo-200">
        <div class="flex items-center gap-2 mb-4">
          <span class="text-xl">🧠</span>
          <h3 class="text-sm font-bold text-slate-900 uppercase tracking-wider">${tr('Neuro AI', 'ذكاء عصبي')}</h3>
        </div>
        <div class="space-y-3 text-sm">
          <div class="p-3 bg-white rounded-lg border border-slate-200">
            <div class="font-semibold text-slate-800">${tr('Neurological Risk', 'الخطر العصبي')}</div>
            <div class="text-xs text-emerald-600 mt-1">${tr('Stable', 'مستقر')}</div>
          </div>
          <div class="p-3 bg-white rounded-lg border border-slate-200">
            <div class="font-semibold text-slate-800">${tr('Deficit Predictor', 'تنبؤ العجز')}</div>
            <div class="text-xs text-slate-600 mt-1">${tr('Low risk', 'خطر منخفض')}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>`;
    },
    openICPLog: () => alert('ICP log (POST /api/neurosurgery/icp-log)'),
    openGCSTrend: () => alert('GCS trend (POST /api/neurosurgery/gcs-trend)')
};
if (typeof window !== 'undefined') window.NeurosurgeryStation = NeurosurgeryStation;
