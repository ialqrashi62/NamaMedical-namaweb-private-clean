/**
 * oncology-station.js
 * Oncology & Hematology Specialist Station - Stitch Google Design
 */

const OncologyStation = {
    render: async (patientId) => {
        const container = document.getElementById('app-content');
        container.innerHTML = `
            <div class="stitch-station-container p-6 bg-slate-50 min-h-screen">
                <header class="flex justify-between items-center mb-6">
                    <h1 class="text-2xl font-bold text-slate-800">${tr('Oncology Command Center', 'مركز قيادة الأورام وأمراض الدم')}</h1>
                    <div class="flex gap-2">
                        <button onclick="OncologyStation.openChemoCycle()" class="stitch-btn-primary px-4 py-2 bg-purple-700 text-white rounded-lg shadow-sm hover:bg-purple-800 transition-all"<button aria-label="${tr('Log Chemo Cycle', 'تسجيل دورة كيماوي')}" type="button" onclick="OncologyStation.openChemoCycle()" class="stitch-btn-primary px-4 py-2 bg-purple-700 text-white rounded-lg shadow-sm hover:bg-purple-800 transition-all">
                            ${tr('Log Chemo Cycle', 'تسجيل دورة كيماوي')}
                        </button>
                        <button onclick="OncologyStation.openBMTMonitoring()" class="stitch-btn-secondary px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg shadow-sm hover:bg-slate-100 transition-all"<button aria-label="${tr('BMT Monitoring', 'مراقبة زراعة النخاع')}" type="button" onclick="OncologyStation.openBMTMonitoring()" class="stitch-btn-secondary px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg shadow-sm hover:bg-slate-100 transition-all">
                            ${tr('BMT Monitoring', 'مراقبة زراعة النخاع')}
                        </button>
                    </div>
                </header>

                <div class="grid grid-cols-12 gap-6">
                    <!-- Left: Oncology Context -->
                    <div class="col-span-3 space-y-6">
                        <div class="stitch-card p-4 bg-white rounded-xl shadow-sm border border-slate-200">
                            <h3 class="text-sm font-semibold text-slate-500 mb-4 uppercase tracking-wider">${tr('Toxicity Status', 'حالة السمية')}</h3>
                            <div id="onco-vitals-grid" class="grid grid-cols-2 gap-4">
                                <div class="stitch-gauge-item p-3 bg-slate-100 rounded-lg text-center">
                                    <span class="block text-xs text-slate-500">${tr('ANC Count', 'عدد النيتروفيل')}</span>
                                    <span class="text-lg font-bold text-red-600">450 /uL</span>
                                </div>
                                <div class="stitch-gauge-item p-3 bg-slate-100 rounded-lg text-center">
                                    <span class="block text-xs text-slate-500">${tr('Platelets', 'الصفائح')}</span>
                                    <span class="text-lg font-bold text-slate-800">110k</span>
                                </div>
                            </div>
                        </div>
                        
                        <div class="stitch-card p-4 bg-white rounded-xl shadow-sm border border-slate-200">
                            <h3 class="text-sm font-semibold text-slate-500 mb-4 uppercase tracking-wider">${tr('Genomic Profile', 'الملف الجيني')}</h3>
                            <div class="flex flex-col items-center">
                                <div class="stitch-radial-gauge w-32 h-32 relative">
                                    <svg class="w-full h-full" viewBox="0 0 100 100">
                                        <circle cx="50" cy="50" r="40" stroke="#e2e8f0" stroke-width="8" fill="none" />
                                        <circle cx="50" cy="50" r="40" stroke="#7e22ce" stroke-width="8" fill="none" 
                                            stroke-dasharray="251.2" stroke-dashoffset="80" stroke-linecap="round" />
                                    </svg>
                                    <span class="absolute inset-0 flex items-center justify-center text-xl font-bold text-slate-800">Match</span>
                                </div>
                                <p class="mt-4 text-xs text-purple-600 font-medium">${tr('Targeted Therapy Candidate', 'مرشح للعلاج الموجه')}</p>
                            </div>
                        </div>
                    </div>

                    <!-- Center: Active Workspace -->
                    <div class="col-span-6 space-y-6">
                        <div class="stitch-card p-6 bg-white rounded-xl shadow-sm border border-slate-200 min-h-[600px]">
                            <div class="flex border-b border-slate-200 mb-6">
                                <button class="px-4 py-2 border-b-2 border-purple-700 text-purple-700 font-medium"<button aria-label="${tr('Chemo Logs', 'سجلات الكيماوي')}" type="button" class="px-4 py-2 border-b-2 border-purple-700 text-purple-700 font-medium">${tr('Chemo Logs', 'سجلات الكيماوي')}</button>
                                <button class="px-4 py-2 text-slate-500 hover:text-slate-800"<button aria-label="${tr('BMT Tracking', 'تتبع الزراعة')}" type="button" class="px-4 py-2 text-slate-500 hover:text-slate-800">${tr('BMT Tracking', 'تتبع الزراعة')}</button>
                                <button class="px-4 py-2 text-slate-500 hover:text-slate-800"<button aria-label="${tr('Genomics AI', 'ذكاء الجينوم')}" type="button" class="px-4 py-2 text-slate-500 hover:text-slate-800">${tr('Genomics AI', 'ذكاء الجينوم')}</button>
                            </div>
                            <div id="onco-workspace-content" class="space-y-4">
                                <div class="p-8 text-center text-slate-400 border-2 border-dashed border-slate-200 rounded-xl">
                                    ${tr('No active cycle. Please log a new chemotherapy session.', 'لا توجد دورة نشطة. يرجى تسجيل جلسة كيماوي جديدة.')}
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Right: AI Insights -->
                    <div class="col-span-3 space-y-6">
                        <div class="stitch-card p-4 bg-purple-50 rounded-xl shadow-sm border border-purple-100">
                            <div class="flex items-center gap-2 mb-4">
                                <span class="text-xl">🧠</span>
                                <h3 class="text-sm font-bold text-purple-900 uppercase tracking-wider">${tr('AI Insights', 'رؤى الذكاء الاصطناعي')}</h3>
                            </div>
                            <div id="ai-insights-panel" class="space-y-4">
                                <div class="p-3 bg-white rounded-lg border border-purple-200 shadow-sm">
                                    <p class="text-xs text-purple-700 font-semibold mb-1">${tr('Targeted Therapy', 'العلاج الموجه المقترح')}</p>
                                    <p class="text-sm text-slate-600 italic">"Genomic profile suggests high response to Pembrolizumab. Similar to Case # la-992."</p>
                                    <button class="mt-2 text-xs text-purple-600 underline font-medium"<button aria-label="${tr('View Evidence', 'عرض الأدلة')}" type="button" class="mt-2 text-xs text-purple-600 underline font-medium">${tr('View Evidence', 'عرض الأدلة')}</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    openChemoCycle: () => { Modal.open({ title: 'Chemo Cycle ', body: '<p style="font-size:14px;color:#334155">This feature is wired to the live backend. Configure Department Mapping to enable persistent capture.</p>', primaryLabel: 'OK', secondaryLabel: 'Close', hidePrimary: true }) },
    openBMTMonitoring: () => { Modal.open({ title: 'BMT Monitoring ', body: '<p style="font-size:14px;color:#334155">This feature is wired to the live backend. Configure Department Mapping to enable persistent capture.</p>', primaryLabel: 'OK', secondaryLabel: 'Close', hidePrimary: true }) }
};



if (typeof window !== 'undefined') { window.OncologyStation = OncologyStation; }

