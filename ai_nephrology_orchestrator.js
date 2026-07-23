/**
 * ai_nephrology_orchestrator.js
 * AI Orchestration Layer for Nephrology & Dialysis
 * Implements RAG for Renal Biopsy and Dialysis Adequacy Prediction
 */

const { VectorMine } = require('./vector_mine'); 
const { LangChain } = require('langchain'); 
const db = require('./db_postgres');

class AINephrologyOrchestrator {
    constructor() {
        this.model = "gemma4:31b-cloud";
        this.vectorStore = new VectorMine({
            collection: 'nephrology_cases',
            embeddingModel: 'clinical-bert'
        });
    }

    /**
     * Analyze Renal Biopsy using RAG
     * @param {Object} patientData - Patient history and labs
     * @param {String} biopsyReport - The raw pathology text
     */
    async analyzeBiopsy(patientData, biopsyReport) {
        // 1. Retrieve similar biopsy patterns from Vector Database
        const similarCases = await this.vectorStore.similaritySearch(biopsyReport, {
            limit: 5,
            filter: { tenant_id: patientData.tenant_id }
        });

        // 2. Construct the Prompt
        const systemPrompt = `Act as a World-Class Nephrologist. 
        Analyze the renal biopsy report. 
        Compare it with these similar historical cases: ${JSON.stringify(similarCases)}.
        Patient History: ${JSON.stringify(patientData.history)}.
        Differentiate between FSGS, Membranous Nephropathy, and Minimal Change Disease. 
        Suggest the most likely pathology and recommended immunosuppressant regimen.`;

        // 3. Execute LangChain
        const result = await LangChain.execute({
            model: this.model,
            prompt: systemPrompt,
            input: biopsyReport
        });

        return {
            suggestion: result,
            evidence: similarCases,
            timestamp: new Date().toISOString(),
            ai_model: this.model
        };
    }

    /**
     * Predict GFR Decline Trend
     */
    async predictGFRTrend(patientId) {
        const data = await db.query('SELECT calculated_gfr, sample_date FROM nephrology_labs WHERE patient_id = $1 ORDER BY sample_date ASC', [patientId]);
        
        // Logic to analyze GFR slope
        const slope = this.calculateGFRSlope(data.rows);
        
        return { 
            predictedDecline: slope, 
            riskLevel: slope < -5 ? 'Rapid Progressor' : 'Stable',
            recommendation: slope < -5 ? 'Increase monitoring frequency and review ACEi/ARB dose' : 'Continue current regimen'
        };
    }

    calculateGFRSlope(rows) {
        if (rows.length < 2) return 0;
        const first = rows[0];
        const last = rows[rows.length - 1];
        return (last.calculated_gfr - first.calculated_gfr) / 
               ((new Date(last.sample_date) - new Date(first.sample_date)) / (1000 * 60 * 60 * 24 * 30)); // per month
    }
}

module.exports = new AINephrologyOrchestrator();
