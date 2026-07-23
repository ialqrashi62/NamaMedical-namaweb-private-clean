/**
 * Electrophysiology (EP) Engine - Cardiac Rhythm & Device Logic
 * Part of the NamaMedical Enterprise Platform
 * 
 * Specialized logic for arrhythmia analysis, ablation planning, 
 * and cardiac device (Pacemaker/ICD) management.
 */

const epEngine = {
    /**
     * Analyze Cardiac Rhythm and suggest ablation target
     * @param {Object} ecgData - Signal data from the EP study
     * @returns {Object} Analysis and suggested target
     */
    analyzeRhythm: (ecgData) => {
        const { heartRate, pWaveMorphology, qrsDuration, prInterval } = ecgData;
        let diagnosis = 'Normal Sinus Rhythm';
        let targetSite = 'N/A';
        let confidence = '100%';

        if (heartRate > 150 && pWaveLacks) {
            diagnosis = 'Atrial Fibrillation (AFib)';
            targetSite = 'Pulmonary Vein Ostium';
            confidence = '92%';
        } else if (qrsDuration > 120 && prInterval > 200) {
            diagnosis = 'First-Degree AV Block';
            targetSite = 'AV Node';
            confidence = '88%';
        }

        return {
            diagnosis,
            suggestedTarget: targetSite,
            confidence,
            timestamp: new Date().toISOString()
        };
    },

    /**
     * Validate Device Parameters (Pacemaker/ICD)
     * @param {Object} params - Device settings (Sensitivity, Output, Rate)
     * @returns {Object} Validation result
     */
    validateDeviceParams: (params) => {
        const { sensitivity, outputVoltage, lowerRateLimit } = params;
        let status = 'Optimal';
        let warnings = [];

        if (sensitivity < 0.5 || sensitivity > 2.5) {
            status = 'Sub-optimal';
            warnings.push('Sensitivity outside recommended range (0.5-2.5mV)');
        }
        if (outputVoltage < 1.0) {
            status = 'Critical';
            warnings.push('Low output voltage: Risk of failure to capture');
        }

        return {
            status,
            warnings,
            isSafe: status === 'Optimal'
        };
    },

    /**
     * Calculate Ablation Energy Safety
     * @param {number} joules - Energy delivered
     * @param {string} modality - RF, Cryo, or Laser
     * @returns {Object} Safety check
     */
    checkAblationSafety: (joules, modality) => {
        const limits = { 'RF': 40, 'Cryo': 100, 'Laser': 20 };
        const limit = limits[modality] || 30;
        
        return {
            isSafe: joules <= limit,
            alert: joules > limit ? `Energy exceeds ${modality} safety threshold of ${limit}J` : null
        };
    }
};

module.exports = epEngine;
