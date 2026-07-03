/**
 * public/js/local-api-preview-ui.js
 * =============================================================================
 * Premium Read-Only Local Mock API Preview Panel.
 * Renders a glassmorphic sidebar/widget showing in-memory API & Contract simulation.
 * 100% client-side, zero fetch, zero database, zero external connections.
 * =============================================================================
 */

(function() {
  if (typeof window === 'undefined') return;

  window.addEventListener('DOMContentLoaded', () => {
    if (window.location.hostname === 'jumanasoft.com' || window.location.hostname === 'www.jumanasoft.com') {
      return;
    }
    // Create the toggle button
    const toggleBtn = document.createElement('button');
    toggleBtn.id = 'mockApiPreviewToggle';
    toggleBtn.innerHTML = '🛡️ معاينة واجهات الاختبار (Mock API)';
    toggleBtn.style.cssText = `
      position: fixed;
      bottom: 20px;
      left: 20px;
      z-index: 9999;
      background: linear-gradient(135deg, #0f172a, #1e293b);
      color: #38bdf8;
      border: 1px solid #38bdf8;
      padding: 10px 16px;
      border-radius: 30px;
      font-family: 'IBM Plex Sans Arabic', sans-serif;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
      transition: all 0.3s ease;
    `;

    // Create the main preview panel
    const panel = document.createElement('div');
    panel.id = 'mockApiPreviewPanel';
    panel.style.cssText = `
      position: fixed;
      bottom: 80px;
      left: 20px;
      width: 420px;
      max-height: 80vh;
      z-index: 9999;
      background: rgba(15, 23, 42, 0.85);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 16px;
      font-family: 'IBM Plex Sans Arabic', sans-serif;
      color: #f1f5f9;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
      display: none;
      flex-direction: column;
      overflow: hidden;
      transition: all 0.3s ease;
    `;

    // Panel Header
    const header = document.createElement('div');
    header.style.cssText = `
      padding: 14px 16px;
      background: rgba(30, 41, 59, 0.5);
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      display: flex;
      justify-content: space-between;
      align-items: center;
    `;
    header.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="font-size: 18px;">🛡️</span>
        <span style="font-weight: 700; font-size: 14px; color: #38bdf8;">نموذج الواجهات المحلية التجريبية</span>
      </div>
      <button id="closeMockApiPanel" style="background:none; border:none; color:#94a3b8; cursor:pointer; font-size: 16px;">✕</button>
    `;

    // Panel Body
    const body = document.createElement('div');
    body.style.cssText = `
      padding: 16px;
      overflow-y: auto;
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 12px;
      font-size: 12px;
    `;

    body.innerHTML = `
      <!-- Warning Alert -->
      <div style="background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 8px; padding: 10px; color: #fca5a5;">
        <strong>تنبيه أمني:</strong> بيئة التشغيل مغلقة تماماً للقراءة فقط. يمنع تشغيل أي عمليات كتابة أو ربط حقيقي بالإنتاج.
      </div>

      <!-- Resource Selector -->
      <div>
        <label style="display:block; margin-bottom: 6px; font-weight:600; color: #94a3b8;">اختر المورد الطبي/المالي:</label>
        <select id="mockResourceSelector" style="width:100%; padding: 8px; background: #1e293b; border: 1px solid #475569; border-radius: 6px; color:#fff; font-family: inherit;">
          ${(window.supportedResources || []).map(r => `<option value="${r}">${r}</option>`).join('')}
        </select>
      </div>

      <!-- Action Selector (GET vs POST Simulation) -->
      <div>
        <label style="display:block; margin-bottom: 6px; font-weight:600; color: #94a3b8;">نوع العملية المحاكاة:</label>
        <select id="mockActionSelector" style="width:100%; padding: 8px; background: #1e293b; border: 1px solid #475569; border-radius: 6px; color:#fff; font-family: inherit;">
          <option value="GET">استعلام للقراءة فقط (GET)</option>
          <option value="POST">محاكاة عملية كتابة (POST)</option>
        </select>
      </div>

      <!-- Metadata Panel -->
      <div style="background: rgba(30, 41, 59, 0.3); border: 1px solid rgba(255, 255, 255, 0.05); border-radius: 8px; padding: 12px; display: flex; flex-direction: column; gap: 8px;">
        <div style="display:flex; justify-content:space-between;"><span style="color:#94a3b8;">المسار التجريبي:</span> <code id="mockEndpoint" style="color:#60a5fa;">-</code></div>
        <div style="display:flex; justify-content:space-between;"><span style="color:#94a3b8;">حالة الاستجابة:</span> <span id="mockResponseStatus" style="font-weight:700;">-</span></div>
        <div style="display:flex; justify-content:space-between;"><span style="color:#94a3b8;">الصلاحية المطلوبة (RBAC):</span> <span id="mockRbac" style="color:#e2e8f0;">-</span></div>
        <div style="display:flex; justify-content:space-between;"><span style="color:#94a3b8;">حالة الكتابة:</span> <span style="color:#f87171; font-weight:600;">معطلة 🛡️</span></div>
        <div style="display:flex; justify-content:space-between;"><span style="color:#94a3b8;">الاتصال الحي:</span> <span style="color:#f87171; font-weight:600;">معطل 🛡️</span></div>
      </div>

      <!-- Audit Log Preview -->
      <div>
        <span style="font-weight:600; color:#94a3b8; display:block; margin-bottom: 6px;">معاينة سجل التدقيق (Audit Event Preview):</span>
        <pre id="mockAuditPreview" style="margin:0; padding:10px; background:#0f172a; border: 1px solid #334155; border-radius:6px; color:#34d399; font-size:11px; overflow-x:auto; max-height: 80px;"></pre>
      </div>

      <!-- Mock Response JSON -->
      <div style="flex: 1; display: flex; flex-direction: column; min-height: 150px;">
        <span style="font-weight:600; color:#94a3b8; display:block; margin-bottom: 6px;">الاستجابة الوهمية (Mock JSON Response):</span>
        <pre id="mockJsonResponse" style="margin:0; padding:10px; background:#0f172a; border: 1px solid #334155; border-radius:6px; color:#38bdf8; font-size:11px; overflow:auto; flex: 1; max-height: 200px;"></pre>
      </div>
    `;

    panel.appendChild(header);
    panel.appendChild(body);
    document.body.appendChild(toggleBtn);
    document.body.appendChild(panel);

    // Toggle logic
    toggleBtn.addEventListener('click', () => {
      if (panel.style.display === 'none') {
        panel.style.display = 'flex';
        toggleBtn.style.background = '#38bdf8';
        toggleBtn.style.color = '#0f172a';
        updatePreview();
      } else {
        panel.style.display = 'none';
        toggleBtn.style.background = 'linear-gradient(135deg, #0f172a, #1e293b)';
        toggleBtn.style.color = '#38bdf8';
      }
    });

    document.getElementById('closeMockApiPanel').addEventListener('click', () => {
      panel.style.display = 'none';
      toggleBtn.style.background = 'linear-gradient(135deg, #0f172a, #1e293b)';
      toggleBtn.style.color = '#38bdf8';
    });

    // Event Listeners for Selector changes
    const resourceSelect = document.getElementById('mockResourceSelector');
    const actionSelect = document.getElementById('mockActionSelector');

    resourceSelect.addEventListener('change', updatePreview);
    actionSelect.addEventListener('change', updatePreview);

    function updatePreview() {
      const resource = resourceSelect.value;
      const action = actionSelect.value;
      
      const endpoint = window.getEndpointDraft ? window.getEndpointDraft(`GET_${resource.toUpperCase().replace('-', '_')}`) || `/api/v1/${resource}` : `/api/v1/${resource}`;
      document.getElementById('mockEndpoint').innerText = action === 'GET' ? endpoint : `/api/v1/actions/finalize`;

      // Get RBAC requirement from enterprise-security.js if loaded
      let requiredRole = 'READ_ONLY_AUDITOR';
      if (window.SECURITY_ACTIONS && window.getRequiredRoleForAction) {
        const actionKey = `PREVIEW_${resource.toUpperCase().replace('-', '_')}`;
        const secAction = window.SECURITY_ACTIONS[actionKey];
        if (secAction) {
          requiredRole = window.getRequiredRoleForAction(secAction);
        }
      }
      document.getElementById('mockRbac').innerText = requiredRole;

      // Call mock api runtime
      if (window.getMockApiResponse) {
        const response = window.getMockApiResponse(resource, {
          action: action,
          endpoint: action === 'GET' ? endpoint : '/api/v1/actions/finalize'
        });

        // Update UI
        const statusEl = document.getElementById('mockResponseStatus');
        statusEl.innerText = response.status;
        if (response.status === 'SUCCESS') {
          statusEl.style.color = '#34d399';
        } else if (response.status === 'BLOCKED') {
          statusEl.style.color = '#f87171';
        } else {
          statusEl.style.color = '#fbbf24';
        }

        document.getElementById('mockJsonResponse').innerText = JSON.stringify(response, null, 2);

        // Update Audit Log
        if (window.getMockAuditPreview) {
          const auditEvent = window.getMockAuditPreview(resource, action, requiredRole);
          document.getElementById('mockAuditPreview').innerText = JSON.stringify(auditEvent, null, 2);
        }
      } else {
        document.getElementById('mockJsonResponse').innerText = '// Mock API Runtime not loaded.';
      }
    }
  });
})();
