// ===== API Client =====
const API = {
    async request(url, options = {}) {
        const res = await fetch(url, {
            ...options,
            headers: { 'Content-Type': 'application/json', ...options.headers },
            credentials: 'same-origin'
        });
        if (res.status === 401) {
            window.location.href = '/login.html';
            throw new Error('Unauthorized');
        }
        return res.json();
    },
    get: (url) => API.request(url),
    post: (url, data) => API.request(url, { method: 'POST', body: JSON.stringify(data) }),
    put: (url, data) => API.request(url, { method: 'PUT', body: JSON.stringify(data) }),
    patch: (url, data) => API.request(url, { method: 'PATCH', body: JSON.stringify(data) }),
    del: (url) => API.request(url, { method: 'DELETE' }),
    delete: (url) => API.request(url, { method: 'DELETE' })
};
