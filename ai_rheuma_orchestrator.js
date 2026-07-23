/**
 * ai_rheuma_orchestrator.js
 * AI Orchestration Layer for Rheumatology & Immunology
 */

const { VectorMine } = require('./vector_mine'); 
const { LangChain } = require('langchain'); 
const db = require('./db_postgres');

class AIRheumaOrchestrator {
    constructor() {
        this.model = "gemma4:31b-cloud";
        this.vectorStore = new VectorMine({
            collection: 'rheuma_cases',
            embeddingModel_clinical_bert: 'clinical-bert'
        });
    }

    async analyzeAutoimmuneCluster(patientData, serology) {
        const similarClusters = await this.vectorStore.similaritySearch(JSON.stringify(serology), {
            limit: 5,
            filter: { tenant_id: patientData.tenant_id }
        });

        const systemPrompt = `Act as a World-Class Rheumatologist. 
        Analyze the serology markers. Compare with similar autoimmune clusters: ${JSON.stringify(similarClusters)}.
        Differentiate between SLE, RA, and Sjogren's. Suggest the most likely diagnosis.`;

        const result = await LangChain.execute({
            model: this.model,
            prompt: systemPrompt,
            input: JSON.stringify(serology)
        });

        return { suggestion: result, evidence: similarClusters };
    }
}

module.exports = new AIRheumaOrchestrator();
