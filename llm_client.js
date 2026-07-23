/**
 * llm_client.js
 * Provider-agnostic wrapper for Large Language Models.
 * Supports OpenAI, Azure, and Claude via environment variables.
 */
const axios = require('axios');

class LLMClient {
    constructor() {
        this.provider = process.env.LLM_PROVIDER || 'openai'; // 'openai', 'azure', 'anthropic'
        this.apiKey = process.env.LLM_API_KEY;
        this.model = process.env.LLM_MODEL || 'gpt-4-turbo';
        this.baseUrl = process.env.LLM_BASE_URL;
    }

    async generateResponse(systemPrompt, userPrompt) {
        if (!this.apiKey) {
            console.error('[LLMClient] API Key missing. Falling back to simulation mode.');
            return `[SIMULATION MODE] The LLM would process this query using the system prompt: "${systemPrompt.substring(0, 50)}..." and the user prompt: "${userPrompt.substring(0, 50)}..."`;
        }

        try {
            if (this.provider === 'openai') {
                return await this._callOpenAI(systemPrompt, userPrompt);
            } else if (this.provider === 'azure') {
                return await this._callAzure(systemPrompt, userPrompt);
            } else if (this.provider === 'anthropic') {
                return await this._callAnthropic(systemPrompt, userPrompt);
            } else {
                throw new Error(`Unsupported LLM provider: ${this.provider}`);
            }
        } catch (error) {
            console.error(`[LLMClient] Error during generation: ${error.message}`);
            throw error;
        }
    }

    async _callOpenAI(systemPrompt, userPrompt) {
        const response = await axios.post(`${this.baseUrl || 'https://api.openai.com/v1/chat/completions'}`, {
            model: this.model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            temperature: 0.2, // Low temperature for clinical precision
        }, {
            headers: { 'Authorization': `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' }
        });
        return response.data.choices[0].message.content;
    }

    async _callAzure(systemPrompt, userPrompt) {
        const response = await axios.post(`${this.baseUrl}/openai/deployments/${this.model}/chat/completions?api-version=2024-02-15-preview`, {
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            temperature: 0.2,
        }, {
            headers: { 'api-key': this.apiKey, 'Content-Type': 'application/json' }
        });
        return response.data.choices[0].message.content;
    }

    async _callAnthropic(systemPrompt, userPrompt) {
        const response = await axios.post(`${this.baseUrl || 'https://api.anthropic.com/v1/messages'}`, {
            model: this.model,
            system: systemPrompt,
            messages: [
                { role: 'user', content: userPrompt }
            ],
            max_tokens: 1024,
            temperature: 0.2,
        }, {
            headers: { 'x-api-key': this.apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' }
        });
        return response.data.content[0].text;
    }
}

module.exports = new LLMClient();
