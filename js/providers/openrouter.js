console.log("openrouter.js yüklendi");

import config from "../config.js";
import { fetchWithTimeout } from "../utils.js";
import { streamSSE, extractOpenAIDelta } from "../streaming.js";
import { ProviderError, classifyHttpStatus } from "./providerError.js";

export default class OpenRouterProvider {

    async sendMessage({ history = [], systemPrompt = "" } = {}) {

        const apiKey = config.providers.openrouter.apiKey;

        if (!apiKey) {

            throw new ProviderError("OpenRouter API anahtarı ayarlanmamış.", "NO_KEY");
        }

        let response;

        try {

            response = await fetchWithTimeout(
                "https://openrouter.ai/api/v1/chat/completions",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${apiKey}`,
                        "HTTP-Referer": window.location.origin,
                        "X-Title": "Lotus AI"
                    },
                    body: JSON.stringify({
                        model: config.providers.openrouter.model || "openai/gpt-4o-mini",
                        messages: [
                            { role: "system", content: systemPrompt },
                            ...history
                        ]
                    })
                },
                15000
            );

        } catch (error) {

            if (error.code === "TIMEOUT") throw new ProviderError("OpenRouter zaman aşımına uğradı.", "TIMEOUT");

            throw new ProviderError("OpenRouter bağlantısı başarısız.", "NETWORK");
        }

        if (!response.ok) {

            const code = classifyHttpStatus(response.status);

            throw new ProviderError(`OpenRouter hatası (${response.status})`, code);
        }

        const data = await response.json();

        const text = data?.choices?.[0]?.message?.content;

        if (!text) throw new ProviderError("OpenRouter boş yanıt döndürdü.", "SERVER");

        return text;
    }

    async sendMessageStream({ history = [], systemPrompt = "" } = {}, onToken, controller = null) {

        const apiKey = config.providers.openrouter.apiKey;

        if (!apiKey) {

            throw new ProviderError("OpenRouter API anahtarı ayarlanmamış.", "NO_KEY");
        }

        let fullText = "";

        await streamSSE(
            "https://openrouter.ai/api/v1/chat/completions",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${apiKey}`,
                    "HTTP-Referer": window.location.origin,
                    "X-Title": "Lotus AI"
                },
                body: JSON.stringify({
                    model: config.providers.openrouter.model || "openai/gpt-4o-mini",
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
            "OpenRouter",
            60000,
            controller
        );

        if (!fullText) throw new ProviderError("OpenRouter boş yanıt döndürdü.", "SERVER");

        return fullText;
    }

    /**
     * Real image analysis via OpenRouter. Vision support depends on
     * which model is configured — if it's not a vision-capable model,
     * OpenRouter/the upstream model will error, which surfaces as a
     * normal ProviderError (api.js will fall back to another provider).
     */
    async sendMessageWithImages({ history = [], systemPrompt = "", message = "", images = [] } = {}) {

        const apiKey = config.providers.openrouter.apiKey;

        if (!apiKey) {

            throw new ProviderError("OpenRouter API anahtarı ayarlanmamış.", "NO_KEY");
        }

        const userContent = [
            { type: "text", text: message },
            ...images.map(image => ({ type: "image_url", image_url: { url: image.dataUrl } }))
        ];

        let response;

        try {

            response = await fetchWithTimeout(
                "https://openrouter.ai/api/v1/chat/completions",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${apiKey}`,
                        "HTTP-Referer": window.location.origin,
                        "X-Title": "Lotus AI"
                    },
                    body: JSON.stringify({
                        model: config.providers.openrouter.model || "openai/gpt-4o-mini",
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

            if (error.code === "TIMEOUT") throw new ProviderError("OpenRouter zaman aşımına uğradı.", "TIMEOUT");

            throw new ProviderError("OpenRouter bağlantısı başarısız.", "NETWORK");
        }

        if (!response.ok) {

            const code = classifyHttpStatus(response.status);

            throw new ProviderError(`OpenRouter hatası (${response.status})`, code);
        }

        const data = await response.json();

        const text = data?.choices?.[0]?.message?.content;

        if (!text) throw new ProviderError("OpenRouter boş yanıt döndürdü.", "SERVER");

        return text;
    }
}
