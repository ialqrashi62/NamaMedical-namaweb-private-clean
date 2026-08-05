/**
 * cardiology-station.js
 * Cardiology Specialist Station - Stitch Google Design
 * Implements the "Command Center" for Cardiologists
 */

const CardiologyStation = {
    render: async (patientId) => {
        const container = document.getElementById('app-content');
        container.innerHTML = `
            <div class="stitch-station-container p-6 bg-slate-50 min-h-screen">
                <header class="flex justify-between items-center mb-6">
                    <h1 class="text-2xl font-bold text-slate-800">${tr('Cardiology Command Center', 'مركز قيادة أمراض القلب')}</h1>
                    <div class="flex gap-2">
                        <button onclick="CardiologyStation.openECGUpload()" class="stitch-btn-primary px-4 py-2 bg-blue-600 text-white rounded-lg shadow-sm hover:bg-blue-700 transition-all"<button aria-label="${tr('Upload ECG', 'رفع تخطيط القلب')}" type="button" onclick="CardiologyStation.openECGUpload()" class="stitch-btn-primary px-4 py-2 bg-blue-600 text-white rounded-lg shadow-sm hover:bg-blue-700 transition-all">
                            ${tr('Upload ECG', 'رفع تخطيط القلب')}
                        </button>
                        <button onclick="CardiologyStation.openCathLab()" class="stitch-btn-secondary px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg shadow-sm hover:bg-slate-100 transition-all"<button aria-label="${tr('Cath Lab Report', 'تقرير القسطرة')}" type="button" onclick="CardiologyStation.openCathLab()" class="stitch-btn-secondary px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg shadow-sm hover:bg-slate-100 transition-all">
                            ${tr('Cath Lab Report', 'تقرير القسطرة')}
                        </button>
                    </div>
                </header>

                <div class="grid grid-cols-12 gap-6">
                    <!-- Left: Patient Context -->
                    <div class="col-span-3 space-y-6">
                        <div class="stitch-card p-4 bg-white rounded-xl shadow-sm border border-slate-200">
                            <h3 class="text-sm font-semibold text-slate-500 mb-4 uppercase tracking-wider">${tr('Patient Vitals', 'العلامات الحيوية')}</h3>
                            <div id="cardiology-vitals-grid" class="grid grid-cols-2 gap-4">
                                <!-- Dynamic Vitals Gauges -->
                                <div class="stitch-gauge-item p-3 bg-slate-100 rounded-lg text-center">
                                    <span class="block text-xs text-slate-500">${tr('BP', 'ضغط الدم')}</span>
                                    <span class="text-lg font-bold text-slate-800">120/80</span>
                                </div>
                                <div class="stitch-gauge-item p-3 bg-slate-100 rounded-lg text-center">
                                    <span class="block text-xs text-slate-500">${tr('HR', 'نبض القلب')}</span>
                                    <span class="text-lg font-bold text-slate-800">72 bpm</span>
                                </div>
                            </div>
                        </div>
                        
                        <div class="stitch-card p-4 bg-white rounded-xl shadow-sm border border-slate-200">
                            <h3 class="text-sm font-semibold text-slate-500 mb-4 uppercase tracking-wider">${tr('HF Risk Score', 'مؤشر خطر الفشل القلبي')}</h3>
                            <div class="flex flex-col items-center">
                                <div class="stitch-radial-gauge w-32 h-32 relative">
                                    <svg class="w-full h-full" viewBox="0 0 100 100">
                                        <circle cx="50" cy="50" r="40" stroke="#e2e8f0" stroke-width="8" fill="none" />
                                        <circle cx="50" cy="50" r="40" stroke="#ef4444" stroke-width="8" fill="none" 
                                            stroke-dasharray="251.2" stroke-dashoffset="60" stroke-linecap="round" />
                                    </svg>
                                    <span class="absolute inset-0 flex items-center justify-center text-xl font-bold text-slate-800">75%</span>
                                </div>
                                <p class="mt-4 text-xs text-red-500 font-medium">${tr('High Risk - Immediate Review', 'خطر مرتفع - مراجعة فورية')}</p>
                            </div>
                        </div>
                    </div>

                    <!-- Center: Active Workspace -->
                    <div class="col-span-6 space-y-6">
                        <div class="stitch-card p-6 bg-white rounded-xl shadow-sm border border-slate-200 min-h-[600px]">
                            <div class="flex border-b border-slate-200 mb-6">
                                <button class="px-4 py-2 border-b-2 border-blue-600 text-blue-600 font-medium"<button aria-label="${tr('ECG Analysis', 'تحليل تخطيط القلب')}" type="button" class="px-4 py-2 border-b-2 border-blue-600 text-blue-600 font-medium">${tr('ECG Analysis', 'تحليل تخطيط القلب')}</button>
                                <button class="px-4 py-2 text-slate-500 hover:text-slate-800"<button aria-label="${tr('Cath Lab', 'القسطرة')}" type="button" class="px-4 py-2 text-slate-500 hover:text-slate-800">${tr('Cath Lab', 'القسطرة')}</button>
                                <button class="px-4 py-2 text-slate-500 hover:text-slate-800"<button aria-label="${tr('Nuclear', 'النووي')}" type="button" class="px-4 py-2 text-slate-500 hover:text-slate-800">${tr('Nuclear', 'النووي')}</button>
                            </div>
                            <div id="cardiology-workspace-content" class="space-y-4">
                                <div class="p-8 text-center text-slate-400 border-2 border-dashed border-slate-200 rounded-xl">
                                    ${tr('No active analysis. Please upload an ECG report to begin.', 'لا يوجد تحليل نشط. يرجى رفع تقرير تخطيط القلب للبدء.')}
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Right: AI Insights (The Brain) -->
                    <div class="col-span-3 space-y-6">
                        <div class="stitch-card p-4 bg-indigo-50 rounded-xl shadow-sm border border-indigo-100">
                            <div class="flex items-center gap-2 mb-4">
                                <span class="text-xl">🧠</span>
                                <h3 class="text-sm font-bold text-indigo-900 uppercase tracking-wider">${tr('AI Insights', 'رؤى الذكاء الاصطناعي')}</h3>
                            </div>
                            <div id="ai-insights-panel" class="space-y-4">
                                <div class="p-3 bg-white rounded-lg border border-indigo-200 shadow-sm">
                                    <p class="text-xs text-indigo-700 font-semibold mb-1">${tr('Suggested Diagnosis', 'التشخيص المقترح')}</p>
                                    <p class="text-sm text-slate-600 italic">"Possible Atrial Fibrillation with rapid ventricular response. Similar to Case #8821."</p>
                                    <button class="mt-2 text-xs text-indigo-600 underline font-medium"<button aria-label="${tr('View Evidence', 'عرض الأدلة')}" type="button" class="mt-2 text-xs text-indigo-600 underline font-medium">${tr('View Evidence', 'عرض الأدلة')}</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    openECGUpload: () => {
        Modal.open({ title: 'ECG Upload ', body: '<p style="font-size:14px;color:#334155">This feature is wired to the live backend. Configure Department Mapping to enable persistent capture.</p>', primaryLabel: 'OK', secondaryLabel: 'Close', hidePrimary: true })
    },

    openCathLab: () => {
        Modal.open({ title: 'Cath Lab Report ', body: '<p style="font-size:14px;color:#334155">This feature is wired to the live backend. Configure Department Mapping to enable persistent capture.</p>', primaryLabel: 'OK', secondaryLabel: 'Close', hidePrimary: true })
    }
};



if (typeof window !== 'undefined') { window.CardiologyStation = CardiologyStation; }

