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
import { buildSystemPrompt, buildCompactSystemPrompt } from "./prompts/systemPrompt.js";
import { streamSSE, extractOpenAIDelta, extractGeminiDelta } from "./streaming.js";
import { ProviderError, classifyHttpStatus } from "./providers/providerError.js";

import GeminiProvider from "./providers/gemini.js";
import GroqProvider from "./providers/groq.js";
import OpenAIProvider from "./providers/openai.js";
import OpenRouterProvider from "./providers/openrouter.js";
import OllamaProvider from "./providers/ollama.js";
import LocalAI from "./providers/local.js";
import { planRoute, Cooldowns, QUOTA_CODES } from "./router.js";
import DeviceMonitor from "./deviceMonitor.js";

const PROVIDER_LABELS = {
    groq: "Groq",
    gemini: "Gemini",
    openai: "OpenAI",
    openrouter: "OpenRouter",
    ollama: "Yerel Ollama",
    wasm: "Lotus Mini"
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

/**
 * Image analysis through the Lotus server (api/chat.js) with ITS shared
 * keys — so photo/video analysis works out of the box without the user
 * pasting a key. Non-streaming: the server returns { text }.
 */
async function callBackendProxyVision(providerName, { systemPrompt, history, message, images, model, controller }) {

    if (config.isProxyUnreachable()) {

        throw new ProviderError("Sunucu proxy adresi ayarlanmamış.", "NOT_FOUND");
    }

    const maxImages = providerName === "groq" ? 3 : 4;

    const messages = [
        { role: "system", content: systemPrompt },
        ...history,
        {
            role: "user",
            content: [
                { type: "text", text: message },
                ...images.slice(0, maxImages).map(image => ({ type: "image_url", image_url: { url: image.dataUrl } }))
            ]
        }
    ];

    const attempt = new AbortController();

    const timer = setTimeout(() => attempt.abort(), 45000);

    if (controller) {

        if (controller.signal.aborted) attempt.abort();

        else controller.signal.addEventListener("abort", () => attempt.abort(), { once: true });
    }

    let response;

    try {

        response = await fetch(config.getBackendProxyUrl(), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ provider: providerName, messages, model, stream: false }),
            signal: attempt.signal
        });

    } catch (error) {

        if (error.name === "AbortError") {

            throw new ProviderError(
                controller?.signal.aborted ? "Yanıt kullanıcı tarafından durduruldu." : "Sunucu zaman aşımına uğradı.",
                controller?.signal.aborted ? "ABORTED" : "TIMEOUT"
            );
        }

        throw new ProviderError("Sunucuya ulaşılamadı.", "NETWORK");

    } finally {

        clearTimeout(timer);
    }

    if (!response.ok) {

        let detail = "";
        let keysExhausted = false;

        try {

            const body = await response.json();

            detail = body?.error || "";
            keysExhausted = Boolean(body?.keysExhausted);

        } catch { /* not JSON */ }

        // "GROQ_API_KEY ayarlanmamış" — the server simply has no key for this
        // provider; that will not change within minutes.
        const noServerKey = response.status >= 500 && /_API_KEY/.test(detail);

        throw new ProviderError(
            detail || `Sunucu hatası (${response.status})`,
            keysExhausted ? "KEYS_EXHAUSTED" : noServerKey ? "NO_KEY" : classifyHttpStatus(response.status)
        );
    }

    const data = await response.json();

    if (!data?.text) throw new ProviderError("Sunucu boş yanıt döndürdü.", "SERVER");

    return data.text;
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

    // ------------------------------------------------------
    // ROUTING (see js/router.js)
    // ------------------------------------------------------

    /** Providers that can be tried right now, preferred first (never Ollama). */
    cloudCandidates() {

        const proxyOk = config.useBackendProxy && !config.isProxyUnreachable();

        return [config.provider, ...config.providerPriority]
            .filter((name, index, all) =>
                name !== "ollama" &&
                this.providers[name] &&
                config.providers[name] &&
                all.indexOf(name) === index &&
                // a personal key, or the Lotus server
                (Boolean(config.providers[name].apiKey) || proxyOk)
            );
    }

    /** On-device backends that can answer, preferred first. */
    localBackends() {

        const list = [];

        const ollamaChosen = config.provider === "ollama";

        // An Ollama server is only tried when the user pointed the app at one.
        const ollamaConfigured = ollamaChosen ||
            Boolean(config.providers.ollama.model) ||
            (config.providers.ollama.baseUrl || "") !== "http://localhost:11434";

        if (ollamaChosen && ollamaConfigured) list.push("ollama");

        if (LocalAI.hasModel()) list.push("wasm");

        if (!list.includes("ollama") && (ollamaConfigured || config.routeMode === "local")) list.push("ollama");

        return list;
    }

    /** The plan for the next message — also used by the UI to preview it. */
    planRoute() {

        return planRoute({
            mode: config.routeMode,
            online: navigator.onLine !== false,
            cloud: this.cloudCandidates(),
            cooldownUntil: name => Cooldowns.until(name),
            local: this.localBackends()
        });
    }

    /** True when the next message cannot leave the device (offline / local mode / no provider). */
    willStayOnDevice() {

        const plan = this.planRoute();

        return plan.steps.length > 0 && plan.steps.every(step => step.kind === "local");
    }

    /**
     * Tells the UI (js/autoSwitch.js, js/statusIndicator.js) where the answer
     * came from and — when that is different from before — why.
     *
     * reasons: "" (nothing to announce) | "quota" | "failure" | "offline" |
     *          "no-provider" | "provider-available"
     */
    announceRoute(route, plan, failures, { explicit = false } = {}) {

        const previous = this.lastRoute || null;

        const cloudFailures = failures.filter(item => !item.local);

        const parkedForQuota = (plan.skipped || []).some(item => QUOTA_CODES.includes(Cooldowns.reason(item.name)));

        const quotaHit = cloudFailures.some(item => QUOTA_CODES.includes(item.code)) || parkedForQuota;

        const failedFirst = cloudFailures[0]
            ? { kind: "cloud", name: cloudFailures[0].provider, label: PROVIDER_LABELS[cloudFailures[0].provider] || cloudFailures[0].provider }
            : (plan.skipped?.[0]
                ? { kind: "cloud", name: plan.skipped[0].name, label: PROVIDER_LABELS[plan.skipped[0].name] || plan.skipped[0].name }
                : null);

        const same = Boolean(previous && previous.kind === route.kind && previous.name === route.name);

        this.lastRoute = { kind: route.kind, name: route.name, label: route.label };

        // Where the switch started: what was tried/skipped first in THIS
        // message, otherwise the route of the previous answer.
        const from = failedFirst || previous;

        const changed = cloudFailures.length > 0 || !same;

        let reason = "";

        if (explicit || config.routeMode === "local") {

            reason = "";

        } else if (route.kind === "local") {

            if (plan.offline) reason = "offline";
            else if (quotaHit) reason = "quota";
            else if (this.cloudCandidates().length === 0) reason = "no-provider";
            else reason = "failure";

        } else if (previous?.kind === "local" && !same) {

            reason = "provider-available";

        } else if (from && (cloudFailures.length > 0 || !same)) {

            reason = quotaHit ? "quota" : "failure";
        }

        try {

            window.dispatchEvent(new CustomEvent("lotus:route-changed", {
                detail: { from, to: this.lastRoute, changed, reason, label: route.label }
            }));

        } catch { /* no window */ }
    }

    async runLocalBackend(backend, { history, memoryContext, searchContext, onToken, controller, onStatus }) {

        if (backend === "wasm") {

            let used = null;

            const text = await LocalAI.sendMessageStream(
                { history, systemPrompt: buildCompactSystemPrompt({ memoryContext, searchContext }) },
                onToken,
                controller,
                { onStatus, onModel: info => { used = info; } }
            );

            return { text, label: used?.model?.name || "Lotus Mini", detail: used?.choice };
        }

        // Ollama: a real server, so the full prompt is fine.
        const text = await this.providers.ollama.sendMessageStream(
            { history, systemPrompt: buildSystemPrompt({ memoryContext, searchContext: "" }) },
            onToken,
            controller
        );

        return { text, label: "Yerel Ollama" };
    }

    /**
     * @param {string} message - the new user message
     * @param {object} options
     * @param {Array<{role, content}>} [options.history]
     * @param {string} [options.memoryContext]
     * @param {string} [options.searchContext]
     * @param {(delta:string, fullTextSoFar:string) => void} [options.onToken] - streaming callback
     * @param {(label:string) => void} [options.onStatus] - progress text ("Lotus Mini yükleniyor…")
     * @returns {Promise<{ text, provider, route, error, limitReached, needsLocalModel }>}
     *
     * Where the message goes is decided by js/router.js (mode "auto" by
     * default): a connected provider, the next provider when a quota runs
     * out, the on-device model when nothing else is usable or offline.
     *
     * `limitReached: true` makes chat.js show the "Limit doldu" choice card
     * (new key / continue on the device / download Lotus Mini).
     */
    async sendMessage(message, { history = [], memoryContext = "", searchContext = "", onToken = null, controller = null, onStatus = null } = {}) {

        const fullHistory = [...history, { role: "user", content: message }];

        const plan = this.planRoute();

        const attemptedErrors = [];

        if (plan.steps.length === 0) {

            const offline = navigator.onLine === false;

            return {
                text: offline
                    ? "Çevrimdışısın ve bu cihazda Lotus Mini kurulu değil. İnternete bağlanınca bir sağlayıcıyla, ya da Ayarlar → Yapay Zekâ'dan Lotus Mini'yi indirerek çevrimdışı da sohbet edebilirsin."
                    : "Henüz bağlı bir yapay zekâ sağlayıcısı yok ve cihazda yerel model kurulu değil.",
                provider: null,
                error: offline ? "OFFLINE" : "NO_PROVIDER",
                limitReached: !offline,
                needsLocalModel: true,
                reason: "no-provider"
            };
        }

        for (const step of plan.steps) {

            if (controller?.signal.aborted) throw new ProviderError("Yanıt kullanıcı tarafından durduruldu.", "ABORTED");

            // ---------- on-device ----------
            if (step.kind === "local") {

                try {

                    if (attemptedErrors.length > 0) {

                        onStatus?.(`${PROVIDER_LABELS[step.name] || "Yerel model"} ile devam ediliyor…`);
                    }

                    const result = await this.runLocalBackend(step.name, {
                        history: fullHistory, memoryContext, searchContext, onToken, controller, onStatus
                    });

                    const route = { kind: "local", name: step.name, label: result.label };

                    this.announceRoute(route, plan, attemptedErrors);

                    return { text: result.text, provider: step.name, route, error: null, limitReached: false };

                } catch (error) {

                    if (error.code === "ABORTED") throw error;

                    console.warn(`⚠️ ${PROVIDER_LABELS[step.name] || step.name} başarısız (${error.code || "UNKNOWN"}):`, error.message);

                    attemptedErrors.push({ provider: step.name, code: error.code, message: error.message, local: true });

                    continue;
                }
            }

            // ---------- hosted provider ----------
            const providerName = step.name;

            const provider = this.providers[providerName];

            const hasPersonalKey = Boolean(config.providers[providerName]?.apiKey);

            const goThroughProxy = config.useBackendProxy && !hasPersonalKey;

            const systemPrompt = buildSystemPrompt({ memoryContext, searchContext });

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

                Cooldowns.success(providerName);

                const route = { kind: "cloud", name: providerName, label: PROVIDER_LABELS[providerName] || providerName };

                this.announceRoute(route, plan, attemptedErrors);

                return { text, provider: providerName, route, error: null, limitReached: false };

            } catch (error) {

                // A user-initiated Stop should never trigger provider
                // fallback or the "Limit doldu" screen — bubble it up
                // as-is so chat.js can finalize whatever partial text
                // already streamed to the message bubble.
                if (error.code === "ABORTED") throw error;

                console.warn(`⚠️ ${PROVIDER_LABELS[providerName] || providerName} başarısız (${error.code || "UNKNOWN"}):`, error.message);

                attemptedErrors.push({ provider: providerName, code: error.code, message: error.message });

                // Park it so the next messages do not wait for it again.
                Cooldowns.mark(providerName, error.code);
            }
        }

        // ---------- nothing answered ----------

        const cloudErrors = attemptedErrors.filter(item => !item.local);

        const quotaHit = cloudErrors.some(item => QUOTA_CODES.includes(item.code));

        const localInstalled = LocalAI.hasModel();

        // Quota ran out (or nothing is connected) and there is no on-device model:
        // offer the choice card — new key, or download Lotus Mini.
        if (quotaHit && !localInstalled && config.routeMode !== "cloud") {

            return {
                text: "Bağlı sağlayıcıların kullanım limiti doldu.",
                provider: null,
                error: "KEYS_EXHAUSTED",
                limitReached: true,
                needsLocalModel: true,
                reason: "quota"
            };
        }

        // The pre-existing "shared Groq pool is empty" card for cloud-only mode.
        if (cloudErrors.some(item => item.provider === "groq" && item.code === "KEYS_EXHAUSTED") && config.routeMode === "cloud") {

            return {
                text: "Groq için şu an ayrılan kullanım limiti doldu.",
                provider: null,
                error: "KEYS_EXHAUSTED",
                limitReached: true,
                needsLocalModel: false,
                reason: "quota"
            };
        }

        const lastError = attemptedErrors[attemptedErrors.length - 1];

        const triedLabel = attemptedErrors.map(item => PROVIDER_LABELS[item.provider] || item.provider).join(", ");

        const proxyNotDeployed = config.useBackendProxy && cloudErrors.length > 0 && cloudErrors.every(item => item.code === "NOT_FOUND");

        const hint = proxyNotDeployed
            ? " (Sunucu proxy'si bulunamadı — Vercel'e deploy edilmemiş olabilir, ya da uygulama olarak paketlendiyse Ayarlar → Yapay Zekâ → \"Sunucu Proxy Adresi\" alanı boş kalmış olabilir. Kendi API anahtarını girerek de doğrudan bağlanabilirsin.)"
            : "";

        const localHint = !localInstalled && config.routeMode !== "cloud"
            ? " Ayarlar → Yapay Zekâ'dan Lotus Mini'yi indirirsen internet olmadan da yanıt verebilirim."
            : "";

        return {
            text: `Denenen tüm sağlayıcılar başarısız oldu (${triedLabel}). Son hata: ${lastError?.message || "bilinmiyor"}${hint}${localHint}`,
            provider: null,
            error: lastError?.code || "UNKNOWN",
            limitReached: false
        };
    }

    /**
     * Explicit on-device path — the "Yerel modelle devam et" button on the
     * limit card. Ignores the routing plan: Lotus Mini first, then Ollama.
     */
    async sendMessageViaLocal(message, { history = [], memoryContext = "", searchContext = "", onToken = null, controller = null, onStatus = null } = {}) {

        const fullHistory = [...history, { role: "user", content: message }];

        const backends = this.localBackends();

        if (backends.length === 0) backends.push("wasm");

        let lastError = null;

        for (const backend of backends) {

            try {

                const result = await this.runLocalBackend(backend, {
                    history: fullHistory, memoryContext, searchContext, onToken, controller, onStatus
                });

                const route = { kind: "local", name: backend, label: result.label };

                this.announceRoute(route, { skipped: [], offline: false }, [], { explicit: true });

                return { text: result.text, provider: backend, route, error: null, limitReached: false };

            } catch (error) {

                if (error.code === "ABORTED") throw error;

                lastError = error;
            }
        }

        return {
            text: lastError?.message || "Yerel model çalıştırılamadı.",
            provider: null,
            error: lastError?.code || "UNKNOWN",
            limitReached: false
        };
    }

    /** Kept for older callers. */
    sendMessageViaOllama(message, options) {

        return this.sendMessageViaLocal(message, options);
    }

    /**
     * Real image/video-frame analysis. Order tried:
     *   1. the user's OWN keys for vision-capable providers
     *      (Gemini → OpenAI → Groq → OpenRouter)
     *   2. the Lotus server's shared keys (Gemini → Groq), so analysis
     *      works with no setup when the proxy is deployed.
     */
    async sendMessageWithImages(message, images, { history = [], memoryContext = "", searchContext = "", controller = null } = {}) {

        const personalOrder = ["gemini", "openai", "groq", "openrouter"].filter(
            name => config.providers[name]?.apiKey
        );

        const canUseServer = config.useBackendProxy && !config.isProxyUnreachable();

        if (personalOrder.length === 0 && !canUseServer) {

            return {
                text: "Görsel/video analizi için Ayarlar → Yapay Zekâ bölümünden Gemini, OpenAI, Groq " +
                    "veya OpenRouter'dan birine kendi API anahtarını eklemen gerekiyor " +
                    "(ya da sunucu proxy adresini ayarlaman).",
                provider: null,
                error: "NO_KEY",
                limitReached: false
            };
        }

        const systemPrompt = buildSystemPrompt({ memoryContext, searchContext });

        const attemptedErrors = [];

        const stopped = () => controller?.signal.aborted;

        for (const providerName of personalOrder) {

            if (stopped()) throw new ProviderError("Yanıt kullanıcı tarafından durduruldu.", "ABORTED");

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

        if (canUseServer) {

            for (const providerName of ["gemini", "groq"]) {

                // Already tried with the user's own key above.
                if (personalOrder.includes(providerName)) continue;

                if (stopped()) throw new ProviderError("Yanıt kullanıcı tarafından durduruldu.", "ABORTED");

                try {

                    const text = await callBackendProxyVision(providerName, {
                        systemPrompt,
                        history,
                        message,
                        images,
                        model: providerName === "gemini" ? config.providers.gemini.model : config.providers.groq.visionModel,
                        controller
                    });

                    return { text, provider: providerName, error: null, limitReached: false };

                } catch (error) {

                    if (error.code === "ABORTED") throw error;

                    console.warn(`⚠️ Sunucu (${PROVIDER_LABELS[providerName]}) görsel analizi başarısız:`, error.message);

                    attemptedErrors.push({ provider: providerName, message: error.message });
                }
            }
        }

        const lastError = attemptedErrors[attemptedErrors.length - 1];

        return {
            text: `Görsel analiz edilemedi. Son hata (${PROVIDER_LABELS[lastError?.provider] || "bilinmiyor"}): ${lastError?.message || "bilinmiyor"}`,
            provider: null,
            error: "UNKNOWN",
            limitReached: false
        };
    }
}
