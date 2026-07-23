/**
 * ai_endocrine_orchestrator.js
 * AI Orchestration Layer for Endocrinology & Diabetes
 */

const { VectorMine } = require('./vector_mine'); 
const { LangChain } = require('langchain'); 
const db = require('./db_postgres');

class AIEndocrineOrchestrator {
    constructor() {
        this.model = "gemma4:31b-cloud";
        this.vectorStore = new VectorMine({
            collection: 'endocrine_cases',
            embeddingModel: 'clinical-bert'
        });
    }

    async predictGlucoseTrend(patientData, glucoseLogs) {
        const similarProfiles = await this.vectorStore.similaritySearch(JSON.stringify(glucoseLogs), {
            limit: 5,
            filter: { tenant_id: patientData.tenant_id }
        });

        const systemPrompt = `Act as a World-Class Endocrinologist. 
        Analyze the glucose trends. Compare with similar profiles: ${JSON.stringify(similarProfiles)}.
        Suggest an insulin adjustment to maintain Time-in-Range (TIR).`;

        const result = await LangChain.execute({
            model: this.model,
            prompt: systemPrompt,
            input: JSON.stringify(glucoseLogs)
        });

        return { suggestion: result, evidence: similarProfiles };
    }
}

module.exports = new AIEndocrineOrchestrator();
