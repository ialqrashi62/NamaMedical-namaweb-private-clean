// Endocrine engine: glycemic control assessment (T1DM/T2DM/pregnancy/elderly/frail)
// Based on ADA Standards of Care 2024 + AACE 2023

const TIR_TARGETS = {
  type1:         { tir_pct: 70, gmi_max: 7.0, hba1c_max: 7.0, time_below_70: 4, time_below_54: 1, label: 'T1DM adult' },
  type2_young:   { tir_pct: 70, gmi_max: 7.0, hba1c_max: 7.0, time_below_70: 4, time_below_54: 1, label: 'T2DM young adult' },
  type2_elderly: { tir_pct: 50, gmi_max: 8.0, hba1c_max: 8.0, time_below_70: 1, time_below_54: 1, label: 'T2DM elderly/frail' },
  pregnancy:     { tir_pct: 70, gmi_max: 6.5, hba1c_max: 6.5, time_below_70: 4, time_below_54: 1, label: 'Pregnancy' },
  frail:         { tir_pct: 50, gmi_max: 8.5, hba1c_max: 8.5, time_below_70: 1, time_below_54: 1, label: 'Frail/limited life expectancy' }
};

function glycemicControl(input) {
  if (!input || input.hba1c === undefined || input.tir_pct === undefined) {
    throw new Error('glycemicControl: hba1c and tir_pct required');
  }
  const base = TIR_TARGETS[input.type] || TIR_TARGETS.type2_young;
  const target = { ...base };
  if ((input.age && input.age > 75) || input.frail) {
    Object.assign(target, TIR_TARGETS.type2_elderly);
  }
  if (input.pregnant) {
    Object.assign(target, TIR_TARGETS.pregnancy);
  }
  const hba1cOnTarget = input.hba1c <= target.hba1c_max;
  const tirOnTarget = input.tir_pct >= target.tir_pct;
  const severeHypoOK = (input.time_below_54 || 0) <= target.time_below_54;
  let severity = 'normal';
  if (!hba1cOnTarget) severity = 'suboptimal';
  if (hba1cOnTarget && !tirOnTarget) severity = 'variability';
  if (input.hba1c > 9) severity = 'uncontrolled';
  if (input.hba1c > 11) severity = 'critical';
  if ((input.time_below_54 || 0) > target.time_below_54) severity = 'hypoglycemia-risk';
  const recommendations = [];
  if (!hba1cOnTarget) {
    recommendations.push({
      action: 'Intensify therapy — consider adding/upgrading GLP-1 RA or basal insulin',
      urgency: input.hba1c > 9 ? 'urgent' : 'routine',
      cite: 'ADA-2024-section-9'
    });
  }
  if (!tirOnTarget && hba1cOnTarget) {
    recommendations.push({
      action: 'Address glucose variability — consider CGM, insulin pump, or DPP-4 inhibitor',
      urgency: 'routine',
      cite: 'ADA-2024-section-7'
    });
  }
  if ((input.time_below_54 || 0) > target.time_below_54) {
    recommendations.push({
      action: 'Reduce hypoglycemia risk — review insulin doses, consider CGM alarm',
      urgency: 'urgent',
      cite: 'ADA-2024-section-6'
    });
  }
  if (input.egfr && input.egfr < 30) {
    recommendations.push({
      action: 'Renal dose adjustment needed for metformin and SGLT2i',
      urgency: 'routine',
      cite: 'ADA-2024-section-11'
    });
  }
  return {
    value: input.hba1c,
    severity,
    notes: `Target HbA1c ${target.hba1c_max}%. TIR target ${target.tir_pct}%. GMI max ${target.gmi_max}%.`,
    target,
    recommendations,
    citations: ['ADA-2024-standards-of-care', 'AACE-2023-algorithm']
  };
}

module.exports = { glycemicControl, TIR_TARGETS };
