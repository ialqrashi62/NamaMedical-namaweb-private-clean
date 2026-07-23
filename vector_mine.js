/**
 * vector_mine.js
 * Vector-based knowledge retrieval system for clinical decision support.
 * Implements a simplified Vector Store for local development and RAG orchestration.
 */

const fs = require('fs');
const path = require('path');

class VectorMine {
    constructor() {
        this.knowledgeBase = {}; // In-memory store for demo/local purposes
        this.indexFile = path.join(__dirname, 'vector_index.json');
        this.loadIndex();
    }

    loadIndex() {
        try {
            if (fs.existsSync(this.indexFile)) {
                this.knowledgeBase = JSON.parse(fs.readFileSync(this.indexFile, 'utf8'));
            }
        } catch (e) {
            console.error('[VectorMine] Error loading index:', e.message);
        }
    }

    saveIndex() {
        try {
            fs.writeFileSync(this.indexFile, JSON.stringify(this.knowledgeBase, null, 2));
        } catch (e) {
            console.error('[VectorMine] Error saving index:', e.message);
        }
    }

    /**
     * Simulates a vector search by finding the most relevant clinical context
     * based on keywords and semantic similarity.
     */
    async query(specialty, queryText) {
        console.log(`[VectorMine] Querying knowledge base for ${specialty}: ${queryText}`);
        
        const specialtyData = this.knowledgeBase[specialty] || [];
        if (specialtyData.length === 0) {
            return "No specific global guidelines found for this specialty in the local vector store.";
        }

        // Simple semantic match simulation (Keyword-based for local dev)
        const results = specialtyData.filter(item => 
            queryText.toLowerCase().includes(item.keyword.toLowerCase()) || 
            item.keyword.toLowerCase().includes(queryText.toLowerCase())
        );

        return results.length > 0 
            ? results.map(r => r.content).join('\n\n') 
            : "General clinical guidelines applied. No specific high-match vector found.";
    }

    async addKnowledge(specialty, keyword, content) {
        if (!this.knowledgeBase[specialty]) this.knowledgeBase[specialty] = [];
        this.knowledgeBase[specialty].push({ keyword, content });
        this.saveIndex();
    }
}

module.exports = VectorMine;
module.exports.VectorMine = VectorMine;
module.exports.default = VectorMine;
