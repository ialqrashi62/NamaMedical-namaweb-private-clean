'use strict';
// Locale loader — looks up keys in ar-SA / en-US / fr-FR / ur-PK dictionaries.
// Missing keys fall back to en-US.

function newLocaleLoader() {
  const dict = {
    'en-US': { greeting: 'Hello', patient: 'Patient', doctor: 'Doctor' },
    'ar-SA': { greeting: 'مرحبا', patient: 'مريض', doctor: 'طبيب' },
    'fr-FR': { greeting: 'Bonjour', patient: 'Patient', doctor: 'Médecin' },
    'ur-PK': { greeting: 'ہیلو', patient: 'مریض', doctor: 'ڈاکٹر' },
  };
  function t(key, locale) {
    return (dict[locale] && dict[locale][key]) || dict['en-US'][key] || key;
  }
  return { t, _dict: dict };
}

module.exports = { newLocaleLoader };
