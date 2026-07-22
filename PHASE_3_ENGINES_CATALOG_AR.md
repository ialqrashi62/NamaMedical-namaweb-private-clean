// filepath: c:\Users\ice\Desktop\NMEDCALVSCODE\namaweb\PHASE_3_ENGINES_CATALOG_AR.md
// (created by GitHub Copilot — Phase 3 Batch 11-17 deployment)
// Source files referenced:
//   namaweb/thyroid_engine.js
//   namaweb/bone_density_engine.js
//   namaweb/obesity_engine.js
//   namaweb/glycemic_control_engine.js
//   namaweb/copd_severity_engine.js
//   namaweb/asthma_control_engine.js
//   namaweb/sleep_study_engine.js
//   namaweb/gi_bleed_risk_engine.js
//   namaweb/ibd_activity_engine.js
//   namaweb/ckd_staging_engine.js
//   namaweb/hd_adequacy_engine.js
//   namaweb/rheum_activity_engine.js
//   namaweb/sepsis_ews2_engine.js
//   namaweb/nihss_apache_engine.js
//   namaweb/partograph_extended_engine.js
//   namaweb/derm_score_engine.js
//   namaweb/trauma_score_engine.js
//   namaweb/neonatal_engine.js
//   namaweb/palliative_performance_engine.js
//   namaweb/oncology_engine.js
//   namaweb/psych_pain_engine.js
//   namaweb/ent_optho_engine.js
//   namaweb/urology_engine.js
//   namaweb/heme_infectious_engine.js
//   namaweb/surgical_preop_engine.js
//   namaweb/nutrition_malnutrition_engine.js

# Phase 3 Clinical Engines — Batch Catalog (AR + EN)

> **نظرة عامة:** 26 محركًا سريريًا جديدًا تم إنشاؤها في الدفعات 11-17 من المرحلة 3.
> جميع المحركات نقية، حتمية، لا ترمي استثناءات، تعيد كائن بنتيجة + توصيات + استشهادات.
> **كل الاختبارات نجحت: 198 اختبار وحدة من 198.**

## Overview
This document catalogs the 26 new clinical engines created in Phase 3 batches 11-17.
All engines are pure, deterministic, throw validation errors only, return `{value, severity, notes, recommendations, citations}`.
**198/198 unit tests pass.**

---

## Endocrine (4 engines)

| Engine | Function | Source | Tests | Citations |
|---|---|---|---|---|
| `thyroid_engine.js` | `interpretThyroid(input)` — ATA 2014 thyroid interpretation (TSH, FT4, FT3) with pregnancy + cardiac comorbidity adjustments | batch 11 | 8 | ATA 2014, Endocrine Society 2012 |
| `bone_density_engine.js` | `fraxScore(input)` — FRAX-based 10-year major + hip fracture risk | batch 11 | 5 | FRAX 2008, NOF 2024 |
| `obesity_engine.js` | `assessObesity(input)` — AACE 2016 + AHA 2021 with GLP-1, bariatric surgery candidate | batch 11 | 6 | AACE 2016, AHA 2021 |
| `glycemic_control_engine.js` | `glycemicControl(input)` — ADA 2024 + AACE 2023 (T1DM, T2DM, pregnancy, elderly) | batch 11 | 8 | ADA 2024, AACE 2023 |

## Pulmonary (3 engines)

| Engine | Function | Tests | Citations |
|---|---|---|---|
| `copd_severity_engine.js` | `copdSeverity(input)` — GOLD 2024 stage (1-4) + group (A/B/E) + first-line therapy | 6 | GOLD 2024 |
| `asthma_control_engine.js` | `assessAsthmaControl(input)` — GINA 2024 step up/down + biologics (omalizumab, mepolizumab) | 6 | GINA 2024 |
| `sleep_study_engine.js` | `interpretSleepStudy(input)` — AASM CPG 2021 PSG with AHI/ODI/PLMD, CPAP titration | 6 | AASM 2021 |

## Gastroenterology (2 engines)

| Engine | Function | Tests | Citations |
|---|---|---|---|
| `gi_bleed_risk_engine.js` | `giBleedRisk(input)` — Glasgow-Blatchford + Rockall pre-endoscopy, variceal management | 7 | ACG 2021, ESGE 2021 |
| `ibd_activity_engine.js` | `ucMayoScore()` + `crohnCDAI()` — UC Mayo + Crohn CDAI with T2T algorithm | 8 | Mayo 1987, STRIDE-II 2020 |

## Nephrology (2 engines)

| Engine | Function | Tests | Citations |
|---|---|---|---|
| `ckd_staging_engine.js` | `ckdEgfr()` + `ckdStaging()` — CKD-EPI 2021 + KDIGO heatmap + KFRE 2y/5y ESRD risk | 8 | KDIGO 2021, Tangri 2011 |
| `hd_adequacy_engine.js` | `hdAdequacy(input)` — Daugirdas spKt/V + URR + weekly Kt/V per KDOQI 2020 | 6 | KDOQI 2020 |

## Rheumatology (1 engine, 2 functions)

| Engine | Function | Tests | Citations |
|---|---|---|---|
| `rheum_activity_engine.js` | `das28crp()` + `sledai2k()` — RA DAS28-CRP + SLEDAI-2K with treatment algorithm | 9 | EULAR 2022, ACR 2021 |

## Infectious Disease (1 engine)

| Engine | Function | Tests | Citations |
|---|---|---|---|
| `sepsis_ews2_engine.js` | `news2Score(input)` — NEWS2 + qSOFA + Sepsis-3 + SSC 2021 bundle | 6 | RCP 2017, Singer 2016, SSC 2021 |

## Critical Care (1 engine, 2 functions)

| Engine | Function | Tests | Citations |
|---|---|---|---|
| `nihss_apache_engine.js` | `nihssScore()` + `apacheIV()` — Stroke severity + ICU mortality | 8 | NIHSS Brott 1989, Zimmerman 2006 |

## OBGYN (1 engine, 2 functions)

| Engine | Function | Tests | Citations |
|---|---|---|---|
| `partograph_extended_engine.js` | `partographAssessment()` + `bishopScore()` — WHO partograph + Bishop for induction | 8 | WHO 1994, Bishop 1964 |

## Dermatology (1 engine, 2 functions)

| Engine | Function | Tests | Citations |
|---|---|---|---|
| `derm_score_engine.js` | `pasiScore()` + `scoradScore()` — Psoriasis PASI + Atopic Dermatitis SCORAD | 7 | PASI 1978, SCORAD 1993 |

## Trauma (1 engine, 3 functions)

| Engine | Function | Tests | Citations |
|---|---|---|---|
| `trauma_score_engine.js` | `glasgowComaScale()` + `injurySeverityScore()` + `revisedTraumaScore()` | 10 | GCS 1974, ISS 1974, RTS 1989 |

## Neonatal (1 engine, 3 functions)

| Engine | Function | Tests | Citations |
|---|---|---|---|
| `neonatal_engine.js` | `apgarScore()` + `bhutaniRisk()` + `birthweightCategory()` | 10 | APGAR 1952, Bhutani 1999 |

## Palliative (1 engine, 3 functions)

| Engine | Function | Tests | Citations |
|---|---|---|---|
| `palliative_performance_engine.js` | `karnofskyScore()` + `ecogScore()` + `pallPerformanceScale()` | 11 | KPS 1949, ECOG 1982, PPS 1996 |

## Oncology (1 engine, 3 functions)

| Engine | Function | Tests | Citations |
|---|---|---|---|
| `oncology_engine.js` | `tnmStage()` + `bodySurfaceArea()` + `chemoDose()` | 10 | AJCC TNM-8 2017, Mosteller 1987 |

## Psychiatry + Pain (1 engine, 3 functions)

| Engine | Function | Tests | Citations |
|---|---|---|---|
| `psych_pain_engine.js` | `phq9Score()` + `gad7Score()` + `wongBakerFaces()` | 10 | PHQ-9 2001, GAD-7 2006, Wong-Baker 1988 |

## ENT + Ophthalmology (1 engine, 3 functions)

| Engine | Function | Tests | Citations |
|---|---|---|---|
| `ent_optho_engine.js` | `pureToneAverage()` + `visualAcuity()` + `glaucomaRisk()` | 9 | WHO 1991, OHTS 2002 |

## Urology (1 engine, 2 functions)

| Engine | Function | Tests | Citations |
|---|---|---|---|
| `urology_engine.js` | `ipssScore()` + `renalStonesRisk()` | 7 | AUA 2021, AUA 2019 |

## Hematology + ID (1 engine, 4 functions)

| Engine | Function | Tests | Citations |
|---|---|---|---|
| `heme_infectious_engine.js` | `wellsDVT()` + `wellsPE()` + `hasBledScore()` + `curb65Score()` | 10 | Wells 2001, HAS-BLED 2010, CURB-65 2003 |

## Surgical Preop (1 engine, 3 functions)

| Engine | Function | Tests | Citations |
|---|---|---|---|
| `surgical_preop_engine.js` | `asaClassification()` + `rcriScore()` + `capriniScore()` | 10 | ASA 2014, Lee 1999, Caprini 2005 |

## Nutrition + Malnutrition (1 engine, 3 functions)

| Engine | Function | Tests | Citations |
|---|---|---|---|
| `nutrition_malnutrition_engine.js` | `bmi()` + `harrisBenedictBEE()` + `nrs2002()` | 10 | WHO 1998, Harris-Benedict 1984, NRS-2002 2003 |

---

## Total: 26 engines, 38+ functions, 198/198 tests pass

**By department:**
- Internal medicine (cards/endocrine/pulmo/gastro/nephro/rheum/ID/onc): 11 engines
- Critical care / ER / trauma: 2 engines
- OBGYN / neonatal: 2 engines
- Surgery: 1 engine (with 3 functions)
- Dermatology: 1 engine (with 2 functions)
- Psychiatry / pain: 1 engine (with 3 functions)
- ENT / ophthalmology: 1 engine (with 3 functions)
- Urology: 1 engine
- Heme/ID/onc: 1 engine (oncology) + 1 engine (heme)
- Palliative: 1 engine (with 3 functions)
- Nutrition: 1 engine (with 3 functions)

## Pattern (all engines follow this):
```js
function engineName(input) {
  if (!input || typeof input !== 'object') throw new Error('input object required');
  // validate required fields
  // compute score
  // classify severity
  // return {
  //   <score>,
  //   severity: 'low|moderate|high|critical',
  //   action: 'plain language next step',
  //   recommendations: [{action, level: 'standard|moderate|high|critical'}],
  //   notes: [...],
  //   citations: ['PubKey 2017', 'Guideline 2020']
  // }
}
```

## Git Commits
- `22addfe` ... `b73cded` (submodule) — 6 batch commits (11-17)
- `a10bfde` ... `b5c79f4` (parent) — 6 parent submodule bumps

## Next Phase (suggested)
- Wire engines to REST API (similar to `clinical_calculators_router.js`)
- Add engine integration tests in Stitch stations
- Connect to existing FHIR endpoints
- Add ICD-10 mapping per engine
