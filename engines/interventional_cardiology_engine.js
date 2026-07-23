/**
 * Interventional Cardiology Engine - Cath Lab Logic
 * Part of the NamaMedical Enterprise Platform
 * 
 * Specialized logic for PCI, Stenting, and Hemodynamic monitoring.
 */

const interventionalCardiologyEngine = {
    /**
     * Calculate Door-to-Balloon (D2B) Time
     * @param {Date} doorTime - Time of arrival at hospital
     * @param {Date} balloonTime - Time of first balloon inflation
     * @returns {Object} Time delta and performance category
     */
    calculateD2BTime: (doorTime, balloonTime) => {
        const diffMs = new Date(balloonTime) - new Date(doorTime);
        const diffMin = Math.floor(diffMs / 60000);
        
        let category = 'Optimal';
        if (diffMin > 90) category = 'Sub-optimal (Exceeds 90min Guideline)';
        else if (diffMin > 60) category = 'Acceptable';

        return {
            minutes: diffMin,
            category,
            guideline: 'ACC/AHA STEMI Guidelines'
        };
    },

    /**
     * Contrast-Induced Nephropathy (CIN) Risk Assessment
     * @param {number} gfr - Glomerular Filtration Rate
     * @param {number} volumeMl - Planned contrast volume
     * @returns {Object} Risk level and hydration recommendation
     */
    assessCINRisk: (gfr, volumeMl) => {
        let risk = 'Low';
        let action = 'Standard hydration';

        if (gfr < 30) {
            risk = 'Critical';
            action = 'Aggressive pre- and post-procedure hydration; consider alternative imaging';
        } else if (gfr < 45 && volumeMl > 100) {
            risk = 'Moderate';
            action = 'Limit contrast volume; ensure adequate hydration';
        }

        return { risk, action };
    },

    /**
     * Stent Pressure Analysis (Post-Dilation)
     * @param {number} pressure - Measured pressure in mmHg
     * @returns {Object} Success status
     */
    analyzeStentPressure: (pressure) => {
        const isOptimal = pressure >= 14; // Standard target for optimal stent expansion
        return {
            isOptimal,
            status: isOptimal ? 'Optimal Expansion' : 'Under-expansion Risk',
            recommendation: isOptimal ? 'Proceed to closure' : 'Consider further dilation'
        };
    }
};

module.exports = interventionalCardiologyEngine;
