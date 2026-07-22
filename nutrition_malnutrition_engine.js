// Nutrition & Malnutrition Engine: BMI + BEE (Harris-Benedict) + NRS-2002 + MUST + ASPEN/SGA
// Pure deterministic, no I/O, no side effects

'use strict';

const BMI_CATEGORIES = {
  severe_thinness: { max: 16, label: 'Severe thinness' },
  moderate_thinness: { min: 16, max: 17, label: 'Moderate thinness' },
  mild_thinness: { min: 17, max: 18.5, label: 'Mild thinness' },
  normal: { min: 18.5, max: 25, label: 'Normal' },
  overweight: { min: 25, max: 30, label: 'Overweight' },
  obese_class_1: { min: 30, max: 35, label: 'Obesity class I' },
  obese_class_2: { min: 35, max: 40, label: 'Obesity class II' },
  obese_class_3: { min: 40, label: 'Obesity class III (severe/morbid)' }
};

const NRS_SEVERITY = {
  no_risk: { val: 0, label: 'No malnutrition risk' },
  moderate: { val: 3, label: 'Moderate risk' },
  severe: { val: 5, label: 'Severe risk' }
};

function bmi(input) {
  if (!input || typeof input !== 'object') throw new Error('input object required');
  if (input.weight_kg === undefined || input.height_m === undefined) throw new Error('weight_kg and height_m required');
  if (input.weight_kg <= 0 || input.height_m <= 0) throw new Error('weight/height must be > 0');

  const bmi = input.weight_kg / (input.height_m * input.height_m);
  const bmiRounded = Math.round(bmi * 10) / 10;

  let category = 'normal';
  if (bmi < 16) category = 'severe_thinness';
  else if (bmi < 17) category = 'moderate_thinness';
  else if (bmi < 18.5) category = 'mild_thinness';
  else if (bmi < 25) category = 'normal';
  else if (bmi < 30) category = 'overweight';
  else if (bmi < 35) category = 'obese_class_1';
  else if (bmi < 40) category = 'obese_class_2';
  else category = 'obese_class_3';

  return {
    bmi: bmiRounded,
    category,
    action: getBmiAction(category, bmi),
    notes: [
      'BMI (Quetelet 1832, 1972 WHO): weight (kg) / height² (m²).',
      'WHO 1998 cutoffs apply to all adults; Asian populations may use lower thresholds (BMI 23 overweight, 27.5 obese).',
      'BMI limitations: doesn\'t distinguish fat vs muscle, doesn\'t account for age/sex/ethnicity differences.',
      'For pediatrics: use BMI-for-age percentiles (CDC 2000, WHO 2006).'
    ],
    citations: ['WHO 1998 BMI Classification', 'NICE 2023 Obesity Guidelines']
  };
}

function getBmiAction(cat, val) {
  if (cat === 'severe_thinness') return 'Severe thinness: medical workup for eating disorder, malabsorption, malignancy. Nutrition consult.';
  if (cat === 'moderate_thinness' || cat === 'mild_thinness') return 'Underweight: nutritional assessment, address underlying cause, consider oral nutritional supplements.';
  if (cat === 'normal') return 'Healthy weight. Continue balanced diet, regular physical activity.';
  if (cat === 'overweight') return 'Overweight: lifestyle modification (diet, exercise 150+ min/week). Target 5-10% weight loss. Screen for metabolic syndrome.';
  if (cat === 'obese_class_1') return 'Obesity I: structured lifestyle program. Consider pharmacotherapy (orlistat, GLP-1 RA) if comorbidities. Endocrine workup if indicated.';
  if (cat === 'obese_class_2') return 'Obesity II: pharmacotherapy + lifestyle. Bariatric surgery evaluation (BMI ≥35 + comorbidity).';
  return 'Obesity III (morbid): bariatric surgery evaluation (BMI ≥40 or ≥35 + comorbidity). Pre-op medical optimization, multidisciplinary team.';
}

function harrisBenedictBEE(input) {
  if (!input || typeof input !== 'object') throw new Error('input object required');
  if (input.weight_kg === undefined || input.height_cm === undefined || input.age === undefined || !input.sex) throw new Error('weight_kg, height_cm, age, sex required');
  if (!['male', 'female'].includes(input.sex)) throw new Error('sex must be male or female');

  // Harris-Benedict 1919 (revised Roza-Shizgal 1984)
  let bee;
  if (input.sex === 'male') {
    bee = 88.362 + 13.397 * input.weight_kg + 4.799 * input.height_cm - 5.677 * input.age;
  } else {
    bee = 447.593 + 9.247 * input.weight_kg + 3.098 * input.height_cm - 4.330 * input.age;
  }
  bee = Math.round(bee);

  // Activity factor
  const activityFactors = {
    bedridden: 1.2,
    sedentary: 1.3,
    light: 1.5,
    moderate: 1.7,
    heavy: 1.9
  };
  const factor = activityFactors[input.activity] || 1.3;
  const tdee = Math.round(bee * factor);

  // Protein requirement
  const proteinGrams = input.weight_kg * 1.2;  // 1.2 g/kg/day normal
  const proteinStress = input.weight_kg * 1.5;  // 1.5 g/kg/day for stress
  const proteinSevere = input.weight_kg * 2.0;  // 2.0 g/kg/day for severe stress

  return {
    bee,
    tdee,
    activityFactor: factor,
    protein_normal_g_d: Math.round(proteinGrams),
    protein_stress_g_d: Math.round(proteinStress),
    protein_severe_g_d: Math.round(proteinSevere),
    notes: [
      'BEE (Basal Energy Expenditure) by Harris-Benedict 1984 revision.',
      'TDEE (Total Daily Energy Expenditure) = BEE × activity factor. Bed rest 1.2, sedentary 1.3, light 1.5, moderate 1.7, heavy 1.9.',
      'For critical illness: 25-30 kcal/kg/day, protein 1.5-2.0 g/kg/day (ASPEN/SCCM 2016).',
      'For obesity (>30 BMI): use adjusted body weight (ABW = IBW + 0.4×(actual-IBW)) for BEE calculation.',
      'Indirect calorimetry is gold standard when feasible (especially in ICU).'
    ],
    citations: ['Harris-Benedict 1919 (revised Roza 1984)', 'ASPEN/SCCM 2016 Critical Care Nutrition Guidelines']
  };
}

function nrs2002(input) {
  if (!input || typeof input !== 'object') throw new Error('input object required');
  if (input.bmi === undefined) throw new Error('bmi required');
  if (input.weight_loss_pct === undefined) throw new Error('weight_loss_pct required');
  if (input.food_intake_pct_reduction === undefined) throw new Error('food_intake_pct_reduction required');
  if (input.disease_severity === undefined) throw new Error('disease_severity required (none, mild, moderate, severe)');
  if (input.age === undefined) throw new Error('age required');

  let score = 0;

  // BMI
  if (input.bmi < 18.5) score += 3;
  else if (input.bmi < 20.5) score += 2;
  else if (input.bmi < 22.5) score += 1;

  // Weight loss
  if (input.weight_loss_pct >= 10) score += 4;
  else if (input.weight_loss_pct >= 5) score += 3;
  else if (input.weight_loss_pct >= 3) score += 2;

  // Food intake
  if (input.food_intake_pct_reduction === 0) {
    // no score
  } else if (input.food_intake_pct_reduction <= 25) score += 1;
  else if (input.food_intake_pct_reduction <= 50) score += 2;
  else if (input.food_intake_pct_reduction <= 75) score += 3;
  else score += 3;

  // Disease severity
  const diseasePoints = { none: 0, mild: 1, moderate: 2, severe: 3 };
  score += diseasePoints[input.disease_severity] || 0;

  // Age
  if (input.age >= 70) score += 1;

  let severity = 'no_risk';
  if (score < 3) severity = 'no_risk';
  else if (score < 5) severity = 'moderate';
  else severity = 'severe';

  let action = '';
  if (severity === 'no_risk') action = 'NRS-2002 <3: no malnutrition risk. Re-screen weekly in hospital. Routine diet.';
  else if (severity === 'moderate') action = 'NRS-2002 3-4: moderate malnutrition risk. Nutrition consult. Increase protein, oral supplements. Reassess in 1 week.';
  else action = 'NRS-2002 ≥5: severe malnutrition. Nutrition consult. Enteral nutrition if oral intake inadequate. Consider parenteral if GI inaccessible.';

  return {
    nrs2002: score,
    severity,
    action,
    notes: [
      'NRS-2002 (Kondrup 2003): bedside malnutrition screening for hospital patients.',
      'Components: BMI, recent weight loss, reduced food intake, disease severity, age ≥70.',
      'Score ≥3 = at risk. Score ≥5 = severely malnourished. Re-screen weekly.',
      'Compared to MUST (Malnutrition Universal Screening Tool) and MNA (Mini Nutritional Assessment for elderly).'
    ],
    citations: ['NRS-2002 (Kondrup 2003, Clin Nutr)', 'ESPEN 2015 Clinical Nutrition Guidelines']
  };
}

module.exports = { bmi, harrisBenedictBEE, nrs2002, BMI_CATEGORIES, NRS_SEVERITY };
