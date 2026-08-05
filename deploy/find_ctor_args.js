const fs = require('fs');
const path = require('path');
const mods = ['pgx','bi','voice','dr','trials','populationHealth','mobile','telehealth','genomic','compounding','salesforce','compliance','homeHealth'];
for (const m of mods) {
  try {
    const x = require(path.resolve('./routes/' + m));
    const ctorName = Object.keys(x).find(k => typeof x[k] === 'function' && /^new/i.test(k));
    if (!ctorName) { console.log(m + ': no ctor'); continue; }
    const src = fs.readFileSync(path.resolve('./routes/' + m + '.js'), 'utf8');
    const m2 = src.match(new RegExp(ctorName + '\\s*\\(\\s*\\{([^}]{1,200})'));
    console.log(m + ': ' + (m2 ? m2[1].slice(0, 100).replace(/\n/g, ' ') : '?'));
  } catch (e) {
    console.log(m + ': ERR ' + e.message.slice(0, 80));
  }
}