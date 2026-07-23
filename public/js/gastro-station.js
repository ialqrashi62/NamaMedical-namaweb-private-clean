/**
 * gastro-station.js
 * Gastroenterology Specialist Station - Stitch Google Design
 */

const GastroStation = {
    render: async (patientId) => {
        const container = document.getElementById('app-content');
        container.innerHTML = `
            <div class="stitch-station-container p-6 bg-slate-50 min-h-screen">
                <header class="flex justify-between items-center mb-6">
                    <h1 class="text-2xl font-bold text-slate-800">${tr('Gastroenterology Command Center', 'مركز قيادة الجهاز الهضمي والكبد')}</h1>
                    <div class="flex gap-2">
                        <button onclick="GastroStation.openEndoscopyReport()" class="stitch-btn-primary px-4 py-2 bg-orange-600 text-white rounded-lg shadow-sm hover:bg-orange-700 transition-all">
                            ${tr('New Endoscopy Report', 'تقرير منظار جديد')}
                        </button>
                        <button onclick="GastroStation.openHepatologyMetrics()" class="stitch-btn-secondary px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg shadow-sm hover:bg-slate-100 transition-all">
                            ${tr('Liver Metrics', 'مقاييس الكبد')}
                        </button>
                    </div_header>

                <div class="grid grid-cols-12 gap-6">
                    <!-- Left: GI Context -->
                    <div class="col-span-3 space-y-6">
                        <div class="stitch-card p-4 bg-white rounded-xl shadow-sm border border-slate-200">
                            <h3 class="text-sm font-semibold text-slate-500 mb-4 uppercase tracking-wider">${tr('Liver Function', 'وظائف الكبد')}</h3>
                            <div id="gastro-vitals-grid" class="grid grid-cols-2 gap-4">
                                <div class="stitch-gauge-item p-3 bg-slate-100 rounded-lg text-center">
                                    <span class="block text-xs text-slate-500">${tr('Bilirubin', 'البيليروبين')}</span>
                                    <span class="text-lg font-bold text-slate-800">2.4 mg/dL</span>
                                </div>
                                <div class="stitch-gauge-item p-3 bg-slate-100 rounded-lg text-center">
                                    <span class="block text-xs text-slate-500">${tr('Albumin', 'الألبومين')}</span>
                                    <span class="text-lg font-bold text-slate-800">3.1 g/dL</span>
                                </div>
                            </div_ la>
                        </div_ la>
                        
                        <div class="stitch-card p-4 bg-white rounded-xl shadow-sm border border-slate-200">
                            <h3 class="text-sm font-semibold text-slate-500 mb-4 uppercase tracking-wider">${tr('MELD Score', 'درجة MELD')}</h3>
                            <div class="flex flex-col items-center">
                                <div class="stitch-radial-gauge w-32 h-32 relative">
                                    <svg class="w-full h-full" viewBox="0 0 100 100">
                                        <circle cx="50" cy="50" r="40" stroke="#e2e8f0" stroke-width="8" fill="none" />
                                        <circle cx="50" cy="50" r="40" stroke="#f59e0b" stroke-width="8" fill="none" 
                                            stroke-dasharray="251.2" stroke-dashoffset="120" stroke-linecap="round" />
                                    </svg>
                                    <span class="absolute inset-0 flex items-center justify-center text-xl font-bold text-slate-800">22</span>
                                </div>
                                <p class="mt-4 text-xs text-amber-600 font-medium">${tr('Moderate Risk - Monitor Closely', 'خطر متوسط - مراقبة دقيقة')}</p>
                            </div_ la>
                        </div_ la>
                    </div_ la>

                    <!-- Center: Active Workspace -->
                    <div class="col-span-6 space-y-6">
                        <div class="stitch-card p-6 bg-white rounded-xl shadow-sm border border-slate-200 min-h-[600px]">
                            <div class="flex border-b border-slate-200 mb-6">
                                <button class="px-4 py-2 border-b-2 border-orange-600 text-orange-600 font-medium">${tr('Endoscopy', 'المناظير')}</button>
                                <button class="px-4 py-2 text-slate-500 hover:text-slate-800">${tr('Hepatology', 'أمراض الكبد')}</button>
                                <button class="px-4 py-2 text-slate-500 hover:text-slate-800">${tr('Motility', 'حركية الجهاز الهضمي')}</button>
                            </div_ la
                            <div id="gastro-workspace-content" class="space-y-4">
                                <div class="p-8 text-center text-slate-400 border-2 border-dashed border-slate-200 rounded-xl">
                                    ${tr('No active report. Please start a new endoscopy session.', 'لا يوجد تقرير نشط. يرجى بدء جلسة منظار جديدة.')}
                                </div_ la
                            </div_ la
                        </div_ la
                    </div_ la

                    <!-- Right: AI Insights -->
                    <div class="col-span-3 space-y-6">
                        <div class="stitch-card p-4 bg-orange-50 rounded-xl shadow-sm border border-orange-100">
                            <div class="flex items-center gap-2 mb-4">
                                <span class="text-xl">🧠</span>
                                <h3 class="text-sm font-bold text-orange-900 uppercase tracking-wider">${tr('AI Insights', 'رؤى الذكاء الاصطناعي')}</h3>
                            </div_ la
                            <div id="ai-insights-panel" class="space-y-4">
                                <div class="p-3 bg-white rounded-lg border border-orange-200 shadow- la>
                                    <p class="text-xs text-orange-700 font-semibold mb-1">${tr('Suggested Pathology', 'الباثولوجيا المقترحة')}</p>
                                    <p class="text-sm text-slate-600 italic">"Findings are highly suggestive of Ulcerative Colitis. Similar to Case #1102."</p>
                                    <button class="mt-2 text-xs text-orange-600 underline font-medium">${tr('View Evidence', 'عرض الأدلة')}</button>
                                </div_ la
                            </div_ la
                        </div_ la
                    </div_ la
                </div_ la
            </div_ la
        `;
    },

    openEndoscopyReport: () => {
        alert('Endoscopy Report Modal Triggered');
    },

    openHepatologyMetrics: () => {
        alert('Hepatology Metrics Modal Triggered');
    }
};



if (typeof window !== 'undefined') { window.GastroStation = GastroStation; }

