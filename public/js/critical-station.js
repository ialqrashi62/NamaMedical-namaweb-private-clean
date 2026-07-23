/**
 * critical-station.js
 * Critical Care & Emergency Specialist Station - Stitch Google Design
 */

const CriticalStation = {
    render: async (patientId) => {
        const container = document.getElementById('app-content');
        container.innerHTML = `
            <div class="stitch-station-container p-6 bg-slate-900 min-h-screen text-white">
                <header class="flex justify-between items-center mb-6">
                    <h1 class="text-2xl font-bold text-white">${tr('Critical Care Command Center', 'مركز قيادة العناية المركزة والطوارئ')}</h1>
                    <div class="flex gap-2">
                        <button onclick="CriticalStation.openTriage()" class="stitch-btn-primary px-4 py-2 bg-red-600 text-white rounded-lg shadow-sm hover:bg-red-700 transition-all">
                            ${tr('Quick Triage', 'فرز سريع')}
                        </button>
                        <button onclick="CriticalStation.openAnesthesiaLog()" class="stitch-btn-secondary px-4 py-2 bg-slate-800 border border-slate-700 text-slate-300 rounded-lg shadow-sm hover:bg-slate-700 transition-all">
                            ${tr('Anesthesia Log', 'سجل التخدير')}
                        </button>
                    </div>
                </header>

                <div class="grid grid-cols-12 gap-6">
                    <!-- Left: High-Acuity Vitals -->
                    <div class="col-span-3 space-y-6">
                        <div class="stitch-card p-4 bg-slate-800 rounded-xl shadow-sm border border-slate-700">
                            <h3 class="text-sm font-semibold text-slate-400 mb-4 uppercase tracking-wider">${tr('Real-time Vitals', 'العلامات الحيوية اللحظية')}</h3>
                            <div id="critical-vitals-grid" class="grid grid-cols-2 gap-4">
                                <div class="stitch-gauge-item p-3 bg-slate-700 rounded-lg text-center">
                                    <span class="block text-xs text-slate-400">${tr('MAP', 'متوسط الضغط')}</span>
                                    <span class="text-lg font-bold text-red-500">58 mmHg</span>
                                </div>
                                <div class="stitch-gauge-item p-3 bg-slate-700 rounded-lg text-center">
                                    <span class="block text-xs text-slate-400">${tr('SpO2', 'تشبع الأكسجين')}</span>
                                    <span class="text-lg font-bold text-emerald-400">92%</span>
                                </div>
                            </div>
                        </div>
                        
                        <div class="stitch-card p-4 bg-slate-800 rounded-xl shadow-sm border border-slate-700">
                            <h3 class="text-sm font-semibold text-slate-400 mb-4 uppercase tracking-wider">${tr('Crash Risk', 'خطر الانهيار')}</h3>
                            <div class="flex flex-col items-center">
                                <div class="stitch-radial-gauge w-32 h-32 relative">
                                    <svg class="w-full h-full" viewBox="0 0 100 100">
                                        <circle cx="50" cy="50" r="40" stroke="#334155" stroke-width="8" fill="none" />
                                        <circle cx="50" cy="50" r="40" stroke="#ef4444" stroke-width="8" fill="none" 
                                            stroke-dasharray="251.2" stroke-dashoffset="40" stroke-linecap="round" />
                                    </svg>
                                    <span class="absolute inset-0 flex items-center justify-center text-xl font-bold text-white">High</span>
                                </div>
                                <p class="mt-4 text-xs text-red-500 font-bold animate-pulse">${tr('Sepsis Bundle Required', 'مطلوب تفعيل حزمة الإنتان')}</p>
                            </div>
                        </div>
                    </div>

                    <!-- Center: Active Workspace -->
                    <div class="col-span-6 space-y-6">
                        <div class="stitch-card p-6 bg-slate-800 rounded-xl shadow-sm border border-slate-700 min-h-[600px]">
                            <div class="flex border-b border-slate-700 mb-6">
                                <button class="px-4 py-2 border-b-2 border-red-600 text-red-600 font-medium">${tr('Triage Log', 'سجل الفرز')}</button>
                                <button class="px-4 py-2 text-slate-500 hover:text-slate-300">${tr('ICU Flowsheet', 'مخطط العناية المركزة')}</button>
                                <button class="px-4 py-2 text-slate-500 hover:text-slate-300">${tr('AI Predictions', 'تنبؤات AI')}</button>
                            </div>
                            <div id="critical-workspace-content" class="space-y-4">
                                <div class="p-8 text-center text-slate-500 border-2 border-dashed border-slate-700 rounded-xl">
                                    ${tr('No active critical session. Please start a triage or ICU log.', 'لا توجد جلسة حرجة نشطة. يرجى بدء سجل فرز أو عناية مركززة.')}
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Right: AI Insights -->
                    <div class="col-span-3 space-y-6">
                        <div class="stitch-card p-4 bg-red-900/20 rounded-xl shadow-sm border border-red-900/30">
                            <div class="flex items-center gap-2 mb-4">
                                <span class="text-xl">🧠</span>
                                <h3 class="text-sm font-bold text-red-400 uppercase tracking-wider">${tr('Critical AI', 'ذكاء العناية المركزة')}</h3>
                            </div>
                            <div id="ai-insights-panel" class="space-y-4">
                                <div class="p-3 bg-slate-800 rounded-lg border border-red-900/50 shadow-sm">
                                    <p class="text-xs text-red-400 font-semibold mb-1">${tr('Deterioration Alert', 'تنبيه تدهور الحالة')}</p>
                                    <p class="text-sm text-slate-300 italic">"Hemodynamic instability detected. Pattern matches Septic Shock. Suggest starting Norepinephrine."</p>
                                    <button class="mt-2 text-xs text-red-400 underline font-medium">${tr('View Evidence', 'عرض الأدلة')}</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    openTriage: () => { alert('Triage Modal Triggered'); },
    openAnesthesiaLog: () => { alert('Anesthesia Log Modal Triggered'); }
};



if (typeof window !== 'undefined') { window.CriticalStation = CriticalStation; }

