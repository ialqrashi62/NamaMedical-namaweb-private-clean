'use strict';
const fs = require('fs');
const path = require('path');

// Inspect whether routes have absolute or relative paths
const mods = ['pgx','bi','voice','dr','trials','populationHealth','compliance','mobile','telehealth','genomic','compounding','salesforce','careplans','discharge','billing_v2','homeHealth','olap','portal','hl7v2','dicomweb'];
for (const m of mods) {
  try {
    const r = require(path.resolve('./routes/' + m));
    let stack = [];
    if (typeof r === 'function' && r.stack) stack = r.stack;
    else {
      for (const k of Object.keys(r)) {
        if (typeof r[k] === 'function' && r[k].stack) stack = r[k].stack;
        if (r[k] && r[k].router && r[k].router.stack) stack = r[k].router.stack;
      }
    }
    const samples = stack.filter(l => l.route).slice(0, 2).map(l => l.route.path);
    const abs = samples.length > 0 && samples[0].startsWith('/api');
    console.log(m + ': absolute=' + (abs ? 'YES (bug)' : 'NO') + ' samples=' + JSON.stringify(samples));
  } catch (e) {
    console.log(m + ': ERR ' + e.message.slice(0, 60));
  }
}