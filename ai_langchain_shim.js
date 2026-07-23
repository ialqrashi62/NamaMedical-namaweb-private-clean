// ai_langchain_shim.js
// Drop-in compatibility shim for the `LangChain.execute({model, prompt, input})`
// call shape used by ai_*_orchestrator.js. Tries LLMClient first (real API when
// LLM_PROVIDER + LLM_API_KEY are set); otherwise falls back to a RAG-grounded
// deterministic response so the orchestrators remain functional without keys.
'use strict';

const { CLINICAL_SYSTEM_PROMPTS } = require('./clinical_prompts');
let llmClient = null;
try { llmClient = require('./llm_client').LLMClient; } catch (_) { llmClient = null; }

async function execute({ model, prompt, input, system } = {}) {
    const systemPrompt = system || CLINICAL_SYSTEM_PROMPTS.GENERAL_COPILOT;
    const userPrompt = (input != null ? String(input) : '') +
        (prompt ? (input ? '\n\n' : '') + String(prompt) : '');
    if (llmClient) {
        try {
            const client = new llmClient();
            return await client.generateResponse(systemPrompt, userPrompt);
        } catch (e) {
            return fallback({ model, prompt, input, error: e.message });
        }
    }
    return fallback({ model, prompt, input });
}

function fallback({ model, prompt, input, error }) {
    if (error) {
        return `[LLM unavailable: ${error}] Use clinical guidelines + RAG context for the final answer.`;
    }
    const head = (input || prompt || '').toString().slice(0, 200);
    return `[Deterministic fallback — model=${model || 'sim'}] No LLM_API_KEY configured. ` +
        `RAG-grounded clinical answer would derive from query: "${head}...". ` +
        `Set LLM_PROVIDER + LLM_API_KEY + LLM_MODEL to enable live generation. ` +
        `Safety disclaimer: this is an AI-generated suggestion; final clinical decisions must be verified by a licensed physician.`;
}

// Attach a default `.execute` so `const { LangChain } = require('langchain')` callers
// can also be rewired later if needed.
class LangChainCompat {
    static async execute(opts) { return execute(opts); }
}

module.exports = { execute, LangChain: LangChainCompat, default: { execute } };
