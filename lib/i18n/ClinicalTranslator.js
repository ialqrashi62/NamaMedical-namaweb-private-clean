'use strict';
// Clinical translator — translates drug names and vitals across locales.

function newClinicalTranslator() {
  const drugs = {
    paracetamol: { 'en-US': 'Paracetamol', 'ar-SA': 'باراسيتامول', 'fr-FR': 'Paracétamol', 'ur-PK': 'پیراسیٹامول' },
    amoxicillin: { 'en-US': 'Amoxicillin', 'ar-SA': 'أموكسيسيلين', 'fr-FR': 'Amoxicilline', 'ur-PK': 'اموکسیسیلن' },
  };
  const vitals = {
    sbp: { 'en-US': 'Systolic BP', 'ar-SA': 'الضغط الانقباضي', 'fr-FR': 'PAS', 'ur-PK': 'سسٹولک بلڈ پریشر' },
    hr: { 'en-US': 'Heart Rate', 'ar-SA': 'معدل النبض', 'fr-FR': 'FC', 'ur-PK': 'دل کی دھڑکن' },
  };
  function drug(name, locale) {
    const k = String(name).toLowerCase();
    return (drugs[k] && drugs[k][locale]) || name;
  }
  function vital(code, locale) {
    return (vitals[code] && vitals[code][locale]) || code;
  }
  return { drug, vital };
}

module.exports = { newClinicalTranslator };
