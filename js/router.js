/**
 * ==========================================================
 * Lotus AI - Provider router
 * ==========================================================
 * Decides, for every single message, WHERE it is answered:
 *
 *   Otomatik (default)
 *     1. an AI provider that is connected (a personal API key, or the
 *        Lotus server) — the chosen provider first, then the others
 *     2. when one runs out of quota / fails → the next provider
 *        (the exhausted one is parked for a while so the following
 *        messages do not wait for it again)
 *     3. when no provider is usable, or the device is offline → the
 *        local model (Lotus Mini on the device, or an Ollama server)
 *   Yalnızca bulut   → providers only, never the local model
 *   Yalnızca yerel   → local model only, nothing leaves the device
 *
 * The plan is recomputed per message, so the moment a provider gets
 * connected (a key is saved, the internet comes back, a cooldown ends)
 * the next message goes there again — no manual switch needed.
 *
 * planRoute() is a pure function; the cooldown book-keeping lives in
 * the small Cooldowns object below.
 * ==========================================================
 */

export const ROUTE_MODES = ["auto", "cloud", "local"];

const COOLDOWN_KEY = "lotus_provider_cooldowns_v1";

const MINUTE = 60 * 1000;

// How long a provider is skipped after each kind of failure.
const COOLDOWN_BY_CODE = {
    KEYS_EXHAUSTED: 30 * MINUTE, // the server's whole key pool is empty
    NO_KEY: 30 * MINUTE, // the Lotus server has no key for this provider
    AUTH: 60 * MINUTE, // wrong/revoked key — retried right away once a key is saved
    NOT_FOUND: 5 * MINUTE, // proxy not deployed / model missing
    TIMEOUT: 1 * MINUTE,
    NETWORK: 1 * MINUTE,
    SERVER: 1 * MINUTE,
    UNKNOWN: 1 * MINUTE
};

// Rate limits repeat: 2 → 6 → 18 → 54 minutes (max 60) while they keep
// coming back, and the counter resets after the first success.
const RATE_LIMIT_BASE = 2 * MINUTE;
const MAX_COOLDOWN = 60 * MINUTE;

export const QUOTA_CODES = ["RATE_LIMIT", "KEYS_EXHAUSTED"];

function read() {

    try {

        const data = JSON.parse(localStorage.getItem(COOLDOWN_KEY) || "{}");

        return data && typeof data === "object" ? data : {};

    } catch {

        return {};
    }
}

function write(data) {

    try {

        localStorage.setItem(COOLDOWN_KEY, JSON.stringify(data));

    } catch {

        // storage unavailable — cooldowns then only live until reload
    }
}

export const Cooldowns = {

    /** Parks `provider` after a failure with `code`. Returns the end time. */
    mark(provider, code, now = Date.now()) {

        if (!provider) return 0;

        const data = read();

        const entry = data[provider] || { strikes: 0, until: 0, code: "" };

        let duration;

        if (code === "RATE_LIMIT") {

            duration = Math.min(MAX_COOLDOWN, RATE_LIMIT_BASE * 3 ** Math.min(entry.strikes, 3));

            entry.strikes += 1;

        } else {

            duration = COOLDOWN_BY_CODE[code] ?? COOLDOWN_BY_CODE.UNKNOWN;
        }

        entry.until = now + duration;
        entry.code = code || "UNKNOWN";

        data[provider] = entry;

        write(data);

        return entry.until;
    },

    /** Epoch ms until which `provider` is parked (0 = available). */
    until(provider, now = Date.now()) {

        const entry = read()[provider];

        return entry && entry.until > now ? entry.until : 0;
    },

    isCooling(provider, now = Date.now()) {

        return this.until(provider, now) > 0;
    },

    reason(provider) {

        return read()[provider]?.code || "";
    },

    /** A success wipes the record (strikes included). */
    success(provider) {

        const data = read();

        if (data[provider]) {

            delete data[provider];

            write(data);
        }
    },

    /** Forget a provider's cooldown — e.g. the user just saved a new key. */
    clear(provider) {

        this.success(provider);
    },

    clearAll() {

        write({});
    }
};

/**
 * @param {object} input
 * @param {"auto"|"cloud"|"local"} input.mode
 * @param {boolean} input.online
 * @param {string[]} input.cloud          usable providers, preferred first
 * @param {(name:string)=>number} input.cooldownUntil  epoch ms or 0
 * @param {string[]} input.local          usable local backends, preferred first
 * @param {number} [input.now]
 * @returns {{ steps: Array<{kind:"cloud"|"local", name:string}>, skipped: Array<{name:string, until:number}> }}
 */
export function planRoute({ mode = "auto", online = true, cloud = [], cooldownUntil = () => 0, local = [], now = Date.now() } = {}) {

    const safeMode = ROUTE_MODES.includes(mode) ? mode : "auto";

    const localSteps = local.map(name => ({ kind: "local", name }));

    if (safeMode === "local") return { steps: localSteps, skipped: [] };

    const ready = [];
    const parked = [];

    for (const name of cloud) {

        const until = cooldownUntil(name) || 0;

        if (until > now) parked.push({ name, until });
        else ready.push({ kind: "cloud", name });
    }

    if (safeMode === "cloud") {

        // No local model here, so a parked provider is still better than
        // nothing: try the healthy ones first, the parked ones last.
        return { steps: [...ready, ...parked.map(item => ({ kind: "cloud", name: item.name }))], skipped: [] };
    }

    // ---- auto ----

    if (!online) return { steps: localSteps, skipped: [], offline: true };

    const steps = [...ready, ...localSteps];

    // Everything is parked and there is no local model: try the parked ones
    // anyway — a quota may well have been refilled.
    if (steps.length === 0 && parked.length > 0) {

        return { steps: parked.map(item => ({ kind: "cloud", name: item.name })), skipped: [] };
    }

    return { steps, skipped: parked };
}

// A freshly saved key may be exactly what a parked provider was waiting for.
if (typeof window !== "undefined") {

    window.addEventListener("lotus:provider-key-changed", event => {

        const provider = event.detail?.provider;

        if (provider) Cooldowns.clear(provider);
    });
}
