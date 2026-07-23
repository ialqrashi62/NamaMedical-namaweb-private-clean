/**
 * endocrine-station.js
 * Endocrinology & Diabetes Specialist Station - Stitch Google Design
 */

const EndocrineStation = {
    render: async (patientId) => {
        const container = document.getElementById('app-content');
        container.innerHTML = `
            <div class="stitch-station-container p-6 bg-slate-50 min-h-screen">
                <header class="flex justify-between items-center mb-6">
                    <h1 class="text-2xl font-bold text-slate-800">${tr('Endocrine Command Center', 'مركز قيادة الغدد والسكري')}</h1>
                    <div class="flex gap-2">
                        <button onclick="EndocrineStation.openGlucoseLog()" class="stitch-btn-primary px-4 py-2 bg-blue-500 text-white rounded-lg shadow-sm hover:bg-blue-600 transition-all">
                            ${tr('Log Glucose', 'تسجيل الجلوكوز')}
                        </button>
                        <button onclick="EndocrineStation.openThyroidMetrics()" class="stitch-btn-secondary px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg shadow-sm hover:bg-slate-100 transition-all">
                            ${tr('Thyroid Metrics', 'مقاييس الغدة الدرقية')}
                        </button>
                    </div>
                </header>

                <div class="grid grid-cols-12 gap-6">
                    <!-- Left: Endocrine Context -->
                    <div class="col-span-3 space-y-6">
                        <div class="stitch-card p-4 bg-white rounded-xl shadow-sm border border-slate-200">
                            <h3 class="text-sm font-semibold text-slate-500 mb-4 uppercase tracking-wider">${tr('Metabolic Vitals', 'المؤشرات الأيضية')}</h3>
                            <div id="endocrine-vitals-grid" class="grid grid-cols-2 gap-4">
                                <div class="stitch-gauge-item p-3 bg-slate-100 rounded-lg text-center">
                                    <span class="block text-xs text-slate-500">${tr('HbA1c', 'السكر التراكمي')}</span>
                                    <span class="text-lg font-bold text-slate-800">7.2%</span>
                                </div>
                                <div class="stitch-gauge-item p-3 bg-slate-100 rounded-lg text-center">
                                    <span class="block text-xs text-slate-500">${tr('TSH', 'هرمون TSH')}</span>
                                    <span class="text-lg font-bold text-slate-800">4.5 mIU/L</span>
                                </div>
                            </div>
                        </div>
                        
                        <div class="stitch-card p-4 bg-white rounded-xl shadow-sm border border-slate-200">
                            <h3 class="text-sm font-semibold text-slate-500 mb-4 uppercase tracking-wider">${tr('TIR (Time In Range)', 'الوقت في النطاق')}</h3>
                            <div class="flex flex-col items-center">
                                <div class="stitch-radial-gauge w-32 h-32 relative">
                                    <svg class="w-full h-full" viewBox="0 0 100 100">
                                        <circle cx="50" cy="50" r="40" stroke="#e2e8f0" stroke-width="8" fill="none" />
                                        <circle cx="50" cy="50" r="40" stroke="#3b82f6" stroke-width="8" fill="none" 
                                            stroke-dasharray="251.2" stroke-dashoffset="100" stroke-linecap="round" />
                                    </svg>
                                    <span class="absolute inset-0 flex items-center justify-center text-xl font-bold text-slate-800">65%</span>
                                </div>
                                <p class="mt-4 text-xs text-blue-600 font-medium">${tr('Stable - Target 70%', 'مستقر - الهدف 70%')}</p>
                            </div>
                        </div>
                    </div>

                    <!-- Center: Active Workspace -->
                    <div class="col-span-6 space-y-6">
                        <div class="stitch-card p-6 bg-white rounded-xl shadow-sm border border-slate-200 min-h-[600px]">
                            <div class="flex border-b border-slate-200 mb-6">
                                <button class="px-4 py-2 border-b-2 border-blue-500 text-blue-500 font-medium">${tr('Glucose Trends', 'اتجاهات الجلوكوز')}</button>
                                <button class="px-4 py-2 text-slate-500 hover:text-slate-800">${tr('Thyroid Panel', 'لوحة الغدة الدرقية')}</button>
                                <button class="px-4 py-2 text-slate-500 hover:text-slate-800">${tr('AI Prediction', 'تنبؤ الذكاء الاصطناعي')}</button>
                            </div>
                            <div id="endocrine-workspace-content" class="space-y-4">
                                <div class="p-8 text-center text-slate-400 border-2 border-dashed border-slate-200 rounded-xl">
                                    ${tr('No active trend. Please log glucose data to begin.', 'لا يوجد اتجاه نشط. يرجى تسجيل بيانات الجلوكوز للبدء.')}
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Right: AI Insights -->
                    <div class="col-span-3 space-y-6">
                        <div class="stitch-card p-4 bg-blue-50 rounded-xl shadow-sm border border-blue-100">
                            <div class="flex items-center gap-2 mb-4">
                                <span class="text-xl">🧠</span>
                                <h3 class="text-sm font-bold text-blue-900 uppercase tracking-wider">${tr('AI Insights', 'رؤى الذكاء الاصطناعي')}</h3>
                            </div>
                            <div id="ai-insights-panel" class="space-y-4">
                                <div class="p-3 bg-white rounded-lg border border-blue-200 shadow-sm">
                                    <p class="text-xs text-blue-700 font-semibold mb-1">${tr('Insulin Adjustment', 'تعديل الأنسولين المقترح')}</p>
                                    <p class="text-sm text-slate-600 italic">"Pattern suggests dawn phenomenon. Suggest reducing basal insulin by 10%."</p>
                                    <button class="mt-2 text-xs text-blue-600 underline font-medium">${tr('View Evidence', 'عرض الأدلة')}</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    openGlucoseLog: () => { alert('Glucose Log Modal Triggered'); },
    openThyroidMetrics: () => { alert('Thyroid Metrics Modal Triggered'); }
};



if (typeof window !== 'undefined') { window.EndocrineStation = EndocrineStation; }

