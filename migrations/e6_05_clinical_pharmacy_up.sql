BEGIN;

-- Seed default drug-drug interactions
INSERT INTO drug_interactions (drug_a, drug_b, interaction_type, severity, description, clinical_action) VALUES
('Warfarin', 'Aspirin', 'Synergistic bleeding', 'High', 'Increased risk of bleeding due to combined anticoagulant and antiplatelet effects.', 'Avoid combination or monitor INR closely.'),
('ACE Inhibitors', 'Potassium', 'Hyperkalemia', 'High', 'Combination increases risk of severe hyperkalemia.', 'Monitor serum potassium levels regularly.'),
('Metformin', 'Contrast Dye', 'Lactic Acidosis', 'Moderate', 'Temporary renal dysfunction from contrast dye may cause metformin accumulation and lactic acidosis.', 'Hold metformin for 48 hours post-procedure.'),
('SSRIs', 'MAOIs', 'Serotonin Syndrome', 'High', 'Combination may cause life-threatening serotonin syndrome.', 'Contraindicated. Allow 14-day washout period between drugs.'),
('Statins', 'Macrolides', 'Myopathy/Rhabdomyolysis', 'Moderate', 'Macrolides inhibit CYP3A4, increasing statin levels and risk of muscle toxicity.', 'Temporarily suspend statin therapy during antibiotic course.'),
('NSAIDs', 'Anticoagulants', 'GI Bleeding', 'High', 'NSAIDs increase risk of gastrointestinal bleeding when used with anticoagulants.', 'Use alternative analgesics (e.g. acetaminophen) if possible.'),
('Digoxin', 'Amiodarone', 'Digoxin Toxicity', 'High', 'Amiodarone increases digoxin serum concentration, risking arrhythmias.', 'Reduce digoxin dose by 50% and monitor levels.'),
('Ciprofloxacin', 'Theophylline', 'Theophylline Toxicity', 'Moderate', 'Ciprofloxacin inhibits metabolism, increasing theophylline levels and toxicity risk.', 'Monitor theophylline levels and adjust dose.')
ON CONFLICT DO NOTHING;

COMMIT;
