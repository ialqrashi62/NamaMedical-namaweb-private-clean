/**
 * ai_diagnostics_orchestrator.js
 * AI Orchestration Layer for Advanced Diagnostics
 * Implements Multimodal RAG for Radiology, Lab, and Functional Tests
 */

const { VectorMine } = require('./vector_mine'); 
const { LangChain } = require('langchain'); 
const db = require('./db_postgres');

class AIDiagnosticsOrchestrator {
    constructor() {
        this.model = "gemma4:31b-cloud";
        this.vectorStore = new VectorMine({
            collection: 'diagnostics_cases',
            embeddingModel: 'clinical-bert-vision'
        });
    }

    /**
     * Analyze Radiology Scan using Vision-RAG
     */
    async analyzeScan(patientData, scanData) {
        const query = `Modality: ${scanData.modality}, Findings: ${scanData.findings}`;
        
        const similarCases = await this.vectorStore.similaritySearch(query, {
            limit: 5,
            filter: { tenant_id: patientData.tenant_id }
        });

        const systemPrompt = `Act as a World-Class Radiologist. 
        Analyze the scan findings. Compare with similar cases: ${JSON.stringify(similarCases)}.
        Suggest the most likely pathology and recommend further imaging if needed.`;

        const result = await LangChain.execute({
            model: this.model,
            prompt: systemPrompt,
            input: query
        });

        return { suggestion: result, evidence: similarCases };
    }

    /**
     * Analyze Lab Trends using Longitudinal RAG
     */
    async analyzeLabTrends(patientId) {
        const labs = await db.query('SELECT * FROM lab_results_extended WHERE patient_id = $1 ORDER BY created_at ASC', [patientId]);
        
        const trendString = JSON.stringify(labs.rows);
        const similarTrends = await this.vectorStore.similaritySearch(trendString, {
            limit: 5,
            filter: { tenant_id: labs.rows[0]?.tenant_id }
        });

        const systemPrompt = `Act as a World-Class Pathologist. 
        Analyze the longitudinal lab trends. Compare with similar patient phenotypes: ${JSON.stringify(similarTrends)}.
        Identify early markers of organ failure or rare autoimmune diseases.`;

        const result = await LangChain.execute({
            model: this.model,
            prompt: systemPrompt,
            input: trendString
        });

        return { suggestion: result, evidence: similarTrends };
    }
}

module.exports = new AIDiagnosticsOrchestrator();
