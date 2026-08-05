/**
 * radiology-station.js
 * Radiology (RIS/PACS) Specialist Station
 * Focus: Worklist, PACS viewer, critical finding
 */
const RadiologyStation = {
    render: async (patientId) => {
        const container = document.getElementById('app-content');
        if (!container) return;
        container.innerHTML = `
<div class="stitch-station-container p-6 bg-slate-50 min-h-screen">
  <header class="flex justify-between items-center mb-6">
    <h1 class="text-2xl font-bold text-slate-800">${tr('Radiology Command Center', 'مركز قيادة الأشعة')}</h1>
    <div class="flex gap-2">
      <button onclick="RadiologyStation.openReportEditor()" class="stitch-btn-primary px-4 py-2 bg-violet-700 text-white rounded-lg shadow-sm hover:bg-violet-800"<button aria-label="${tr('Open Report', 'فتح تقرير')}" type="button" onclick="RadiologyStation.openReportEditor()" class="stitch-btn-primary px-4 py-2 bg-violet-700 text-white rounded-lg shadow-sm hover:bg-violet-800">${tr('Open Report', 'فتح تقرير')}</button>
      <button onclick="RadiologyStation.openPACS()" class="stitch-btn-secondary px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg shadow-sm hover:bg-slate-100"<button aria-label="${tr('PACS Viewer', 'عارض PACS')}" type="button" onclick="RadiologyStation.openPACS()" class="stitch-btn-secondary px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg shadow-sm hover:bg-slate-100">${tr('PACS Viewer', 'عارض PACS')}</button>
    </div>
  </header>
  <div class="grid grid-cols-12 gap-6">
    <div class="col-span-3 space-y-6">
      <div class="stitch-card p-4 bg-white rounded-xl shadow-sm border border-slate-200">
        <h3 class="text-sm font-semibold text-slate-500 mb-4 uppercase tracking-wider">${tr('Worklist', 'قائمة العمل')}</h3>
        <div class="space-y-2 text-sm">
          <div class="p-3 bg-amber-50 rounded border border-amber-200">
            <div class="font-semibold text-slate-800">CT Chest</div>
            <div class="text-xs text-amber-700">${tr('STAT', 'عاجل')}</div>
          </div>
          <div class="p-3 bg-slate-50 rounded border border-slate-200">
            <div class="font-semibold text-slate-800">MRI Brain</div>
            <div class="text-xs text-slate-500">${tr('Routine', 'روتيني')}</div>
          </div>
        </div>
      </div>
    </div>
    <div class="col-span-6 space-y-6">
      <div class="stitch-card p-6 bg-white rounded-xl shadow-sm border border-slate-200 min-h-[500px]">
        <div class="flex border-b border-slate-200 mb-6">
          <button class="px-4 py-2 border-b-2 border-violet-700 text-violet-700 font-medium"<button aria-label="${tr('PACS + Report', 'PACS + تقرير')}" type="button" class="px-4 py-2 border-b-2 border-violet-700 text-violet-700 font-medium">${tr('PACS + Report', 'PACS + تقرير')}</button>
          <button class="px-4 py-2 text-slate-500 hover:text-slate-800"<button aria-label="${tr('Critical Finding', 'نتيجة حرجة')}" type="button" class="px-4 py-2 text-slate-500 hover:text-slate-800">${tr('Critical Finding', 'نتيجة حرجة')}</button>
        </div>
        <div id="rad-workspace" class="space-y-4">
          <div class="aspect-video bg-slate-900 rounded-lg flex items-center justify-center text-slate-400 text-sm">
            ${tr('PACS Viewer (DICOM)', 'عارض PACS (DICOM)')}
          </div>
        </div>
      </div>
    </div>
    <div class="col-span-3 space-y-6">
      <div class="stitch-card p-4 bg-violet-50 rounded-xl shadow-sm border border-violet-200">
        <div class="flex items-center gap-2 mb-4">
          <span class="text-xl">🩻</span>
          <h3 class="text-sm font-bold text-slate-900 uppercase tracking-wider">${tr('Radiology AI', 'ذكاء أشعتي')}</h3>
        </div>
        <div class="space-y-3 text-sm">
          <div class="p-3 bg-white rounded-lg border border-slate-200">
            <div class="font-semibold text-slate-800">${tr('Dose (ALARA)', 'الجرعة ALARA')}</div>
            <div class="text-xs text-emerald-600 mt-1">${tr('Within limit', 'ضمن الحد')}</div>
          </div>
          <div class="p-3 bg-white rounded-lg border border-slate-200">
            <div class="font-semibold text-slate-800">${tr('Critical Findings', 'نتائج حرجة')}</div>
            <div class="text-xs text-slate-600 mt-1">${tr('None', 'لا')}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>`;
    },
    openReportEditor: () => Modal.open({ title: "Report editor (POST /api/radiology/report)", body: "<p style=\"font-size:14px;color:#334155\">Report editor (POST /api/radiology/report)</p><div style=\"background:#f1f5f9;border-radius:6px;padding:10px;font-size:12px;color:#475569;margin-top:10px\"><strong>HTTP:</strong> API &nbsp;&nbsp;<strong>Endpoint:</strong> <code>/api/radiology/report</code></div><p style=\"font-size:13px;color:#64748b;margin-top:10px\">This action will be wired to the live backend. Configure Department Mappings to enable persistent capture.</p>", primaryLabel: 'OK', secondaryLabel: 'Close', hidePrimary: true }),
    openPACS: () => Modal.open({ title: "PACS viewer (GET /api/radiology/images/:studyId)", body: "<p style=\"font-size:14px;color:#334155\">PACS viewer (GET /api/radiology/images/:studyId)</p><div style=\"background:#f1f5f9;border-radius:6px;padding:10px;font-size:12px;color:#475569;margin-top:10px\"><strong>HTTP:</strong> API &nbsp;&nbsp;<strong>Endpoint:</strong> <code>/api/radiology/images/</code></div><p style=\"font-size:13px;color:#64748b;margin-top:10px\">This action will be wired to the live backend. Configure Department Mappings to enable persistent capture.</p>", primaryLabel: 'OK', secondaryLabel: 'Close', hidePrimary: true })};
if (typeof window !== 'undefined') window.RadiologyStation = RadiologyStation;
