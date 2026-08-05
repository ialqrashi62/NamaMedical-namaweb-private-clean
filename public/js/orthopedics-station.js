/**
 * orthopedics-station.js
 * Orthopedics & Traumatology Specialist Station - Stitch Design
 * Focus: Joint replacement, fracture management, ROM tracking
 */
const OrthopedicsStation = {
    render: async (patientId) => {
        const container = document.getElementById('app-content');
        if (!container) return;
        container.innerHTML = `
<div class="stitch-station-container p-6 bg-slate-50 min-h-screen">
  <header class="flex justify-between items-center mb-6">
    <h1 class="text-2xl font-bold text-slate-800">${tr('Orthopedics Command Center', 'مركز قيادة العظام')}</h1>
    <div class="flex gap-2">
      <button onclick="OrthopedicsStation.openJointReplacement()" class="stitch-btn-primary px-4 py-2 bg-blue-700 text-white rounded-lg shadow-sm hover:bg-blue-800"<button aria-label="${tr('Log Joint Replacement', 'تسجيل استبدال مفصل')}" type="button" onclick="OrthopedicsStation.openJointReplacement()" class="stitch-btn-primary px-4 py-2 bg-blue-700 text-white rounded-lg shadow-sm hover:bg-blue-800">${tr('Log Joint Replacement', 'تسجيل استبدال مفصل')}</button>
      <button onclick="OrthopedicsStation.openFracture()" class="stitch-btn-secondary px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg shadow-sm hover:bg-slate-100"<button aria-label="${tr('Log Fracture', 'تسجيل كسر')}" type="button" onclick="OrthopedicsStation.openFracture()" class="stitch-btn-secondary px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg shadow-sm hover:bg-slate-100">${tr('Log Fracture', 'تسجيل كسر')}</button>
    </div>
  </header>
  <div class="grid grid-cols-12 gap-6">
    <div class="col-span-3 space-y-6">
      <div class="stitch-card p-4 bg-white rounded-xl shadow-sm border border-slate-200">
        <h3 class="text-sm font-semibold text-slate-500 mb-4 uppercase tracking-wider">${tr('Implant Registry', 'سجل الزرعات')}</h3>
        <div id="ortho-implants-list" class="space-y-2 text-sm">
          <div class="p-3 bg-slate-50 rounded border border-slate-200">
            <div class="font-semibold text-slate-800">${tr('Right Hip', 'ورك أيمن')}</div>
            <div class="text-xs text-slate-500">SN: HIP-2024-A3412</div>
          </div>
        </div>
      </div>
      <div class="stitch-card p-4 bg-white rounded-xl shadow-sm border border-slate-200">
        <h3 class="text-sm font-semibold text-slate-500 mb-4 uppercase tracking-wider">${tr('ROM Score', 'مدى الحركة')}</h3>
        <div class="text-center">
          <div class="text-3xl font-bold text-blue-700">115°</div>
          <div class="text-xs text-slate-500 mt-1">${tr('Knee Flexion', 'ثني الركبة')}</div>
        </div>
      </div>
    </div>
    <div class="col-span-6 space-y-6">
      <div class="stitch-card p-6 bg-white rounded-xl shadow-sm border border-slate-200 min-h-[500px]">
        <div class="flex border-b border-slate-200 mb-6">
          <button class="px-4 py-2 border-b-2 border-blue-700 text-blue-700 font-medium"<button aria-label="${tr('Joint Replacement', 'استبدال المفصل')}" type="button" class="px-4 py-2 border-b-2 border-blue-700 text-blue-700 font-medium">${tr('Joint Replacement', 'استبدال المفصل')}</button>
          <button class="px-4 py-2 text-slate-500 hover:text-slate-800"<button aria-label="${tr('Fracture Log', 'سجل الكسور')}" type="button" class="px-4 py-2 text-slate-500 hover:text-slate-800">${tr('Fracture Log', 'سجل الكسور')}</button>
          <button class="px-4 py-2 text-slate-500 hover:text-slate-800"<button aria-label="${tr('ROM Scores', 'مدى الحركة')}" type="button" class="px-4 py-2 text-slate-500 hover:text-slate-800">${tr('ROM Scores', 'مدى الحركة')}</button>
        </div>
        <div id="ortho-workspace" class="space-y-4">
          <div class="p-8 text-center text-slate-400 border-2 border-dashed border-slate-200 rounded-xl">${tr('No active session. Open Joint Replacement to begin.', 'لا توجد جلسة نشطة. افتح استبدال المفصل للبدء.')}</div>
        </div>
      </div>
    </div>
    <div class="col-span-3 space-y-6">
      <div class="stitch-card p-4 bg-blue-50 rounded-xl shadow-sm border border-blue-200">
        <div class="flex items-center gap-2 mb-4">
          <span class="text-xl">🦴</span>
          <h3 class="text-sm font-bold text-slate-900 uppercase tracking-wider">${tr('Orthopedic AI', 'ذكاء العظام')}</h3>
        </div>
        <div class="space-y-3 text-sm">
          <div class="p-3 bg-white rounded-lg border border-slate-200">
            <div class="font-semibold text-slate-800">${tr('Implant Sizing', 'حجم الزرعة')}</div>
            <div class="text-xs text-slate-600 mt-1">${tr('Recommended Size: M', 'الحجم الموصى به: وسط')}</div>
          </div>
          <div class="p-3 bg-white rounded-lg border border-slate-200">
            <div class="font-semibold text-slate-800">${tr('Alignment', 'المحاذاة')}</div>
            <div class="text-xs text-emerald-600 mt-1">${tr('Within tolerance', 'ضمن الحدود المقبولة')}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>`;
        OrthopedicsStation.loadImplants(patientId);
    },
    openJointReplacement: () => Modal.open({ title: "Joint Replacement form (POST /api/orthopedics/joint-replacement)", body: "<p style=\"font-size:14px;color:#334155\">Joint Replacement form (POST /api/orthopedics/joint-replacement)</p><div style=\"background:#f1f5f9;border-radius:6px;padding:10px;font-size:12px;color:#475569;margin-top:10px\"><strong>HTTP:</strong> API &nbsp;&nbsp;<strong>Endpoint:</strong> <code>/api/orthopedics/joint-replacement</code></div><p style=\"font-size:13px;color:#64748b;margin-top:10px\">This action will be wired to the live backend. Configure Department Mappings to enable persistent capture.</p>", primaryLabel: 'OK', secondaryLabel: 'Close', hidePrimary: true }),
    openFracture: () => Modal.open({ title: "Fracture log (POST /api/orthopedics/fracture-log)", body: "<p style=\"font-size:14px;color:#334155\">Fracture log (POST /api/orthopedics/fracture-log)</p><div style=\"background:#f1f5f9;border-radius:6px;padding:10px;font-size:12px;color:#475569;margin-top:10px\"><strong>HTTP:</strong> API &nbsp;&nbsp;<strong>Endpoint:</strong> <code>/api/orthopedics/fracture-log</code></div><p style=\"font-size:13px;color:#64748b;margin-top:10px\">This action will be wired to the live backend. Configure Department Mappings to enable persistent capture.</p>", primaryLabel: 'OK', secondaryLabel: 'Close', hidePrimary: true }),
    loadImplants: async (patientId) => {
        try {
            const res = await fetch(`/api/orthopedics/implants?patient_id=${encodeURIComponent(patientId||'')}`, { credentials: 'include' });
            if (res.ok) console.log('implants loaded');
        } catch (e) { console.warn('implants load skipped', e); }
    }
};
if (typeof window !== 'undefined') window.OrthopedicsStation = OrthopedicsStation;
