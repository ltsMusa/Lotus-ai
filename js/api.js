/**
 * ==========================================================
 * Lotus AI - API Manager
 * Version : 3.0 Alpha
 * Author  : ltsMusa
 * Description : Handles AI API requests.
 * ==========================================================
 */

import config from "./config.js";

import GeminiProvider from "./providers/gemini.js";
import GroqProvider from "./providers/groq.js";
import OpenAIProvider from "./providers/openai.js";
import OpenRouterProvider from "./providers/openrouter.js";

export default class APIManager {

    constructor() {

        this.providers = {

            gemini: new GeminiProvider(),
            groq: new GroqProvider(),
            openai: new OpenAIProvider(),
            openrouter: new OpenRouterProvider()

        };

    }

    async sendMessage(message) {

        const provider = this.providers[config.provider];

        if (!provider) {

            return "Geçersiz API sağlayıcısı.";

        }

        return await provider.sendMessage(message);

    }

}
