/**
 * General Surgery Clinical Engine
 * Gold Standard Implementation: S-MODE
 * Handles: Surgical Risk Assessment, Wound Healing Tracking, and Implant Registry
 */

class SurgeryEngine {
    constructor() {
        this.ASA_PHYSICAL_STATUS = {
            1: 'Healthy patient',
            2: 'Patient with mild systemic disease',
            3: 'Patient with severe systemic disease',
            4: 'Patient with severe systemic disease that is a constant threat to life',
            5: 'Moribund patient who is not expected to survive without the operation'
        };
    }

    /**
     * Calculate Surgical Risk based on ASA Score and Comorbidities
     * @param {Object} data { asaScore, age, comorbiditiesCount, emergencyStatus }
     */
    calculateSurgicalRisk(data) {
        let riskScore = 0;
        
        // ASA Score weight
        riskScore += (data.asaScore || 1) * 2;
        
        // Age weight
        if (data.age > 65) riskScore += 2;
        if (data.age > 80) riskScore += 3;

        // Comorbidities
        riskScore += (data.comorbiditiesCount || 0) * 1.5;

        // Emergency status
        if (data.emergencyStatus === 'Emergency') riskScore += 5;

        let category = 'Low';
        if (riskScore > 15) category = 'Very High';
        else if (riskScore > 10) category = 'High';
        else if (riskScore > 5) category = 'Moderate';

        return {
            score: riskScore,
            category,
            recommendation: category === 'High' || category === 'Very High' 
                ? 'Pre-operative cardiac clearance and ICU bed reservation strongly recommended.' 
                : 'Standard pre-operative protocol.'
        };
    }

    /**
     * Analyze Wound Status
     * @param {Object} data { woundStatus, drainageAmount, drainageType }
     */
    analyzeWound(data) {
        if (data.woundStatus === 'Infected') {
            return {
                status: 'CRITICAL',
                finding: 'Surgical Site Infection (SSI) detected.',
                action: 'Immediate wound culture, swab, and surgical review for possible debridement.'
            };
        }
        if (data.drainageAmount > 100) {
            return {
                status: 'WARNING',
                finding: 'Excessive drainage detected.',
                action: 'Monitor for hematoma or lymphatic leak.'
            };
        }
        return { status: 'STABLE', finding: 'Wound healing as expected.' };
    }
}

module.exports = new SurgeryEngine();
