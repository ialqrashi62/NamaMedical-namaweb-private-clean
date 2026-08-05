/**
 * anesthesia-station.js
 * Anesthesia & Perioperative Specialist Station
 * Focus: Pre-op assessment, intra-op chart, PACU handoff
 */
const AnesthesiaStation = {
    render: async (patientId) => {
        const container = document.getElementById('app-content');
        if (!container) return;
        container.innerHTML = `
<div class="stitch-station-container p-6 bg-slate-50 min-h-screen">
  <header class="flex justify-between items-center mb-6">
    <h1 class="text-2xl font-bold text-slate-800">${tr('Anesthesia Command Center', 'مركز قيادة التخدير')}</h1>
    <div class="flex gap-2">
      <button onclick="AnesthesiaStation.openPreOp()" class="stitch-btn-primary px-4 py-2 bg-purple-700 text-white rounded-lg shadow-sm hover:bg-purple-800"<button aria-label="${tr('Pre-Op Assessment', 'تقييم ما قبل')}" type="button" onclick="AnesthesiaStation.openPreOp()" class="stitch-btn-primary px-4 py-2 bg-purple-700 text-white rounded-lg shadow-sm hover:bg-purple-800">${tr('Pre-Op Assessment', 'تقييم ما قبل')}</button>
      <button onclick="AnesthesiaStation.openPACUHandoff()" class="stitch-btn-secondary px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg shadow-sm hover:bg-slate-100"<button aria-label="${tr('PACU Handoff', 'تسليم PACU')}" type="button" onclick="AnesthesiaStation.openPACUHandoff()" class="stitch-btn-secondary px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg shadow-sm hover:bg-slate-100">${tr('PACU Handoff', 'تسليم PACU')}</button>
    </div>
  </header>
  <div class="grid grid-cols-12 gap-6">
    <div class="col-span-3 space-y-6">
      <div class="stitch-card p-4 bg-white rounded-xl shadow-sm border border-slate-200">
        <h3 class="text-sm font-semibold text-slate-500 mb-4 uppercase tracking-wider">${tr('OR Schedule', 'جدول العمليات')}</h3>
        <div class="space-y-2 text-sm">
          <div class="p-3 bg-amber-50 rounded border border-amber-200">
            <div class="font-semibold text-slate-800">OR 3 - 08:00</div>
            <div class="text-xs text-slate-500">${tr('CABG', 'تطعيم شرايين تاجية')}</div>
          </div>
        </div>
      </div>
      <div class="stitch-card p-4 bg-white rounded-xl shadow-sm border border-slate-200">
        <h3 class="text-sm font-semibold text-slate-500 mb-4 uppercase tracking-wider">${tr('ASA Class', 'تصنيف ASA')}</h3>
        <div class="text-center text-2xl font-bold text-purple-700">III</div>
      </div>
    </div>
    <div class="col-span-6 space-y-6">
      <div class="stitch-card p-6 bg-white rounded-xl shadow-sm border border-slate-200 min-h-[500px]">
        <div class="flex border-b border-slate-200 mb-6">
          <button class="px-4 py-2 border-b-2 border-purple-700 text-purple-700 font-medium"<button aria-label="${tr('Intra-Op Chart', 'سجل العملية')}" type="button" class="px-4 py-2 border-b-2 border-purple-700 text-purple-700 font-medium">${tr('Intra-Op Chart', 'سجل العملية')}</button>
          <button class="px-4 py-2 text-slate-500 hover:text-slate-800"<button aria-label="${tr('Pre-Op', 'قبل العملية')}" type="button" class="px-4 py-2 text-slate-500 hover:text-slate-800">${tr('Pre-Op', 'قبل العملية')}</button>
          <button class="px-4 py-2 text-slate-500 hover:text-slate-800"<button aria-label="${tr('Drugs', 'الأدوية')}" type="button" class="px-4 py-2 text-slate-500 hover:text-slate-800">${tr('Drugs', 'الأدوية')}</button>
        </div>
        <div id="anesthesia-workspace" class="space-y-4">
          <div class="p-8 text-center text-slate-400 border-2 border-dashed border-slate-200 rounded-xl">${tr('No active case. Open Pre-Op Assessment to begin.', 'لا توجد حالة نشطة. افتح تقييم ما قبل للبدء.')}</div>
        </div>
      </div>
    </div>
    <div class="col-span-3 space-y-6">
      <div class="stitch-card p-4 bg-purple-50 rounded-xl shadow-sm border border-purple-200">
        <div class="flex items-center gap-2 mb-4">
          <span class="text-xl">💉</span>
          <h3 class="text-sm font-bold text-slate-900 uppercase tracking-wider">${tr('Anesthesia AI', 'ذكاء تخدير')}</h3>
        </div>
        <div class="space-y-3 text-sm">
          <div class="p-3 bg-white rounded-lg border border-slate-200">
            <div class="font-semibold text-slate-800">${tr('Airway Risk', 'خطر مجرى الهواء')}</div>
            <div class="text-xs text-amber-600 mt-1">${tr('Moderate', 'متوسط')}</div>
          </div>
          <div class="p-3 bg-white rounded-lg border border-slate-200">
            <div class="font-semibold text-slate-800">${tr('Drug Interaction', 'تداخلات دوائية')}</div>
            <div class="text-xs text-slate-600 mt-1">${tr('None', 'لا')}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>`;
    },
    openPreOp: () => Modal.open({ title: "Pre-op (POST /api/anesthesia/pre-op)", body: "<p style=\"font-size:14px;color:#334155\">Pre-op (POST /api/anesthesia/pre-op)</p><div style=\"background:#f1f5f9;border-radius:6px;padding:10px;font-size:12px;color:#475569;margin-top:10px\"><strong>HTTP:</strong> API &nbsp;&nbsp;<strong>Endpoint:</strong> <code>/api/anesthesia/pre-op</code></div><p style=\"font-size:13px;color:#64748b;margin-top:10px\">This action will be wired to the live backend. Configure Department Mappings to enable persistent capture.</p>", primaryLabel: 'OK', secondaryLabel: 'Close', hidePrimary: true }),
    openPACUHandoff: () => Modal.open({ title: "PACU handoff (PUT /api/anesthesia/complete)", body: "<p style=\"font-size:14px;color:#334155\">PACU handoff (PUT /api/anesthesia/complete)</p><div style=\"background:#f1f5f9;border-radius:6px;padding:10px;font-size:12px;color:#475569;margin-top:10px\"><strong>HTTP:</strong> API &nbsp;&nbsp;<strong>Endpoint:</strong> <code>/api/anesthesia/complete</code></div><p style=\"font-size:13px;color:#64748b;margin-top:10px\">This action will be wired to the live backend. Configure Department Mappings to enable persistent capture.</p>", primaryLabel: 'OK', secondaryLabel: 'Close', hidePrimary: true })};
if (typeof window !== 'undefined') window.AnesthesiaStation = AnesthesiaStation;
