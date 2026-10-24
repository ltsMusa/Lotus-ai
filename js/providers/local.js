/**
 * ==========================================================
 * Lotus AI - On-device model ("Lotus Mini")
 * ==========================================================
 * Runs a small Qwen2.5-Instruct GGUF model inside the app with
 * llama.cpp compiled to WebAssembly (wllama, MIT licence) — no server,
 * no account, no internet once the model is on the device.
 *
 * Where the pieces come from
 *   engine  vendor/wllama/index.js + wllama.wasm   (put there by
 *           tools/fetch-local-ai.sh; if absent, the same version is
 *           loaded from the jsDelivr CDN when the device is online)
 *   model   models/<file>.gguf next to the app (optional, bundled), else
 *           downloaded once from Hugging Face and kept by the engine in
 *           the browser's persistent storage (OPFS) — see Settings →
 *           Yapay Zekâ → Lotus Mini.
 *
 * What this file does on top of the engine
 *   • download / delete / list models, with progress and cancel
 *   • pick WHICH installed model to run from the device's power and
 *     temperature (js/localPolicy.js) and reload when that changes
 *   • stream tokens, honour the Stop button, record speed so a phone that
 *     starts throttling is noticed (js/deviceMonitor.js)
 *   • free the memory after a few idle minutes
 *
 * The engine API used here (wllama 3.x): new Wllama({default: wasmUrl}),
 * .modelManager.getModels()/downloadModel(), .loadModelFromUrl(),
 * .createChatCompletion({stream:true, abortSignal}), .exit().
 * ==========================================================
 */

import config from "../config.js";
import { LOCAL_MODELS, LOCAL_MODEL_NAME, BUNDLED_MODEL_DIR, getLocalModel } from "../localModels.js";
import { pickLocalModel, recommendedModelId } from "../localPolicy.js";
import DeviceMonitor from "../deviceMonitor.js";
import { ProviderError } from "./providerError.js";

// The newest wllama that is actually PUBLISHED on npm (the GitHub master branch
// is ahead of npm — pointing the CDN URLs at an unpublished version 404s and
// the engine never loads, which looks like "the model does not download").
const ENGINE_VERSION = "3.8.1";

const ENGINE_URLS = [
    {
        label: "uygulama içi",
        module: new URL("../../vendor/wllama/index.js", import.meta.url).href,
        wasm: new URL("../../vendor/wllama/wllama.wasm", import.meta.url).href
    },
    {
        label: "jsDelivr",
        module: `https://cdn.jsdelivr.net/npm/@wllama/wllama@${ENGINE_VERSION}/esm/index.js`,
        wasm: `https://cdn.jsdelivr.net/npm/@wllama/wllama@${ENGINE_VERSION}/src/wasm/wllama.wasm`
    },
    {
        label: "unpkg",
        module: `https://unpkg.com/@wllama/wllama@${ENGINE_VERSION}/esm/index.js`,
        wasm: `https://unpkg.com/@wllama/wllama@${ENGINE_VERSION}/src/wasm/wllama.wasm`
    }
];

const INSTALLED_KEY = "lotus_local_installed_v1";
const MAX_REPLY_TOKENS = 700;
const TEMPERATURE = 0.7;
// Rough characters-per-token for Turkish/English text; only used to trim.
const CHARS_PER_TOKEN = 3.2;

const toError = (message, code) => new ProviderError(message, code);

// ----------------------------------------------------------
// STATE (observable)
// ----------------------------------------------------------

const state = {
    engine: "idle", // idle | loading | ready | missing | unsupported
    engineError: "",
    installed: [], // model ids present on the device
    installedKnown: false, // true once the engine confirmed the list
    downloading: null, // { id, loaded, total }
    loadedId: null,
    loadedThreads: 0,
    multithread: false,
    busy: false // a generation is running
};

const listeners = new Set();

function emit() {

    const snapshot = LocalAI.getState();

    listeners.forEach(listener => {

        try { listener(snapshot); } catch { /* a broken listener must not break the others */ }
    });

    try {

        window.dispatchEvent(new CustomEvent("lotus:local-state", { detail: snapshot }));

    } catch { /* no window */ }
}

function readInstalledHint() {

    try {

        const list = JSON.parse(localStorage.getItem(INSTALLED_KEY) || "[]");

        return Array.isArray(list) ? list.filter(id => getLocalModel(id)) : [];

    } catch {

        return [];
    }
}

function writeInstalledHint(ids) {

    try { localStorage.setItem(INSTALLED_KEY, JSON.stringify(ids)); } catch { /* ignore */ }
}

state.installed = readInstalledHint();

// ----------------------------------------------------------
// ENGINE
// ----------------------------------------------------------

let wllama = null; // the Wllama instance (one at a time)
let EngineClass = null;
let enginePaths = null;
let enginePromise = null;
let engineSource = "";

/** Short, human reason why a source could not be used (HTTP status or network). */
async function probeSource(url) {

    try {

        const controller = new AbortController();

        const timer = setTimeout(() => controller.abort(), 4000);

        const response = await fetch(url, { method: "HEAD", signal: controller.signal });

        clearTimeout(timer);

        return response.ok ? "dosya var ama yüklenemedi" : `HTTP ${response.status}`;

    } catch {

        return navigator.onLine === false ? "internet yok" : "ulaşılamadı";
    }
}

async function importEngine() {

    const failures = [];

    for (const source of ENGINE_URLS) {

        // The CDN copies are only worth trying while online.
        if (source.label !== "uygulama içi" && navigator.onLine === false) {

            failures.push(`${source.label}: internet yok`);

            continue;
        }

        try {

            const module = await import(/* @vite-ignore */ source.module);

            if (typeof module.Wllama !== "function") throw new Error("Wllama sınıfı bulunamadı");

            EngineClass = module.Wllama;
            enginePaths = { default: source.wasm };
            engineSource = source.label;

            return;

        } catch (error) {

            failures.push(`${source.label}: ${await probeSource(source.module)}`);

            console.warn(`Yerel motor (${source.label}) yüklenemedi:`, error?.message || error);
        }
    }

    throw new Error(failures.join(" · ") || "motor yüklenemedi");
}

/** Loads the engine module once. Throws ProviderError(NO_ENGINE | UNSUPPORTED). */
async function ensureEngineModule() {

    if (EngineClass) return;

    if (!enginePromise) {

        state.engine = "loading";
        emit();

        enginePromise = importEngine().catch(error => {

            enginePromise = null;

            state.engine = "missing";
            state.engineError = `Yerel yapay zekâ motoru yüklenemedi (${error.message}). İnternete bağlıyken tekrar dene; internetsiz kullanım için motoru uygulamaya eklemek gerekir (tools/fetch-local-ai.sh).`;

            emit();

            throw toError(state.engineError, "NO_ENGINE");
        });
    }

    await enginePromise;
}

/** A fresh engine instance, or the existing one. */
async function getInstance() {

    await ensureEngineModule();

    if (wllama) return wllama;

    try {

        wllama = new EngineClass(enginePaths, {
            suppressNativeLog: true,
            parallelDownloads: 3,
            allowOffline: true,
            logger: { debug() {}, log() {}, warn: console.warn, error: console.error }
        });

        // The compat build (Safari/Firefox helper) is fetched from a CDN; the app
        // targets Chromium WebViews, so keep the engine fully self-contained.
        wllama.setCompat?.(null);

        state.engine = "ready";
        state.engineError = "";

    } catch (error) {

        wllama = null;

        state.engine = "unsupported";
        state.engineError = "Bu cihaz/tarayıcı yerel modeli çalıştırmayı desteklemiyor (WebAssembly SIMD gerekir).";

        emit();

        throw toError(state.engineError, "UNSUPPORTED");
    }

    emit();

    return wllama;
}

// ----------------------------------------------------------
// MODEL SOURCES + INSTALLED LIST
// ----------------------------------------------------------

const bundledCache = new Map();

/** URL of a model file shipped inside the app (models/…), or null. */
async function bundledUrl(model) {

    if (bundledCache.has(model.id)) return bundledCache.get(model.id);

    let found = null;

    try {

        const url = new URL(`${BUNDLED_MODEL_DIR}${model.file}`, document.baseURI).href;

        const response = await fetch(url, { method: "HEAD" });

        const length = Number(response.headers.get("content-length") || 0);

        // A host that answers every path with index.html would say "ok" too:
        // insist on a file of about the right size.
        if (response.ok && length > model.sizeBytes * 0.9) found = url;

    } catch {

        found = null;
    }

    bundledCache.set(model.id, found);

    return found;
}

async function sourcesFor(model) {

    const bundled = await bundledUrl(model);

    return bundled ? [bundled, model.url] : [model.url];
}

function modelIdForUrl(url) {

    return LOCAL_MODELS.find(model => url === model.url || String(url).endsWith(`/${model.file}`))?.id || null;
}

async function listEngineModels() {

    const instance = await getInstance();

    return instance.modelManager.getModels();
}

// ----------------------------------------------------------
// MESSAGE PREPARATION
// ----------------------------------------------------------

/** Keeps the newest turns that fit the context budget. */
export function fitHistory(history, maxChars) {

    const kept = [];

    let used = 0;

    for (let index = history.length - 1; index >= 0; index--) {

        const message = history[index];

        const text = typeof message.content === "string" ? message.content : String(message.content?.[0]?.text ?? "");

        // The newest message is always kept (cut if it alone is too long).
        if (kept.length > 0 && used + text.length > maxChars) break;

        const clipped = text.length > maxChars ? `${text.slice(0, maxChars)}…` : text;

        used += clipped.length;

        kept.unshift({ role: message.role, content: clipped });
    }

    return kept;
}

// ----------------------------------------------------------
// PUBLIC OBJECT
// ----------------------------------------------------------

let idleTimer = null;
let queue = Promise.resolve();

function scheduleIdleUnload() {

    clearTimeout(idleTimer);

    const minutes = Number(config.local?.idleUnloadMinutes) || 0;

    if (minutes <= 0) return;

    idleTimer = setTimeout(() => {

        if (!state.busy) LocalAI.unload().catch(() => {});

    }, minutes * 60 * 1000);
}

const LocalAI = {

    displayName: LOCAL_MODEL_NAME,

    engineSource: () => engineSource,

    subscribe(listener) {

        listeners.add(listener);

        return () => listeners.delete(listener);
    },

    getState() {

        return { ...state, installed: [...state.installed], downloading: state.downloading ? { ...state.downloading } : null };
    },

    /** Models known to be on the device (a hint until the engine confirms). */
    getInstalledIds() {

        return [...state.installed];
    },

    hasModel() {

        return state.installed.length > 0;
    },

    /** Asks the engine which models are really stored. Safe to call often. */
    async refreshInstalled() {

        try {

            const models = await listEngineModels();

            const ids = [...new Set(models.map(model => modelIdForUrl(model.url)).filter(Boolean))];

            state.installed = ids;
            state.installedKnown = true;

            writeInstalledHint(ids);

            emit();

        } catch (error) {

            // Engine missing/unsupported: keep the stored hint, the UI shows why.
            if (error.code !== "NO_ENGINE" && error.code !== "UNSUPPORTED") console.warn("Yerel model listesi okunamadı:", error);
        }

        return this.getInstalledIds();
    },

    recommendedModelId() {

        return recommendedModelId(DeviceMonitor.get());
    },

    /**
     * Downloads a model (about 0.5–1.1 GB) into the app's own storage.
     * @param {string} id model id from js/localModels.js
     * @param {{ signal?: AbortSignal }} [options]
     */
    async download(id, { signal } = {}) {

        const model = getLocalModel(id);

        if (!model) throw toError("Bilinmeyen model.", "UNKNOWN");

        if (state.downloading) throw toError("Başka bir model indiriliyor.", "BUSY");

        if (navigator.onLine === false && !(await bundledUrl(model))) {

            throw toError("İnternet yok — model indirilemiyor.", "NETWORK");
        }

        await this.checkStorage(model.sizeBytes);

        const instance = await getInstance();

        state.downloading = { id, loaded: 0, total: model.sizeBytes };

        emit();

        let lastError = null;

        try {

            for (const url of await sourcesFor(model)) {

                try {

                    await instance.modelManager.downloadModel(url, {
                        signal,
                        progressCallback: ({ loaded, total }) => {

                            state.downloading = { id, loaded, total: total || model.sizeBytes };

                            emit();
                        }
                    });

                    lastError = null;

                    break;

                } catch (error) {

                    lastError = error;

                    if (signal?.aborted) break;
                }
            }

            if (lastError) {

                if (signal?.aborted || lastError.name === "AbortError") throw toError("İndirme iptal edildi.", "ABORTED");

                throw toError(`Model indirilemedi: ${lastError.message || lastError}`, "NETWORK");
            }

            // Ask the browser not to evict the 0.5–1 GB file when space runs low.
            try { await navigator.storage?.persist?.(); } catch { /* best effort */ }

            await this.refreshInstalled();

        } finally {

            state.downloading = null;

            emit();
        }
    },

    /** Throws a friendly error only when the device clearly has no room for the model. */
    async checkStorage(bytes) {

        try {

            const estimate = await navigator.storage?.estimate?.();

            if (!estimate?.quota) return;

            const free = estimate.quota - (estimate.usage || 0);

            if (free < bytes) {

                const needMB = Math.ceil(bytes / 1024 / 1024);

                const freeMB = Math.max(0, Math.floor(free / 1024 / 1024));

                throw toError(`Yeterli depolama alanı yok (${needMB} MB gerekli, ${freeMB} MB boş görünüyor). Telefonda yer açıp tekrar dene.`, "STORAGE");
            }

        } catch (error) {

            if (error.code === "STORAGE") throw error;
        }
    },

    async remove(id) {

        const model = getLocalModel(id);

        if (!model) return;

        if (state.loadedId === id) await this.unload();

        const instance = await getInstance();

        const stored = await instance.modelManager.getModels({ includeInvalid: true });

        for (const item of stored) {

            if (modelIdForUrl(item.url) === id) await item.remove();
        }

        await this.refreshInstalled();
    },

    /** Frees the model's memory (it stays on disk). */
    async unload() {

        clearTimeout(idleTimer);

        if (!wllama || !state.loadedId) return;

        try { await wllama.exit(); } catch { /* already gone */ }

        state.loadedId = null;
        state.loadedThreads = 0;
        state.multithread = false;

        emit();
    },

    /**
     * Makes sure `modelId` is loaded with about `threads` threads.
     * @returns {Promise<void>}
     */
    async ensureLoaded(modelId, threads, onStatus) {

        const model = getLocalModel(modelId);

        if (!model) throw toError("Model bulunamadı.", "NO_LOCAL_MODEL");

        // Same model, and a thread count that is not meaningfully different.
        if (state.loadedId === modelId && Math.abs((state.loadedThreads || 1) - threads) < 2) return;

        const instance = await getInstance();

        if (state.loadedId) await this.unload();

        onStatus?.(`${model.name} yükleniyor…`);

        const url = (await sourcesFor(model)).find(candidate => candidate) || model.url;

        const attempt = async count => {

            await instance.loadModelFromUrl(url, {
                n_ctx: model.nCtx,
                n_threads: count,
                // WebGPU on phones is still experimental — opt-in only.
                ...(config.local?.useGpu ? {} : { n_gpu_layers: 0 })
            });
        };

        try {

            await attempt(threads);

        } catch (first) {

            // Multi-thread needs a cross-origin-isolated page and can fail on
            // some WebViews; a single thread nearly always works.
            if (threads > 1) {

                try { await instance.exit(); } catch { /* ignore */ }

                try {

                    await attempt(1);

                } catch (second) {

                    throw toError(`Yerel model yüklenemedi: ${second.message || second}`, "LOAD_FAILED");
                }

                threads = 1;

            } else {

                throw toError(`Yerel model yüklenemedi: ${first.message || first}`, "LOAD_FAILED");
            }
        }

        state.loadedId = modelId;
        state.loadedThreads = threads;
        state.multithread = Boolean(instance.isMultithread?.());

        emit();
    },

    /** What would run right now (for the UI), without running it. */
    previewChoice() {

        return pickLocalModel({
            installedIds: this.getInstalledIds(),
            snapshot: DeviceMonitor.get(state.loadedId),
            prefs: config.local
        });
    },

    /**
     * Same contract as the other providers' sendMessageStream().
     * @returns {Promise<string>} the full reply
     */
    sendMessageStream({ history = [], systemPrompt = "" } = {}, onToken, controller = null, { onStatus = null, onModel = null } = {}) {

        // One generation at a time (the engine has a single context).
        const run = queue.then(() => this._generate({ history, systemPrompt }, onToken, controller, onStatus, onModel));

        queue = run.catch(() => {});

        return run;
    },

    async _generate({ history, systemPrompt }, onToken, controller, onStatus, onModel) {

        if (controller?.signal.aborted) throw toError("Yanıt kullanıcı tarafından durduruldu.", "ABORTED");

        if (!state.installedKnown) await this.refreshInstalled();

        const choice = this.previewChoice();

        if (!choice.modelId) throw toError(`${LOCAL_MODEL_NAME} bu cihazda kurulu değil.`, "NO_LOCAL_MODEL");

        const model = getLocalModel(choice.modelId);

        state.busy = true;

        clearTimeout(idleTimer);

        emit();

        try {

            await this.ensureLoaded(choice.modelId, choice.threads, onStatus);

            if (controller?.signal.aborted) throw toError("Yanıt kullanıcı tarafından durduruldu.", "ABORTED");

            onModel?.({ model, choice });

            // ~45 % of the context for the history, the rest for system + reply.
            const budgetChars = Math.floor(model.nCtx * 0.45 * CHARS_PER_TOKEN);

            const messages = [
                { role: "system", content: systemPrompt },
                ...fitHistory(history, budgetChars)
            ];

            let full = "";
            let tokens = 0;
            let firstAt = 0;

            const stream = await wllama.createChatCompletion({
                messages,
                stream: true,
                temperature: TEMPERATURE,
                max_tokens: MAX_REPLY_TOKENS,
                abortSignal: controller?.signal
            });

            for await (const chunk of stream) {

                const delta = chunk?.choices?.[0]?.delta?.content;

                if (!delta) continue;

                if (!firstAt) firstAt = performance.now();

                tokens += 1;
                full += delta;

                onToken?.(delta, full);
            }

            if (firstAt) DeviceMonitor.recordSpeed(model.id, tokens, performance.now() - firstAt);

            if (!full.trim()) throw toError(`${LOCAL_MODEL_NAME} boş yanıt döndürdü.`, "SERVER");

            return full;

        } catch (error) {

            if (error instanceof ProviderError) throw error;

            if (error?.name === "AbortError" || error?.name === "WllamaAbortError" || controller?.signal.aborted) {

                throw toError("Yanıt kullanıcı tarafından durduruldu.", "ABORTED");
            }

            throw toError(`Yerel model hatası: ${error?.message || error}`, "SERVER");

        } finally {

            state.busy = false;

            emit();

            scheduleIdleUnload();
        }
    }
};

export default LocalAI;
