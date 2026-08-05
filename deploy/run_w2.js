const H = require('./hetzner');
const files = [
  'lib/mobile/pushNotification.js','lib/mobile/deviceRegistry.js','lib/mobile/mobileApi.js','routes/mobile.js',
  'lib/telehealth/sfu.js','lib/telehealth/session.js','lib/telehealth/consent.js','routes/telehealth.js',
  'lib/genomic/variants.js','lib/genomic/storage.js','lib/genomic/report.js','routes/genomic.js',
  'lib/pharmacy/usp.js','lib/pharmacy/storage.js','lib/pharmacy/compounder.js','routes/compounding.js',
  'lib/cqm/measures.js','lib/cqm/qrda.js','lib/cqm/storage.js','routes/cqm.js',
  'lib/anesthesia/case.js','lib/anesthesia/oru.js','lib/anesthesia/storage.js','routes/anesthesia.js',
  'lib/cardiology/templates.js','lib/cardiology/structuredReport.js','lib/cardiology/storage.js','routes/cardiology.js',
  'lib/tumorBoard/scheduler.js','lib/tumorBoard/presentation.js','lib/tumorBoard/storage.js','routes/tumorBoard.js',
  'lib/denial/classifier.js','lib/denial/appealTemplate.js','lib/denial/worklist.js','routes/denial.js',
  'lib/homeHealth/scheduler.js','lib/homeHealth/storage.js','lib/homeHealth/offlineSync.js','routes/homeHealth.js',
];
console.log('files:', files.length);
const r = H.deploy({
  host: '204.168.144.74',
  user: 'root',
  keyPath: 'C:\\Users\\ice\\.ssh\\nama_medical_key',
  remoteDir: '/var/www/namaweb',
  files,
  run: [
    "mkdir -p /var/www/namaweb/lib/mobile /var/www/namaweb/lib/telehealth /var/www/namaweb/lib/genomic /var/www/namaweb/lib/pharmacy /var/www/namaweb/lib/cqm /var/www/namaweb/lib/anesthesia /var/www/namaweb/lib/cardiology /var/www/namaweb/lib/tumorBoard /var/www/namaweb/lib/denial /var/www/namaweb/lib/homeHealth",
    "cd /var/www/namaweb && pm2 reload nama-medical-erp --wait-ready 2>&1 || echo PM2_FAIL",
    "sleep 4",
    "curl -s -o /dev/null -w 'health: %{http_code}\\n' http://127.0.0.1:3000/health",
  ],
});
const okFiles = r.files.filter(x => x.ok).length;
console.log('files ok:', okFiles + '/' + r.files.length);
console.log('failed:');
r.files.filter(x => !x.ok).slice(0, 5).forEach(f => console.log(' ', f.file, ':', (f.err || '').split('\n')[0]));
r.commands.forEach(c => console.log((c.out || '').trim()));