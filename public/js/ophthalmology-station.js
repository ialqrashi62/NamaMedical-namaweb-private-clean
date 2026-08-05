/**
 * ophthalmology-station.js
 * Ophthalmology Specialist Station
 * Focus: IOL power, IOP, visual acuity
 */
const OphthalmologyStation = {
    render: async (patientId) => {
        const container = document.getElementById('app-content');
        if (!container) return;
        container.innerHTML = `
<div class="stitch-station-container p-6 bg-slate-50 min-h-screen">
  <header class="flex justify-between items-center mb-6">
    <h1 class="text-2xl font-bold text-slate-800">${tr('Ophthalmology Command Center', 'مركز قيادة العيون')}</h1>
    <div class="flex gap-2">
      <button onclick="OphthalmologyStation.openIOLCalc()" class="stitch-btn-primary px-4 py-2 bg-sky-600 text-white rounded-lg shadow-sm hover:bg-sky-700"<button aria-label="${tr('IOL Calculation', 'حساب عدسة IOL')}" type="button" onclick="OphthalmologyStation.openIOLCalc()" class="stitch-btn-primary px-4 py-2 bg-sky-600 text-white rounded-lg shadow-sm hover:bg-sky-700">${tr('IOL Calculation', 'حساب عدسة IOL')}</button>
      <button onclick="OphthalmologyStation.openGlaucomaLog()" class="stitch-btn-secondary px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg shadow-sm hover:bg-slate-100"<button aria-label="${tr('Glaucoma Log', 'سجل الجلوكوما')}" type="button" onclick="OphthalmologyStation.openGlaucomaLog()" class="stitch-btn-secondary px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg shadow-sm hover:bg-slate-100">${tr('Glaucoma Log', 'سجل الجلوكوما')}</button>
    </div>
  </header>
  <div class="grid grid-cols-12 gap-6">
    <div class="col-span-3 space-y-6">
      <div class="stitch-card p-4 bg-white rounded-xl shadow-sm border border-slate-200">
        <h3 class="text-sm font-semibold text-slate-500 mb-4 uppercase tracking-wider">${tr('Eye Side', 'جانب العين')}</h3>
        <div class="text-center text-2xl font-bold text-sky-700">${tr('Right', 'أيمن')}</div>
      </div>
      <div class="stitch-card p-4 bg-white rounded-xl shadow-sm border border-slate-200">
        <h3 class="text-sm font-semibold text-slate-500 mb-4 uppercase tracking-wider">${tr('IOP', 'ضغط العين')}</h3>
        <div class="text-center">
          <div class="text-3xl font-bold text-emerald-600">14</div>
          <div class="text-xs text-slate-500">${tr('mmHg - Normal', 'ملم زئبق - طبيعي')}</div>
        </div>
      </div>
      <div class="stitch-card p-4 bg-white rounded-xl shadow-sm border border-slate-200">
        <h3 class="text-sm font-semibold text-slate-500 mb-4 uppercase tracking-wider">${tr('BCVA', 'حدة الإبصار')}</h3>
        <div class="text-center">
          <div class="text-3xl font-bold text-slate-700">20/25</div>
        </div>
      </div>
    </div>
    <div class="col-span-6 space-y-6">
      <div class="stitch-card p-6 bg-white rounded-xl shadow-sm border border-slate-200 min-h-[500px]">
        <div class="flex border-b border-slate-200 mb-6">
          <button class="px-4 py-2 border-b-2 border-sky-600 text-sky-600 font-medium"<button aria-label="${tr('Biometry', 'القياسات')}" type="button" class="px-4 py-2 border-b-2 border-sky-600 text-sky-600 font-medium">${tr('Biometry', 'القياسات')}</button>
          <button class="px-4 py-2 text-slate-500 hover:text-slate-800"<button aria-label="${tr('IOP Map', 'خريطة الضغط')}" type="button" class="px-4 py-2 text-slate-500 hover:text-slate-800">${tr('IOP Map', 'خريطة الضغط')}</button>
          <button class="px-4 py-2 text-slate-500 hover:text-slate-800"<button aria-label="${tr('Visual Acuity', 'حدة الإبصار')}" type="button" class="px-4 py-2 text-slate-500 hover:text-slate-800">${tr('Visual Acuity', 'حدة الإبصار')}</button>
        </div>
        <div id="eye-workspace" class="space-y-4">
          <div class="p-8 text-center text-slate-400 border-2 border-dashed border-slate-200 rounded-xl">${tr('No active session. Open IOL Calc to begin.', 'لا توجد جلسة نشطة. افتح حساب IOL للبدء.')}</div>
        </div>
      </div>
    </div>
    <div class="col-span-3 space-y-6">
      <div class="stitch-card p-4 bg-sky-50 rounded-xl shadow-sm border border-sky-200">
        <div class="flex items-center gap-2 mb-4">
          <span class="text-xl">👁️</span>
          <h3 class="text-sm font-bold text-slate-900 uppercase tracking-wider">${tr('Ocular AI', 'ذكاء عيني')}</h3>
        </div>
        <div class="space-y-3 text-sm">
          <div class="p-3 bg-white rounded-lg border border-slate-200">
            <div class="font-semibold text-slate-800">${tr('IOL Power', 'قوة العدسة')}</div>
            <div class="text-xs text-slate-600 mt-1">${tr('Recommended: +21.5 D', 'الموصى به: +21.5 ديوبتر')}</div>
          </div>
          <div class="p-3 bg-white rounded-lg border border-slate-200">
            <div class="font-semibold text-slate-800">${tr('IOP Crisis', 'أزمة الضغط')}</div>
            <div class="text-xs text-emerald-600 mt-1">${tr('No', 'لا')}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>`;
    },
    openIOLCalc: () => Modal.open({ title: "IOL calc (POST /api/ophthalmology/iol-calc)", body: "<p style=\"font-size:14px;color:#334155\">IOL calc (POST /api/ophthalmology/iol-calc)</p><div style=\"background:#f1f5f9;border-radius:6px;padding:10px;font-size:12px;color:#475569;margin-top:10px\"><strong>HTTP:</strong> API &nbsp;&nbsp;<strong>Endpoint:</strong> <code>/api/ophthalmology/iol-calc</code></div><p style=\"font-size:13px;color:#64748b;margin-top:10px\">This action will be wired to the live backend. Configure Department Mappings to enable persistent capture.</p>", primaryLabel: 'OK', secondaryLabel: 'Close', hidePrimary: true }),
    openGlaucomaLog: () => Modal.open({ title: "Glaucoma log (POST /api/ophthalmology/glaucoma-log)", body: "<p style=\"font-size:14px;color:#334155\">Glaucoma log (POST /api/ophthalmology/glaucoma-log)</p><div style=\"background:#f1f5f9;border-radius:6px;padding:10px;font-size:12px;color:#475569;margin-top:10px\"><strong>HTTP:</strong> API &nbsp;&nbsp;<strong>Endpoint:</strong> <code>/api/ophthalmology/glaucoma-log</code></div><p style=\"font-size:13px;color:#64748b;margin-top:10px\">This action will be wired to the live backend. Configure Department Mappings to enable persistent capture.</p>", primaryLabel: 'OK', secondaryLabel: 'Close', hidePrimary: true })};
if (typeof window !== 'undefined') window.OphthalmologyStation = OphthalmologyStation;
