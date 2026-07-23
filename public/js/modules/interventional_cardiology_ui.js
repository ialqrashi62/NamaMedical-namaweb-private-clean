/**
 * Interventional Cardiology UI - Google Material Design 3 + Stitch Integration
 * Specialized for Cath Lab environments (High Contrast, High Precision)
 */

const ICUI = {
    colors: {
        primary: '#0061a4',
        onPrimary: '#ffffff',
        primaryContainer: '#d1e4ff',
        onPrimaryContainer: '#001d35',
        secondary: '#5b5e71',
        surface: '#0f1115', // Dark surface for Cath Lab to reduce glare
        onSurface: '#e2e2e6',
        error: '#ffb4ab',
        outline: '#44474e'
    },

    renderDashboard: async (container) => {
        container.innerHTML = `
            <div class="m3-ic-container" style="display: flex; height: 100vh; background: ${ICUI.colors.surface}; color: ${ICUI.colors.onSurface}; font-family: 'Roboto', sans-serif;">
                <!-- Navigation Rail (Material 3) -->
                <nav class="m3-nav-rail" style="width: 80px; background: #1c1b1f; display: flex; flex-direction: column; align-items: center; padding: 20px 0; border-right: 1px solid ${ICUI.colors.outline};">
                    <div class="m3-nav-item active" onclick="ICUI.switchTab('session')" style="margin-bottom: 20px; cursor: pointer; text-align: center;">
                        <div class="m3-icon-wrapper" style="width: 56px; height: 32px; background: ${ICUI.colors.primaryContainer}; color: ${ICUI.colors.onPrimaryContainer}; border-radius: 16px; display: flex; align-items: center; justify-content: center; font-weight: bold;">
                            <i class="fas fa-syringe"></i>
                        </div>
                        <span style="font-size: 12px; display: block; margin-top: 4px;">Session</span>
                    </div>
                    <div class="m3-nav-item" onclick="ICUI.switchTab('stents')" style="margin-bottom: 20px; cursor: pointer; text-align: center;">
                        <div class="m3-icon-wrapper" style="width: 56px; height: 32px; border-radius: 16px; display: flex; align-items: center; justify-content: center;">
                            <i class="fas fa-circle-notch"></i>
                        </div>
                        <span style="font-size: 12px; display: block; margin-top: 4px;">Stents</span>
                    </div>
                    <div class="m3-nav-item" onclick="ICUI.switchTab('hemo')" style="margin-bottom: 20px; cursor: pointer; text-align: center;">
                        <div class="m3-icon-wrapper" style="width: 56px; height: 32px; border-radius: 16px; display: flex; align-items: center; justify-content: center;">
                            <i class="fas fa-chart-line"></i>
                        </div>
                        <span style="font-size: 12px; display: block; margin-top: 4px;">Hemo</span>
                    </div>
                </nav>

                <!-- Main Content Area -->
                <main class="m3-main-content" style="flex: 1; padding: 24px; overflow-y: auto;">
                    <header style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 32px;">
                        <h1 style="font-size: 24px; color: ${ICUI.colors.onSurface};">Cath Lab Procedure Control</h1>
                        <div id="session-badge" style="background: ${ICUI.colors.primaryContainer}; color: ${ICUI.colors.onPrimaryContainer}; padding: 8px 16px; border-radius: 20px; font-weight: 500;">
                            Session: PCI-2026-001 | Patient: Ahmed Ali
                        </div}
                    </header>

                    <!-- Critical Metrics Grid (Material 3 Cards) -->
                    <div class="m3-metrics-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 16px; margin-bottom: 32px;">
                        <div class="m3-card" style="background: #2b2930; padding: 20px; border-radius: 12px; border: 1px solid ${ICUI.colors.outline};">
                            <span style="color: #cac4d0; font-size: 14px;">Door-to-Balloon Time</span>
                            <div style="font-size: 32px; font-weight: bold; margin: 8px 0; color: ${ICUI.colors.primaryContainer};">42 <span style="font-size: 16px; color: gray;">min</span></div>
                            <div style="color: #4caf50; font-size: 12px;">● Optimal (Guideline < 90min)</div>
                        </div>
                        <div class="m3-card" style="background: #2b2930; padding: 20px; border-radius: 12px; border: 1px solid ${ICUI.colors.outline};">
                            <span style="color: #cac4d0; font-size: 14px;">Contrast Volume</span>
                            <div style="font-size: 32px; font-weight: bold; margin: 8px 0;">85 <span style="font-size: 16px; color: gray;">ml</span></div>
                            <div style="color: #ffb4ab; font-size: 12px;">▲ Approaching Limit (GFR: 40)</div>
                        </div>
                        <div class="m3-card" style="background: #2b2930; padding: 20px; border-radius: 12px; border: 1px solid ${ICUI.colors.outline};">
                            <span style="color: #cac4d0; font-size: 14px;">Post-Dilation Pressure</span>
                            <div style="font-size: 32px; font-weight: bold; margin: 8px 0;">16 <span style="font-size: 16px; color: gray;">atm</span></div>
                            <div style="color: #4caf50; font-size: 12px;">● Optimal Expansion</div>
                        </div>
                    </div>

                    <!-- AI Procedural Insight (RAG Integrated) -->
                    <div class="m3-ai-insight" style="background: #211f26; padding: 20px; border-radius: 16px; border-left: 6px solid ${ICUI.colors.primary}; margin-bottom: 32px;">
                        <h3 style="margin: 0 0 10px 0; display: flex; align-items: center; gap: 8px; color: ${ICUI.colors.onSurface};">
                            <i class="fas fa-robot"></i> AI Procedural Guidance
                        </h3>
                        <p style="margin: 0; color: #cac4d0; line-height: 1.5;">
                            Current vessel segment (LAD) shows high calcification. 
                            <strong style="color: ${ICUI.colors.primaryContainer};">Recommendation:</strong> Consider 
                            <strong style="color: ${ICUI.colors.primaryContainer};">Rotational Atherectomy</strong> 
                            before stent deployment to ensure optimal expansion.
                        </p>
                    </div>

                    <!-- Action Area -->
                    <div id="action-area">
                        <button onclick="ICUI.openStentModal()" style="background: ${ICUI.colors.primary}; color: white; border: none; padding: 12px 24px; border-radius: 100px; font-weight: 500; cursor: pointer; box-shadow: 0 4px 8px rgba(0,0,0,0.2);">
                            + Record Stent Deployment
                        </button>
                    </div>
                </main>

                <!-- Floating Action Button (FAB) -->
                <div class="m3-fab" style="position: absolute; bottom: 24px; right: 24px; width: 56px; height: 56px; background: ${ICUI.colors.primaryContainer}; color: ${ICUI.colors.onPrimaryContainer}; border-radius: 16px; display: flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 4px 12px rgba(0,0,0,0.3); font-size: 24px;">
                    <i class="fas fa-plus"></i>
                </div>
            </div>
        `;
    },

    switchTab: (tab) => {
        console.log('Switching to IC Tab:', tab);
    },

    openStentModal: () => {
        alert('Opening Stent Registry Modal... (Stitch-Material3 implementation)');
    }
};

window.ICUI = ICUI;
