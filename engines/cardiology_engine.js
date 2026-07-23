/**
 * Cardiology Engine - General Cardiology Logic
 * Part of the NamaMedical Enterprise Platform
 * 
 * This engine handles clinical calculations, risk stratification, 
 * and data validation for General Cardiology.
 */

const cardiologyEngine = {
    /**
     * Calculate Heart Failure Risk based on EF% and comorbidities
     * @param {number} efPercentage - Ejection Fraction percentage
     * @param {Object} comorbidities - Patient comorbidities (diabetes, hypertension, etc.)
     * @returns {Object} Risk assessment
     */
    calculateHFRisk: (efPercentage, comorbidities = {}) => {
        let riskLevel = 'Low';
        let recommendation = 'Routine monitoring';

        if (efPercentage <= 40) {
            riskLevel = 'High (HFrEF)';
            recommendation = 'Initiate GDMT (Guideline-Directed Medical Therapy)';
        } else if (efPercentage <= 50) {
            riskLevel = 'Moderate (HFpEF/HFmrEF)';
            recommendation = 'Optimize blood pressure and fluid management';
        }

        if (comorbidities.diabetes || comorbidities.renalFailure) {
            riskLevel += ' - Complex';
            recommendation += ' - Close multidisciplinary follow-up required';
        }

        return {
            riskLevel,
            recommendation,
            timestamp: new Date().toISOString()
        };
    },

    /**
     * Validate ECG Interpretation against common patterns
     * @param {string} interpretation - The AI or Doctor's interpretation
     * @returns {boolean} Validity status
     */
    validateECGInterpretation: (interpretation) => {
        if (!interpretation || interpretation.length < 5) return false;
        // Basic check for medical keywords to ensure it's not junk data
        const keywords = ['sinus', 'rhythm', 'axis', 'st-elevation', 'block', 'tachycardia', 'bradycardia'];
        return keywords.some(word => interpretation.toLowerCase().includes(word));
    },

    /**
     * Calculate Contrast Volume Limit based on GFR (Glomerular Filtration Rate)
     * To prevent Contrast-Induced Nephropathy (CIN)
     * @param {number} gfr - Patient's GFR value
     * @returns {Object} Limit and warning
     */
    calculateContrastLimit: (gfr) => {
        if (gfr >= 60) return { limit: 'Standard', warning: 'No restriction' };
        if (gfr >= 30 && gfr < 60) return { limit: 'Moderate', warning: 'Limit contrast to < 100ml, ensure hydration' };
        if (gfr < 30) return { limit: 'Strict', warning: 'High risk of CIN. Consider alternative imaging or aggressive hydration' };
        return { limit: 'Unknown', warning: 'GFR missing. Do not proceed without manual review' };
    }
};

module.exports = cardiologyEngine;
