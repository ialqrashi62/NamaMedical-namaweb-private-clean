'use strict';
// CDSS Knowledge Corpus — initial seed chunks for RAG.
// Each chunk is {id, source, kind, text, dept?, tenantSafe}.
//
// NOT PHI. None of these contain patient identifiers.
// These are PUBLIC clinical knowledge fragments, drug monographs, guidelines.

module.exports = [
  {
    id: 'cbc-001',
    source: 'UpToDate-stern-cell',
    kind: 'guideline',
    dept: 'HEME',
    tenantSafe: true,
    text: 'CBC findings in aplastic anemia: pancytopenia with hypocellular marrow <25% in absence of fibrosis or infiltrate.',
  },
  {
    id: 'cbc-002',
    source: 'NEJM-ardsnet-2000',
    kind: 'guideline',
    dept: 'PULM',
    tenantSafe: true,
    text: 'ARDSNet low tidal volume: 6 mL/kg PBW, plateau pressure <30 cmH2O. Reduces mortality vs traditional 12 mL/kg.',
  },
  {
    id: 'card-001',
    source: 'ACC-AHA-stemi-2013',
    kind: 'guideline',
    dept: 'CARD',
    tenantSafe: true,
    text: 'STEMI primary PCI: door-to-balloon <90 min if PCI-capable hospital; FMC-to-device <120 min if transferred. Aspirin 325 mg chewed on presentation. P2Y12 loading per risk.',
  },
  {
    id: 'card-002',
    source: 'Warfarin-DDI-Lexicomp',
    kind: 'drug-interaction',
    dept: 'CARD',
    tenantSafe: true,
    text: 'Warfarin + fluconazole: CYP2C9 inhibition increases INR 2-3x → bleeding risk. Use alternative antifungal (e.g. terbinafine) or warfarin dose reduction 30-50%.',
  },
  {
    id: 'obg-001',
    source: 'ACOG-pph-2017',
    kind: 'guideline',
    dept: 'OBG',
    tenantSafe: true,
    text: 'Postpartum hemorrhage: TXA 1g IV within 3h + uterine massage + uterotonics (oxytocin/misoprostol) + Bakri balloon if refractory. Activate massive transfusion early.',
  },
  {
    id: 'peds-001',
    source: 'NRP-8th-edition',
    kind: 'guideline',
    dept: 'PEDS',
    tenantSafe: true,
    text: 'Neonatal resuscitation (NRP): warm, dry, stimulate. HR <100 → PPV 21% O2 term / 21-30% preterm. HR <60 → chest compressions + epinephrine. Routine intubation not required.',
  },
  {
    id: 'icu-001',
    source: 'Surviving-Sepsis-2021',
    kind: 'guideline',
    dept: 'ICU',
    tenantSafe: true,
    text: 'Hour-1 bundle: lactate, blood cultures, broad-spectrum antibiotics, 30 mL/kg crystalloid for hypotension or lactate ≥4, vasopressors if MAP <65.',
  },
  {
    id: 'er-001',
    source: 'ATLS-10th-edition',
    kind: 'guideline',
    dept: 'ER',
    tenantSafe: true,
    text: 'Primary survey ABCDE: Airway with C-spine, Breathing, Circulation, Disability (neuro), Exposure. Address each before moving on.',
  },
  {
    id: 'pharm-001',
    source: 'SFDA-Drug-Safety',
    kind: 'drug-safety',
    dept: 'PHARM',
    tenantSafe: true,
    text: 'Pregnancy + warfarin (any trimester, but esp. 1st): major embryopathy risk. Use LMWH instead unless mechanical valve present.',
  },
  {
    id: 'pharm-002',
    source: 'SFDA-Drug-Safety',
    kind: 'drug-safety',
    dept: 'PHARM',
    tenantSafe: true,
    text: 'Penicillin allergy (true IgE-mediated): avoid all beta-lactams with R1 side chain (amoxicillin, ampicillin). Cephalosporins 3rd-gen generally safe; 1st-gen cautiously.',
  },
  {
    id: 'lab-001',
    source: 'Lab-Med-NEJM-2020',
    kind: 'reference',
    dept: 'LAB',
    tenantSafe: true,
    text: 'Reference range CBC: WBC 4.5-11.0 x10^3/uL; Hb 12-16 g/dL (women) / 13-17 g/dL (men); Platelets 150-450 x10^3/uL.',
  },
  {
    id: 'rad-001',
    source: 'ACR-Appropriateness-Criteria',
    kind: 'guideline',
    dept: 'RAD',
    tenantSafe: true,
    text: 'Acute stroke onset within 4.5h: non-contrast CT to exclude hemorrhage before IV thrombolytics. CTA + CT-perfusion if thrombectomy candidate (6-24h window for LVO).',
  },
];
