/**
 * ai_oncology_orchestrator.js
 * AI Orchestration Layer for Oncology & Hematology
 */

const { VectorMine } = require('./vector_mine'); 
const { LangChain } = require('langchain'); 
const db = require('./db_postgres');

class AIOncologyOrchestrator {
    constructor() {
        this.model = "gemma4:31b-cloud";
        this.vectorStore = new VectorMine({
            collection: 'oncology_cases',
            embeddingModel: 'clinical-bert'
        });
    }

    async analyzeGenomics(patientData, genomicProfile) {
        const similarCases = await this.vectorStore.similaritySearch(genomicProfile, {
            limit: 5,
            filter: { tenant_id: patientData.tenant_id }
        });

        const systemPrompt = `Act as a World-Class Oncologist. 
        Analyze the genomic profile. Compare with these similar cases: ${JSON.stringify(similarCases)}.
        Suggest the most effective targeted therapy based on current clinical trials.`;

        const result = await LangChain.execute({
            model: this.model,
            prompt: systemPrompt,
            input: genomicProfile
        });

        return { suggestion: result, evidence: similarCases };
    }
}

module.exports = new AIOncologyOrchestrator();
