/**
 * ai_derm_orchestrator.js
 * AI Orchestration Layer for Dermatology
 */

const { VectorMine } = require('./vector_mine'); 
const { LangChain } = require('langchain'); 
const db = require('./db_postgres');

class AIDermOrchestrator {
    constructor() {
        this.model = "gemma4:31b-cloud";
        this.vectorStore = new VectorMine({
            collection: 'derm_cases',
            embeddingModel: 'clinical-bert-vision'
        });
    }

    async analyzeLesion(patientData, lesionData) {
        const query = `Location: ${lesionData.location}, Description: ${lesionData.description}`;
        
        const similarCases = await this.vectorStore.similaritySearch(query, {
            limit: 5,
            filter: { tenant_id: patientData.tenant_id }
        });

        const systemPrompt = `Act as a World-Class Dermatologist. 
        Analyze the lesion description. Compare with similar visual cases: ${JSON.stringify(similarCases)}.
        Differentiate between benign and malignant possibilities. Suggest the next diagnostic step.`;

        const result = await LangChain.execute({
            model: this.model,
            prompt: systemPrompt,
            input: query
        });

        return { suggestion: result, evidence: similarCases };
    }
}

module.exports = new AIDermOrchestrator();
