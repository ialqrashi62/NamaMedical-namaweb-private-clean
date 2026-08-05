'use strict';
// OLAP cube — by tenant/day. Dimensions: tenantId, day, dept
// Measures: enc, los (length of stay), rvu, denied

function newCube() {
  let data = [];
  function ingest(rows) {
    for (const r of rows) {
      const day = new Date(r.t).toISOString().slice(0, 10);
      data.push({ tenantId: r.tenantId, day, dept: r.dept, enc: r.enc || 0, los: r.los || 0, rvu: r.rvu || 0, denied: r.denied || 0 });
    }
  }
  function rollup({ tenantId, from, to }) {
    const byDay = {};
    for (const r of data) {
      if (r.tenantId !== tenantId) continue;
      if (from && r.day < from) continue;
      if (to && r.day > to) continue;
      if (!byDay[r.day]) byDay[r.day] = { day: r.day, enc: 0, los: 0, rvu: 0, denied: 0 };
      byDay[r.day].enc += r.enc;
      byDay[r.day].los += r.los;
      byDay[r.day].rvu += r.rvu;
      byDay[r.day].denied += r.denied;
    }
    return Object.values(byDay).sort((a, b) => a.day.localeCompare(b.day));
  }
  function kpi({ tenantId }) {
    const arr = rollup({ tenantId });
    return {
      encounters: arr.reduce((a, b) => a + b.enc, 0),
      avgLos: arr.length ? arr.reduce((a, b) => a + b.los, 0) / arr.reduce((a, b) => a + b.enc, 0) : 0,
      rvu: arr.reduce((a, b) => a + b.rvu, 0),
      denied: arr.reduce((a, b) => a + b.denied, 0),
    };
  }
  return { ingest, rollup, kpi, _data: () => data };
}

module.exports = { newCube };
