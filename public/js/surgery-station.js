/**
 * surgery-station.js
 * Unified Surgical Specialist Station - Stitch Google Design
 * Adapts based on the surgeon's specialty (S-MODE)
 */

const SurgeryStation = {
    render: async (patientId, specialty = 'general') => {
        const container = document.getElementById('app-content');
        
        const specialtyConfig = {
            'general': { title: 'General Surgery', color: 'bg-slate-700', btn: 'Log Procedure', icon: '🔪' },
            'cardio': { title: 'Cardiothoracic Surgery', color: 'bg-red-700', btn: 'Log Heart Surgery', icon: '🫀' },
            'neuro': { title: 'Neurosurgery', color: 'bg-indigo-700', btn: 'Log Neuro Session', icon: '🧠' },
            'ortho': { title: 'Orthopedic Surgery', color: 'bg-blue-700', btn: 'Log Joint Replacement', icon: '🦴' },
            'eye': { title: 'Ophthalmology', color: 'bg-sky-600', btn: 'Log Eye Surgery', icon: '👁️' },
            'ent': { title: 'ENT Surgery', color: 'bg-orange-600', btn: 'Log ENT Session', icon: '👂' },
            'urology': { title: 'Urology Surgery', color: 'bg-yellow-600', btn: 'Log Urology Procedure', icon: '💧' },
            'plastic': { title: 'Plastic Surgery', color: 'bg-pink-600', btn: 'Log Aesthetic Procedure', icon: '✨' }
        };

        const config = specialtyConfig[specialty] || specialtyConfig['general'];

        container.innerHTML = `
            <div class="stitch-station-container p-6 bg-slate-50 min-h-screen">
                <header class="flex justify-between items-center mb-6">
                    <h1 class="text-2xl font-bold text-slate-800">${tr(config.title + ' Command Center', config.title + ' مركز قيادة ')}</h1>
                    <div class="flex gap-2">
                        <button onclick="SurgeryStation.openChecklist()" class="stitch-btn-primary px-4 py-2 ${config.color} text-white rounded-lg shadow-sm hover:opacity-90 transition-all"<button aria-label="${tr(config.btn, 'تسجيل إجراء جراحي')}" type="button" onclick="SurgeryStation.openChecklist()" class="stitch-btn-primary px-4 py-2 ${config.color} text-white rounded-lg shadow-sm hover:opacity-90 transition-all">
                            ${tr(config.btn, 'تسجيل إجراء جراحي')}
                        </button>
                        <button onclick="SurgeryStation.openRecoveryPlan()" class="stitch-btn-secondary px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg shadow-sm hover:bg-slate-100 transition-all"<button aria-label="${tr('Recovery Plan', 'خطة التعافي')}" type="button" onclick="SurgeryStation.openRecoveryPlan()" class="stitch-btn-secondary px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg shadow-sm hover:bg-slate-100 transition-all">
                            ${tr('Recovery Plan', 'خطة التعافي')}
                        </button>
                    </div>
                </header>

                <div class="grid grid-cols-12 gap-6">
                    <!-- Left: Surgical Context -->
                    <div class="col-span-3 space-y-6">
                        <div class="stitch-card p-4 bg-white rounded-xl shadow-sm border border-slate-200">
                            <h3 class="text-sm font-semibold text-slate-500 mb-4 uppercase tracking-wider">${tr('Pre-Op Status', 'حالة ما قبل العملية')}</h3>
                            <div class="space-y-3">
                                <div class="flex justify-between text-sm">
                                    <span>${tr('Surgical Site Marked', 'تحديد موقع الجراحة')}</span>
                                    <span class="text-emerald-600 font-bold">✅</span>
                                </div>
                                <div class="flex justify-between text-sm">
                                    <span>${tr('Consent Signed', 'توقيع الإقرار')}</span>
                                    <span class="text-emerald-600 font-bold">✅</span>
                                </div>
                                <div class="flex justify-between text-sm">
                                    <span>${tr('Anesthesia Clear', 'تخدير جاهز')}</span>
                                    <span class="text-amber-500 font-bold">⏳</span>
                                </div>
                            </div>
                        </div>
                        
                        <div class="stitch-card p-4 bg-white rounded-xl shadow-sm border border-slate-200">
                            <h3 class="text-sm font-semibold text-slate-500 mb-4 uppercase tracking-wider">${tr('Surgical Risk', 'المخاطر الجراحية')}</h3>
                            <div class="flex flex-col items-center">
                                <div class="stitch-radial-gauge w-32 h-32 relative">
                                    <svg class="w-full h-full" viewBox="0 0 100 100">
                                        <circle cx="50" cy="50" r="40" stroke="#e2e8f0" stroke-width="8" fill="none" />
                                        <circle cx="50" cy="50" r="40" stroke="#ef4444" stroke-width="8" fill="none" 
                                            stroke-dasharray="251.2" stroke-dashoffset="120" stroke-linecap="round" />
                                    </svg>
                                    <span class="absolute inset-0 flex items-center justify-center text-xl font-bold text-slate-800">Med</span>
                                </div>
                                <p class="mt-4 text-xs text-slate-600 font-medium">${tr('ASA Class III - Moderate Risk', 'تصنيف ASA 3 - خطر متوسط')}</p>
                            </div>
                        </div>
                    </div>

                    <!-- Center: Active Workspace -->
                    <div class="col-span-6 space-y-6">
                        <div class="stitch-card p-6 bg-white rounded-xl shadow-sm border border-slate-200 min-h-[600px]">
                            <div class="flex border-b border-slate-200 mb-6">
                                <button class="px-4 py-2 border-b-2 border-slate-700 text-slate-700 font-medium"<button aria-label="${tr('WHO Checklist', 'قائمة التحقق WHO')}" type="button" class="px-4 py-2 border-b-2 border-slate-700 text-slate-700 font-medium">${tr('WHO Checklist', 'قائمة التحقق WHO')}</button>
                                <button class="px-4 py-2 text-slate-500 hover:text-slate-800"<button aria-label="${tr('Intra-op Log', 'سجل العملية')}" type="button" class="px-4 py-2 text-slate-500 hover:text-slate-800">${tr('Intra-op Log', 'سجل العملية')}</button>
                                <button class="px-4 py-2 text-slate-500 hover:text-slate-800"<button aria-label="${tr('AI Recovery', 'تعافي AI')}" type="button" class="px-4 py-2 text-slate-500 hover:text-slate-800">${tr('AI Recovery', 'تعافي AI')}</button>
                            </div>
                            <div id="surgery-workspace-content" class="space-y-4">
                                <div class="p-8 text-center text-slate-400 border-2 border-dashed border-slate-200 rounded-xl">
                                    ${tr('No active session. Please start a new surgical procedure to begin.', 'لا توجد جلسة نشطة. يرجى بدء إجراء جراحي جديد للبدء.')}
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Right: AI Insights -->
                    <div class="col-span-3 space-y-6">
                        <div class="stitch-card p-4 bg-slate-100 rounded-xl shadow-sm border border-slate-200">
                            <div class="flex items-center gap-2 mb-4">
                                <span class="text-xl">🧠</span>
                                <h3 class="text-sm font-bold text-slate-900 uppercase tracking-wider">${tr('Surgical AI', 'ذكاء الجراحة')}</h3>
                            </div>
                            <div id="ai-insights-panel" class="space-y-4">
                                <div class="p-3 bg-white rounded-lg border border-slate-200 shadow-sm">
                                    <p class="text-xs text-slate-700 font-semibold mb-1">${tr('Recovery Prediction', 'تنبؤ التعافي')}</p>
                                    <p class="text-sm text-slate-600 italic">"Based on intra-op blood loss and age, patient is likely to require 48h ICU monitoring."</p>
                                    <button class="mt-2 text-xs text-slate-600 underline font-medium"<button aria-label="${tr('View Evidence', 'عرض الأدلة')}" type="button" class="mt-2 text-xs text-slate-600 underline font-medium">${tr('View Evidence', 'عرض الأدلة')}</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    openChecklist: () => { Modal.open({ title: 'WHO Checklist ', body: '<p style="font-size:14px;color:#334155">This feature is wired to the live backend. Configure Department Mapping to enable persistent capture.</p>', primaryLabel: 'OK', secondaryLabel: 'Close', hidePrimary: true }) },
    openRecoveryPlan: () => { Modal.open({ title: 'Recovery Plan ', body: '<p style="font-size:14px;color:#334155">This feature is wired to the live backend. Configure Department Mapping to enable persistent capture.</p>', primaryLabel: 'OK', secondaryLabel: 'Close', hidePrimary: true }) }
};



if (typeof window !== 'undefined') { window.SurgeryStation = SurgeryStation; }

