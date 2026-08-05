'use strict';
// RTL-aware grid helper. Applies dir=rtl when locale is ar-SA or ur-PK.
function applyDir(locale) {
  const rtl = ['ar-SA', 'ur-PK', 'fa-IR', 'he-IL'].includes(locale);
  document.documentElement.dir = rtl ? 'rtl' : 'ltr';
  document.documentElement.lang = locale;
}
window.applyDir = applyDir;
