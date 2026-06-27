// seed_extra_catalog.js — Add comprehensive lab tests and radiology exams
const { pool } = require('./db_postgres');

async function addExtraLabTests() {
    const existing = (await pool.query('SELECT COUNT(*) as cnt FROM lab_tests_catalog')).rows[0].cnt;
    console.log(`  📊 Current lab tests: ${existing}`);

    const extraTests = [
        // ===== GENETICS / CYTOGENETICS =====
        ['Karyotype Analysis', 'Genetics', 'Normal 46,XX or 46,XY', 500],
        ['FISH (Fluorescence In Situ Hybridization)', 'Genetics', 'See report', 600],
        ['BRCA1/BRCA2 Gene Test', 'Genetics', 'No mutation detected', 1200],
        ['Cystic Fibrosis Gene Panel', 'Genetics', 'No mutation detected', 800],
        ['Hemoglobin S Gene Test', 'Genetics', 'Not detected', 400],
        ['Thalassemia Gene Panel', 'Genetics', 'Not detected', 600],
        ['Fragile X Syndrome Test', 'Genetics', 'Normal CGG repeats', 500],
        ['Prader-Willi/Angelman Syndrome', 'Genetics', 'Normal methylation', 600],
        ['Spinal Muscular Atrophy (SMA) Test', 'Genetics', 'Normal SMN1 copies', 500],
        ['Prenatal Cell-Free DNA (NIPT)', 'Genetics', 'Low risk', 1500],
        ['Newborn Screening Panel', 'Genetics', 'Normal', 300],
        ['Pharmacogenomics Panel', 'Genetics', 'See report', 800],
        ['Chromosomal Microarray', 'Genetics', 'Normal', 1000],
        ['Whole Exome Sequencing', 'Genetics', 'See report', 3000],
        ['Lynch Syndrome Panel (MLH1/MSH2/MSH6/PMS2)', 'Genetics', 'No mutation', 1000],
        ['Factor V Leiden Gene Test', 'Genetics', 'Not detected', 300],
        ['Prothrombin G20210A Mutation', 'Genetics', 'Not detected', 300],
        ['MTHFR Gene Mutation', 'Genetics', 'Not detected', 250],
        ['JAK2 V617F Mutation', 'Genetics', 'Not detected', 400],
        ['BCR-ABL Quantitative (CML)', 'Genetics', 'Not detected', 600],
        ['EGFR Mutation (Lung Cancer)', 'Genetics', 'Not detected', 500],
        ['BRAF V600E Mutation', 'Genetics', 'Not detected', 500],
        ['HER2/neu Gene Amplification', 'Genetics', 'Not amplified', 500],
        ['Microsatellite Instability (MSI)', 'Genetics', 'Stable', 400],
        ['PDL1 Expression', 'Genetics', 'See report', 400],
        ['Next-Gen Sequencing - Tumor Panel', 'Genetics', 'See report', 2500],
        ['FMR1 Gene Analysis', 'Genetics', 'Normal', 500],
        ['Duchenne/Becker Muscular Dystrophy', 'Genetics', 'Not detected', 600],
        ['Hereditary Breast/Ovarian Cancer Panel', 'Genetics', 'No mutation', 1500],
        ['Familial Hypercholesterolemia Panel', 'Genetics', 'No mutation', 800],

        // ===== DERMATOLOGY =====
        ['Skin Biopsy Pathology', 'Dermatology', 'See report', 300],
        ['Fungal Scrape (KOH Preparation)', 'Dermatology', 'Negative', 60],
        ['Nail Clipping Fungal Culture', 'Dermatology', 'No growth', 100],
        ['Woods Lamp Examination', 'Dermatology', 'Normal fluorescence', 50],
        ['Patch Test (Contact Allergy)', 'Dermatology', 'See results', 300],
        ['Tzanck Smear', 'Dermatology', 'No multinucleated giant cells', 80],
        ['Direct Immunofluorescence (DIF) - Skin', 'Dermatology', 'Negative', 400],
        ['Scabies Scraping', 'Dermatology', 'Negative', 60],

        // ===== ADDITIONAL MICROBIOLOGY =====
        ['GBS Culture (Group B Strep)', 'Microbiology', 'Negative', 100],
        ['Chlamydia PCR', 'Microbiology', 'Not detected', 200],
        ['Gonorrhea PCR', 'Microbiology', 'Not detected', 200],
        ['Chlamydia/Gonorrhea Combo PCR', 'Microbiology', 'Not detected', 250],
        ['Trichomonas PCR', 'Microbiology', 'Not detected', 150],
        ['BV (Bacterial Vaginosis) Panel', 'Microbiology', 'Negative', 150],
        ['Mycoplasma Culture', 'Microbiology', 'No growth', 150],
        ['Ureaplasma Culture', 'Microbiology', 'No growth', 150],
        ['Legionella Urinary Antigen', 'Microbiology', 'Negative', 150],
        ['Strep A Rapid Test', 'Microbiology', 'Negative', 50],
        ['Cryptococcal Antigen', 'Microbiology', 'Negative', 150],
        ['Aspergillus Galactomannan', 'Microbiology', 'Negative', 200],
        ['Beta-D-Glucan', 'Microbiology', '<60 pg/mL', 250],
        ['Parasite Blood Smear (Thick/Thin)', 'Microbiology', 'No parasites', 80],
        ['Pinworm Test (Scotch Tape)', 'Microbiology', 'Negative', 50],
        ['Giardia Antigen', 'Microbiology', 'Negative', 100],
        ['Clostridium botulinum Toxin', 'Microbiology', 'Not detected', 300],
        ['Norovirus PCR', 'Microbiology', 'Not detected', 200],
        ['Rotavirus Antigen', 'Microbiology', 'Negative', 100],
        ['Adenovirus Antigen', 'Microbiology', 'Negative', 100],

        // ===== ADDITIONAL ENDOCRINOLOGY =====
        ['Insulin Antibodies', 'Endocrinology', 'Negative', 200],
        ['Anti-GAD65 Antibodies', 'Endocrinology', '<5 U/mL', 200],
        ['IA-2 Antibodies', 'Endocrinology', 'Negative', 200],
        ['Fructosamine', 'Endocrinology', '200-285 umol/L', 100],
        ['1,25-Dihydroxy Vitamin D', 'Endocrinology', '18-72 pg/mL', 200],
        ['Catecholamines, Plasma', 'Endocrinology', 'See ranges', 250],
        ['24-Hour Urine Catecholamines', 'Endocrinology', 'See ranges', 250],
        ['24-Hour Urine 5-HIAA', 'Endocrinology', '2-8 mg/24hr', 200],
        ['24-Hour Urine Cortisol', 'Endocrinology', '10-100 mcg/24hr', 180],
        ['Renin Activity, Plasma', 'Endocrinology', '0.5-3.5 ng/mL/hr', 200],
        ['Aldosterone/Renin Ratio', 'Endocrinology', '<30', 250],
        ['17-OH Progesterone', 'Endocrinology', 'Age/sex-dependent', 150],
        ['Androstenedione', 'Endocrinology', 'Age/sex-dependent', 150],
        ['Sex Hormone Binding Globulin (SHBG)', 'Endocrinology', 'M:10-57 F:18-114 nmol/L', 150],
        ['Insulin-like Growth Factor Binding Protein 3', 'Endocrinology', 'Age-dependent', 200],
        ['Chromogranin A', 'Endocrinology', '<93 ng/mL', 200],
        ['Serotonin, Serum', 'Endocrinology', '50-200 ng/mL', 180],

        // ===== ADDITIONAL IMMUNOLOGY =====
        ['Cryoglobulins', 'Immunology', 'Negative', 200],
        ['Beta-2 Microglobulin', 'Immunology', '<2.0 mg/L', 150],
        ['Serum Free Light Chains', 'Immunology', 'Kappa:3.3-19.4 Lambda:5.7-26.3', 250],
        ['Immunofixation Electrophoresis (IFE)', 'Immunology', 'No monoclonal protein', 300],
        ['IgG Subclasses', 'Immunology', 'See ranges', 300],
        ['Mannose-Binding Lectin', 'Immunology', '>100 ng/mL', 200],
        ['CH50 (Total Complement)', 'Immunology', '60-144 CAE Units', 150],
        ['Anti-Cardiolipin Antibodies (IgG/IgM)', 'Immunology', '<20 GPL/MPL', 200],
        ['Anti-Beta2 Glycoprotein I', 'Immunology', '<20 U/mL', 200],
        ['Tissue Transglutaminase IgA', 'Immunology', '<20 U/mL', 150],
        ['Deamidated Gliadin Peptide', 'Immunology', '<20 U/mL', 150],

        // ===== ADDITIONAL CHEMISTRY =====
        ['Procalcitonin', 'Chemistry', '<0.1 ng/mL', 200],
        ['Presepsin', 'Chemistry', '<317 pg/mL', 250],
        ['Ceruloplasmin', 'Chemistry', '20-35 mg/dL', 120],
        ['Copper, 24-Hour Urine', 'Chemistry', '<40 mcg/24hr', 150],
        ['Alpha-1 Antitrypsin', 'Chemistry', '100-200 mg/dL', 150],
        ['Angiotensin Converting Enzyme (ACE)', 'Chemistry', '8-52 U/L', 150],
        ['Osmolality, Serum', 'Chemistry', '275-295 mOsm/kg', 80],
        ['Osmolality, Urine', 'Chemistry', '300-900 mOsm/kg', 80],
        ['Specific Gravity, Urine', 'Chemistry', '1.005-1.030', 30],
        ['Cystatin C', 'Chemistry', '0.55-1.15 mg/L', 200],
        ['Bile Acids, Total', 'Chemistry', '<10 umol/L', 150],
        ['Galactose-1-Phosphate', 'Chemistry', '<1 mg/dL', 200],
        ['Pyruvate', 'Chemistry', '0.3-0.9 mg/dL', 100],
        ['Organic Acids, Urine', 'Chemistry', 'Normal pattern', 400],
        ['Amino Acids, Plasma Panel', 'Chemistry', 'Normal pattern', 400],
        ['Carnitine Profile', 'Chemistry', 'Normal pattern', 300],
        ['Acylcarnitine Profile', 'Chemistry', 'Normal pattern', 350],
        ['Biotinidase Activity', 'Chemistry', '>5.0 nmol/min/mL', 200],
        ['Sweat Chloride Test', 'Chemistry', '<30 mmol/L normal', 150],

        // ===== POINT OF CARE =====
        ['Rapid Strep A Test', 'Point of Care', 'Negative', 40],
        ['Rapid Flu A/B Test', 'Point of Care', 'Negative', 60],
        ['Rapid RSV Test', 'Point of Care', 'Negative', 60],
        ['Urine Pregnancy Test (hCG)', 'Point of Care', 'Negative', 30],
        ['Rapid HIV Test', 'Point of Care', 'Non-reactive', 50],
        ['Rapid Dengue IgG/IgM', 'Point of Care', 'Negative', 80],
        ['Blood Glucose (Fingerstick)', 'Point of Care', '70-140 mg/dL', 20],
        ['Hemoglobin A1c (Point of Care)', 'Point of Care', '<5.7%', 50],
        ['INR (Point of Care)', 'Point of Care', '0.8-1.1', 40],
        ['Troponin I (Point of Care)', 'Point of Care', '<0.04 ng/mL', 80],
        ['CRP (Point of Care)', 'Point of Care', '<3 mg/L', 40],
        ['D-Dimer (Point of Care)', 'Point of Care', '<0.5 mg/L', 80],
        ['Procalcitonin (Point of Care)', 'Point of Care', '<0.1 ng/mL', 100],
        ['Lactate (Point of Care)', 'Point of Care', '<2.2 mmol/L', 50],

        // ===== ADDITIONAL HEMATOLOGY =====
        ['Osmotic Fragility Test', 'Hematology', 'Normal', 150],
        ['Platelet Function Assay (PFA-100)', 'Hematology', 'Col/EPI <165s Col/ADP <120s', 200],
        ['Bone Marrow Biopsy/Aspirate', 'Hematology', 'See report', 500],
        ['Flow Cytometry - Leukemia Panel', 'Hematology', 'See report', 500],
        ['Hemoglobin HPLC', 'Hematology', 'Normal pattern', 200],
        ['Heinz Body Preparation', 'Hematology', 'Negative', 80],
        ['Ham Test (Acidified Serum)', 'Hematology', 'Negative', 150],
        ['Sugar Water Test', 'Hematology', 'Negative', 80],
        ['Methemoglobin Level', 'Hematology', '<1.5%', 100],
        ['Carboxyhemoglobin', 'Hematology', '<3% non-smoker', 100],
        ['RBC Folate', 'Hematology', '>280 ng/mL', 120],
        ['Immature Platelet Fraction', 'Hematology', '1.1-6.1%', 100],
        ['Thromboelastography (TEG)', 'Hematology', 'See report', 300],

        // ===== THERAPEUTIC DRUG MONITORING =====
        ['Phenytoin Level', 'Therapeutic Drug Monitoring', '10-20 mcg/mL', 120],
        ['Carbamazepine Level', 'Therapeutic Drug Monitoring', '4-12 mcg/mL', 120],
        ['Valproic Acid Level', 'Therapeutic Drug Monitoring', '50-125 mcg/mL', 120],
        ['Phenobarbital Level', 'Therapeutic Drug Monitoring', '15-40 mcg/mL', 120],
        ['Lamotrigine Level', 'Therapeutic Drug Monitoring', '2.5-15 mcg/mL', 150],
        ['Levetiracetam Level', 'Therapeutic Drug Monitoring', '12-46 mcg/mL', 150],
        ['Gentamicin Level (Peak/Trough)', 'Therapeutic Drug Monitoring', 'Peak:5-10 Trough:<2', 150],
        ['Amikacin Level', 'Therapeutic Drug Monitoring', 'Peak:20-30 Trough:<8', 150],
        ['Cyclosporine Level', 'Therapeutic Drug Monitoring', '100-400 ng/mL', 200],
        ['Sirolimus Level', 'Therapeutic Drug Monitoring', '4-12 ng/mL', 200],
        ['Mycophenolate Level', 'Therapeutic Drug Monitoring', '1-3.5 mg/L', 200],
        ['Theophylline Level', 'Therapeutic Drug Monitoring', '10-20 mcg/mL', 120],
        ['Methotrexate Level', 'Therapeutic Drug Monitoring', 'Time-dependent', 200],
        ['Salicylate Level', 'Therapeutic Drug Monitoring', '15-30 mg/dL', 80],

        // ===== ADDITIONAL TUMOR MARKERS =====
        ['HE4 (Ovarian)', 'Tumor Markers', '<140 pmol/L premenopausal', 200],
        ['ROMA Index', 'Tumor Markers', 'See interpretation', 250],
        ['Thyroglobulin', 'Tumor Markers', '<40 ng/mL', 150],
        ['SCC Antigen', 'Tumor Markers', '<2.0 ng/mL', 150],
        ['CYFRA 21-1', 'Tumor Markers', '<3.3 ng/mL', 150],
        ['S-100 Protein', 'Tumor Markers', '<0.12 mcg/L', 200],
        ['Lactate Dehydrogenase (LDH) Isoenzymes', 'Tumor Markers', 'See pattern', 200],
        ['Free PSA / Total PSA Ratio', 'Tumor Markers', '>25% low risk', 150],
        ['PCA3 Urine Test', 'Tumor Markers', '<25 normal', 400],
        ['Pepsinogen I/II', 'Tumor Markers', 'PGI/PGII >3', 200],

        // ===== ADDITIONAL ALLERGY =====
        ['Specific IgE - Cockroach', 'Allergy', '<0.35 kU/L', 120],
        ['Specific IgE - Dog Dander', 'Allergy', '<0.35 kU/L', 120],
        ['Specific IgE - Mold Mix', 'Allergy', '<0.35 kU/L', 120],
        ['Specific IgE - Tree Pollen Mix', 'Allergy', '<0.35 kU/L', 120],
        ['Specific IgE - Weed Pollen', 'Allergy', '<0.35 kU/L', 120],
        ['Specific IgE - Latex', 'Allergy', '<0.35 kU/L', 120],
        ['Specific IgE - Fish', 'Allergy', '<0.35 kU/L', 120],
        ['Specific IgE - Shellfish', 'Allergy', '<0.35 kU/L', 120],
        ['Specific IgE - Soy', 'Allergy', '<0.35 kU/L', 120],
        ['Specific IgE - Sesame', 'Allergy', '<0.35 kU/L', 120],
        ['Specific IgE - Bee Venom', 'Allergy', '<0.35 kU/L', 120],
        ['Specific IgE - Wasp Venom', 'Allergy', '<0.35 kU/L', 120],
        ['Comprehensive Food Panel (20+ items)', 'Allergy', 'See components', 600],
        ['Comprehensive Inhalant Panel (20+ items)', 'Allergy', 'See components', 600],
        ['Drug Allergy - Penicillin IgE', 'Allergy', '<0.35 kU/L', 120],
        ['Drug Allergy - Cephalosporin IgE', 'Allergy', '<0.35 kU/L', 120],
        ['Tryptase (Mast Cell Activation)', 'Allergy', '<11.4 ng/mL', 200],
        ['Eosinophil Cationic Protein', 'Allergy', '<24 mcg/L', 150],

        // ===== ADDITIONAL INFECTIOUS DISEASE =====
        ['Hepatitis A IgM', 'Infectious Disease', 'Negative', 80],
        ['Hepatitis A Total Antibody', 'Infectious Disease', 'See interpretation', 80],
        ['Hepatitis B e-Antigen', 'Infectious Disease', 'Negative', 80],
        ['Hepatitis B e-Antibody', 'Infectious Disease', 'See interpretation', 80],
        ['Hepatitis D Antibody', 'Infectious Disease', 'Negative', 100],
        ['Hepatitis E IgM', 'Infectious Disease', 'Negative', 100],
        ['Herpes Simplex IgG Type 1', 'Infectious Disease', 'See interpretation', 100],
        ['Herpes Simplex IgG Type 2', 'Infectious Disease', 'See interpretation', 100],
        ['Herpes Simplex PCR', 'Infectious Disease', 'Not detected', 200],
        ['Parvovirus B19 IgM', 'Infectious Disease', 'Negative', 120],
        ['Leishmania Antibody', 'Infectious Disease', 'Negative', 150],
        ['Schistosoma Antibody', 'Infectious Disease', 'Negative', 100],
        ['Echinococcus Antibody', 'Infectious Disease', 'Negative', 120],
        ['Lyme Disease Antibody (IgG/IgM)', 'Infectious Disease', 'Negative', 200],
        ['Q Fever Antibody', 'Infectious Disease', 'Negative', 150],
        ['Rickettsial Antibody Panel', 'Infectious Disease', 'Negative', 200],
        ['Chikungunya Antibody', 'Infectious Disease', 'Negative', 150],
        ['Zika Virus IgM', 'Infectious Disease', 'Negative', 200],
        ['HTLV I/II Antibody', 'Infectious Disease', 'Non-reactive', 150],
    ];

    if (parseInt(existing) >= 400) {
        console.log('  ✅ Lab catalog already has sufficient tests');
        return;
    }

    const client = await pool.connect();
    let added = 0;
    try {
        await client.query('BEGIN');
        for (const [n, c, r, p] of extraTests) {
            const exists = (await client.query('SELECT 1 FROM lab_tests_catalog WHERE test_name=$1', [n])).rows.length;
            if (!exists) {
                await client.query('INSERT INTO lab_tests_catalog (test_name,category,normal_range,price) VALUES ($1,$2,$3,$4)', [n, c, r, p]);
                added++;
            }
        }
        await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK'); console.error('Lab seed error:', e.message); } finally { client.release(); }
    const newTotal = (await pool.query('SELECT COUNT(*) as cnt FROM lab_tests_catalog')).rows[0].cnt;
    console.log(`  ✅ Added ${added} extra lab tests → Total: ${newTotal}`);
}

async function addExtraRadiology() {
    const existing = (await pool.query('SELECT COUNT(*) as cnt FROM radiology_catalog')).rows[0].cnt;
    console.log(`  📡 Current radiology exams: ${existing}`);

    const extraRads = [
        // ===== ADDITIONAL X-RAY =====
        ['X-Ray', 'X-Ray Sternum', '', 100],
        ['X-Ray', 'X-Ray Acromioclavicular Joint', '', 100],
        ['X-Ray', 'X-Ray Whole Spine (Scoliosis)', '', 200],
        ['X-Ray', 'X-Ray Bone Age (Left Hand)', '', 150],
        ['X-Ray', 'X-Ray Soft Tissue Neck (Lateral)', '', 100],
        ['X-Ray', 'X-Ray Mastoid (Towne View)', '', 120],
        ['X-Ray', 'X-Ray Orbit', '', 120],
        ['X-Ray', 'X-Ray Zygomatic Arch', '', 100],
        ['X-Ray', 'X-Ray TMJ', '', 120],
        ['X-Ray', 'X-Ray Both Hips (Frog Leg)', '', 150],
        ['X-Ray', 'X-Ray Leg Length (Scanogram)', '', 200],
        ['X-Ray', 'X-Ray Chest (AP Portable)', '', 100],
        ['X-Ray', 'X-Ray Chest (Decubitus)', '', 120],
        ['X-Ray', 'X-Ray Abdomen (Supine & Erect)', '', 150],
        ['X-Ray', 'X-Ray Calcaneus', '', 80],
        ['X-Ray', 'X-Ray Patella', '', 80],

        // ===== ADDITIONAL CT =====
        ['CT', 'CT Maxillofacial', '', 500],
        ['CT', 'CT Jaw (Dental CT / Cone Beam)', '', 400],
        ['CT', 'CT Chest/Abdomen/Pelvis (Triple Phase)', '', 1000],
        ['CT', 'CT Liver (Triple Phase)', '', 800],
        ['CT', 'CT Pancreas Protocol', '', 700],
        ['CT', 'CT Adrenal Protocol', '', 600],
        ['CT', 'CT Shoulder', '', 500],
        ['CT', 'CT Hip', '', 500],
        ['CT', 'CT Knee', '', 500],
        ['CT', 'CT Ankle/Foot', '', 500],
        ['CT', 'CT Wrist/Hand', '', 500],
        ['CT', 'CT Elbow', '', 500],
        ['CT', 'CT Calcium Scoring (Heart)', '', 500],
        ['CT', 'CT Perfusion - Brain (Stroke)', '', 1000],
        ['CT', 'CT Aortography', '', 900],
        ['CT', 'CT Whole Body (Trauma Protocol)', '', 1200],
        ['CT', 'CT Cisternography', '', 800],

        // ===== ADDITIONAL MRI =====
        ['MRI', 'MRI Plexus (Lumbosacral)', '', 800],
        ['MRI', 'MRI Peripheral Nerve', '', 800],
        ['MRI', 'MRI Rectal', '', 900],
        ['MRI', 'MRI Pancreas', '', 900],
        ['MRI', 'MRI Adrenal', '', 800],
        ['MRI', 'MRI Arthrogram - Shoulder', '', 1200],
        ['MRI', 'MRI Arthrogram - Hip', '', 1200],
        ['MRI', 'MRI Arthrogram - Wrist', '', 1200],
        ['MRI', 'MRI Diffusion Tensor Imaging (DTI)', '', 1200],
        ['MRI', 'MRI Spectroscopy (Brain)', '', 1500],
        ['MRI', 'MRI Functional (fMRI)', '', 1500],
        ['MRI', 'MRI Small Bowel', '', 900],
        ['MRI', 'MRI Defecography', '', 800],
        ['MRI', 'MRI Spleen', '', 800],
        ['MRI', 'MRI Whole Body (Screening)', '', 2000],
        ['MRI', 'MRA - Renal', '', 1000],
        ['MRI', 'MRA - Upper Limbs', '', 1000],
        ['MRI', 'MRA - Aorta', '', 1200],

        // ===== ADDITIONAL ULTRASOUND =====
        ['Ultrasound', 'US Appendix', '', 200],
        ['Ultrasound', 'US Gallbladder', '', 150],
        ['Ultrasound', 'US Liver', '', 150],
        ['Ultrasound', 'US Spleen', '', 150],
        ['Ultrasound', 'US Pancreas', '', 200],
        ['Ultrasound', 'US Lymph Nodes', '', 200],
        ['Ultrasound', 'US Salivary Glands', '', 200],
        ['Ultrasound', 'US Parathyroid', '', 200],
        ['Ultrasound', 'US Chest Wall', '', 150],
        ['Ultrasound', 'US Penile Doppler', '', 350],
        ['Ultrasound', 'US Transfontanelle', '', 250],
        ['Ultrasound', 'US Pyloric Stenosis', '', 200],
        ['Ultrasound', 'US Umbilical Doppler', '', 300],
        ['Ultrasound', 'US Uterine Artery Doppler', '', 300],
        ['Ultrasound', 'US Middle Cerebral Artery Doppler', '', 300],
        ['Ultrasound', 'US Biophysical Profile (BPP)', '', 300],
        ['Ultrasound', 'US Cervical Length', '', 200],
        ['Ultrasound', 'US Nuchal Translucency', '', 300],
        ['Ultrasound', 'US 4D/3D Obstetric', '', 400],
        ['Ultrasound', 'US Endoanal/Endorectal', '', 400],
        ['Ultrasound', 'US Guided Thyroid FNA', '', 500],
        ['Ultrasound', 'US Guided Breast FNA', '', 500],
        ['Ultrasound', 'US Guided Liver Biopsy', '', 600],
        ['Ultrasound', 'US Guided Renal Biopsy', '', 600],
        ['Ultrasound', 'Doppler - AV Fistula Mapping', '', 350],
        ['Ultrasound', 'Doppler - Abdominal Aorta', '', 300],
        ['Ultrasound', 'Doppler - Transcranial (TCD)', '', 400],

        // ===== ADDITIONAL SPECIAL PROCEDURES =====
        ['Mammography', 'Mammography with CAD (Computer-Aided)', '', 500],
        ['Mammography', 'Breast MRI Guided Biopsy', '', 1500],
        ['Mammography', 'Galactography', '', 400],
        ['Mammography', 'Ductography', '', 400],

        ['DEXA', 'DEXA Body Fat Analysis', '', 300],
        ['DEXA', 'DEXA Pediatric', '', 300],
        ['DEXA', 'DEXA Vertebral Fracture Assessment', '', 350],

        ['Echo', 'Dobutamine Stress Echo', '', 700],
        ['Echo', 'Contrast Echocardiography', '', 600],
        ['Echo', '3D Echocardiography', '', 600],
        ['Echo', 'Strain Echocardiography', '', 500],

        // ===== ADDITIONAL NUCLEAR MEDICINE =====
        ['Nuclear Medicine', 'WBC Labeled Scan (Infection)', '', 700],
        ['Nuclear Medicine', 'Octreotide Scan (Neuroendocrine)', '', 800],
        ['Nuclear Medicine', 'MIBG Scan', '', 800],
        ['Nuclear Medicine', 'Meckel Scan', '', 500],
        ['Nuclear Medicine', 'Lymphoscintigraphy', '', 600],
        ['Nuclear Medicine', 'Brain Perfusion SPECT', '', 800],
        ['Nuclear Medicine', 'DaTSCAN (Dopamine Transport)', '', 1500],
        ['Nuclear Medicine', 'I-131 Whole Body Scan', '', 700],
        ['Nuclear Medicine', 'I-131 Therapy (Thyroid)', '', 2000],
        ['Nuclear Medicine', 'Ra-223 Therapy (Bone Mets)', '', 5000],
        ['Nuclear Medicine', 'Lu-177 PSMA Therapy', '', 8000],
        ['Nuclear Medicine', 'Cisternography (CSF Leak)', '', 700],
        ['Nuclear Medicine', 'Salivary Gland Scintigraphy', '', 500],

        // ===== ADDITIONAL PET =====
        ['PET/CT', 'PET/CT (PSMA - Prostate)', '', 3500],
        ['PET/CT', 'PET/CT (Ga-68 DOTATATE - NET)', '', 3500],
        ['PET/CT', 'PET/CT (Amyloid Brain)', '', 3000],
        ['PET/CT', 'PET/CT (F-18 NaF Bone)', '', 2500],
        ['PET/CT', 'PET/MRI', '', 4000],

        // ===== ADDITIONAL INTERVENTIONAL =====
        ['Interventional', 'Transjugular Liver Biopsy', '', 3000],
        ['Interventional', 'Carotid Stenting', '', 8000],
        ['Interventional', 'Dialysis Access Creation', '', 3000],
        ['Interventional', 'Thrombolysis (IR)', '', 5000],
        ['Interventional', 'IVC Filter Placement', '', 4000],
        ['Interventional', 'IVC Filter Retrieval', '', 3000],
        ['Interventional', 'Thoracentesis (IR-guided)', '', 1000],
        ['Interventional', 'Paracentesis (IR-guided)', '', 1000],
        ['Interventional', 'Joint Injection (IR-guided)', '', 800],
        ['Interventional', 'Epidural Injection (IR-guided)', '', 1500],
        ['Interventional', 'Facet Joint Injection', '', 1500],
        ['Interventional', 'Nerve Block (IR-guided)', '', 1200],
        ['Interventional', 'Kyphoplasty', '', 6000],
        ['Interventional', 'Cryoablation', '', 5000],
        ['Interventional', 'Microwave Ablation', '', 5000],
        ['Interventional', 'Chemoembolization (TACE)', '', 8000],
        ['Interventional', 'Radioembolization (Y-90)', '', 10000],
        ['Interventional', 'Sclerotherapy', '', 2000],
        ['Interventional', 'Varicocele Embolization', '', 4000],
        ['Interventional', 'Pelvic Congestion Embolization', '', 5000],
    ];

    if (parseInt(existing) >= 280) {
        console.log('  ✅ Radiology catalog already has sufficient exams');
        return;
    }

    const client = await pool.connect();
    let added = 0;
    try {
        await client.query('BEGIN');
        for (const [m, n, t, p] of extraRads) {
            const exists = (await client.query('SELECT 1 FROM radiology_catalog WHERE exact_name=$1', [n])).rows.length;
            if (!exists) {
                await client.query('INSERT INTO radiology_catalog (modality,exact_name,default_template,price) VALUES ($1,$2,$3,$4)', [m, n, t, p]);
                added++;
            }
        }
        await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK'); console.error('Radiology seed error:', e.message); } finally { client.release(); }
    const newTotal = (await pool.query('SELECT COUNT(*) as cnt FROM radiology_catalog')).rows[0].cnt;
    console.log(`  ✅ Added ${added} extra radiology exams → Total: ${newTotal}`);
}

module.exports = { addExtraLabTests, addExtraRadiology };

// Run directly if executed
if (require.main === module) {
    (async () => {
        await addExtraLabTests();
        await addExtraRadiology();
        process.exit(0);
    })();
}
