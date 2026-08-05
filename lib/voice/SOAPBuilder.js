'use strict';
// SOAP note builder — structures a transcript into Subjective/Objective/Asmt/Plan.

function newSOAPBuilder() {
  function build({ transcript }) {
    if (!transcript) throw new Error('TRANSCRIPT_REQUIRED');
    // Naive section split by keywords.
    const sub = [];
    const obj = [];
    const asmt = [];
    const plan = [];
    const map = (line) => {
      const l = line.toLowerCase();
      if (l.startsWith('s:') || l.includes('patient reports')) sub.push(line);
      else if (l.startsWith('o:') || l.includes('bp ') || l.includes('hr ')) obj.push(line);
      else if (l.startsWith('a:') || l.includes('assessment')) asmt.push(line);
      else if (l.startsWith('p:') || l.includes('plan')) plan.push(line);
      else sub.push(line);
    };
    for (const l of transcript.split('\n')) map(l);
    return { subjective: sub, objective: obj, assessment: asmt, plan };
  }
  return { build };
}

module.exports = { newSOAPBuilder };
