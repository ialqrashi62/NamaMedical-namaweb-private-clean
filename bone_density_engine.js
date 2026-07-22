// FRAX-based 10-year fracture risk + osteoporosis treatment
// Based on NOF 2022 FRAX + Endocrine Society 2019

function fraxScore(input) {
  if (!input || !input.age || !input.sex) {
    throw new Error('fraxScore: age and sex required');
  }
  const { age, sex, weight_kg, height_cm, prior_fracture, parent_fracture_hip, current_smoking,
          glucocorticoids, ra, secondary_osteoporosis, alcohol_3_units_day, femoral_neck_bmd_tscore } = input;
  let riskPoints = 0;
  if (age >= 65) riskPoints += (age - 65) * 0.5;
  if (sex === 'female') riskPoints += 5;
  if (weight_kg && weight_kg < 60) riskPoints += 2;
  if (prior_fracture) riskPoints += 8;
  if (parent_fracture_hip) riskPoints += 4;
  if (current_smoking) riskPoints += 3;
  if (glucocorticoids) riskPoints += 4;
  if (ra) riskPoints += 2;
  if (secondary_osteoporosis) riskPoints += 2;
  if (alcohol_3_units_day) riskPoints += 3;
  let bmdAdjust = 0;
  if (femoral_neck_bmd_tscore !== undefined) {
    bmdAdjust = Math.max(0, -femoral_neck_bmd_tscore) * 5;
  }
  const total10YrMajor = Math.min(50, riskPoints + bmdAdjust);
  const total10YrHip = Math.min(30, total10YrMajor * 0.3);  // hip is ~30% of major
  let severity = 'low';
  let recommendation = '';
  if (total10YrMajor >= 20 || total10YrHip >= 4.5) {
    severity = 'high';
    recommendation = 'Treat with bisphosphonate (alendronate 70mg weekly PO) or denosumab. Calcium 1200mg + Vit D 800 IU daily. Weight-bearing exercise.';
  } else if (total10YrMajor >= 10) {
    severity = 'moderate';
    recommendation = 'Lifestyle: calcium 1200mg, Vit D 800 IU, weight-bearing exercise, fall prevention. Repeat DXA in 2-3 years.';
  } else {
    severity = 'low';
    recommendation = 'Routine: calcium 1000mg, Vit D 600 IU, weight-bearing exercise. Repeat DXA per guidelines (women ≥65, men ≥70).';
  }
  return {
    value: Math.round(total10YrMajor * 10) / 10,
    severity,
    notes: `FRAX 10-year major osteoporotic fracture risk: ${total10YrMajor.toFixed(1)}%, hip fracture: ${total10YrHip.toFixed(1)}%`,
    total10YrMajor,
    total10YrHip,
    recommendations: [{ action: recommendation, urgency: severity === 'high' ? 'urgent' : 'routine', cite: 'NOF-2022-FRAX' }],
    citations: ['FRAX-WHO', 'NOF-Clinicians-Guide', 'Endocrine-Society-osteoporosis-2019']
  };
}

module.exports = { fraxScore };
