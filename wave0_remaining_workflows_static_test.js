const fs = require('fs');
const path = require('path');

const root = __dirname;
const appJs = fs.readFileSync(path.join(root, 'public/js/app.js'), 'utf8');
const serverJs = fs.readFileSync(path.join(root, 'server.js'), 'utf8');

const patientAccountsBlock = appJs.slice(
  appJs.indexOf('async function renderPatientAccounts'),
  appJs.indexOf('window.loadPatientAccount')
);

const checks = [
  {
    name: 'Patient Accounts defines search before invoking it',
    pass: patientAccountsBlock.indexOf('window.searchPatientAccounts = async') > -1 &&
      patientAccountsBlock.indexOf('await window.searchPatientAccounts();') >
        patientAccountsBlock.indexOf('window.searchPatientAccounts = async') &&
      !patientAccountsBlock.includes('\n  searchPatientAccounts();'),
  },
  {
    name: 'Doctor wait queue uses current exam_rooms columns',
    pass: serverJs.includes('COALESCE(r.name_ar, r.name_en, r.room_number) as exam_room_name') &&
      serverJs.includes('COALESCE(r.name_ar, r.name_en, r.room_number) AS room_name') &&
      serverJs.includes('p.insurance_policy_number AS insurance_number'),
  },
  {
    name: 'Optional lab/RIS/pharmacy/HR/CSSD reads degrade to empty arrays',
    pass: [
      '/api/lab/samples',
      '/api/lab/qc',
      '/api/radiology/worklist',
      '/api/pharmacy/batches',
      '/api/hr/leave-requests',
      '/api/cssd/trays',
    ].every(route => {
      const i = serverJs.indexOf(`app.get('${route}'`);
      const block = serverJs.slice(i, i + 1200);
      return i >= 0 && block.includes("e.code === '42P01'") && block.includes('return res.json([])');
    }),
  },
  {
    name: 'Legacy internal messages without tenant_id can still load sent mail',
    pass: serverJs.includes("app.get('/api/users'") &&
      serverJs.includes('im.sender_id AS from_user_id') &&
      serverJs.includes('im.receiver_id AS to_user_id') &&
      serverJs.includes('req.body.receiver_id || req.body.to_user_id') &&
      serverJs.includes("app.get('/api/messages/sent'") &&
      serverJs.includes("if (e.code === '42703')") &&
      serverJs.includes('WHERE m.sender_id=$1 ORDER BY m.created_at DESC'),
  },
];

const failed = checks.filter(c => !c.pass);
if (failed.length) {
  console.error('Remaining workflow static checks failed:');
  failed.forEach(c => console.error(`- ${c.name}`));
  process.exit(1);
}

console.log(`Remaining workflow static checks passed (${checks.length}/${checks.length}).`);
