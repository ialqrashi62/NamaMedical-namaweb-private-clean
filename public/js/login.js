document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('loginBtn');
    const errEl = document.getElementById('errorMsg');
    
    // Premium loading state
    btn.disabled = true;
    btn.classList.add('loading', 'opacity-80', 'cursor-not-allowed');
    const originalText = btn.innerHTML;
    btn.innerHTML = `
        <svg class="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" style="margin-inline-end: 8px; display: inline-block;">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        جاري التحقق...
    `;
    errEl.classList.remove('show');
    errEl.classList.add('hidden');
    
    try {
        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: document.getElementById('username').value.trim(),
                password: document.getElementById('password').value.trim()
            })
        });
        const data = await res.json();
        if (data.success) {
            window.location.href = '/';
        } else {
            errEl.textContent = 'اسم المستخدم أو كلمة المرور غير صحيحة!';
            errEl.classList.add('show');
            errEl.classList.remove('hidden');
            btn.disabled = false;
            btn.classList.remove('loading', 'opacity-80', 'cursor-not-allowed');
            btn.innerHTML = originalText;
        }
    } catch (err) {
        errEl.textContent = 'خطأ في الاتصال بالخادم، يرجى المحاولة لاحقاً';
        errEl.classList.add('show');
        errEl.classList.remove('hidden');
        btn.disabled = false;
        btn.classList.remove('loading', 'opacity-80', 'cursor-not-allowed');
        btn.innerHTML = originalText;
    }
});

// Check if already logged in
fetch('/api/auth/me').then(r => r.json()).then(d => {
    if (d.user) window.location.href = '/';
}).catch(() => { });

// Load Theme
fetch('/api/settings').then(r => r.json()).then(s => {
    if (s.theme) document.documentElement.setAttribute('data-theme', s.theme);
}).catch(() => { });
