'use strict';
// Load Tester — simple in-memory concurrent request simulator.
class LoadTester {
  constructor(opts = {}) {
    this.concurrency = opts.concurrency || 10;
    this.iterations = opts.iterations || 100;
  }

  async run({ fn }) {
    const results = { ok: 0, fail: 0, latencies: [] };
    const start = Date.now();
    let i = 0;
    const workers = [];
    for (let w = 0; w < this.concurrency; w++) {
      workers.push((async () => {
        while (i < this.iterations) {
          const idx = i++;
          if (idx >= this.iterations) break;
          const s = Date.now();
          try {
            await fn(idx);
            results.ok++;
            results.latencies.push(Date.now() - s);
          } catch (e) {
            results.fail++;
          }
        }
      })());
    }
    await Promise.all(workers);
    results.total = results.iterations;
    results.elapsedMs = Date.now() - start;
    results.p50 = this._percentile(results.latencies, 50);
    results.p95 = this._percentile(results.latencies, 95);
    results.p99 = this._percentile(results.latencies, 99);
    return results;
  }

  _percentile(arr, p) {
    if (!arr.length) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const idx = Math.floor(sorted.length * (p / 100));
    return sorted[Math.min(idx, sorted.length - 1)];
  }
}

module.exports = { LoadTester };
