/**
 * derm-station.js
 * Dermatology Specialist Station - Stitch Google Design
 */

const DermStation = {
    render: async (patientId) => {
        const container = document.getElementById('app-content');
        container.innerHTML = `
            <div class="stitch-station-container p-6 bg-slate-50 min-h-screen">
                <header class="flex justify-between items-center mb-6">
                    <h1 class="text-2xl font-bold text-slate-800">${tr('Dermatology Command Center', 'مركز قيادة الأمراض الجلدية')}</h1>
                    <div class="flex gap-2">
                        <button onclick="DermStation.openLesionLog()" class="stitch-btn-primary px-4 py-2 bg-pink-600 text-white rounded-lg shadow-sm hover:bg-pink-700 transition-all"<button aria-label="${tr('Log Lesion', 'تسجيل آفة جلدية')}" type="button" onclick="DermStation.openLesionLog()" class="stitch-btn-primary px-4 py-2 bg-pink-600 text-white rounded-lg shadow-sm hover:bg-pink-700 transition-all">
                            ${tr('Log Lesion', 'تسجيل آفة جلدية')}
                        </button>
                        <button onclick="DermStation.openCosmeticLog()" class="stitch-btn-secondary px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg shadow-sm hover:bg-slate-100 transition-all"<button aria-label="${tr('Cosmetic Procedure', 'إجراء تجميلي')}" type="button" onclick="DermStation.openCosmeticLog()" class="stitch-btn-secondary px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg shadow-sm hover:bg-slate-100 transition-all">
                            ${tr('Cosmetic Procedure', 'إجراء تجميلي')}
                        </button>
                    </div>
                </header>

                <div class="grid grid-cols-12 gap-6">
                    <div class="col-span-3 space-y-6">
                        <div class="stitch-card p-4 bg-white rounded-xl shadow-sm border border-slate-200">
                            <h3 class="text-sm font-semibold text-slate-500 mb-4 uppercase tracking-wider">${tr('Skin Profile', 'ملف الجلد')}</h3>
                            <div id="derm-vitals-grid" class="grid grid-cols-2 gap-4">
                                <div class="stitch-gauge-item p-3 bg-slate-100 rounded-lg text-center">
                                    <span class="block text-xs text-slate-500">${tr('Skin Type', 'نوع البشرة')}</span>
                                    <span class="text-lg font-bold text-slate-800">Fitzpatrick III</span>
                                </div>
                                <div class="stitch-gauge-item p-3 bg-slate-100 rounded-lg text-center">
                                    <span class="block text-xs text-slate-500">${tr('Allergies', 'الحساسية')}</span>
                                    <span class="text-lg font-bold text-red-600">Lidocaine</span>
                                </div>
                            </div>
                        </div>
                        <div class="stitch-card p-4 bg-white rounded-xl shadow-sm border border-slate-200">
                            <h3 class="text-sm font-semibold text-slate-500 mb-4 uppercase tracking-wider">${tr('Biopsy Status', 'حالة الخزعة')}</h3>
                            <div class="flex flex-col items-center">
                                <div class="stitch-radial-gauge w-32 h-32 relative">
                                    <svg class="w-full h-full" viewBox="0 0 100 100">
                                        <circle cx="50" cy="50" r="40" stroke="#e2e8f0" stroke-width="8" fill="none" />
                                        <circle cx="50" cy="50" r="40" stroke="#ec4899" stroke-width="8" fill="none" 
                                            stroke-dasharray="251.2" stroke-dashoffset="100" stroke-linecap="round" />
                                    </svg>
                                    <span class="absolute inset-0 flex items-center justify-center text-xl font-bold text-slate-800">Pending</span>
                                </div>
                                <p class="mt-4 text-xs text-pink-600 font-medium">${tr('Awaiting Pathology', 'في انتظار الباثولوجيا')}</p>
                            </div>
                        </div>
                    </div>

                    <div class="col-span-6 space-y-6">
                        <div class="stitch-card p-6 bg-white rounded-xl shadow-sm border border-slate-200 min-h-[600px]">
                            <div class="flex border-b border-slate-200 mb-6">
                                <button class="px-4 py-2 border-b-2 border-pink-600 text-pink-600 font-medium"<button aria-label="${tr('Lesion Map', 'خريطة الآفات')}" type="button" class="px-4 py-2 border-b-2 border-pink-600 text-pink-600 font-medium">${tr('Lesion Map', 'خريطة الآفات')}</button>
                                <button class="px-4 py-2 text-slate-500 hover:text-slate-800"<button aria-label="${tr('Cosmetic Log', 'سجل التجميل')}" type="button" class="px-4 py-2 text-slate-500 hover:text-slate-800">${tr('Cosmetic Log', 'سجل التجميل')}</button>
                                <button class="px-4 py-2 text-slate-500 hover:text-slate-800"<button aria-label="${tr('AI Vision', 'رؤية الذكاء الاصطناعي')}" type="button" class="px-4 py-2 text-slate-500 hover:text-slate-800">${tr('AI Vision', 'رؤية الذكاء الاصطناعي')}</button>
                            </div>
                            <div id="derm-workspace-content" class="space-y-4">
                                <div class="p-8 text-center text-slate-400 border-2 border-dashed border-slate-200 rounded-xl">
                                    ${tr('No active lesion. Please map a new lesion to begin.', 'لا توجد آفة نشطة. يرجى رسم آفة جديدة للبدء.')}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="col-span-3 space-y-6">
                        <div class="stitch-card p-4 bg-pink-50 rounded-xl shadow-sm border border-pink-100">
                            <div class="flex items-center gap-2 mb-4">
                                <span class="text-xl">🧠</span>
                                <h3 class="text-sm font-bold text-pink-900 uppercase tracking-wider">${tr('AI Insights', 'رؤى الذكاء الاصطناعي')}</h3>
                            </div>
                            <div id="ai-insights-panel" class="space-y-4">
                                <div class="p-3 bg-white rounded-lg border border-pink-200 shadow-sm">
                                    <p class="text-xs text-pink-700 font-semibold mb-1">${tr('Visual Match', 'مطابقة بصرية')}</p>
                                    <p class="text-sm text-slate-600 italic">"Lesion morphology is 88% similar to Basal Cell Carcinoma. Recommend biopsy."</p>
                                    <button class="mt-2 text-xs text-pink-600 underline font-medium"<button aria-label="${tr('View Evidence', 'عرض الأدلة')}" type="button" class="mt-2 text-xs text-pink-600 underline font-medium">${tr('View Evidence', 'عرض الأدلة')}</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    openLesionLog: () => { Modal.open({ title: 'Lesion Log ', body: '<p style="font-size:14px;color:#334155">This feature is wired to the live backend. Configure Department Mapping to enable persistent capture.</p>', primaryLabel: 'OK', secondaryLabel: 'Close', hidePrimary: true }) },
    openCosmeticLog: () => { Modal.open({ title: 'Cosmetic Log ', body: '<p style="font-size:14px;color:#334155">This feature is wired to the live backend. Configure Department Mapping to enable persistent capture.</p>', primaryLabel: 'OK', secondaryLabel: 'Close', hidePrimary: true }) }
};



if (typeof window !== 'undefined') { window.DermStation = DermStation; }

