/**
 * ==========================================================
 * Lotus AI - API Manager
 * Version : 4.0
 * Description : Sends messages to AI providers with automatic
 *               fallback, streaming, backend-proxy routing,
 *               and Groq key-pool exhaustion handling.
 * ==========================================================
 */
console.log("api.js yüklendi");

import config from "./config.js";
import { buildSystemPrompt } from "./prompts/systemPrompt.js";
import { streamSSE, extractOpenAIDelta, extractGeminiDelta } from "./streaming.js";
import { ProviderError } from "./providers/providerError.js";

import GeminiProvider from "./providers/gemini.js";
import GroqProvider from "./providers/groq.js";
import OpenAIProvider from "./providers/openai.js";
import OpenRouterProvider from "./providers/openrouter.js";
import OllamaProvider from "./providers/ollama.js";

const PROVIDER_LABELS = {
    groq: "Groq",
    gemini: "Gemini",
    openai: "OpenAI",
    openrouter: "OpenRouter",
    ollama: "Yerel Ollama"
};

async function callBackendProxy(providerName, { messages, model, onToken, controller }) {

    if (config.isProxyUnreachable()) {

        throw new ProviderError(
            "Sunucu proxy adresi ayarlanmamış. Bu, dosyadan/uygulama olarak çalıştığı için " +
            "göreli \"/api/chat\" adresine ulaşamıyor — Ayarlar → Yapay Zekâ → " +
            "\"Sunucu Proxy Adresi\" alanına deploy ettiğin adresi (örn. https://... .vercel.app) gir.",
            "NOT_FOUND"
        );
    }

    const extractor = providerName === "gemini" ? extractGeminiDelta : extractOpenAIDelta;

    let fullText = "";

    await streamSSE(
        config.getBackendProxyUrl(),
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ provider: providerName, messages, model, stream: true })
        },
        json => {

            const delta = extractor(json);

            if (delta) {

                fullText += delta;

                onToken?.(delta, fullText);
            }
        },
        PROVIDER_LABELS[providerName],
        60000,
        controller
    );

    if (!fullText) throw new ProviderError(`${PROVIDER_LABELS[providerName]} boş yanıt döndürdü.`, "SERVER");

    return fullText;
}

export default class APIManager {

    constructor() {

        this.providers = {
            gemini: new GeminiProvider(),
            groq: new GroqProvider(),
            openai: new OpenAIProvider(),
            openrouter: new OpenRouterProvider(),
            ollama: new OllamaProvider()
        };
    }

    /**
     * @param {string} message - the new user message
     * @param {object} options
     * @param {Array<{role, content}>} [options.history]
     * @param {string} [options.memoryContext]
     * @param {string} [options.searchContext]
     * @param {(delta:string, fullTextSoFar:string) => void} [options.onToken] - streaming callback
     * @returns {Promise<{ text, provider, error, limitReached }>}
     *
     * `limitReached: true` means every hosted provider's shared key
     * pool is exhausted right now — chat.js shows the "Limit doldu"
     * choice screen (get a personal key / switch to local Ollama)
     * instead of a plain error bubble.
     */
    async sendMessage(message, { history = [], memoryContext = "", searchContext = "", onToken = null, controller = null } = {}) {

        const fallbackOrder = config.getFallbackOrder();

        const systemPrompt = buildSystemPrompt({ memoryContext, searchContext });

        const fullHistory = [...history, { role: "user", content: message }];

        if (fallbackOrder.length === 0) {

            return {
                text: "Henüz hiçbir yapay zekâ sağlayıcısı kullanılamıyor. Ayarlar → Yapay Zekâ bölümünden bir anahtar ekleyebilirsin.",
                provider: null,
                error: "NO_KEY",
                limitReached: false
            };
        }

        const attemptedErrors = [];

        for (const providerName of fallbackOrder) {

            const provider = this.providers[providerName];

            if (!provider) continue;

            const hasPersonalKey = Boolean(config.providers[providerName]?.apiKey);

            const goThroughProxy = config.useBackendProxy && !hasPersonalKey && providerName !== "ollama";

            try {

                let text;

                if (goThroughProxy) {

                    text = await callBackendProxy(providerName, {
                        messages: [{ role: "system", content: systemPrompt }, ...fullHistory],
                        model: config.providers[providerName]?.model,
                        onToken,
                        controller
                    });

                } else {

                    text = await provider.sendMessageStream(
                        { history: fullHistory, systemPrompt },
                        onToken,
                        controller
                    );
                }

                return { text, provider: providerName, error: null, limitReached: false };

            } catch (error) {

                // A user-initiated Stop should never trigger provider
                // fallback or the "Limit doldu" screen — bubble it up
                // as-is so chat.js can finalize whatever partial text
                // already streamed to the message bubble.
                if (error.code === "ABORTED") throw error;

                console.warn(`⚠️ ${PROVIDER_LABELS[providerName] || providerName} başarısız (${error.code || "UNKNOWN"}):`, error.message);

                attemptedErrors.push({ provider: providerName, code: error.code, message: error.message });
            }
        }

        // If Groq's shared key pool specifically came back exhausted,
        // that's the "Limit doldu" moment — surface the choice screen
        // regardless of what the other (already-empty-key) providers
        // reported, since Groq is the one running with no user setup.
        const groqExhausted = attemptedErrors.some(
            item => item.provider === "groq" && item.code === "KEYS_EXHAUSTED"
        );

        if (groqExhausted) {

            return {
                text: "Groq için şu an ayrılan kullanım limiti doldu.",
                provider: null,
                error: "KEYS_EXHAUSTED",
                limitReached: true
            };
        }

        const lastError = attemptedErrors[attemptedErrors.length - 1];

        const triedLabel = attemptedErrors.map(item => PROVIDER_LABELS[item.provider] || item.provider).join(", ");

        const proxyNotDeployed = config.useBackendProxy && attemptedErrors.every(item => item.code === "NOT_FOUND");

        const hint = proxyNotDeployed
            ? " (Sunucu proxy'si bulunamadı — Vercel'e deploy edilmemiş olabilir, ya da uygulama olarak paketlendiyse Ayarlar → Yapay Zekâ → \"Sunucu Proxy Adresi\" alanı boş kalmış olabilir. Kendi API anahtarını girerek de doğrudan bağlanabilirsin.)"
            : "";

        return {
            text: `Denenen tüm sağlayıcılar başarısız oldu (${triedLabel}). Son hata: ${lastError?.message || "bilinmiyor"}${hint}`,
            provider: null,
            error: lastError?.code || "UNKNOWN",
            limitReached: false
        };
    }

    /**
     * Explicit local path — used when the user picks "Yerel API
     * kullanarak devam et" on the limit screen. Bypasses the normal
     * fallback chain entirely (Ollama depends on a local/LAN server
     * that most users won't have, so it's never tried automatically).
     */
    async sendMessageViaOllama(message, { history = [], memoryContext = "", searchContext = "", onToken = null, controller = null } = {}) {

        const systemPrompt = buildSystemPrompt({ memoryContext, searchContext });

        const fullHistory = [...history, { role: "user", content: message }];

        const text = await this.providers.ollama.sendMessageStream(
            { history: fullHistory, systemPrompt },
            onToken,
            controller
        );

        return { text, provider: "ollama", error: null, limitReached: false };
    }

    /**
     * Real image/video-frame analysis. Vision requests are NOT routed
     * through the backend proxy (api/chat.js doesn't handle multi-part
     * image payloads) — this only works with the user's OWN personal
     * key for a vision-capable provider. Tries Gemini first (strong
     * free-tier vision support), then OpenAI, then Groq's dedicated
     * vision model, then OpenRouter.
     */
    async sendMessageWithImages(message, images, { history = [], memoryContext = "", searchContext = "" } = {}) {

        const visionOrder = ["gemini", "openai", "groq", "openrouter"].filter(
            name => config.providers[name]?.apiKey
        );

        if (visionOrder.length === 0) {

            return {
                text: "Görsel/video analizi için Ayarlar → Yapay Zekâ bölümünden Gemini, OpenAI, Groq " +
                    "veya OpenRouter'dan birine kendi API anahtarını eklemen gerekiyor — otomatik Groq " +
                    "modu görsel analizini desteklemiyor.",
                provider: null,
                error: "NO_KEY",
                limitReached: false
            };
        }

        const systemPrompt = buildSystemPrompt({ memoryContext, searchContext });

        const attemptedErrors = [];

        for (const providerName of visionOrder) {

            try {

                const text = await this.providers[providerName].sendMessageWithImages({
                    history,
                    systemPrompt,
                    message,
                    images
                });

                return { text, provider: providerName, error: null, limitReached: false };

            } catch (error) {

                console.warn(`⚠️ ${PROVIDER_LABELS[providerName]} görsel analizi başarısız:`, error.message);

                attemptedErrors.push({ provider: providerName, message: error.message });
            }
        }

        const lastError = attemptedErrors[attemptedErrors.length - 1];

        return {
            text: `Görsel analiz edilemedi. Son hata (${PROVIDER_LABELS[lastError.provider]}): ${lastError.message}`,
            provider: null,
            error: "UNKNOWN",
            limitReached: false
        };
    }
}
