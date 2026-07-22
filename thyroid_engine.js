// Thyroid function interpretation + levothyroxine dose
// Based on ATA 2014 + Endocrine Society 2014

const TSH_REF = { low: 0.4, high: 4.0 };
const FT4_REF = { low: 0.8, high: 1.8 };

function interpretThyroid(input) {
  if (!input || input.tsh === undefined) {
    throw new Error('interpretThyroid: tsh required');
  }
  const { tsh, ft4, age, pregnant, on_levothyroxine, weight_kg = 70, comorbid_heart = false } = input;
  let pattern = '';
  let severity = 'normal';
  let recommendation = '';
  if (tsh > TSH_REF.high && (ft4 === undefined || ft4 < FT4_REF.low)) {
    pattern = 'overt_hypothyroid';
    severity = 'high';
    if (!on_levothyroxine) {
      const startDose = pregnant ? 1.6 : (age > 60 || comorbid_heart ? 0.025 : 1.6);
      recommendation = `Start levothyroxine ${startDose} mcg/kg/day PO. Recheck TSH in 6-8 weeks.`;
    } else {
      const adjustDose = (age > 60 || comorbid_heart) ? 12.5 : 25;
      recommendation = `Increase levothyroxine by ${adjustDose} mcg/day. Recheck TSH in 6-8 weeks.`;
    }
  } else if (tsh > TSH_REF.high && ft4 !== undefined && ft4 >= FT4_REF.low) {
    pattern = 'subclinical_hypothyroid';
    severity = 'moderate';
    if (tsh > 10) {
      recommendation = 'Treat as overt hypothyroid — start levothyroxine';
    } else {
      recommendation = pregnant ? 'Treat with levothyroxine.' : 'Consider treatment if symptomatic or TPOAb positive. Recheck in 3-6 months.';
    }
  } else if (tsh < TSH_REF.low && ft4 !== undefined && ft4 > FT4_REF.high) {
    pattern = 'overt_hyperthyroid';
    severity = 'high';
    recommendation = 'Workup for hyperthyroidism (TRAb, thyroid U/S, radioiodine uptake). Refer to endocrinology.';
  } else if (tsh < TSH_REF.low && (ft4 === undefined || ft4 <= FT4_REF.high)) {
    pattern = 'subclinical_hyperthyroid';
    severity = 'moderate';
    recommendation = 'Recheck in 3-6 months. If persistent, workup for hyperthyroidism.';
  } else {
    pattern = 'euthyroid';
    severity = 'normal';
    recommendation = 'Continue current management. Routine annual TSH if on levothyroxine.';
  }
  if (pattern !== 'euthyroid' && comorbid_heart && tsh < TSH_REF.low) {
    recommendation += ' Consider beta-blocker for symptom control. Avoid anti-thyroid drugs until etiology confirmed.';
  }
  return {
    value: tsh,
    severity,
    notes: `TSH ${tsh} mIU/L, FT4 ${ft4 !== undefined ? ft4 : 'N/A'} ng/dL. Pattern: ${pattern}.`,
    pattern,
    recommendations: [{ action: recommendation, urgency: severity === 'high' ? 'urgent' : 'routine', cite: 'ATA-thyroid-2014' }],
    citations: ['ATA-thyroid-guidelines', 'Endocrine-Society-thyroid-2014']
  };
}

module.exports = { interpretThyroid, TSH_REF, FT4_REF };
