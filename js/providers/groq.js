console.log("groq.js yüklendi");

import config from "../config.js";
import { fetchWithTimeout } from "../utils.js";
import { streamSSE, extractOpenAIDelta } from "../streaming.js";
import { ProviderError, classifyHttpStatus } from "./providerError.js";

export default class GroqProvider {

    async sendMessage({ history = [], systemPrompt = "" } = {}) {

        const apiKey = config.providers.groq.apiKey;

        if (!apiKey) {

            throw new ProviderError("Groq API anahtarı ayarlanmamış.", "NO_KEY");
        }

        let response;

        try {

            response = await fetchWithTimeout(
                "https://api.groq.com/openai/v1/chat/completions",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${apiKey}`
                    },
                    body: JSON.stringify({
                        model: config.providers.groq.model || "openai/gpt-oss-120b",
                        messages: [
                            { role: "system", content: systemPrompt },
                            ...history
                        ]
                    })
                },
                15000
            );

        } catch (error) {

            if (error.code === "TIMEOUT") throw new ProviderError("Groq zaman aşımına uğradı.", "TIMEOUT");

            throw new ProviderError("Groq bağlantısı başarısız.", "NETWORK");
        }

        if (!response.ok) {

            const code = classifyHttpStatus(response.status);

            throw new ProviderError(`Groq hatası (${response.status})`, code);
        }

        const data = await response.json();

        const text = data?.choices?.[0]?.message?.content;

        if (!text) throw new ProviderError("Groq boş yanıt döndürdü.", "SERVER");

        return text;
    }

    /**
     * Streaming variant — calls onToken(deltaText, fullTextSoFar) as
     * chunks arrive and resolves with the full text at the end.
     */
    async sendMessageStream({ history = [], systemPrompt = "" } = {}, onToken, controller = null) {

        const apiKey = config.providers.groq.apiKey;

        if (!apiKey) {

            throw new ProviderError("Groq API anahtarı ayarlanmamış.", "NO_KEY");
        }

        let fullText = "";

        await streamSSE(
            "https://api.groq.com/openai/v1/chat/completions",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: config.providers.groq.model || "openai/gpt-oss-120b",
                    stream: true,
                    messages: [
                        { role: "system", content: systemPrompt },
                        ...history
                    ]
                })
            },
            json => {

                const delta = extractOpenAIDelta(json);

                if (delta) {

                    fullText += delta;

                    onToken?.(delta, fullText);
                }
            },
            "Groq",
            60000,
            controller
        );

        if (!fullText) throw new ProviderError("Groq boş yanıt döndürdü.", "SERVER");

        return fullText;
    }

    /**
     * Real image analysis via Groq. IMPORTANT: Groq's default text
     * model does NOT support vision — this always uses
     * config.providers.groq.visionModel instead. Groq's vision model
     * lineup has changed over time; if this starts failing with a
     * "model not found"-style error, update visionModel in Settings →
     * Yapay Zekâ (or config.js's default) to whatever Groq currently
     * offers.
     */
    async sendMessageWithImages({ history = [], systemPrompt = "", message = "", images = [] } = {}) {

        const apiKey = config.providers.groq.apiKey;

        if (!apiKey) {

            throw new ProviderError("Groq API anahtarı ayarlanmamış.", "NO_KEY");
        }

        const visionModel = config.providers.groq.visionModel || "qwen/qwen3.8-27b";

        const userContent = [
            { type: "text", text: message },
            // Groq's vision models accept at most 3 images per request.
            ...images.slice(0, 3).map(image => ({ type: "image_url", image_url: { url: image.dataUrl } }))
        ];

        let response;

        try {

            response = await fetchWithTimeout(
                "https://api.groq.com/openai/v1/chat/completions",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${apiKey}`
                    },
                    body: JSON.stringify({
                        model: visionModel,
                        messages: [
                            { role: "system", content: systemPrompt },
                            ...history,
                            { role: "user", content: userContent }
                        ]
                    })
                },
                30000
            );

        } catch (error) {

            if (error.code === "TIMEOUT") throw new ProviderError("Groq zaman aşımına uğradı.", "TIMEOUT");

            throw new ProviderError("Groq bağlantısı başarısız.", "NETWORK");
        }

        if (!response.ok) {

            const code = classifyHttpStatus(response.status);

            throw new ProviderError(`Groq hatası (${response.status}) — visionModel (${visionModel}) artık geçerli olmayabilir.`, code);
        }

        const data = await response.json();

        const text = data?.choices?.[0]?.message?.content;

        if (!text) throw new ProviderError("Groq boş yanıt döndürdü.", "SERVER");

        return text;
    }
}
