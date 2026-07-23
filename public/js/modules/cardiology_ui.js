/**
 * Cardiology Module UI - Google Material Design 3 + Stitch Integration
 * Handles the rendering and interaction for General Cardiology
 */

const CardiologyUI = {
    // Material 3 Color Palette
    colors: {
        primary: '#0061a4',
        onPrimary: '#ffffff',
        primaryContainer: '#d1e4ff',
        onPrimaryContainer: '#001d35',
        secondary: '#5b5e71',
        surface: '#fdfbff',
        error: '#ba1a1a',
        outline: '#74777f'
    },

    /**
     * Render the Main Cardiology Dashboard
     * @param {HTMLElement} container - The element to render into
     */
    renderDashboard: async (container) => {
        container.innerHTML = `
            <div class="m3-cardiology-container" style="display: flex; height: 100vh; background: ${CardiologyUI.colors.surface}; font-family: 'Roboto', sans-serif;">
                <!-- Navigation Rail (Material 3) -->
                <nav class="m3-nav-rail" style="width: 80px; background: #f3f4f9; display: flex; flex-direction: column; align-items: center; padding: 20px 0; border-right: 1px solid ${CardiologyUI.colors.outline};">
                    <div class="m3-nav-item active" onclick="CardiologyUI.switchTab('overview')" style="margin-bottom: 20px; cursor: pointer; text-align: center;">
                        <div class="m3-icon-wrapper" style="width: 56px; height: 32px; background: ${CardiologyUI.colors.primaryContainer}; color: ${CardiologyUI.colors.onPrimaryContainer}; border-radius: 16px; display: flex; align-items: center; justify-content: center; font-weight: bold;">
                            <i class="fas fa-heartbeat"></i>
                        </div>
                        <span style="font-size: 12px; display: block; margin-top: 4px;">Overview</span>
                    </div>
                    <div class="m3-nav-item" onclick="CardiologyUI.switchTab('ecg')" style="margin-bottom: 20px; cursor: pointer; text-align: center;">
                        <div class="m3-icon-wrapper" style="width: 56px; height: 32px; border-radius: 16px; display: flex; align-items: center; justify-content: center;">
                            <i class="fas fa-wave-square"></i>
                        </div>
                        <span style="font-size: 12px; display: block; margin-top: 4px;">ECG</span>
                    </div>
                    <div class="m3-nav-item" onclick="CardiologyUI.switchTab('meds')" style="margin-bottom: 20px; cursor: pointer; text-align: center;">
                        <div class="m3-icon-wrapper" style="width: 56px; height: 32px; border-radius: 16px; display: flex; align-items: center; justify-content: center;">
                            <i class="fas fa-pills"></i>
                        </div>
                        <span style="font-size: 12px; display: block; margin-top: 4px;">Meds</span>
                    </div>
                </nav>

                <!-- Main Content Area -->
                <main class="m3-main-content" style="flex: 1; padding: 24px; overflow-y: auto;">
                    <header style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 32px;">
                        <h1 style="font-size: 24px; color: #1c1b1f;">Cardiology Patient Overview</h1>
                        <div id="patient-badge" style="background: ${CardiologyUI.colors.primaryContainer}; color: ${CardiologyUI.colors.onPrimaryContainer}; padding: 8px 16px; border-radius: 20px; font-weight: 500;">
                            Patient: #12345 - Ahmed Ali
                        </div>
                    </header>

                    <!-- Vitals Grid (Material 3 Cards) -->
                    <div class="m3-vitals-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 16px; margin-bottom: 32px;">
                        <div class="m3-card" style="background: white; padding: 20px; border-radius: 12px; border: 1px solid ${CardiologyUI.colors.outline}; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                            <span style="color: ${CardiologyUI.colors.secondary}; font-size: 14px;">Blood Pressure</span>
                            <div style="font-size: 32px; font-weight: bold; margin: 8px 0;">120/80 <span style="font-size: 16px; color: gray;">mmHg</span></div>
                            <div style="color: green; font-size: 12px;">● Stable</div>
                        </div>
                        <div class="m3-card" style="background: white; padding: 20px; border-radius: 12px; border: 1px solid ${CardiologyUI.colors.outline}; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                            <span style="color: ${CardiologyUI.colors.secondary}; font-size: 14px;">Heart Rate</span>
                            <div style="font-size: 32px; font-weight: bold; margin: 8px 0;">72 <span style="font-size: 16px; color: gray;">bpm</span></div>
                            <div style="color: green; font-size: 12px;">● Normal</div>
                        </div>
                        <div class="m3-card" style="background: white; padding: 20px; border-radius: 12px; border: 1px solid ${CardiologyUI.colors.outline}; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                            <span style="color: ${CardiologyUI.colors.secondary}; font-size: 14px;">Ejection Fraction (EF%)</span>
                            <div style="font-size: 32px; font-weight: bold; margin: 8px 0; color: ${CardiologyUI.colors.error};">35%</div>
                            <div style="color: ${CardiologyUI.colors.error}; font-size: 12px;">▲ High Risk (HFrEF)</div>
                        </div>
                    </div>

                    <!-- AI Insight Section (RAG Integrated) -->
                    <div class="m3-ai-insight" style="background: ${CardiologyUI.colors.primaryContainer}; padding: 20px; border-radius: 16px; border-left: 6px solid ${CardiologyUI.colors.primary}; margin-bottom: 32px;">
                        <h3 style="margin: 0 0 10px 0; display: flex; align-items: center; gap: 8px;">
                            <i class="fas fa-robot"></i> AI Clinical Insight
                        </h3>
                        <p style="margin: 0; color: ${CardiologyUI.colors.onPrimaryContainer}; line-height: 1.5;">
                            Based on EF% (35%) and current medications, the patient is a candidate for 
                            <strong>ARNI therapy (Sacubitril/Valsartan)</strong> according to 2023 ESC Guidelines. 
                            Consider optimizing Beta-blocker dosage.
                        </p>
                    </div>

                    <!-- Action Area -->
                    <div id="action-area">
                        <button onclick="CardiologyUI.openVisitModal()" style="background: ${CardiologyUI.colors.primary}; color: white; border: none; padding: 12px 24px; border-radius: 100px; font-weight: 500; cursor: pointer; box-shadow: 0 4px 8px rgba(0,0,0,0.2);">
                            + New Cardiology Visit
                        </button>
                    </div>
                </main>

                <!-- Floating Action Button (FAB) -->
                <div class="m3-fab" style="position: absolute; bottom: 24px; right: 24px; width: 56px; height: 56px; background: ${CardiologyUI.colors.primaryContainer}; color: ${CardiologyUI.colors.onPrimaryContainer}; border-radius: 16px; display: flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 4px 12px rgba(0,0,0,0.3); font-size: 24px;">
                    <i class="fas fa-plus"></i>
                </div>
            </div>
        `;
    },

    switchTab: (tab) => {
        console.log('Switching to tab:', tab);
        // Implementation for tab switching logic
    },

    openVisitModal: () => {
        alert('Opening New Visit Modal... (Stitch-Modal implementation)');
    }
};

// Export to global window for app.js access
window.CardiologyUI = CardiologyUI;
