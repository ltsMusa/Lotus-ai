/**
 * ==========================================================
 * Lotus AI - Key wizard: pure helpers
 * ==========================================================
 * No DOM, no network at import time — everything here can be
 * tested with plain `node --test` (tests/keys.test.mjs).
 *
 *  • which providers the wizard knows and where their key pages are
 *  • spotting a key inside whatever text the clipboard holds
 *  • masking a key for the screen
 *  • trying a key against the provider (fetch is injectable)
 *  • deciding which keys an account may hand to a device
 *  • deciding when the wizard may be offered after sign-in
 *
 * Honest limit: no provider lets an app create an API key on the
 * user's behalf from an account login. The wizard opens the key
 * page, the user taps "copy", and the app picks the key up.
 * ==========================================================
 */

export const KEY_PROVIDERS = {
    groq: {
        id: "groq",
        label: "Groq",
        pageUrl: "https://console.groq.com/keys",
        prefix: "gsk_",
        pattern: /gsk_[A-Za-z0-9]{20,100}/
    },
    gemini: {
        id: "gemini",
        label: "Gemini",
        pageUrl: "https://aistudio.google.com/apikey",
        prefix: "AIza",
        // Google API keys are always 39 characters: "AIza" + 35.
        pattern: /AIza[A-Za-z0-9_-]{35}/
    }
};

/** Providers the wizard (and the account sync) handle. */
export const WIZARD_PROVIDERS = Object.keys(KEY_PROVIDERS);

/** Longest clipboard text worth looking at. */
const MAX_SCAN = 2000;

const KEY_CHAR = /[A-Za-z0-9_-]/;

/**
 * Finds the first Groq/Gemini key inside `text`.
 * A match must be a whole token: "xgsk_…" or a key followed by more
 * key characters is not accepted (that is something else).
 * @param {string} text
 * @param {"groq"|"gemini"|null} prefer  when both are present, this one wins
 * @returns {{ provider: string, key: string } | null}
 */
export function findKey(text, prefer = null) {

    const source = String(text ?? "").slice(0, MAX_SCAN);

    const found = [];

    for (const provider of Object.values(KEY_PROVIDERS)) {

        const pattern = new RegExp(provider.pattern.source, "g");

        let match;

        while ((match = pattern.exec(source))) {

            const before = source[match.index - 1];
            const after = source[match.index + match[0].length];

            if ((before && KEY_CHAR.test(before)) || (after && KEY_CHAR.test(after))) continue;

            found.push({ provider: provider.id, key: match[0], index: match.index });

            break;
        }
    }

    if (!found.length) return null;

    found.sort((a, b) => (a.provider === prefer ? -1 : b.provider === prefer ? 1 : a.index - b.index));

    return { provider: found[0].provider, key: found[0].key };
}

/** True when `key` is exactly one well-formed key of `provider`. */
export function isWellFormed(provider, key) {

    const found = findKey(String(key ?? "").trim(), provider);

    return Boolean(found && found.provider === provider && found.key === String(key).trim());
}

/** "gsk_••••ab12" — enough to recognise it, not enough to use it. */
export function maskKey(key) {

    const value = String(key ?? "");

    if (value.length < 12) return "•".repeat(Math.max(value.length, 4));

    return `${value.slice(0, 4)}••••••••${value.slice(-4)}`;
}

// ----------------------------------------------------------
// Trying a key
// ----------------------------------------------------------

/** The cheapest authenticated call each provider offers (lists models, costs no quota). */
export function testRequest(provider, key) {

    if (provider === "groq") {

        return {
            url: "https://api.groq.com/openai/v1/models",
            init: { method: "GET", headers: { Authorization: `Bearer ${key}` } }
        };
    }

    if (provider === "gemini") {

        return {
            url: `https://generativelanguage.googleapis.com/v1beta/models?pageSize=1&key=${encodeURIComponent(key)}`,
            init: { method: "GET" }
        };
    }

    return null;
}

/**
 * Turns an HTTP answer into a verdict.
 * @returns {{ ok: boolean, reason: "ok"|"limited"|"invalid"|"denied"|"server"|"unknown", status: number }}
 */
export function interpretTest(provider, status, bodyText = "") {

    const body = String(bodyText ?? "");

    if (status >= 200 && status < 300) return { ok: true, reason: "ok", status };

    // The key works, the provider just asks us to slow down.
    if (status === 429) return { ok: true, reason: "limited", status };

    if (status === 401) return { ok: false, reason: "invalid", status };

    // Gemini answers a bad key with 400 + API_KEY_INVALID.
    if (status === 400 && /API_KEY_INVALID|API key not valid|invalid api key/i.test(body)) {

        return { ok: false, reason: "invalid", status };
    }

    if (status === 403) return { ok: false, reason: "denied", status };

    if (status >= 500) return { ok: false, reason: "server", status };

    return { ok: false, reason: "unknown", status };
}

export const TEST_MESSAGES = {
    ok: "Anahtar çalışıyor.",
    limited: "Anahtar çalışıyor (sağlayıcı şu an yoğun, kullanım sınırına yakın).",
    invalid: "Bu anahtar geçersiz görünüyor. Doğru anahtarı kopyaladığından emin ol.",
    denied: "Sağlayıcı bu anahtarı reddetti (izin yok ya da API kapalı).",
    server: "Sağlayıcıya şu an ulaşılamıyor, birazdan tekrar dene.",
    network: "Anahtar denenemedi — bağlantını kontrol et.",
    unknown: "Anahtar denenemedi."
};

/**
 * Tries a key against its provider.
 * Never throws: a network failure is a verdict ("network"), not an error.
 * @returns {Promise<{ ok: boolean, reason: string, status: number, message: string }>}
 */
export async function testKey(provider, key, { fetchImpl = globalThis.fetch, timeoutMs = 10000 } = {}) {

    const request = testRequest(provider, key);

    if (!request || typeof fetchImpl !== "function") {

        return { ok: false, reason: "unknown", status: 0, message: TEST_MESSAGES.unknown };
    }

    const controller = typeof AbortController === "function" ? new AbortController() : null;

    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

    try {

        const response = await fetchImpl(request.url, { ...request.init, signal: controller?.signal });

        let body = "";

        if (!response.ok) {

            try { body = await response.text(); } catch { /* unreadable body is fine */ }
        }

        const verdict = interpretTest(provider, response.status, body);

        return { ...verdict, message: TEST_MESSAGES[verdict.reason] };

    } catch {

        return { ok: false, reason: "network", status: 0, message: TEST_MESSAGES.network };

    } finally {

        if (timer) clearTimeout(timer);
    }
}

// ----------------------------------------------------------
// Account sync decisions
// ----------------------------------------------------------

/** True when the user already has a key for any provider (the wizard then has nothing to offer). */
export function hasAnyKey(providers = {}) {

    return Object.values(providers).some(entry => String(entry?.apiKey ?? "").trim().length > 0);
}

/**
 * Which keys stored in the account should be put on this device?
 * Only providers the device has no key for, and only keys that look
 * exactly like a real key of that provider — a junk row never lands
 * in the settings.
 * @param {{ [provider: string]: string }} device
 * @param {{ [provider: string]: string }} account
 * @returns {{ provider: string, key: string }[]}
 */
export function planPull(device = {}, account = {}) {

    const plan = [];

    for (const provider of WIZARD_PROVIDERS) {

        if (String(device[provider] ?? "").trim()) continue;

        const key = String(account[provider] ?? "").trim();

        if (key && isWellFormed(provider, key)) plan.push({ provider, key });
    }

    return plan;
}

/**
 * What kind of failure was it?
 *  - "missing-table": supabase/schema.sql was not run (the app keeps working, keys stay on the device)
 *  - "signed-out":    no (valid) session
 *  - "network":       no connection
 *  - "other"
 */
export function classifySyncError(error) {

    if (!error) return "other";

    const code = String(error.code ?? "");
    const message = String(error.message ?? error ?? "");

    if (code === "PGRST205" || code === "42P01") return "missing-table";

    if (/api_keys/i.test(message) && /(does not exist|schema cache|could not find)/i.test(message)) return "missing-table";

    if (code === "PGRST301" || /JWT|not authenticated|permission denied for table/i.test(message) || Number(error.status) === 401) return "signed-out";

    if (/Failed to fetch|NetworkError|Load failed|Sunucuya \(Supabase\) ulaşılamıyor|network/i.test(message)) return "network";

    return "other";
}

// ----------------------------------------------------------
// When to offer the wizard
// ----------------------------------------------------------

export const OFFER_EVERY_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * The wizard is offered (as a toast with a button, never forced) right
 * after sign-in — but only while the user has no key of their own, and
 * not more often than every few days.
 */
export function shouldOfferWizard({ signedIn = false, hasKey = false, lastOfferAt = 0, now = Date.now(), everyMs = OFFER_EVERY_MS } = {}) {

    if (!signedIn || hasKey) return false;

    const last = Number(lastOfferAt);

    if (Number.isFinite(last) && last > 0 && now - last < everyMs && now >= last) return false;

    return true;
}

/** The clipboard held `text` when the user left for the key page — a key already in there is old news. */
export function freshCandidate(text, baselineText, prefer = null) {

    const found = findKey(text, prefer);

    if (!found) return null;

    const before = findKey(baselineText, prefer);

    if (before && before.key === found.key) return null;

    return found;
}
