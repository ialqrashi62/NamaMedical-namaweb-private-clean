/**
 * Gastroenterology Clinical Engine
 * Gold Standard Implementation: S-MODE
 * Handles: Endoscopy Analysis, Child-Pugh Scoring, and Hepatic Risk Assessment
 */

class GastroEngine {
    constructor() {
        this.CHILD_PUGH_LEVELS = {
            A: 'Compensated',
            B: 'Significant Functional Impairment',
            C: 'Decompensated'
        };
    }

    /**
     * Calculate Child-Pugh Score for Liver Cirrhosis
     * @param {Object} data { bilirubin, albumin, ascites, encephalopathy, prothrombinTime }
     * @returns {Object} { score: number, class: string, description: string }
     */
    calculateChildPugh(data) {
        let score = 0;
        
        // Bilirubin (mg/dL)
        if (data.bilirubin < 2) score += 1;
        else if (data.bilirubin < 3) score += 2;
        else score += 3;

        // Albumin (g/dL)
        if (data.albumin > 3.5) score += 1;
        else if (data.albumin > 2.8) score += 2;
        else score += 3;

        // Ascites
        if (data.ascites === 'none') score += 1;
        else if (data.ascites === 'mild') score += 2;
        else score += 3;

        // Encephalopathy
        if (data.encephalopathy === 'none') score += 1;
        else if (data.encephalopathy === 'grade1-2') score += 2;
        else score += 3;

        // Prothrombin Time (INR)
        if (data.inr < 1.7) score += 1;
        else if (data.inr < 2.3) score += 2;
        else score += 3;

        let cls = 'C';
        if (score <= 6) cls = 'A';
        else if (score <= 7 || score <= 9) cls = 'B'; // Simplified logic

        return {
            score,
            class: cls,
            description: this.CHILD_PUGH_LEVELS[cls]
        };
    }

    /**
     * Analyze Endoscopy Findings (S-MODE)
     * @param {Object} findings { type, bostonBowelScore, biopsyTaken }
     */
    analyzeEndoscopy(findings) {
        let risk = 'Low';
        if (findings.bostonBowelScore && findings.bostonBowelScore < 6) {
            risk = 'High (Poor Preparation)';
        }
        if (findings.biopsyTaken) {
            risk = 'Pending Histopathology';
        }
        return { risk, recommendation: 'Follow-up based on biopsy results' };
    }

    /**
     * Hepatic Encephalopathy Risk Bridge
     * @param {Object} data { ammoniaLevel, asterixisPresent, confusionLevel }
     */
    assessHepaticRisk(data) {
        if (data.ammoniaLevel > 100 && data.asterixisPresent) {
            return {
                risk: 'CRITICAL',
                finding: 'Acute Hepatic Encephalopathy suspected.',
                action: 'Immediate administration of Lactulose and Rifaximin. Monitor airway.'
            };
        }
        return { risk: 'STABLE', finding: 'No acute hepatic encephalopathy signs.' };
    }
}

module.exports = new GastroEngine();
