/**
 * diagnostics-station.js
 * Advanced Diagnostics Specialist Station - Stitch Google Design
 */

const DiagnosticsStation = {
    render: async (patientId) => {
        const container = document.getElementById('app-content');
        container.innerHTML = `
            <div class="stitch-station-container p-6 bg-slate-50 min-h-screen">
                <header class="flex justify-between items-center mb-6">
                    <h1 class="text-2xl font-bold text-slate-800">${tr('Advanced Diagnostics Command Center', 'مركز قيادة التشخيصات المتقدمة')}</h1>
                    <div class="flex gap-2">
                        <button onclick="DiagnosticsStation.openScanUpload()" class="stitch-btn-primary px-4 py-2 bg-indigo-600 text-white rounded-lg shadow-sm hover:bg-indigo-700 transition-all">
                            ${tr('Upload Scan', 'رفع أشعة')}
                        </button>
                        <button onclick="DiagnosticsStation.openLabResult()" class="stitch-btn-secondary px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg shadow-sm hover:bg-slate-100 transition-all">
                            ${tr('Lab Results', 'نتائج المختبر')}
                        </button>
                    </div>
                </header>

                <div class="grid grid-cols-12 gap-6">
                    <div class="col-span-3 space-y-6">
                        <div class="stitch-card p-4 bg-white rounded-xl shadow-sm border border-slate-200">
                            <h3 class="text-sm font-semibold text-slate-500 mb-4 uppercase tracking-wider">${tr('Diagnostic Status', 'حالة التشخيص')}</h3>
                            <div class="space-y-3">
                                <div class="flex justify-between text-sm">
                                    <span>${tr('Radiology Report', 'تقرير الأشعة')}</span>
                                    <span class="text-emerald-600 font-bold">Final</span>
                                </div>
                                <div class="flex justify-between text-sm">
                                    <span>${tr('Lab Verification', 'تحقق المختبر')}</span>
                                    <span class="text-amber-500 font-bold">Pending</span>
                                </div>
                            </div>
                        </div>
                        <div class="stitch-card p-4 bg-white rounded-xl shadow-sm border border-slate-200">
                            <h3 class="text-sm font-semibold text-slate-500 mb-4 uppercase tracking-wider">${tr('Criticality Index', 'مؤشر الخطورة')}</h3>
                            <div class="flex flex-col items-center">
                                <div class="stitch-radial-gauge w-32 h-32 relative">
                                    <svg class="w-full h-full" viewBox="0 0 100 100">
                                        <circle cx="50" cy="50" r="40" stroke="#e2e8f0" stroke-width="8" fill="none" />
                                        <circle cx="50" cy="50" r="40" stroke="#ef4444" stroke-width="8" fill="none" 
                                            stroke-dasharray="251.2" stroke-dashoffset="60" stroke-linecap="round" />
                                    </svg>
                                    <span class="absolute inset-0 flex items-center justify-center text-xl font-bold text-slate-800">High</span>
                                </div>
                                <p class="mt-4 text-xs text-red-600 font-medium">${tr('Critical Value Detected', 'تم اكتشاف قيمة حرجة')}</p>
                            </div>
                        </div>
                    </div>

                    <div class="col-span-6 space-y-6">
                        <div class="stitch-card p-6 bg-white rounded-xl shadow-sm border border-slate-200 min-h-[600px]">
                            <div class="flex border-b border-slate-200 mb-6">
                                <button class="px-4 py-2 border-b-2 border-indigo-600 text-indigo-600 font-medium">${tr('Radiology', 'الأشعة')}</button>
                                <button class="px-4 py-2 text-slate-500 hover:text-slate-800">${tr('Laboratory', 'المختبر')}</button>
                                <button class="px-4 py-2 text-slate-500 hover:text-slate-800">${tr('Functional', 'الوظيفية')}</button>
                            </div>
                            <div id="diag-workspace-content" class="space-y-4">
                                <div class="p-8 text-center text-slate-400 border-2 border-dashed border-slate-200 rounded-xl">
                                    ${tr('No active study. Please select a scan or lab result to begin.', 'لا توجد دراسة نشطة. يرجى اختيار أشعة أو نتيجة مختبر للبدء.')}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="col-span-3 space-y-6">
                        <div class="stitch-card p-4 bg-indigo-50 rounded-xl shadow-sm border border-indigo-100">
                            <div class="flex items-center gap-2 mb-4">
                                <span class="text-xl">🧠</span>
                                <h3 class="text-sm font-bold text-indigo-900 uppercase tracking-wider">${tr('AI Insights', 'رؤى الذكاء الاصطناعي')}</h3>
                            </div>
                            <div id="ai-insights-panel" class="space-y-4">
                                <div class="p-3 bg-white rounded-lg border border-indigo-200 shadow-sm">
                                    <p class="text-xs text-indigo-700 font-semibold mb-1">${tr('Suggested Finding', 'النتيجة المقترحة')}</p>
                                    <p class="text-sm text-slate-600 italic">"Symmetry analysis suggests early-stage focal lesion in the left lobe. Similar to Case # la- la- la."</p>
                                    <button class="mt-2 text-xs text-indigo-600 underline font-medium">${tr('View Evidence', 'عرض الأدلة')}</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    openScanUpload: () => { alert('Scan Upload Modal Triggered'); },
    openLabResult: () => { alert('Lab Result Modal Triggered'); }
};



if (typeof window !== 'undefined') { window.DiagnosticsStation = DiagnosticsStation; }

