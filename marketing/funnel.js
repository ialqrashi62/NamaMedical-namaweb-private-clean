'use strict';
// Sales funnel — tracks visitor → trial → paid conversion. Pure in-memory.

function newFunnel() {
  const stats = { visitors: 0, trials: 0, paid: 0 };
  function visit() { stats.visitors += 1; }
  function trial() { stats.trials += 1; }
  function pay() { stats.paid += 1; }
  function conversions() {
    return {
      visitors: stats.visitors,
      trials: stats.trials,
      paid: stats.paid,
      trialRate: stats.visitors ? stats.trials / stats.visitors : 0,
      paidRate: stats.trials ? stats.paid / stats.trials : 0,
    };
  }
  return { visit, trial, pay, conversions };
}

module.exports = { newFunnel };
