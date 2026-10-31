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

import { isPackagedApp } from "./env.js";
import { DEFAULT_PERSONALIZATION, normalizePersonalization } from "./personalization.js";
import { DEFAULT_THEME, normalizeTheme } from "./themeList.js";
import { DEFAULT_NOTIFICATIONS, normalizeNotifications } from "./notifyPolicy.js";

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
        gemini: { apiKey: "", model: "gemini-3.8-flash" },
        groq: { apiKey: "", model: "openai/gpt-oss-120b", visionModel: "qwen/qwen3.8-27b" },
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

    // Where a message is answered (js/router.js):
    //   "auto"  → a connected provider, the next one when a quota runs out,
    //             the on-device model (Lotus Mini) when none is usable
    //   "cloud" → providers only      "local" → on-device only
    routeMode: "auto",

    // On-device model (Lotus Mini, js/providers/local.js)
    local: {
        adaptive: true, // pick the model size from heat / battery / power-saver
        preferredModel: "auto", // or a model id from js/localModels.js
        useGpu: false, // WebGPU offload is experimental on phones
        idleUnloadMinutes: 5 // free the RAM after this long without a message
    },

    // Look of the app: "neon-purple" (Lotus Mor) or "dark-gray" (Karanlık),
    // chosen in Settings → Kişiselleştirme → Tema (js/themeList.js).
    theme: DEFAULT_THEME,

    // Kişiselleştirme: the user's own standing instructions and style
    // choices, added to the system prompt of every request
    // (js/personalization.js, Settings → Kişiselleştirme). Separate from
    // Hafıza, which holds the short facts Lotus collects.
    personalization: { ...DEFAULT_PERSONALIZATION },

    // Bildirimler ve arka planda çalışma (js/notifyPolicy.js, js/notify.js,
    // Settings → Bildirimler).
    notifications: { ...DEFAULT_NOTIFICATIONS },

    // "Her mesajda otomatik web araması yapsın" — on by default so
    // answers stay grounded in current info instead of the model's
    // frozen training data. Adds latency to every message, so it's
    // toggleable in Settings → Yapay Zekâ for anyone who'd rather
    // skip it for speed.
    webSearchEnabled: true,

    // Web search needs a search API (Jina's keyless search endpoint was
    // closed). Order tried by js/webSearch.js: this personal key →
    // the server's /api/search → keyless Wikipedia. "auto" picks the
    // provider from the key's prefix (tvly- → Tavily, jina_ → Jina).
    searchProvider: "auto",
    searchApiKey: ""
};

// Model IDs that providers have shut down. A saved config keeps the
// defaults it was first written with, so just changing DEFAULTS would
// never reach existing users — these are swapped for the current
// default the next time the app loads.
const RETIRED_MODELS = {
    gemini: [
        "gemini-1.0-pro", "gemini-pro", "gemini-1.5-flash", "gemini-1.5-flash-8b", "gemini-1.5-pro",
        "gemini-2.0-flash", "gemini-2.0-flash-001", "gemini-2.0-flash-lite", "gemini-2.0-flash-lite-001"
    ],
    // llama-3.3-70b-versatile / llama-3.1-8b-instant / qwen3-32b: shut down for
    // free & developer accounts on Groq (2026-08-16 / 2026-07-17).
    groq: [
        "llama3-70b-8192", "llama3-8b-8192", "mixtral-8x7b-32768", "gemma2-9b-it", "llama-3.1-70b-versatile",
        "llama-3.3-70b-versatile", "llama-3.1-8b-instant", "qwen/qwen3-32b"
    ],
    groqVision: [
        "llama-3.2-11b-vision-preview", "llama-3.2-90b-vision-preview",
        "meta-llama/llama-4-scout-17b-16e-instruct", "meta-llama/llama-4-maverick-17b-128e-instruct",
        "qwen/qwen3.6-27b"
    ]
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

// A hand-edited or damaged saved value must never reach the prompt.
config.personalization = normalizePersonalization(config.personalization);
config.theme = normalizeTheme(config.theme);
config.notifications = normalizeNotifications(config.notifications);

function migrateRetiredModels(target) {

    let changed = false;

    const swap = (list, current, apply, replacement) => {

        if (list.includes(current)) {

            apply(replacement);

            changed = true;
        }
    };

    swap(RETIRED_MODELS.gemini, target.providers.gemini.model, value => { target.providers.gemini.model = value; }, DEFAULTS.providers.gemini.model);
    swap(RETIRED_MODELS.groq, target.providers.groq.model, value => { target.providers.groq.model = value; }, DEFAULTS.providers.groq.model);
    swap(RETIRED_MODELS.groqVision, target.providers.groq.visionModel, value => { target.providers.groq.visionModel = value; }, DEFAULTS.providers.groq.visionModel);

    return changed;
}

if (migrateRetiredModels(config)) {

    try {

        localStorage.setItem(STORAGE_KEY, JSON.stringify(config));

    } catch {

        // storage unavailable — the migration just reruns next load
    }
}

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

    // A new key may bring a parked provider back (js/router.js listens).
    try {

        window.dispatchEvent(new CustomEvent("lotus:provider-key-changed", { detail: { provider: providerName } }));

    } catch {

        // no window (tests)
    }

    return true;
};

config.setProviderModel = function (providerName, model) {

    if (!this.providers[providerName]) return false;

    this.providers[providerName].model = String(model || "").trim();

    persist();

    return true;
};

config.setGroqVisionModel = function (model) {

    this.providers.groq.visionModel = String(model || "").trim() || DEFAULTS.providers.groq.visionModel;

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

config.setRouteMode = function (mode) {

    this.routeMode = ["auto", "cloud", "local"].includes(mode) ? mode : "auto";

    persist();
};

config.setLocal = function (updates = {}) {

    this.local = { ...this.local, ...updates };

    persist();

    try {

        window.dispatchEvent(new CustomEvent("lotus:local-settings-changed", { detail: this.local }));

    } catch {

        // no window (tests)
    }
};

config.setTheme = function (id) {

    this.theme = normalizeTheme(id);

    persist();

    try {

        window.dispatchEvent(new CustomEvent("lotus:theme-changed", { detail: { theme: this.theme } }));

    } catch {

        // no window (tests)
    }

    return this.theme;
};

config.setPersonalization = function (updates = {}) {

    // Always store a complete, valid object — whatever the form (or a
    // damaged localStorage entry) hands over.
    this.personalization = normalizePersonalization({ ...this.personalization, ...updates });

    persist();

    try {

        window.dispatchEvent(new CustomEvent("lotus:personalization-changed", { detail: this.personalization }));

    } catch {

        // no window (tests)
    }

    return this.personalization;
};

config.resetPersonalization = function () {

    return this.setPersonalization({ ...DEFAULT_PERSONALIZATION });
};

config.setNotifications = function (updates = {}) {

    this.notifications = normalizeNotifications({ ...this.notifications, ...updates });

    persist();

    try {

        window.dispatchEvent(new CustomEvent("lotus:notifications-changed", { detail: this.notifications }));

    } catch {

        // no window (tests)
    }

    return this.notifications;
};

config.setMemoryEnabled = function (enabled) {

    this.memoryEnabled = Boolean(enabled);

    persist();
};

config.setWebSearchEnabled = function (enabled) {

    this.webSearchEnabled = Boolean(enabled);

    persist();
};

config.setSearchApiKey = function (key) {

    this.searchApiKey = String(key || "").trim();

    persist();
};

config.setSearchProvider = function (provider) {

    this.searchProvider = ["auto", "tavily", "jina"].includes(provider) ? provider : "auto";

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

    return this.useBackendProxy && !this.backendProxyBaseUrl && isPackagedApp();
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
