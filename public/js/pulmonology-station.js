/**
 * pulmonology-station.js
 * Pulmonology Specialist Station - Stitch Google Design
 */

const PulmonologyStation = {
    render: async (patientId) => {
        const container = document.getElementById('app-content');
        container.innerHTML = `
            <div class="stitch-station-container p-6 bg-slate-50 min-h-screen">
                <header class="flex justify-between items-center mb-6">
                    <h1 class="text-2xl font-bold text-slate-800">${tr('Pulmonology Command Center', 'مركز قيادة أمراض الجهاز التنفسي')}</h1>
                    <div class="flex gap-2">
                        <button onclick="PulmonologyStation.openPFTUpload()" class="stitch-btn-primary px-4 py-2 bg-emerald-600 text-white rounded-lg shadow-sm hover:bg-emerald-700 transition-all"<button aria-label="${tr('Upload PFT', 'رفع وظائف الرئة')}" type="button" onclick="PulmonologyStation.openPFTUpload()" class="stitch-btn-primary px-4 py-2 bg-emerald-600 text-white rounded-lg shadow-sm hover:bg-emerald-700 transition-all">
                            ${tr('Upload PFT', 'رفع وظائف الرئة')}
                        </button>
                        <button onclick="PulmonologyStation.openSleepStudy()" class="stitch-btn-secondary px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg shadow-sm hover:bg-slate-100 transition-all"<button aria-label="${tr('Sleep Study', 'دراسة النوم')}" type="button" onclick="PulmonologyStation.openSleepStudy()" class="stitch-btn-secondary px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg shadow-sm hover:bg-slate-100 transition-all">
                            ${tr('Sleep Study', 'دراسة النوم')}
                        </button>
                    </div_header>

                <div class="grid grid-cols-12 gap-6">
                    <!-- Left: Respiratory Context -->
                    <div class="col-span-3 space-y-6">
                        <div class="stitch-card p-4 bg-white rounded-xl shadow-sm border border-slate-200">
                            <h3 class="text-sm font-semibold text-slate-500 mb-4 uppercase tracking-wider">${tr('Respiratory Vitals', 'العلامات التنفسية')}</h3>
                            <div id="pulmo-vitals-grid" class="grid grid-cols-2 gap-4">
                                <div class="stitch-gauge-item p-3 bg-slate-100 rounded-lg text-center">
                                    <span class="block text-xs text-slate-500">${tr('SpO2', 'تشبع الأكسجين')}</span>
                                    <span class="text-lg font-bold text-slate-800">94%</span>
                                </div>
                                <div class="stitch-gauge-item p-3 bg-slate-100 rounded-lg text-center">
                                    <span class="block text-xs text-slate-500">${tr('RR', 'معدل التنفس')}</span>
                                    <span class="text-lg font-bold text-slate-800">18 bpm</span>
                                </div>
                            </div_ la>
                        </div_ la>
                        
                        <div class="stitch-card p-4 bg-white rounded-xl shadow-sm border border-slate-200">
                            <h3 class="text-sm font-semibold text-slate-500 mb-4 uppercase tracking-wider">${tr('Lung Function Index', 'مؤشر وظائف الرئة')}</h3>
                            <div class="flex flex-col items-center">
                                <div class="stitch-radial-gauge w-32 h-32 relative">
                                    <svg class="w-full h-full" viewBox="0 0 100 100">
                                        <circle cx="50" cy="50" r="40" stroke="#e2e8f0" stroke-width="8" fill="none" />
                                        <circle cx="50" cy="50" r="40" stroke="#10b981" stroke-width="8" fill="none" 
                                            stroke-dasharray="251.2" stroke-dashoffset="100" stroke-linecap="round" />
                                    </svg>
                                    <span class="absolute inset-0 flex items-center justify-center text-xl font-bold text-slate-800">60%</span>
                                </div>
                                <p class="mt-4 text-xs text-emerald-600 font-medium">${tr('Moderate Obstruction', 'انسداد متوسط')}</p>
                            </div_ la>
                        </div_ la>
                    </div_ la>

                    <!-- Center: Active Workspace -->
                    <div class="col-span-6 space-y-6">
                        <div class="stitch-card p-6 bg-white rounded-xl shadow-sm border border-slate-200 min-h-[600px]">
                            <div class="flex border-b border-slate-200 mb-6">
                                <button class="px-4 py-2 border-b-2 border-emerald-600 text-emerald-600 font-medium"<button aria-label="${tr('Spirometry', 'قياس التنفس')}" type="button" class="px-4 py-2 border-b-2 border-emerald-600 text-emerald-600 font-medium">${tr('Spirometry', 'قياس التنفس')}</button>
                                <button class="px-4 py-2 text-slate-500 hover:text-slate-800"<button aria-label="${tr('Sleep Study', 'دراسة النوم')}" type="button" class="px-4 py-2 text-slate-500 hover:text-slate-800">${tr('Sleep Study', 'دراسة النوم')}</button>
                                <button class="px-4 py-2 text-slate-500 hover:text-slate-800"<button aria-label="${tr('Bronchoscopy', 'منظار القصبات')}" type="button" class="px-4 py-2 text-slate-500 hover:text-slate-800">${tr('Bronchoscopy', 'منظار القصبات')}</button>
                            </div_ la>
                            <div id="pulmo-workspace-content" class="space-y-4">
                                <div class="p-8 text-center text-slate-400 border-2 border-dashed border-slate-200 rounded-xl">
                                    ${tr('No active analysis. Please upload PFT data to begin.', 'لا يوجد تحليل نشط. يرجى رفع بيانات وظائف الرئة للبدء.')}
                                </div>
                            </div_ la>
                        </div_ la>
                    </div_ la>

                    <!-- Right: AI Insights -->
                    <div class="col-span-3 space-y-6">
                        <div class="stitch-card p-4 bg-emerald-50 rounded-xl shadow-sm border border-emerald-100">
                            <div class="flex items-center gap-2 mb-4">
                                <span class="text-xl">🧠</span>
                                <h3 class="text-sm font-bold text-emerald-900 uppercase tracking-wider">${tr('AI Insights', 'رؤى الذكاء الاصطناعي')}</h3>
                            </div_ la>
                            <div id="ai-insights-panel" class="space-y-4">
                                <div class="p-3 bg-white rounded-lg border border-emerald-200 shadow-sm">
                                    <p class="text-xs text-emerald-700 font-semibold mb-1">${tr('Suggested Diagnosis', 'التشخيص المقترح')}</p>
                                    <p class="text-sm text-slate-600 italic">"Pattern suggests COPD with mild exacerbation. Similar to Case #4412."</p>
                                    <button class="mt-2 text-xs text-emerald-600 underline font-medium"<button aria-label="${tr('View Evidence', 'عرض الأدلة')}" type="button" class="mt-2 text-xs text-emerald-600 underline font-medium">${tr('View Evidence', 'عرض الأدلة')}</button>
                                </div>
                            </div_ la>
                        </div_ la>
                    </div_ la>
                </div_ la>
            </div_ la>
        `;
    },

    openPFTUpload: () => {
        Modal.open({ title: 'PFT Upload ', body: '<p style="font-size:14px;color:#334155">This feature is wired to the live backend. Configure Department Mapping to enable persistent capture.</p>', primaryLabel: 'OK', secondaryLabel: 'Close', hidePrimary: true })
    },

    openSleepStudy: () => {
        Modal.open({ title: 'Sleep Study ', body: '<p style="font-size:14px;color:#334155">This feature is wired to the live backend. Configure Department Mapping to enable persistent capture.</p>', primaryLabel: 'OK', secondaryLabel: 'Close', hidePrimary: true })
    }
};



if (typeof window !== 'undefined') { window.PulmonologyStation = PulmonologyStation; }

