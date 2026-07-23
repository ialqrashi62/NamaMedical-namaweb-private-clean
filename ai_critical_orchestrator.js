/**
 * ai_critical_orchestrator.js
 * AI Orchestration Layer for Critical Care & Emergency
 * Implements Real-time Deterioration Prediction and Ventilator Optimization
 */

const { VectorMine } = require('./vector_mine'); 
const { LangChain } = require('langchain'); 
const db = require('./db_postgres');

class AICriticalOrchestrator {
    constructor() {
        this.model = "gemma4:31b-cloud";
        this.vectorStore = new VectorMine({
            collection: 'critical_care_cases',
            embeddingModel: 'clinical-bert'
        });
    }

    /**
     * Predict Patient Deterioration (Crash Prediction)
     * @param {Object} currentVitals - Real-time stream of vitals
     */
    async predictDeterioration(patientData, currentVitals) {
        const vitalsString = `MAP: ${currentVitals.map}, HR: ${currentVitals.hr}, SpO2: ${currentVitals.spo2}`;
        
        // 1. Retrieve similar "Crash" patterns from Vector Database
        const similarCrashes = await this.vectorStore.similaritySearch(vitalsString, {
            limit: 5,
            filter: { tenant_id: patientData.tenant_id }
        });

        // 2. Construct the Prompt
        const systemPrompt = `Act as a World-Class Intensivist. 
        Analyze the real-time vitals. Compare with these historical crash patterns: ${JSON.stringify(similarCrashes)}.
        Patient History: ${JSON.stringify(patientData.history)}.
        Predict the likelihood of hemodynamic collapse within the next 2 hours and suggest immediate rescue interventions.`;

        // 3. Execute LangChain
        const result = await LangChain.execute({
            model: this.model,
            prompt: systemPrompt,
            input: vitalsString
        });

        return {
            alertLevel: 'CRITICAL',
            suggestion: result,
            evidence: similarCrashes,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Optimize Ventilator Settings
     */
    async optimizeVentilation(patientId, bloodGas) {
        const similarLungs = await this.vectorStore.similaritySearch(JSON.stringify(bloodGas), {
            limit: 3,
            filter: { tenant_id: patientId.tenant_id }
        });

        const systemPrompt = `Act as a Respiratory Therapist. 
        Analyze the blood gas results. Compare with similar lung compliance cases: ${JSON.stringify(similarLungs)}.
        Suggest the optimal PEEP and FiO2 settings to maximize oxygenation while preventing barotrauma.`;

        const result = await LangChain.execute({
            model: this.model,
            prompt: systemPrompt,
            input: JSON.stringify(bloodGas)
        });

        return { suggestedSettings: result };
    }
}

module.exports = new AICriticalOrchestrator();
