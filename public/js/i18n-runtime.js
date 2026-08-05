'use strict';
// i18n Runtime — loads medical_dictionary.json, applies AR/EN/FR/UR to any DOM tree.
// Picks right-to-left for ar-SA, ur-PK, fa-IR, he-IL.

const I18N = (() => {
  const RTL = ['ar-SA', 'ur-PK', 'fa-IR', 'he-IL'];
  const SUPPORTED = ['en-US', 'ar-SA', 'fr-FR', 'ur-PK'];
  let dict = null;
  let current = 'en-US';

  async function loadDict(path = '/i18n/medical_dictionary.json') {
    if (dict) return dict;
    try {
      const res = await fetch(path);
      dict = await res.json();
      return dict;
    } catch (e) {
      console.warn('[i18n] dict load failed, using inline fallback', e);
      dict = {};
      return dict;
    }
  }

  function t(key, lang = current) {
    if (!dict || !dict[key]) return key;
    return dict[key][lang] || dict[key]['en-US'] || key;
  }

  function setLang(lang) {
    if (!SUPPORTED.includes(lang)) lang = 'en-US';
    current = lang;
    document.documentElement.lang = lang;
    document.documentElement.dir = RTL.includes(lang) ? 'rtl' : 'ltr';
    document.dispatchEvent(new CustomEvent('i18n:change', { detail: { lang } }));
    try { localStorage.setItem('preferredLang', lang); } catch (_) {}
  }

  function getLang() {
    try { return localStorage.getItem('preferredLang') || current; } catch (_) { return current; }
  }

  function applyToDOM(root = document) {
    if (!dict) return;
    root.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n');
      const arabic = el.getAttribute('data-i18n-ar');
      const val = current === 'ar-SA' ? (arabic || t(key, 'ar-SA')) : t(key, current);
      if (val) el.textContent = val;
    });
    root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      const key = el.getAttribute('data-i18n-placeholder');
      const val = t(key, current);
      if (val) el.setAttribute('placeholder', val);
    });
  }

  // Augment any station snippet: convert snippet.title/titleAr → user-facing strings.
  function localizeSnippet(snippet, lang = current) {
    if (!snippet) return snippet;
    const isAr = lang === 'ar-SA';
    return {
      ...snippet,
      title: isAr ? (snippet.titleAr || snippet.title) : snippet.title,
      forms: (snippet.forms || []).map((f) => ({
        ...f,
        label: isAr ? (f.labelAr || f.label || f.name) : (f.label || f.name),
      })),
    };
  }

  return { loadDict, t, setLang, getLang, applyToDOM, localizeSnippet, SUPPORTED, RTL };
})();

window.I18N = I18N;
