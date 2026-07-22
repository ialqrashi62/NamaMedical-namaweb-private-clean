// Obesity assessment + treatment algorithm
// Based on AACE 2016 + AHA 2021 + Endocrine Society 2015

const BMI_CATEGORIES = [
  { max: 18.5, category: 'underweight' },
  { max: 25, category: 'normal' },
  { max: 30, category: 'overweight' },
  { max: 35, category: 'obesity_1' },
  { max: 40, category: 'obesity_2' },
  { max: Infinity, category: 'obesity_3' }
];

function assessObesity(input) {
  if (!input || !input.weight_kg || !input.height_cm) {
    throw new Error('assessObesity: weight_kg and height_cm required');
  }
  const { weight_kg, height_cm, waist_cm, comorbidities = [], age, sex } = input;
  const heightM = height_cm / 100;
  const bmi = weight_kg / (heightM * heightM);
  const bmiCat = BMI_CATEGORIES.find(c => bmi < c.max);
  let waistElevated = false;
  if (sex === 'male' && waist_cm && waist_cm >= 102) waistElevated = true;
  if (sex === 'female' && waist_cm && waist_cm >= 88) waistElevated = true;
  let severity = bmiCat.category;
  if (bmiCat.category === 'obesity_1' && comorbidities.length > 0) severity = 'obesity_1_with_comorb';
  if (bmiCat.category === 'obesity_2' || bmiCat.category === 'obesity_3') severity = 'severe_obesity';
  const hasMetabolicSyndrome = (waistElevated && comorbidities.includes('htn')) ||
                                (waistElevated && comorbidities.includes('dm2')) ||
                                (comorbidities.includes('htn') && comorbidities.includes('dm2') && comorbidities.includes('dyslipidemia'));
  const recommendations = [];
  if (bmi >= 30 || (bmi >= 27 && comorbidities.length > 0)) {
    if (bmi >= 40 || (bmi >= 35 && comorbidities.length >= 2)) {
      recommendations.push({
        action: 'Candidate for bariatric surgery (sleeve gastrectomy or RYGB). Refer to Bariatric Center.',
        urgency: 'routine',
        cite: 'AACE-Obesity-2016'
      });
    } else if (bmi >= 30 || (bmi >= 27 && comorbidities.length > 0)) {
      recommendations.push({
        action: 'Consider pharmacotherapy: GLP-1 RA (semaglutide 2.4mg weekly SC) or tirzepatide 15mg weekly SC',
        urgency: 'routine',
        cite: 'AACE-Obesity-2016'
      });
    }
    recommendations.push({
      action: 'Lifestyle: 500-750 kcal/day deficit, ≥150 min/week aerobic + 2x/week resistance exercise',
      urgency: 'routine',
      cite: 'AHA-Obesity-2021'
    });
  } else if (bmi >= 25) {
    recommendations.push({
      action: 'Lifestyle: 500-750 kcal/day deficit, ≥150 min/week exercise, behavior therapy',
      urgency: 'routine',
      cite: 'AHA-Obesity-2021'
    });
  } else {
    recommendations.push({
      action: 'Maintain healthy weight. Continue current diet and exercise.',
      urgency: 'routine',
      cite: 'AHA-Obesity-2021'
    });
  }
  if (hasMetabolicSyndrome) {
    recommendations.push({
      action: 'Metabolic syndrome present — address each component (HTN, DM, dyslipidemia, central obesity)',
      urgency: 'urgent',
      cite: 'AHA-Metabolic-Syndrome'
    });
  }
  return {
    value: Math.round(bmi * 10) / 10,
    severity,
    notes: `BMI ${bmi.toFixed(1)} kg/m² (${bmiCat.category}). Waist circumference: ${waist_cm || 'N/A'} cm${waistElevated ? ' (elevated)' : ''}.`,
    bmi,
    bmiCategory: bmiCat.category,
    waistElevated,
    metabolicSyndrome: hasMetabolicSyndrome,
    recommendations,
    citations: ['AACE-Obesity-2016', 'AHA-Obesity-2021', 'Endocrine-Society-Obesity-2015']
  };
}

module.exports = { assessObesity, BMI_CATEGORIES };
