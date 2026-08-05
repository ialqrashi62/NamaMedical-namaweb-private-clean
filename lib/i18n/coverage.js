'use strict';
// i18n coverage scanner — counts keys, missing locales, generates matrix.

const fs = require('fs');
const path = require('path');

const Coverage = {};

Coverage.scan = function ({ sourceDir, dictionary, locales = ['en-US', 'ar-SA', 'fr-FR', 'ur-PK'] } = {}) {
  const dictPath = path.isAbsolute(dictionary) ? dictionary : path.resolve(process.cwd(), dictionary);
  const dict = JSON.parse(fs.readFileSync(dictPath, 'utf8'));
  const total = Object.keys(dict).length;
  const perLocale = {};
  const missing = {};
  for (const loc of locales) {
    perLocale[loc] = 0;
    missing[loc] = [];
    for (const k of Object.keys(dict)) {
      if (dict[k] && dict[k][loc]) {
        perLocale[loc]++;
      } else {
        missing[loc].push(k);
      }
    }
  }
  const coverage = ((perLocale[locales[0]] || total) / total * 100).toFixed(0) + '%';
  return { total, perLocale, missing, coverage, locales };
};

Coverage.matrix = function (report) {
  if (!report || !report.perLocale) return 'invalid report';
  const rows = Object.keys(report.perLocale).map((loc) => `${loc}: ${report.perLocale[loc]}/${report.total}`);
  return `${report.coverage} (${rows.join(', ')})`;
};

Coverage.listMissing = function (report, locale) {
  if (!report || !report.missing) return [];
  return report.missing[locale] || [];
};

Coverage.fixDictionary = function ({ dictionary, fillSource, locales, dryRun = false } = {}) {
  const dictPath = path.isAbsolute(dictionary) ? dictionary : path.resolve(process.cwd(), dictionary);
  const dict = JSON.parse(fs.readFileSync(dictPath, 'utf8'));
  const source = fillSource || {};
  let added = 0;
  for (const k of Object.keys(dict)) {
    for (const loc of locales || ['ar-SA', 'fr-FR', 'ur-PK']) {
      if (!dict[k][loc] && source[k] && source[k][loc]) {
        dict[k][loc] = source[k][loc];
        added++;
      }
    }
  }
  if (!dryRun) {
    fs.writeFileSync(dictPath, JSON.stringify(dict, null, 2));
  }
  return { added, total: Object.keys(dict).length };
};

module.exports = Coverage;