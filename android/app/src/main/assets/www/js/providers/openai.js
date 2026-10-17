console.log("openai.js yüklendi");

import config from "../config.js";
import { fetchWithTimeout } from "../utils.js";
import { streamSSE, extractOpenAIDelta } from "../streaming.js";
import { ProviderError, classifyHttpStatus } from "./providerError.js";

export default class OpenAIProvider {

    async sendMessage({ history = [], systemPrompt = "" } = {}) {

        const apiKey = config.providers.openai.apiKey;

        if (!apiKey) {

            throw new ProviderError("OpenAI API anahtarı ayarlanmamış.", "NO_KEY");
        }

        let response;

        try {

            response = await fetchWithTimeout(
                "https://api.openai.com/v1/chat/completions",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${apiKey}`
                    },
                    body: JSON.stringify({
                        model: config.providers.openai.model || "gpt-4o-mini",
                        messages: [
                            { role: "system", content: systemPrompt },
                            ...history
                        ]
                    })
                },
                15000
            );

        } catch (error) {

            if (error.code === "TIMEOUT") throw new ProviderError("OpenAI zaman aşımına uğradı.", "TIMEOUT");

            throw new ProviderError("OpenAI bağlantısı başarısız.", "NETWORK");
        }

        if (!response.ok) {

            const code = classifyHttpStatus(response.status);

            throw new ProviderError(`OpenAI hatası (${response.status})`, code);
        }

        const data = await response.json();

        const text = data?.choices?.[0]?.message?.content;

        if (!text) throw new ProviderError("OpenAI boş yanıt döndürdü.", "SERVER");

        return text;
    }

    async sendMessageStream({ history = [], systemPrompt = "" } = {}, onToken, controller = null) {

        const apiKey = config.providers.openai.apiKey;

        if (!apiKey) {

            throw new ProviderError("OpenAI API anahtarı ayarlanmamış.", "NO_KEY");
        }

        let fullText = "";

        await streamSSE(
            "https://api.openai.com/v1/chat/completions",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: config.providers.openai.model || "gpt-4o-mini",
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
            "OpenAI",
            60000,
            controller
        );

        if (!fullText) throw new ProviderError("OpenAI boş yanıt döndürdü.", "SERVER");

        return fullText;
    }

    /** Real image analysis via OpenAI's vision-capable chat models. */
    async sendMessageWithImages({ history = [], systemPrompt = "", message = "", images = [] } = {}) {

        const apiKey = config.providers.openai.apiKey;

        if (!apiKey) {

            throw new ProviderError("OpenAI API anahtarı ayarlanmamış.", "NO_KEY");
        }

        const userContent = [
            { type: "text", text: message },
            ...images.map(image => ({ type: "image_url", image_url: { url: image.dataUrl } }))
        ];

        let response;

        try {

            response = await fetchWithTimeout(
                "https://api.openai.com/v1/chat/completions",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${apiKey}`
                    },
                    body: JSON.stringify({
                        model: config.providers.openai.model || "gpt-4o-mini",
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

            if (error.code === "TIMEOUT") throw new ProviderError("OpenAI zaman aşımına uğradı.", "TIMEOUT");

            throw new ProviderError("OpenAI bağlantısı başarısız.", "NETWORK");
        }

        if (!response.ok) {

            const code = classifyHttpStatus(response.status);

            throw new ProviderError(`OpenAI hatası (${response.status})`, code);
        }

        const data = await response.json();

        const text = data?.choices?.[0]?.message?.content;

        if (!text) throw new ProviderError("OpenAI boş yanıt döndürdü.", "SERVER");

        return text;
    }
}
