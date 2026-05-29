import { getPrompt } from './getPromptvalue.js';
import { env } from '../CliAsk/inputEnv.js';
import { Groq } from 'groq-sdk';
import dotenv from 'dotenv';

dotenv.config();

class GroqAi {
    static getApiKeys() {
        const keysStr = process.env.GROQ_API_KEYS;
        if (!keysStr) {
            throw new Error("GROQ_API_KEYS is missing from environment variables.");
        }
        const keys = keysStr.split(',').map(k => k.trim()).filter(Boolean);
        if (keys.length === 0) {
            throw new Error("No valid keys found in GROQ_API_KEYS.");
        }
        return keys;
    }

    static currentKeyIndex = 0;

    static async testApi() {
        console.log("\n[TEST API] Memulai testing Groq API Keys...\n");
        const apiKeys = this.getApiKeys();

        for (let i = 0; i < apiKeys.length; i++) {
            const groq = new Groq({ apiKey: apiKeys[i] });
            const startTime = Date.now();
            try {
                const res = await groq.chat.completions.create({
                    messages: [{ role: "user", content: "ping" }],
                    model: "llama-3.1-8b-instant",
                    max_completion_tokens: 1
                });
                const elapsed = Date.now() - startTime;
                console.log(`[Key ${i + 1}/${apiKeys.length}] ✅ Status: 200 OK | Latency: ${elapsed}ms`);
            } catch (err) {
                console.log(`[Key ${i + 1}/${apiKeys.length}] ❌ Status: ${err.status || 'ERROR'} | Msg: ${err.message}`);
            }
        }
        console.log("\n[TEST API] Selesai.\n");
    }

    static async generateImage(image) {
        const apiKeys = this.getApiKeys();
        if (this.currentKeyIndex >= apiKeys.length) {
            this.currentKeyIndex = 0;
        }

        const prompt = getPrompt();

        let attempts = 0;
        const maxAttempts = apiKeys.length; // try every key once before giving up this turn

        while (attempts < maxAttempts) {
            const currentKey = apiKeys[this.currentKeyIndex];
            const groq = new Groq({ apiKey: currentKey });

            try {
                const res = await groq.chat.completions.create({
                    messages: [
                        {
                            role: "user",
                            content: [
                                {
                                    type: "text",
                                    text: prompt
                                },
                                {
                                    type: "image_url",
                                    image_url: {
                                        url: `data:image/jpeg;base64,${image}`
                                    }
                                }
                            ]
                        }
                    ],
                    model: "meta-llama/llama-4-scout-17b-16e-instruct",
                    temperature: 1,
                    max_completion_tokens: 1024,
                    top_p: 1,
                    stream: false,
                    stop: null
                });

                if (!res.choices || res.choices.length === 0 || !res.choices[0].message.content) {
                    throw new Error('Invalid response format from Groq API');
                }

                const imageData = res.choices[0].message.content;
                return imageData;

            } catch (err) {
                // If Rate Limit, rotate key and retry
                if (err.status === 429 || err?.error?.error?.code === 'rate_limit_exceeded') {
                    console.log(`[Rate Limit] API Key at index ${this.currentKeyIndex} hit rate limit. Rotating to next key...`);
                    this.currentKeyIndex = (this.currentKeyIndex + 1) % apiKeys.length;
                    attempts++;
                    continue;
                }

                // If other errors, rethrow so it can be handled by index.js
                throw err;
            }
        }

        // If we exhausted all keys without success, throw an error to trigger delay in index.js
        throw new Error('All Groq API keys hit rate limits or failed. Backing off...');
    }
}

export default GroqAi;
