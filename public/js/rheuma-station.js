/**
 * rheuma-station.js
 * Rheumatology & Immunology Specialist Station - Stitch Google Design
 */

const RheumaStation = {
    render: async (patientId) => {
        const container = document.getElementById('app-content');
        container.innerHTML = `
            <div class="stitch-station-container p-6 bg-slate-50 min-h-screen">
                <header class="flex justify-between items-center mb-6">
                    <h1 class="text-2xl font-bold text-slate-800">${tr('Rheumatology Command Center', 'مركز قيادة الروماتيزم والمناعة')}</h1>
                    <div class="flex gap-2">
                        <button onclick="RheumaStation.openScoreLog()" class="stitch-btn-primary px-4 py-2 bg-rose-600 text-white rounded-lg shadow-sm hover:bg-rose-700 transition-all">
                            ${tr('Log DAS28/SLEDAI', 'تسجيل DAS28/SLEDAI')}
                        </button>
                        <button onclick="RheumaStation.openSerologyLog()" class="stitch-btn-secondary px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg shadow-sm hover:bg-slate-100 transition-all">
                            ${tr('Serology Markers', 'مؤشرات المصل')}
                        </button>
                    </div>
                </header>

                <div class="grid grid-cols-12 gap-6">
                    <!-- Left: Rheuma Context -->
                    <div class="col-span-3 space-y-6">
                        <div class="stitch-card p-4 bg-white rounded-xl shadow-sm border border-slate-200">
                            <h3 class="text-sm font-semibold text-slate-500 mb-4 uppercase tracking-wider">${tr('Disease Activity', 'نشاط المرض')}</h3>
                            <div id="rheuma-vitals-grid" class="grid grid-cols-2 gap-4">
                                <div class="stitch-gauge-item p-3 bg-slate-100 rounded-lg text-center">
                                    <span class="block text-xs text-slate-500">${tr('DAS28', 'مقياس DAS28')}</span>
                                    <span class="text-lg font-bold text-slate-800">5.4</span>
                                </div>
                                <div class="stitch-gauge-item p-3 bg-slate-100 rounded-lg text-center">
                                    <span class="block text-xs text-slate-500">${tr('SLEDAI', 'مقياس SLEDAI')}</span>
                                    <span class="text-lg font-bold text-slate-800">8.0</span>
                                </div>
                            </div>
                        </div>
                        
                        <div class="stitch-card p-4 bg-white rounded-xl shadow-sm border border-slate-200">
                            <h3 class="text-sm font-semibold text-slate-500 mb-4 uppercase tracking-wider">${tr('Autoimmune Status', 'الحالة المناعية')}</h3>
                            <div class="flex flex-col items-center">
                                <div class="stitch-radial-gauge w-32 h-32 relative">
                                    <svg class="w-full h-full" viewBox="0 0 100 100">
                                        <circle cx="50" cy="50" r="40" stroke="#e2e8f0" stroke-width="8" fill="none" />
                                        <circle cx="50" cy="50" r="40" stroke="#e11d48" stroke-width="8" fill="none" 
                                            stroke-dasharray="251.2" stroke-dashoffset="120" stroke-linecap="round" />
                                    </svg>
                                    <span class="absolute inset-0 flex items-center justify-center text-xl font-bold text-slate-800">High</span>
                                </div>
                                <p class="mt-4 text-xs text-rose-600 font-medium">${tr('Active Inflammation', 'التهاب نشط')}</p>
                            </div>
                        </div>
                    </div>

                    <!-- Center: Active Workspace -->
                    <div class="col-span-6 space-y-6">
                        <div class="stitch-card p-6 bg-white rounded-xl shadow-sm border border-slate-200 min-h-[600px]">
                            <div class="flex border-b border-slate-200 mb-6">
                                <button class="px-4 py-2 border-b-2 border-rose-600 text-rose-600 font-medium">${tr('Symptom Cluster', 'عنقود الأعراض')}</button>
                                <button class="px-4 py-2 text-slate-500 hover:text-slate-800">${tr('Serology Trends', 'اتجاهات المصل')}</button>
                                <button class="px-4 py-2 text-slate-500 hover:text-slate-800">${tr('AI Differential', 'التشخيص التفريقي AI')}</button>
                            </div>
                            <div id="rheuma-workspace-content" class="space-y-4">
                                <div class="p-8 text-center text-slate-400 border-2 border-dashed border-slate-200 rounded-xl">
                                    ${tr('No active cluster. Please log serology markers to begin.', 'لا يوجد عنقود نشط. يرجى تسجيل مؤشرات المصل للبدء.')}
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Right: AI Insights -->
                    <div class="col-span-3 space-y-6">
                        <div class="stitch-card p-4 bg-rose-50 rounded-xl shadow-sm border border-rose-100">
                            <div class="flex items-center gap-2 mb-4">
                                <span class="text-xl">🧠</span>
                                <h3 class="text-sm font-bold text-rose-900 uppercase tracking-wider">${tr('AI Insights', 'رؤى الذكاء الاصطناعي')}</h3>
                            </div>
                            <div id="ai-insights-panel" class="space-y-4">
                                <div class="p-3 bg-white rounded-lg border border-rose-200 shadow-sm">
                                    <p class="text-xs text-rose-700 font-semibold mb-1">${tr('Suggested Diagnosis', 'التشخيص المقترح')}</p>
                                    <p class="text-sm text-slate-600 italic">"Pattern suggests Systemic Lupus Erythematosus (SLE) with renal involvement. Similar to Case # la- la- la."</p>
                                    <button class="mt-2 text-xs text-rose-600 underline font-medium">${tr('View Evidence', 'عرض الأدلة')}</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    openScoreLog: () => { alert('Score Log Modal Triggered'); },
    openSerologyLog: () => { alert('Serology Log Modal Triggered'); }
};



if (typeof window !== 'undefined') { window.RheumaStation = RheumaStation; }

