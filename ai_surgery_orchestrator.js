/**
 * ai_surgery_orchestrator.js
 * AI Orchestration Layer for Surgical Specialties
 * Implements Post-Op Recovery Prediction and Surgical Report Generation
 */

const { VectorMine } = require('./vector_mine'); 
const { LangChain } = require('langchain'); 
const db = require('./db_postgres');

class AISurgeryOrchestrator {
    constructor() {
        this.model = "gemma4:31b-cloud";
        this.vectorStore = new VectorMine({
            collection: 'surgical_cases',
            embeddingModel: 'clinical-bert'
        });
    }

    /**
     * Predict Post-Op Recovery and Complications
     * @param {Object} sessionData - Intra-op vitals, duration, and blood loss
     */
    async predictRecovery(sessionData) {
        const query = `Procedure: ${sessionData.procedure_type}, Duration: ${sessionData.duration}, BloodLoss: ${sessionData.bloodLoss}`;
        
        const similarCases = await this.vectorStore.similaritySearch(query, {
            limit: 5,
            filter: { tenant_id: sessionData.tenant_id }
        });

        const systemPrompt = `Act as a World-Class Surgical Consultant. 
        Analyze the intra-operative data. Compare with similar cases: ${JSON.stringify(similarCases)}.
        Predict the likelihood of post-operative complications (e.g., SSI, DVT) and suggest a monitoring plan.`;

        const result = await LangChain.execute({
            model: this.model,
            prompt: systemPrompt,
            input: query
        });

        return { suggestion: result, evidence: similarCases };
    }

    /**
     * Generate Professional Surgical Report
     */
    async generateSurgicalReport(sessionLog) {
        const systemPrompt = `Act as a Senior Surgeon. 
        Convert the following raw surgical logs into a professional, structured surgical report.
        Include: Indications, Procedure Steps, Findings, and Post-op Plan.`;

        const result = await LangChain.execute({
            model: this.model,
            prompt: systemPrompt,
            input: JSON.stringify(sessionLog)
        });

        return { report: result };
    }
}

module.exports = new AISurgeryOrchestrator();
