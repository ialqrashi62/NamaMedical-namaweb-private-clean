const fs = require('fs');
const path = require('path');

const root = __dirname;
const doctorJs = fs.readFileSync(path.join(root, 'public/js/doctor-station.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public/css/styles.css'), 'utf8');

const checks = [
  {
    name: 'Doctor Station keeps one active orders section',
    pass: doctorJs.includes('activeOrderSection') &&
      doctorJs.includes('window.dsApplyOrdersAccordion') &&
      doctorJs.includes("document.querySelectorAll('#dsOrdersContent .ds-order-section')"),
  },
  {
    name: 'Orders panel has consent section and stable data-section hooks',
    pass: doctorJs.includes('data-section="diagnosis"') &&
      doctorJs.includes('data-section="consent"') &&
      doctorJs.includes("window.dsCreateConsentFromStation"),
  },
  {
    name: 'Doctor chart includes medical consents tab',
    pass: doctorJs.includes("id: 'consents'") &&
      doctorJs.includes("case 'consents':") &&
      doctorJs.includes('window.dsTabConsents(content)'),
  },
  {
    name: 'Consent workflow supports create, list, sign modal, and signature submit',
    pass: doctorJs.includes('window.dsTabConsents') &&
      doctorJs.includes('window.dsOpenConsentSignModal') &&
      doctorJs.includes('window.dsInitConsentSignatureCanvas') &&
      doctorJs.includes('window.dsSignConsentFromStation') &&
      doctorJs.includes('/api/consent-forms/templates/list') &&
      doctorJs.includes('/api/consent-forms'),
  },
  {
    name: 'Orders accordion and consent modal CSS are present',
    pass: css.includes('.ds-order-section.collapsed .ds-order-section-body') &&
      css.includes('.ds-consent-modal') &&
      css.includes('.ds-consent-card') &&
      css.includes('grid-template-columns: minmax(260px, 300px) minmax(0, 1fr) minmax(320px, 360px)'),
  },
];

const failed = checks.filter(c => !c.pass);
if (failed.length) {
  console.error('Doctor Station UI static checks failed:');
  failed.forEach(c => console.error(`- ${c.name}`));
  process.exit(1);
}

console.log(`Doctor Station UI static checks passed (${checks.length}/${checks.length}).`);
