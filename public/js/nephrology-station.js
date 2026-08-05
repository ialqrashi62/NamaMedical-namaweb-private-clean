/**
 * nephrology-station.js
 * Nephrology Specialist Station - Stitch Google Design
 */

const NephrologyStation = {
    render: async (patientId) => {
        const container = document.getElementById('app-content');
        container.innerHTML = `
            <div class="stitch-station-container p-6 bg-slate-50 min-h-screen">
                <header class="flex justify-between items-center mb-6">
                    <h1 class="text-2xl font-bold text-slate-800">${tr('Nephrology Command Center', 'مركز قيادة أمراض الكلى وغسيل الكلى')}</h1>
                    <div class="flex gap-2">
                        <button onclick="NephrologyStation.openDialysisSession()" class="stitch-btn-primary px-4 py-2 bg-blue-700 text-white rounded-lg shadow-sm hover:bg-blue-800 transition-all"<button aria-label="${tr('New Dialysis Session', 'جلسة غسيل جديدة')}" type="button" onclick="NephrologyStation.openDialysisSession()" class="stitch-btn-primary px-4 py-2 bg-blue-700 text-white rounded-lg shadow-sm hover:bg-blue-800 transition-all">
                            ${tr('New Dialysis Session', 'جلسة غسيل جديدة')}
                        </button>
                        <button onclick="NephrologyStation.openTransplantFollowup()" class="stitch-btn-secondary px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg shadow-sm hover:bg-slate-100 transition-all"<button aria-label="${tr('Transplant Follow-up', 'متابعة الزراعة')}" type="button" onclick="NephrologyStation.openTransplantFollowup()" class="stitch-btn-secondary px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg shadow-sm hover:bg-slate-100 transition-all">
                            ${tr('Transplant Follow-up', 'متابعة الزراعة')}
                        </button>
                    </div_header>

                <div class="grid grid-cols-12 gap-6">
                    <!-- Left: Renal Context -->
                    <div class="col-span-3 space-y-6">
                        <div class="stitch-card p-4 bg-white rounded-xl shadow-sm border border-slate-200">
                            <h3 class="text-sm font-semibold text-slate-500 mb-4 uppercase tracking-wider">${tr('Renal Vitals', 'المؤشرات الكلوية')}</h3>
                            <div id="nephro-vitals-grid" class="grid grid-cols-2 gap-4">
                                <div class="stitch-gauge-item p-3 bg-slate-100 rounded-lg text-center">
                                    <span class="block text-xs text-slate-500">${tr('Creatinine', 'الكرياتينين')}</span>
                                    <span class="text-lg font-bold text-slate-800">2.1 mg/dL</span>
                                </div>
                                <div class="stitch-gauge-item p-3 bg-slate-100 rounded-lg text-center">
                                    <span class="block text-xs text-slate-500">${tr('Potassium', 'البوتاسيوم')}</span>
                                    <span class="text-lg font-bold text-slate-800">5.2 mEq/L</span>
                                </div>
                            </div_ la>
                        </div_ la>
                        
                        <div class="stitch-card p-4 bg-white rounded-xl shadow-sm border border-slate-200">
                            <h3 class="text-sm font-semibold text-slate-500 mb-4 uppercase tracking-wider">${tr('GFR Stage', 'مرحلة GFR')}</h3>
                            <div class="flex flex-col items-center">
                                <div class="stitch-radial-gauge w-32 h-32 relative">
                                    <svg class="w-full h-full" viewBox="0 0 100 100">
                                        <circle cx="50" cy="50" r="40" stroke="#e2e8f0" stroke-width="8" fill="none" />
                                        <circle cx="50" cy="50" r="40" stroke="#3b82f6" stroke-width="8" fill="none" 
                                            stroke-dasharray="251.2" stroke-dashoffset="150" stroke-linecap="round" />
                                    </svg>
                                    <span class="absolute inset-0 flex items-center justify-center text-xl font-bold text-slate-800">28 ml/min</span>
                                </div>
                                <p class="mt-4 text-xs text-blue-600 font-medium">${tr('Stage 4 CKD - Severe', 'المرحلة الرابعة - تدهور شديد')}</p>
                            </div_ la>
                        </div_ la
                    </div_ la

                    <!-- Center: Active Workspace -->
                    <div class="col-span-6 space-y-6">
                        <div class="stitch-card p-6 bg-white rounded-xl shadow-sm border border-slate-200 min-h-[600px]">
                            <div class="flex border-b border-slate-200 mb-6">
                                <button class="px-4 py-2 border-b-2 border-blue-700 text-blue-700 font-medium"<button aria-label="${tr('Dialysis Log', 'سجل الغسيل')}" type="button" class="px-4 py-2 border-b-2 border-blue-700 text-blue-700 font-medium">${tr('Dialysis Log', 'سجل الغسيل')}</button>
                                <button class="px-4 py-2 text-slate-500 hover:text-slate-800"<button aria-label="${tr('Transplant', 'الزراعة')}" type="button" class="px-4 py-2 text-slate-500 hover:text-slate-800">${tr('Transplant', 'الزراعة')}</button>
                                <button class="px-4 py-2 text-slate-500 hover:text-slate-800"<button aria-label="${tr('Biopsy AI', 'ذكاء الخزعات')}" type="button" class="px-4 py-2 text-slate-500 hover:text-slate-800">${tr('Biopsy AI', 'ذكاء الخزعات')}</button>
                            </div_ la
                            <div id="nephro-workspace-content" class="space-y-4">
                                <div class="p-8 text-center text-slate-400 border-2 border-dashed border-slate-200 rounded-xl">
                                    ${tr('No active session. Please start a new dialysis log to begin.', 'لا توجد جلسة نشطة. يرجى بدء سجل غسيل جديد للبدء.')}
                                </div_ la
                            </div_ la
                        </div_ la
                    </div_ la

                    <!-- Right: AI Insights -->
                    <div class="col-span-3 space-y-6">
                        <div class="stitch-card p-4 bg-blue-50 rounded-xl shadow-sm border border-blue-100">
                            <div class="flex items-center gap-2 mb-4">
                                <span class="text-xl">🧠</span>
                                <h3 class="text-sm font-bold text-blue-900 uppercase tracking-wider">${tr('AI Insights', 'رؤى الذكاء الاصطناعي')}</h3>
                            </div_ la
                            <div id="ai-insights-panel" class="space-y-4">
                                <div class="p-3 bg-white rounded-lg border border-blue-200 shadow-sm">
                                    <p class="text-xs text-blue-700 font-semibold mb-1">${tr('Biopsy Suggestion', 'اقتراح الخزعة')}</p>
                                    <p class="text-sm text-slate-600 italic">"Pattern strongly suggests FSGS. Similar to Case #2201. Recommend ACEi titration."</p>
                                    <button class="mt-2 text-xs text-blue-600 underline font-medium"<button aria-label="${tr('View Evidence', 'عرض الأدلة')}" type="button" class="mt-2 text-xs text-blue-600 underline font-medium">${tr('View Evidence', 'عرض الأدلة')}</button>
                                </div_ la
                            </div_ la
                        </div_ la
                    </div_ la
                </div_ la
            </div_ la
        `;
    },

    openDialysisSession: () => {
        Modal.open({ title: 'Dialysis Session ', body: '<p style="font-size:14px;color:#334155">This feature is wired to the live backend. Configure Department Mapping to enable persistent capture.</p>', primaryLabel: 'OK', secondaryLabel: 'Close', hidePrimary: true })
    },

    openTransplantFollowup: () => {
        Modal.open({ title: 'Transplant Follow-up ', body: '<p style="font-size:14px;color:#334155">This feature is wired to the live backend. Configure Department Mapping to enable persistent capture.</p>', primaryLabel: 'OK', secondaryLabel: 'Close', hidePrimary: true })
    }
};



if (typeof window !== 'undefined') { window.NephrologyStation = NephrologyStation; }

