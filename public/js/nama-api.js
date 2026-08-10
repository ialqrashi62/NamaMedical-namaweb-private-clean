// nama-api.js — Shared API client for all dept pages
// Token-saver: replaces ~50 lines per dept page with 4 calls (apiGet/apiPost/apiPut/apiDel)

const NamaApi = (() => {
    function getCookie(name) {
        const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
        return m ? decodeURIComponent(m[1]) : '';
    }
    function headers(extra) {
        const h = { 'Content-Type': 'application/json' };
        const t = (typeof window !== 'undefined' && window.NAMA_TENANT_ID) ||
                  (document.documentElement.dataset && document.documentElement.dataset.tenant) || '';
        if (t) h['X-Tenant-Id'] = t;
        if (extra) Object.assign(h, extra);
        return h;
    }
    async function send(method, path, body) {
        const opts = { method, headers: headers(), credentials: 'same-origin' };
        if (body !== undefined) opts.body = JSON.stringify(body);
        const r = await fetch(path, opts);
        const text = await r.text();
        let json;
        try { json = JSON.parse(text); } catch (_e) { json = { raw: text }; }
        if (!r.ok) throw new Error(json.error || r.statusText);
        return json;
    }
    return {
        apiGet:  (p)    => send('GET', p),
        apiPost: (p, b) => send('POST', p, b),
        apiPut:  (p, b) => send('PUT', p, b),
        apiDel:  (p)    => send('DELETE', p)
    };
})();

if (typeof window !== 'undefined') window.NamaApi = NamaApi;
