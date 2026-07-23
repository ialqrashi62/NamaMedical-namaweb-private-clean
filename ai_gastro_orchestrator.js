/**
 * ai_gastro_orchestrator.js
 * AI Orchestration Layer for Gastroenterology & Hepatology
 * Implements Multimodal RAG for Endoscopic Findings and Liver Metrics
 */

const { VectorMine } = require('./vector_mine'); 
const { LangChain } = require('langchain'); 
const db = require('./db_postgres');

class AIGastroOrchestrator {
    constructor() {
        this.model = "gemma4:31b-cloud";
        this.vectorStore = new VectorMine({
            collection: 'gastro_cases',
            embeddingModel: 'clinical-bert-vision'
        });
    }

    /**
     * Analyze Endoscopic Findings using Multimodal RAG
     * @param {Object} patientData - Patient history and labs
     * @param {Object} findings - Endoscopic text and image metadata
     */
    async analyzeEndoscopy(patientData, findings) {
        const findingsText = `Procedure: ${findings.procedure_type}, Findings: ${findings.text}`;
        
        // 1. Retrieve similar visual/textual patterns from Vector Database
        const similarCases = await this.vectorStore.similaritySearch(findingsText, {
            limit: 5,
            filter: { tenant_id: patientData.tenant_id }
        });

        // 2. Construct the Prompt
        const systemPrompt = `Act as a World-Class Gastroenterologist. 
        Analyze the endoscopic findings. 
        Compare with these similar historical cases: ${JSON.stringify(similarCases)}.
        Patient History: ${JSON.stringify(patientData.history)}.
        Differentiate between Crohn's Disease, Ulcerative Colitis, and Ischemic Colitis. 
        Suggest the most likely pathology and recommended biopsy sites.`;

        // 3. Execute LangChain
        const result = await LangChain.execute({
            model: this.model,
            prompt: systemPrompt,
            input: findingsText
        });

        return {
            suggestion: result,
            evidence: similarCases,
            timestamp: new Date().toISOString(),
            ai_model: this.model
        };
    }

    /**
     * Predict Liver Failure Risk (MELD Trend Analysis)
     */
    async predictLiverRisk(patientId) {
        const data = await db.query('SELECT * FROM hepatology_metrics WHERE patient_id = $1 ORDER BY record_date DESC', [patientId]);
        
        // Logic to analyze MELD score trend
        const trend = this.analyzeMeldTrend(data.rows);
        
        return { 
            riskLevel: trend > 15 ? 'High' : 'Stable', 
            meldTrend: trend,
            recommendation: trend > 15 ? 'Prioritize for Transplant List' : 'Continue Routine Monitoring'
        };
    }

    analyzeMeldTrend(rows) {
        if (rows.length < 2) return 0;
        return rows[0].meld_score - rows[rows.length - 1].meld_score;
    }
}

module.exports = new AIGastroOrchestrator();
