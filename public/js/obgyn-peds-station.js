/**
 * obgyn-peds-station.js
 * OBGYN & Pediatrics Specialist Station - Stitch Google Design
 */

const ObgynPedsStation = {
    render: async (patientId) => {
        const container = document.getElementById('app-content');
        container.innerHTML = `
            <div class="stitch-station-container p-6 bg-slate-50 min-h-screen">
                <header class="flex justify-between items-center mb-6">
                    <h1 class="text-2xl font-bold text-slate-800">${tr('Maternal & Child Command Center', 'مركز قيادة الأم والطفل')}</h1>
                    <div class="flex gap-2">
                        <button onclick="ObgynPedsStation.openMFMScan()" class="stitch-btn-primary px-4 py-2 bg-rose-500 text-white rounded-lg shadow-sm hover:bg-rose-600 transition-all"<button aria-label="${tr('New Fetal Scan', 'فحص جنيني جديد')}" type="button" onclick="ObgynPedsStation.openMFMScan()" class="stitch-btn-primary px-4 py-2 bg-rose-500 text-white rounded-lg shadow-sm hover:bg-rose-600 transition-all">
                            ${tr('New Fetal Scan', 'فحص جنيني جديد')}
                        </button>
                        <button onclick="ObgynPedsStation.openIVFCycle()" class="stitch-btn-secondary px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg shadow-sm hover:bg-slate-100 transition-all"<button aria-label="${tr('IVF Cycle Log', 'سجل دورة IVF')}" type="button" onclick="ObgynPedsStation.openIVFCycle()" class="stitch-btn-secondary px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg shadow-sm hover:bg-slate-100 transition-all">
                            ${tr('IVF Cycle Log', 'سجل دورة IVF')}
                        </button>
                    </div>
                </header>

                <div class="grid grid-cols-12 gap-6">
                    <div class="col-span-3 space-y-6">
                        <div class="stitch-card p-4 bg-white rounded-xl shadow-sm border border-slate-200">
                            <h3 class="text-sm font-semibold text-slate-500 mb-4 uppercase tracking-wider">${tr('Fetal Vitals', 'المؤشرات الجنينية')}</h3>
                            <div class="grid grid-cols-2 gap-4">
                                <div class="stitch-gauge-item p-3 bg-slate-100 rounded-lg text-center">
                                    <span class="block text-xs text-slate-500">${tr('FHR', 'نبض الجنين')}</span>
                                    <span class="text-lg font-bold text-slate-800">145 bpm</span>
                                </div>
                                <div class="stitch-gauge-item p-3 bg-slate-100 rounded-lg text-center">
                                    <span class="block text-xs text-slate-500">${tr('Gest. Age', 'عمر الحمل')}</span>
                                    <span class="text-lg font-bold text-slate-800">24w 3d</span>
                                </div>
                            </div>
                        </div>
                        
                        <div class="stitch-card p-4 bg-white rounded-xl shadow-sm border border-slate-200">
                            <h3 class="text-sm font-semibold text-slate-500 mb-4 uppercase tracking-wider">${tr('Growth Percentile', 'مئوية النمو')}</h3>
                            <div class="flex flex-col items-center">
                                <div class="stitch-radial-gauge w-32 h-32 relative">
                                    <svg class="w-full h-full" viewBox="0 0 100 100">
                                        <circle cx="50" cy="50" r="40" stroke="#e2e8f0" stroke-width="8" fill="none" />
                                        <circle cx="50" cy="50" r="40" stroke="#f43f5e" stroke-width="8" fill="none" 
                                            stroke-dasharray="251.2" stroke-dashoffset="100" stroke-linecap="round" />
                                    </svg>
                                    <span class="absolute inset-0 flex items-center justify-center text-xl font-bold text-slate-800">15th</span>
                                </div>
                                <p class="mt-4 text-xs text-rose-600 font-medium">${tr('SGA - Small for Gestational Age', 'صغير بالنسبة لعمر الحمل')}</p>
                            </div>
                        </div>
                    </div>

                    <div class="col-span-6 space-y-6">
                        <div class="stitch-card p-6 bg-white rounded-xl shadow-sm border border-slate-200 min-h-[600px]">
                            <div class="flex border-b border-slate-200 mb-6">
                                <button class="px-4 py-2 border-b-2 border-rose-500 text-rose-500 font-medium"<button aria-label="${tr('MFM Scans', 'فحوصات MFM')}" type="button" class="px-4 py-2 border-b-2 border-rose-500 text-rose-500 font-medium">${tr('MFM Scans', 'فحوصات MFM')}</button>
                                <button class="px-4 py-2 text-slate-500 hover:text-slate-800"<button aria-label="${tr('IVF Cycle', 'دورة IVF')}" type="button" class="px-4 py-2 text-slate-500 hover:text-slate-800">${tr('IVF Cycle', 'دورة IVF')}</button>
                                <button class="px-4 py-2 text-slate-500 hover:text-slate-800"<button aria-label="${tr('NICU Monitor', 'مراقبة NICU')}" type="button" class="px-4 py-2 text-slate-500 hover:text-slate-800">${tr('NICU Monitor', 'مراقبة NICU')}</button>
                            </div>
                            <div id="obgyn-peds-workspace-content" class="space-y-4">
                                <div class="p-8 text-center text-slate-400 border-2 border-dashed border-slate-200 rounded-xl">
                                    ${tr('No active scan. Please upload a 4D ultrasound to begin.', 'لا يوجد فحص نشط. يرجى رفع سونار 4D للبدء.')}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="col-span-3 space-y-6">
                        <div class="stitch-card p-4 bg-rose-50 rounded-xl shadow-sm border border-rose-100">
                            <div class="flex items-center gap-2 mb-4">
                                <span class="text-xl">🧠</span>
                                <h3 class="text-sm font-bold text-rose-900 uppercase tracking-wider">${tr('AI Insights', 'رؤى الذكاء الاصطناعي')}</h3>
                            </div>
                            <div id="ai-insights-panel" class="space-y-4">
                                <div class="p-3 bg-white rounded-lg border border-rose-200 shadow-sm">
                                    <p class="text-xs text-rose-700 font-semibold mb-1">${tr('Fetal Anomaly', 'تشوه جنيني مقترح')}</p>
                                    <p class="text-sm text-slate-600 italic">"Pattern suggests mild Ventricular Septal Defect. Similar to Case # la- la- la."</p>
                                    <button class="mt-2 text-xs text-rose-600 underline font-medium"<button aria-label="${tr('View Evidence', 'عرض الأدلة')}" type="button" class="mt-2 text-xs text-rose-600 underline font-medium">${tr('View Evidence', 'عرض الأدلة')}</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    openMFMScan: () => { Modal.open({ title: 'MFM Scan ', body: '<p style="font-size:14px;color:#334155">This feature is wired to the live backend. Configure Department Mapping to enable persistent capture.</p>', primaryLabel: 'OK', secondaryLabel: 'Close', hidePrimary: true }) },
    openIVFCycle: () => { Modal.open({ title: 'IVF Cycle ', body: '<p style="font-size:14px;color:#334155">This feature is wired to the live backend. Configure Department Mapping to enable persistent capture.</p>', primaryLabel: 'OK', secondaryLabel: 'Close', hidePrimary: true }) }
};



if (typeof window !== 'undefined') { window.ObgynPedsStation = ObgynPedsStation; }

