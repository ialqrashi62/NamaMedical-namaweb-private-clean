/**
 * Pulmonology Clinical Engine
 * Gold Standard Implementation: S-MODE
 * Handles: PFT Analysis, GOLD Criteria, Sleep Apnea Scoring, and Cardiology Bridge
 */

const { 
    // Assume these are available in the global scope or imported from a core utility
    // In a real implementation, we would import from ../utils/validation.js etc.
} = require('./utils/clinical_utils');

class PulmonologyEngine {
    constructor() {
        this.GOLD_CRITERIA = {
            STAGE_1: { minFev1: 80, label: 'Mild' },
            STAGE_2: { minFev1: 50, label: 'Moderate' },
            STAGE_3: { minFev1: 30, label: 'Severe' },
            STAGE_4: { minFev1: 0, label: 'Very Severe' }
        };
    }

    /**
     * Calculate GOLD Stage for COPD based on FEV1 % Predicted
     * @param {number} fev1Actual 
     * @param {number} fev1Predicted 
     * @returns {Object} { stage: string, label: string }
     */
    calculateGOLDStage(fev1Actual, fev1Predicted) {
        if (!fev1Actual || !fev1Predicted) throw new Error('Missing FEV1 data for GOLD calculation');
        
        const percentPredicted = (fev1Actual / fev1Predicted) * 100;
        
        if (percentPredicted >= 80) return { stage: 'GOLD 1', label: 'Mild' };
        if (percentPredicted >= 50) return { stage: 'GOLD 2', label: 'Moderate' };
        if (percentPredicted >= 30) return { stage: 'GOLD 3', label: 'Severe' };
        return { stage: 'GOLD 4', label: 'Very Severe' };
    }

    /**
     * Analyze PFT Results (Spirometry)
     * @param {Object} data { fev1Actual, fvcActual, fev1Predicted, fvcPredicted }
     */
    analyzeSpirometry(data) {
        const { fev1Actual, fvcActual, fev1Predicted, fvcPredicted } = data;
        const ratio = (fev1Actual / fvcActual);
        const percentPredicted = (fev1Actual / fev1Predicted) * 100;

        let interpretation = '';
        if (ratio < 0.7) {
            interpretation = 'Obstructive Pattern';
            const gold = this.calculateGOLDStage(fev1Actual, fev1Predicted);
            interpretation += ` (${gold.stage}: ${gold.label})`;
        } else if (percentPredicted < 80) {
            interpretation = 'Restrictive Pattern';
        } else {
            interpretation = 'Normal Spirometry';
        }

        return {
            ratio: ratio.toFixed(2),
            percentPredicted: percentPredicted.toFixed(2),
            interpretation,
            goldStage: ratio < 0.7 ? this.calculateGOLDStage(fev1Actual, fev1Predicted).stage : 'N/A'
        };
    }

    /**
     * Sleep Apnea Severity (AHI Index)
     * @param {number} ahi 
     */
    calculateSleepApneaSeverity(ahi) {
        if (ahi < 5) return 'Normal';
        if (ahi < 15) return 'Mild OSA';
        if (ahi < 30) return 'Moderate OSA';
        return 'Severe OSA';
    }

    /**
     * Cardiology Bridge: Cor Pulmonale Risk Assessment
     * Checks if pulmonary hypertension is likely causing right heart failure
     * @param {Object} pulmData { fev1, oxygenSat }
     * @param {Object} cardioData { rightVentriclePressure, ecgFindings }
     */
    assessCorPulmonaleRisk(pulmData, cardioData) {
        const isSeverePulm = pulmData.fev1 < 30; // Severe obstruction
        const isRightHeartStrained = cardioData.rightVentriclePressure > 25; // mmHg

        if (isSeverePulm && isRightHeartStrained) {
            return {
                risk: 'HIGH',
                finding: 'Strong evidence of Cor Pulmonale due to chronic pulmonary disease.',
                action: 'Immediate Cardiology Consultation for Right Heart Failure management.'
            };
        }
        return { risk: 'LOW', finding: 'No immediate evidence of Cor Pulmonale.' };
    }
}

module.exports = new PulmonologyEngine();
