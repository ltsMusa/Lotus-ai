/**
 * ==========================================================
 * Lotus AI - Configuration
 * ==========================================================
 * SECURITY NOTE
 * ----------------------------------------------------------
 * This file is shipped to the browser, so nothing written
 * here as a literal string is ever secret — anyone can open
 * DevTools and read it. That's why provider API keys are NOT
 * hardcoded below. Instead they're entered by the user in
 * Settings → Yapay Zekâ and persisted in localStorage on
 * their own device only.
 *
 * This is still a client-side key model (not a real secret,
 * just "not in source control"). The correct production
 * architecture is a backend proxy that holds the real keys
 * server-side — see /api/chat.js for a Vercel serverless
 * scaffold that does this. Until that proxy is wired up,
 * Lotus AI runs in "bring your own key" mode.
 * ==========================================================
 */

const STORAGE_KEY = "lotus_config_v1";

const DEFAULTS = {
    provider: "groq",
    // Fallback order used by APIManager when the active
    // provider fails, times out, or is rate-limited. "ollama" is
    // deliberately NOT in the automatic chain — it only gets used
    // when the user explicitly picks "Yerel API kullanarak devam et"
    // after every hosted option is exhausted, since it depends on a
    // local/LAN server that may not exist for a given user.
    providerPriority: ["groq", "openrouter", "gemini", "openai"],

    providers: {
        gemini: { apiKey: "", model: "gemini-2.0-flash" },
        groq: { apiKey: "", model: "llama-3.3-70b-versatile", visionModel: "llama-3.2-11b-vision-preview" },
        openai: { apiKey: "", model: "gpt-4o-mini" },
        openrouter: { apiKey: "", model: "openai/gpt-4o-mini" },
        ollama: { baseUrl: "http://localhost:11434", model: "" } // "" = auto-pick by device tier
    },

    voice: {
        sttEnabled: true,
        ttsEnabled: false,
        language: "tr-TR",
        rate: 1
    },

    // When true (the default), chat requests go through /api/chat
    // (see api/chat.js) using a Groq key the app already provides —
    // the user never has to paste their own key to get started. Real
    // keys live only on the server (Vercel env vars). Per-provider:
    // api.js only proxies a provider while the user hasn't entered
    // their own personal key for it in Settings — the moment they do,
    // that provider switches to using their key directly.
    useBackendProxy: true,

    // Base URL the proxy lives at. Empty string = same-origin relative
    // "/api/chat", which only works when this app is actually served
    // BY that Vercel deployment (normal web hosting). Packaged as a
    // native app (AIDE/WebView loading file:///android_asset/...),
    // there's no "same origin" server to call — set this to your
    // deployed proxy's full URL (e.g. "https://lotus-ai.vercel.app")
    // in Settings → Yapay Zekâ, or the shared-Groq auto mode simply
    // can't reach anything.
    backendProxyBaseUrl: "",

    memoryEnabled: true,

    // "Her mesajda otomatik web araması yapsın" — on by default so
    // answers stay grounded in current info instead of the model's
    // frozen training data. Adds latency to every message, so it's
    // toggleable in Settings → Yapay Zekâ for anyone who'd rather
    // skip it for speed.
    webSearchEnabled: true
};

function loadStoredConfig() {

    try {

        const raw = localStorage.getItem(STORAGE_KEY);

        if (!raw) return {};

        return JSON.parse(raw);

    } catch (error) {

        console.warn("⚙️ Config okunamadı, varsayılanlar kullanılıyor:", error);

        return {};
    }
}

function deepMerge(base, override) {

    const result = { ...base };

    for (const key of Object.keys(override || {})) {

        if (
            override[key] &&
            typeof override[key] === "object" &&
            !Array.isArray(override[key])
        ) {
            result[key] = deepMerge(base[key] || {}, override[key]);
        } else {
            result[key] = override[key];
        }
    }

    return result;
}

const config = deepMerge(DEFAULTS, loadStoredConfig());

function persist() {

    try {

        localStorage.setItem(STORAGE_KEY, JSON.stringify(config));

    } catch (error) {

        console.warn("⚙️ Config kaydedilemedi:", error);
    }
}

// ----------------------------------------------------------
// Mutators — always go through these so changes are saved.
// ----------------------------------------------------------

config.setProvider = function (providerName) {

    if (!this.providers[providerName]) return false;

    this.provider = providerName;

    persist();

    return true;
};

config.setProviderKey = function (providerName, apiKey) {

    if (!this.providers[providerName]) return false;

    this.providers[providerName].apiKey = String(apiKey || "").trim();

    persist();

    return true;
};

config.setProviderModel = function (providerName, model) {

    if (!this.providers[providerName]) return false;

    this.providers[providerName].model = String(model || "").trim();

    persist();

    return true;
};

config.setGroqVisionModel = function (model) {

    this.providers.groq.visionModel = String(model || "").trim() || "llama-3.2-11b-vision-preview";

    persist();
};

config.setOllamaBaseUrl = function (url) {

    this.providers.ollama.baseUrl = String(url || "").trim() || "http://localhost:11434";

    persist();
};

config.setVoice = function (updates = {}) {

    this.voice = { ...this.voice, ...updates };

    persist();
};

config.setMemoryEnabled = function (enabled) {

    this.memoryEnabled = Boolean(enabled);

    persist();
};

config.setWebSearchEnabled = function (enabled) {

    this.webSearchEnabled = Boolean(enabled);

    persist();
};

config.setUseBackendProxy = function (enabled) {

    this.useBackendProxy = Boolean(enabled);

    persist();
};

config.setBackendProxyBaseUrl = function (url) {

    this.backendProxyBaseUrl = String(url || "").trim().replace(/\/+$/, "");

    persist();
};

/** Full URL to POST proxy chat requests to. */
config.getBackendProxyUrl = function () {

    return `${this.backendProxyBaseUrl}/api/chat`;
};

/**
 * True when this page has no real HTTP origin to call a relative
 * "/api/chat" against (e.g. packaged as a native app and loaded via
 * file:///android_asset/...) AND no absolute proxy URL has been set —
 * the shared-Groq auto mode can't reach anything in that case.
 */
config.isProxyUnreachable = function () {

    return this.useBackendProxy && !this.backendProxyBaseUrl && window.location.protocol === "file:";
};

// Providers that currently have a usable key, in priority order,
// starting with the actively selected provider. In backend-proxy
// mode, every provider is a candidate — the browser doesn't hold
// keys, so it can't know which ones are actually configured; the
// server decides that per-request and api.js falls back on error.
config.getFallbackOrder = function () {

    if (this.useBackendProxy) {

        return [this.provider, ...this.providerPriority].filter(
            (name, index, arr) => this.providers[name] && arr.indexOf(name) === index
        );
    }

    const configured = this.providerPriority.filter(
        name => this.providers[name] && this.providers[name].apiKey
    );

    const ordered = [this.provider, ...configured].filter(
        (name, index, arr) =>
            this.providers[name] &&
            this.providers[name].apiKey &&
            arr.indexOf(name) === index
    );

    return ordered;
};

export default config;
