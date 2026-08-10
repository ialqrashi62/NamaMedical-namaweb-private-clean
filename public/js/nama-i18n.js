// nama-i18n.js — Shared i18n loader (AR/EN switch)
// Loads /js/locales/<locale>.json and provides window.NamaT(key) translator.

const NamaI18n = (() => {
    let dict = {};
    let current = localStorage.getItem('nama.locale') || 'ar';
    const listeners = [];

    async function loadLocale(locale) {
        current = locale;
        try {
            const r = await fetch(`/js/locales/${locale}.json`, { credentials: 'same-origin' });
            dict = await r.json();
        } catch (_e) {
            dict = {};
        }
        localStorage.setItem('nama.locale', locale);
        document.documentElement.lang = locale;
        document.documentElement.dir  = locale === 'ar' ? 'rtl' : 'ltr';
        listeners.forEach(fn => fn(dict, locale));
    }

    function t(key, fallback) {
        const parts = key.split('.');
        let v = dict;
        for (const p of parts) {
            if (v && typeof v === 'object' && p in v) v = v[p]; else return fallback || key;
        }
        return typeof v === 'string' ? v : (fallback || key);
    }

    function onLoad(fn) { listeners.push(fn); }

    // Auto-load on first use
    loadLocale(current);

    return { t, loadLocale, current: () => current, onLoad };
})();

if (typeof window !== 'undefined') window.NamaT = (k, fb) => NamaI18n.t(k, fb);
