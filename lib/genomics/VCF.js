'use strict';
// VCF parser — minimal. Parses lines starting with '#CHROM' as header; subsequent
// lines as records. Returns normalised objects.

function parseVCF(text) {
  if (typeof text !== 'string') throw new Error('VCF_TEXT_REQUIRED');
  const lines = text.split('\n').filter(l => l && !l.startsWith('##'));
  const header = lines.findIndex(l => l.startsWith('#CHROM'));
  if (header < 0) throw new Error('VCF_HEADER_MISSING');
  const cols = lines[header].split('\t');
  const records = [];
  for (let i = header + 1; i < lines.length; i++) {
    const f = lines[i].split('\t');
    const rec = {};
    cols.forEach((c, idx) => { rec[c] = f[idx]; });
    records.push(rec);
  }
  return { cols, records };
}

module.exports = { parseVCF };
