/**
 * ai_infectious_orchestrator.js
 * AI Orchestration Layer for Infectious Diseases
 */

const { VectorMine } = require('./vector_mine'); 
const { LangChain } = require('langchain'); 
const db = require('./db_postgres');

class AIInfectiousOrchestrator {
    constructor() {
        this.model = "gemma4:31b-cloud";
        this.vectorStore = new VectorMine({
            collection: 'infectious_cases',
            embeddingModel: 'clinical-bert'
        });
    }

    async suggestAntibiotic(patientData, cultureResults) {
        const query = `Pathogen: ${cultureResults.pathogen}, Sensitivity: ${JSON.stringify(cultureResults.sensitivity_profile)}`;
        
        const similarCases = await this.vectorStore.similaritySearch(query, {
            limit: 5,
            filter: { tenant_id: patientData.tenant_id }
        });

        const systemPrompt = `Act as a World-Class Infectious Disease Specialist. 
        Analyze the culture results. Compare with similar cases: ${JSON.stringify(similarCases)}.
        Suggest the most effective narrow-spectrum antibiotic based on the local antibiogram.`;

        const result = await LangChain.execute({
            model: this.model,
            prompt: systemPrompt,
            input: query
        });

        return { suggestion: result, evidence: similarCases };
    }
}

module.exports = new AIInfectiousOrchestrator();
