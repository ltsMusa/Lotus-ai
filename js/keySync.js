/**
 * ==========================================================
 * Lotus AI - Keys in the account (optional)
 * ==========================================================
 * A Groq / Gemini key the user chose to keep "in my account" is
 * stored in the Supabase table `api_keys` (supabase/schema.sql),
 * readable and writable only by that user (row level security).
 * After signing in on another phone the key arrives by itself.
 *
 * Rules:
 *  • Uploading is opt-in (wizard checkbox / Settings switch). Turning
 *    it off deletes the copies in the account.
 *  • A key is only ever put on a device that has none for that
 *    provider — a key the user typed on the device is never replaced.
 *  • Only well-formed keys travel (js/keyTools.js).
 *  • If the table does not exist yet (schema.sql not run) or there is
 *    no connection, everything keeps working with the keys on the
 *    device; nothing here ever throws into the app.
 *
 * Honest note (also in GIZLILIK.md): the key is stored as plain text
 * in the database, protected by row level security — whoever
 * administers the Supabase project can technically read it.
 * ==========================================================
 */

import { supabase, Auth } from "./auth.js";
import config from "./config.js";
import { WIZARD_PROVIDERS, planPull, classifySyncError, isWellFormed } from "./keyTools.js";

const PREF_KEY = "lotus_key_sync";

const TABLE = "api_keys";

let tableMissing = false;

// While keys from the account are put on the device, the "key changed"
// event must not push them straight back.
let adopting = 0;

let sessionUserId = null;

// ----------------------------------------------------------
// Preference: "on" | "off" | null (never asked)
// ----------------------------------------------------------

export function syncPreference() {

    try {

        const value = localStorage.getItem(PREF_KEY);

        return value === "on" || value === "off" ? value : null;

    } catch {

        return null;
    }
}

function writePreference(value) {

    try { localStorage.setItem(PREF_KEY, value); } catch { /* storage unavailable */ }
}

// ----------------------------------------------------------
// Basics
// ----------------------------------------------------------

export const userId = () => Auth.user?.id ?? sessionUserId ?? null;

export const isSignedIn = () => Boolean(userId());

/** False once we learned the table is not there (schema.sql not run). */
export const syncAvailable = () => !tableMissing;

function failure(error) {

    const status = classifySyncError(error);

    if (status === "missing-table") tableMissing = true;

    if (status === "other") console.warn("Anahtar eşitleme hatası:", error?.message ?? error);

    return { ok: false, status };
}

function deviceKeys() {

    const keys = {};

    for (const provider of WIZARD_PROVIDERS) keys[provider] = String(config.providers[provider]?.apiKey ?? "").trim();

    return keys;
}

// ----------------------------------------------------------
// Talking to the table
// ----------------------------------------------------------

/** @returns {Promise<{ ok: boolean, status: string, keys: Object }>} */
export async function pull() {

    const id = userId();

    if (!id) return { ok: false, status: "signed-out", keys: {} };

    if (tableMissing) return { ok: false, status: "missing-table", keys: {} };

    try {

        const { data, error } = await supabase.from(TABLE).select("provider, api_key").eq("user_id", id);

        if (error) return { ...failure(error), keys: {} };

        const keys = {};

        for (const row of data ?? []) {

            if (WIZARD_PROVIDERS.includes(row?.provider)) keys[row.provider] = String(row.api_key ?? "");
        }

        return { ok: true, status: "ok", keys };

    } catch (error) {

        return { ...failure(error), keys: {} };
    }
}

export async function push(provider, key) {

    const id = userId();

    if (!id) return { ok: false, status: "signed-out" };

    if (tableMissing) return { ok: false, status: "missing-table" };

    if (!WIZARD_PROVIDERS.includes(provider) || !isWellFormed(provider, key)) return { ok: false, status: "invalid" };

    try {

        const { error } = await supabase.from(TABLE).upsert(
            { user_id: id, provider, api_key: String(key).trim(), updated_at: new Date().toISOString() },
            { onConflict: "user_id,provider" }
        );

        return error ? failure(error) : { ok: true, status: "ok" };

    } catch (error) {

        return failure(error);
    }
}

export async function remove(provider) {

    const id = userId();

    if (!id) return { ok: false, status: "signed-out" };

    if (tableMissing) return { ok: false, status: "missing-table" };

    try {

        const { error } = await supabase.from(TABLE).delete().eq("user_id", id).eq("provider", provider);

        return error ? failure(error) : { ok: true, status: "ok" };

    } catch (error) {

        return failure(error);
    }
}

// ----------------------------------------------------------
// Account → device
// ----------------------------------------------------------

/**
 * Puts keys from the account on this device (only where it has none).
 * @returns {Promise<{ ok: boolean, status: string, adopted: string[], accountHas: string[] }>}
 */
export async function adoptFromAccount() {

    const result = await pull();

    if (!result.ok) return { ok: false, status: result.status, adopted: [], accountHas: [] };

    const plan = planPull(deviceKeys(), result.keys);

    adopting++;

    try {

        for (const { provider, key } of plan) config.setProviderKey(provider, key);

        // The active provider has no key of its own but an adopted one does → use it.
        if (plan.length && !String(config.providers[config.provider]?.apiKey ?? "").trim() && !plan.some(item => item.provider === config.provider)) {

            config.setProvider(plan[0].provider);
        }

    } finally {

        adopting--;
    }

    // Keys arrived from the account: keep this device in sync from now on, unless the user said no.
    if (plan.length && syncPreference() === null) writePreference("on");

    return { ok: true, status: "ok", adopted: plan.map(item => item.provider), accountHas: Object.keys(result.keys) };
}

// ----------------------------------------------------------
// Device → account
// ----------------------------------------------------------

/**
 * Switch "keep my keys in my account" on or off.
 *  on  → uploads the keys on this device (nothing to upload is fine)
 *  off → deletes the copies in the account
 * @returns {Promise<{ ok: boolean, status: string }>}
 */
export async function setSyncEnabled(enabled) {

    if (!enabled) {

        const wasOn = syncPreference() === "on";

        writePreference("off");

        if (!wasOn || !isSignedIn() || tableMissing) return { ok: true, status: "ok" };

        const results = await Promise.all(WIZARD_PROVIDERS.map(provider => remove(provider)));

        return results.find(item => !item.ok) ?? { ok: true, status: "ok" };
    }

    if (!isSignedIn()) return { ok: false, status: "signed-out" };

    if (tableMissing) return { ok: false, status: "missing-table" };

    // With no key to upload yet nothing would touch the server, and "on" would be a promise
    // nobody checked: make sure the table is there and reachable first.
    const probe = await pull();

    if (!probe.ok) return { ok: false, status: probe.status };

    const keys = deviceKeys();

    for (const provider of WIZARD_PROVIDERS) {

        if (!isWellFormed(provider, keys[provider])) continue;

        const result = await push(provider, keys[provider]);

        if (!result.ok) return result;
    }

    writePreference("on");

    return { ok: true, status: "ok" };
}

/** A key was changed on the device (Settings, wizard): mirror it when sync is on. */
async function mirror(provider) {

    if (syncPreference() !== "on" || !isSignedIn() || tableMissing) return;

    const key = String(config.providers[provider]?.apiKey ?? "").trim();

    if (!key) {

        await remove(provider);

    } else if (isWellFormed(provider, key)) {

        await push(provider, key);
    }
}

const timers = new Map();

if (typeof window !== "undefined") {

    window.addEventListener("lotus:provider-key-changed", event => {

        const provider = event.detail?.provider;

        if (adopting || !WIZARD_PROVIDERS.includes(provider)) return;

        clearTimeout(timers.get(provider));

        timers.set(provider, setTimeout(() => mirror(provider), 600));
    });
}

// ----------------------------------------------------------
// Sign-in hook
// ----------------------------------------------------------

const listeners = new Set();

let watching = false;

let handledUser = null;

/** Sync is on and the device has keys the account lacks (e.g. the table was created later): upload them. */
async function reconcile(accountHas) {

    if (syncPreference() !== "on") return;

    const keys = deviceKeys();

    for (const provider of WIZARD_PROVIDERS) {

        if (!accountHas.includes(provider) && isWellFormed(provider, keys[provider])) await push(provider, keys[provider]);
    }
}

async function onSignedIn(user) {

    const result = await adoptFromAccount();

    if (result.ok) await reconcile(result.accountHas);

    for (const listener of listeners) {

        try { listener({ user, ...result }); } catch (error) { console.warn("keySync dinleyicisi hata verdi:", error); }
    }
}

/**
 * Calls `callback({ user, ok, status, adopted })` once per page load after
 * the user is signed in and keys from the account have been applied.
 * Safe to call before sign-in.
 */
export function watchSignIn(callback) {

    listeners.add(callback);

    if (watching) return;

    watching = true;

    supabase.auth.onAuthStateChange((event, session) => {

        sessionUserId = session?.user?.id ?? null;

        if (!session?.user) {

            // Signed out: a different account may sign in next.
            if (event === "SIGNED_OUT") handledUser = null;

            return;
        }

        if (event !== "SIGNED_IN" && event !== "INITIAL_SESSION") return;

        // supabase-js repeats SIGNED_IN when the tab regains focus; act once per user.
        if (handledUser === session.user.id) return;

        handledUser = session.user.id;

        onSignedIn(session.user);
    });
}

export default {
    syncPreference,
    syncAvailable,
    isSignedIn,
    pull,
    push,
    remove,
    adoptFromAccount,
    setSyncEnabled,
    watchSignIn
};
