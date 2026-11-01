/**
 * ==========================================================
 * Lotus AI - Image Generation
 * ==========================================================
 * Two ways to get a picture, tried in this order:
 *
 *  1. Gemini (only with the user's own Gemini key): the image model
 *     answers with the picture itself, which is shrunk to a JPEG and
 *     kept inside the chat (a data: address — it never expires).
 *     If Gemini says no (quota, free tier without images, wrong model,
 *     key refused, safety, busy) the reason is remembered for a while
 *     so the next picture does not wait for it again, and the picture
 *     is made by the free service instead — with a one-line note.
 *
 *  2. Pollinations.ai's keyless endpoint (no key, no account):
 *     https://image.pollinations.ai/prompt/<text>
 *
 * HONEST LIMITS of the free service (checked Nov 2026): it is a
 * third-party endpoint without a formal guarantee. Anonymous use is
 * limited to about one picture per ~45 s per device, pictures are
 * at most 768×768 pixels in area, and a small logo can be added.
 * A request that comes too soon is refused — and the browser only sees
 * "the picture failed to load". So this file waits out the window
 * BEFORE asking (the wait is shown as a countdown), retries only after
 * a full window, can be stopped by the Stop button and gives up with a
 * clear message instead of hanging.
 *
 * Before either, the idea is optionally rewritten as one detailed
 * English prompt by the user's own chat model (best effort: if that
 * does not answer within a few seconds the original text is used).
 *
 * The chat stores a Pollinations picture as a markdown URL (reopening
 * an old chat asks the service again; js/viewer.js shows a retry card
 * when that fails) and a Gemini picture as a data URL.
 * ==========================================================
 */

import config from "./config.js";

import {
    normalizeImageSettings,
    ENHANCER_SYSTEM,
    enhancerUserMessage,
    cleanEnhanced,
    finalPrompt,
    pollinationsUrl,
    msUntilNextAnonymous,
    RETRY_DELAYS_MS,
    secondsLabel,
    GEMINI_IMAGE_MODEL,
    geminiImageRequest,
    classifyGeminiImage,
    GEMINI_PARK_MS,
    GEMINI_NOTES,
    shouldTryGemini
} from "./imagePolicy.js";

const ATTEMPT_TIMEOUT_MS = 50000;
const GEMINI_TIMEOUT_MS = 45000;

/** A stored picture should stay well under this many characters (guests keep chats in ~5 MB of localStorage). */
const MAX_INLINE_CHARS = 450_000;

const LAST_ANON_KEY = "lotus_img_last_anon";
const GEMINI_PARK_KEY = "lotus_img_gemini_park";

// ----------------------------------------------------------
// Small persisted state (survives reloads; every access is guarded)
// ----------------------------------------------------------

function readNumber(key) {

    try {

        const value = Number(localStorage.getItem(key));

        return Number.isFinite(value) && value > 0 ? value : 0;

    } catch {

        return 0;
    }
}

function writeNumber(key, value) {

    try { localStorage.setItem(key, String(value)); } catch { /* storage unavailable */ }
}

function readPark() {

    try {

        const parsed = JSON.parse(localStorage.getItem(GEMINI_PARK_KEY) || "null");

        const until = Number(parsed?.until);

        return Number.isFinite(until) && until > 0 ? { until, kind: String(parsed.kind ?? "other") } : null;

    } catch {

        return null;
    }
}

function parkGemini(kind, now = Date.now()) {

    const duration = GEMINI_PARK_MS[kind];

    if (!duration) return;

    try { localStorage.setItem(GEMINI_PARK_KEY, JSON.stringify({ until: now + duration, kind })); } catch { /* storage unavailable */ }
}

export function clearGeminiPark() {

    try { localStorage.removeItem(GEMINI_PARK_KEY); } catch { /* storage unavailable */ }
}

// A new Gemini key or a new model name deserves a fresh try.
if (typeof window !== "undefined") {

    window.addEventListener("lotus:provider-key-changed", event => {

        if (event.detail?.provider === "gemini") clearGeminiPark();
    });

    window.addEventListener("lotus:image-model-changed", clearGeminiPark);
}

// ----------------------------------------------------------
// What the UI may want to say before a picture is made
// ----------------------------------------------------------

/**
 * @returns {{ gemini: "ready"|"parked"|"no-key", parkedKind: string|null, waitMs: number }}
 *   gemini : what the next picture will try first
 *   waitMs : how long the free service would make the next picture wait
 */
export function imageRoute(now = Date.now()) {

    const hasKey = Boolean(String(config.providers.gemini?.apiKey ?? "").trim());

    const park = readPark();

    const parked = Boolean(park && park.until > now);

    return {
        gemini: !hasKey ? "no-key" : parked ? "parked" : "ready",
        parkedKind: parked ? park.kind : null,
        waitMs: msUntilNextAnonymous({ lastAt: readNumber(LAST_ANON_KEY), now })
    };
}

// ----------------------------------------------------------
// Waiting
// ----------------------------------------------------------

function abortError() {

    const error = new Error("Yanıt kullanıcı tarafından durduruldu.");

    error.code = "ABORTED";

    return error;
}

function wait(ms, signal) {

    return new Promise((resolve, reject) => {

        if (signal?.aborted) {

            reject(abortError());

            return;
        }

        const timer = setTimeout(done, ms);

        function done() {

            signal?.removeEventListener("abort", onAbort);

            resolve();
        }

        function onAbort() {

            clearTimeout(timer);

            reject(abortError());
        }

        signal?.addEventListener("abort", onAbort, { once: true });
    });
}

/** Waits `ms`, telling the UI how many seconds are left (once per second). */
async function waitWithCountdown(ms, signal, onStatus, label) {

    const end = Date.now() + ms;

    for (;;) {

        const left = end - Date.now();

        if (left <= 0) return;

        onStatus?.(`${label} ${secondsLabel(left)}`);

        await wait(Math.min(1000, left), signal);
    }
}

// ----------------------------------------------------------
// Idea → English prompt
// ----------------------------------------------------------

async function enhance(prompt, { style, enhancer, signal, onStatus }) {

    if (typeof enhancer !== "function") return null;

    onStatus?.("Fikrini zenginleştiriyorum…");

    try {

        return cleanEnhanced(await enhancer(ENHANCER_SYSTEM, enhancerUserMessage(prompt, style)));

    } catch (error) {

        if (error?.code === "ABORTED" || signal?.aborted) throw abortError();

        return null;
    }
}

// ----------------------------------------------------------
// Gemini
// ----------------------------------------------------------

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

const OK_MIME = /^image\/(?:png|jpeg|webp)$/;

function loadDataUrl(dataUrl) {

    return new Promise((resolve, reject) => {

        const image = new Image();

        image.onload = () => resolve(image);

        image.onerror = () => reject(new Error("DECODE_FAILED"));

        image.src = dataUrl;
    });
}

/**
 * Shrinks a generated picture to a JPEG that fits in a chat message.
 * Without a canvas (or when drawing fails) a small enough original is kept as it is.
 */
async function toStoredDataUrl(mime, base64) {

    const original = `data:${mime};base64,${base64}`;

    if (typeof document === "undefined") return original.length <= MAX_INLINE_CHARS ? original : null;

    try {

        const image = await loadDataUrl(original);

        const canvas = document.createElement("canvas");

        const context = canvas.getContext("2d");

        if (!context) throw new Error("NO_CANVAS");

        let scale = Math.min(1, 1024 / Math.max(image.naturalWidth || 1, image.naturalHeight || 1));

        for (let round = 0; round < 4; round++) {

            canvas.width = Math.max(1, Math.round((image.naturalWidth || 1) * scale));
            canvas.height = Math.max(1, Math.round((image.naturalHeight || 1) * scale));

            // JPEG has no transparency — a see-through picture would turn black.
            context.fillStyle = "#ffffff";
            context.fillRect(0, 0, canvas.width, canvas.height);
            context.drawImage(image, 0, 0, canvas.width, canvas.height);

            for (const quality of [0.88, 0.78, 0.66]) {

                const result = canvas.toDataURL("image/jpeg", quality);

                if (result.length <= MAX_INLINE_CHARS) return result;
            }

            scale *= 0.75;
        }

        return null;

    } catch {

        return original.length <= MAX_INLINE_CHARS ? original : null;
    }
}

/**
 * @returns {Promise<{ url: string } | { fail: string }>}  `fail` is a kind from classifyGeminiImage
 */
async function tryGemini({ text, signal }) {

    const key = String(config.providers.gemini?.apiKey ?? "").trim();

    const model = String(config.providers.gemini?.imageModel ?? "").trim() || GEMINI_IMAGE_MODEL;

    const request = geminiImageRequest(model, key, text);

    const attempt = new AbortController();

    const timer = setTimeout(() => attempt.abort(), GEMINI_TIMEOUT_MS);

    const onAbort = () => attempt.abort();

    if (signal?.aborted) throw abortError();

    signal?.addEventListener("abort", onAbort, { once: true });

    let status = 0;
    let body = null;

    try {

        const response = await fetch(request.url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(request.body),
            signal: attempt.signal
        });

        status = response.status;

        try { body = await response.json(); } catch { body = null; }

    } catch (error) {

        if (signal?.aborted) throw abortError();

        // timeout or no connection
        return { fail: "transient" };

    } finally {

        clearTimeout(timer);

        signal?.removeEventListener("abort", onAbort);
    }

    const verdict = classifyGeminiImage({ status, body });

    if (verdict.kind !== "image") return { fail: verdict.kind };

    const mime = OK_MIME.test(verdict.mime) ? verdict.mime : "image/png";

    const data = verdict.data.replace(/\s+/g, "");

    // The text goes straight into markdown: only real base64 may pass.
    if (!BASE64.test(data)) return { fail: "no-image" };

    const url = await toStoredDataUrl(mime, data);

    return url ? { url } : { fail: "other" };
}

// ----------------------------------------------------------
// Pollinations
// ----------------------------------------------------------

function preload(url, signal) {

    return new Promise((resolve, reject) => {

        if (signal?.aborted) {

            reject(abortError());

            return;
        }

        const image = new Image();

        const finish = (callback, value) => {

            clearTimeout(timer);

            signal?.removeEventListener("abort", onAbort);

            image.onload = null;
            image.onerror = null;

            callback(value);
        };

        const timer = setTimeout(() => {

            // Stop downloading and treat as a failed attempt.
            image.src = "";

            finish(reject, new Error("TIMEOUT"));

        }, ATTEMPT_TIMEOUT_MS);

        const onAbort = () => {

            image.src = "";

            finish(reject, abortError());
        };

        image.onload = () => finish(resolve);

        image.onerror = () => finish(reject, new Error("LOAD_FAILED"));

        signal?.addEventListener("abort", onAbort, { once: true });

        image.src = url;
    });
}

async function pollinations({ text, aspect, signal, onStatus }) {

    const url = pollinationsUrl(text, { aspect, seed: Math.floor(Math.random() * 1_000_000) });

    let lastError = null;

    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {

        if (navigator.onLine === false) {

            throw new Error("Görsel üretilemedi: internet bağlantısı yok. Bağlanınca tekrar dene.");
        }

        // The free service lets one picture through per window; asking sooner only gets refused.
        const waitMs = attempt === 0
            ? msUntilNextAnonymous({ lastAt: readNumber(LAST_ANON_KEY) })
            : RETRY_DELAYS_MS[attempt - 1];

        if (waitMs > 0) {

            await waitWithCountdown(
                waitMs,
                signal,
                onStatus,
                attempt === 0 ? "Ücretsiz görsel servisinin sırası bekleniyor:" : "Servis yoğun, tekrar denemek için bekleniyor:"
            );
        }

        onStatus?.(attempt === 0 ? "Görsel oluşturuluyor..." : "Görsel yeniden deneniyor...");

        // The window starts when the request is made.
        writeNumber(LAST_ANON_KEY, Date.now());

        try {

            await preload(url, signal);

            return url;

        } catch (error) {

            if (error.code === "ABORTED") throw error;

            lastError = error;
        }
    }

    const reason = lastError?.message === "TIMEOUT" ? "Servis zamanında yanıt vermedi." : "Servis isteği reddetti veya ulaşılamadı.";

    throw new Error(
        `Görsel üretilemedi. ${reason} Ücretsiz Pollinations.ai servisinde görseller arasında yaklaşık 45 saniye bekleme var ` +
        "ve bazen yoğun oluyor — biraz bekleyip tekrar dene. Gemini anahtarın varsa Ayarlar → Yapay Zekâ'dan ekleyebilirsin."
    );
}

// ----------------------------------------------------------
// Public entry
// ----------------------------------------------------------

/**
 * @param {string} prompt  the idea, as the user wrote it
 * @param {object} [options]
 * @param {AbortSignal} [options.signal]                       Stop button
 * @param {(label: string) => void} [options.onStatus]         progress text (also the countdown)
 * @param {{ aspect?: string, style?: string, enhance?: boolean }} [options.settings]  default: the saved ones
 * @param {(system: string, user: string) => Promise<string|null>} [options.enhancer]  e.g. APIManager.completeOnce
 * @returns {Promise<{ url: string, provider: "gemini"|"pollinations", note: string|null, enhanced: string|null }>}
 *   `url` is a picture that has really loaded / been received.
 *   `note` is a one-line explanation when Gemini was tried and the free service made the picture.
 */
export async function generateImage(prompt, { signal, onStatus, settings = config.image, enhancer = null } = {}) {

    const { aspect, style, enhance: wantsEnhance } = normalizeImageSettings(settings);

    const idea = String(prompt ?? "").trim();

    if (!idea) throw new Error("Ne çizeceğimi yazmadın.");

    const enhanced = wantsEnhance ? await enhance(idea, { style, enhancer, signal, onStatus }) : null;

    let note = null;

    // 1. Gemini, when a key is there and it has not just said no.
    const hasKey = Boolean(String(config.providers.gemini?.apiKey ?? "").trim());

    if (shouldTryGemini({ hasKey, parkedUntil: readPark()?.until ?? 0 })) {

        onStatus?.("Gemini ile görsel oluşturuluyor...");

        const result = await tryGemini({ text: finalPrompt({ prompt: idea, enhanced, style, aspect, forGemini: true }), signal });

        if (result.url) return { url: result.url, provider: "gemini", note: null, enhanced };

        // A refusal for safety reasons is about this prompt, not about Gemini — do not park it.
        if (result.fail !== "safety") parkGemini(result.fail);

        note = GEMINI_NOTES[result.fail] ?? GEMINI_NOTES.other;
    }

    // 2. The free service.
    const url = await pollinations({ text: finalPrompt({ prompt: idea, enhanced, style, aspect }), aspect, signal, onStatus });

    return { url, provider: "pollinations", note, enhanced };
}
