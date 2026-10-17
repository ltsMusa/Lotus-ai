console.log("gemini.js yüklendi");

import config from "../config.js";
import { fetchWithTimeout } from "../utils.js";
import { streamSSE, extractGeminiDelta } from "../streaming.js";
import { ProviderError, classifyHttpStatus } from "./providerError.js";

function toGeminiContents(history) {

    // Gemini uses "model" instead of "assistant", and takes the
    // system prompt as a separate field rather than a message.
    return history.map(message => ({
        role: message.role === "assistant" ? "model" : "user",
        parts: [{ text: message.content }]
    }));
}

export default class GeminiProvider {

    async sendMessage({ history = [], systemPrompt = "" } = {}) {

        const apiKey = config.providers.gemini.apiKey;

        if (!apiKey) {

            throw new ProviderError("Gemini API anahtarı ayarlanmamış.", "NO_KEY");
        }

        const model = config.providers.gemini.model || "gemini-2.0-flash";

        let response;

        try {

            response = await fetchWithTimeout(
                `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        system_instruction: { parts: [{ text: systemPrompt }] },
                        contents: toGeminiContents(history)
                    })
                },
                15000
            );

        } catch (error) {

            if (error.code === "TIMEOUT") throw new ProviderError("Gemini zaman aşımına uğradı.", "TIMEOUT");

            throw new ProviderError("Gemini bağlantısı başarısız.", "NETWORK");
        }

        if (!response.ok) {

            const code = classifyHttpStatus(response.status);

            throw new ProviderError(`Gemini hatası (${response.status})`, code);
        }

        const data = await response.json();

        const text = data?.candidates?.[0]?.content?.parts?.map(part => part.text).join("");

        if (!text) throw new ProviderError("Gemini boş yanıt döndürdü.", "SERVER");

        return text;
    }

    async sendMessageStream({ history = [], systemPrompt = "" } = {}, onToken, controller = null) {

        const apiKey = config.providers.gemini.apiKey;

        if (!apiKey) {

            throw new ProviderError("Gemini API anahtarı ayarlanmamış.", "NO_KEY");
        }

        const model = config.providers.gemini.model || "gemini-2.0-flash";

        let fullText = "";

        await streamSSE(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    system_instruction: { parts: [{ text: systemPrompt }] },
                    contents: toGeminiContents(history)
                })
            },
            json => {

                const delta = extractGeminiDelta(json);

                if (delta) {

                    fullText += delta;

                    onToken?.(delta, fullText);
                }
            },
            "Gemini",
            60000,
            controller
        );

        if (!fullText) throw new ProviderError("Gemini boş yanıt döndürdü.", "SERVER");

        return fullText;
    }

    /**
     * Real image analysis — the model actually receives the image
     * bytes (as inline base64), not just a filename or description.
     * Non-streaming for simplicity; vision replies are typically
     * short enough that the wait is unnoticeable.
     */
    async sendMessageWithImages({ history = [], systemPrompt = "", message = "", images = [] } = {}) {

        const apiKey = config.providers.gemini.apiKey;

        if (!apiKey) {

            throw new ProviderError("Gemini API anahtarı ayarlanmamış.", "NO_KEY");
        }

        const model = config.providers.gemini.model || "gemini-2.0-flash";

        const imageParts = images.map(image => ({
            inline_data: {
                mime_type: image.mimeType,
                data: image.dataUrl.split(",")[1] || ""
            }
        }));

        const contents = [
            ...toGeminiContents(history),
            { role: "user", parts: [{ text: message }, ...imageParts] }
        ];

        let response;

        try {

            response = await fetchWithTimeout(
                `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        system_instruction: { parts: [{ text: systemPrompt }] },
                        contents
                    })
                },
                30000
            );

        } catch (error) {

            if (error.code === "TIMEOUT") throw new ProviderError("Gemini zaman aşımına uğradı.", "TIMEOUT");

            throw new ProviderError("Gemini bağlantısı başarısız.", "NETWORK");
        }

        if (!response.ok) {

            const code = classifyHttpStatus(response.status);

            throw new ProviderError(`Gemini hatası (${response.status})`, code);
        }

        const data = await response.json();

        const text = data?.candidates?.[0]?.content?.parts?.map(part => part.text).join("");

        if (!text) throw new ProviderError("Gemini boş yanıt döndürdü.", "SERVER");

        return text;
    }
}
