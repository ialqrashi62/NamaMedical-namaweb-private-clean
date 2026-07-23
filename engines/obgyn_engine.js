/**
 * OBGYN & Pediatrics Clinical Engine
 * Gold Standard Implementation: S-MODE
 * Handles: EDD Calculation, APGAR Scoring, and Gestational Age Tracking
 */

class ObgynEngine {
    constructor() {}

    /**
     * Calculate Estimated Date of Delivery (EDD) using Naegele's Rule
     * @param {string} lmp - Last Menstrual Period (YYYY-MM-DD)
     * @returns {string} EDD (YYYY-MM-DD)
     */
    calculateEDD(lmp) {
        if (!lmp) throw new Error('LMP date is required for EDD calculation');
        const date = new Date(lmp);
        if (isNaN(date.getTime())) throw new Error('Invalid LMP date format');
        
        // Naegele's Rule: LMP + 9 months + 7 days
        date.setMonth(date.getMonth() + 9);
        date.setDate(date.getDate() + 7);
        
        return date.toISOString().split('T')[0];
    }

    /**
     * Calculate Gestational Age in Weeks and Days
     * @param {string} lmp - Last Menstrual Period (YYYY-MM-DD)
     * @param {string} today - Current Date (YYYY-MM-DD)
     */
    calculateGestationalAge(lmp, today = new Date().toISOString().split('T')[0]) {
        const start = new Date(lmp);
        const end = new Date(today);
        if (isNaN(start.getTime()) || isNaN(end.getTime())) throw new Error('Invalid dates provided');

        const diffTime = Math.abs(end - start);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        const weeks = Math.floor(diffDays / 7);
        const days = diffDays % 7;
        
        return { weeks, days, formatted: `${weeks}w ${days}d` };
    }

    /**
     * Calculate APGAR Score
     * @param {Object} data { appearance, pulse, grimace, activity, respiration }
     * Each value should be 0, 1, or 2
     */
    calculateAPGAR(data) {
        const score = (data.appearance || 0) + 
                      (data.pulse || 0) + 
                      (data.grimace || 0) + 
                      (data.activity || 0) + 
                      (data.respiration || 0);
        
        let interpretation = 'Normal';
        if (score <= 3) interpretation = 'Severely Depressed';
        else if (score <= 6) interpretation = 'Moderately Depressed';
        
        return { score, interpretation };
    }

    /**
     * Preeclampsia Risk Assessment (S-MODE)
     * @param {Object} data { bpSystolic, bpDiastolic, proteinuria }
     */
    assessPreeclampsiaRisk(data) {
        const isHypertensive = data.bpSystolic >= 140 || data.bpDiastolic >= 90;
        const hasProteinuria = data.proteinuria === 'positive' || data.proteinuria === '+++';

        if (isHypertensive && hasProteinuria) {
            return {
                risk: 'CRITICAL',
                finding: 'Strong evidence of Preeclampsia.',
                action: 'Immediate stabilization, Magnesium Sulfate protocol, and urgent delivery evaluation.'
            };
        }
        if (isHypertensive) {
            return { risk: 'MODERATE', finding: 'Gestational Hypertension detected.', action: 'Close monitoring of BP and fetal well-being.' };
        }
        return { risk: 'LOW', finding: 'No immediate signs of preeclampsia.' };
    }
}

module.exports = new ObgynEngine();
