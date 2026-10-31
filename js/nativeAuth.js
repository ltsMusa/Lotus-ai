/**
 * ==========================================================
 * Lotus AI - Google sign-in inside the Android app (pure helpers)
 * ==========================================================
 * Google refuses OAuth inside an embedded WebView ("disallowed_useragent"),
 * so the app opens the sign-in in the phone's browser and Google/Supabase
 * send the user back with a link of its own: lotusai://auth?code=…
 * MainActivity catches that link and hands it to the page, which finishes
 * the sign-in (PKCE code exchange). See Auth.loginWithGoogleInApp in auth.js.
 *
 * Everything here is pure (no DOM, no Supabase) so it can be unit-tested.
 * ==========================================================
 */

/** Must be listed under Supabase → Authentication → URL Configuration → Redirect URLs. */
export const NATIVE_AUTH_REDIRECT = "lotusai://auth";

/** storageKey of the throw-away Supabase client that runs the PKCE exchange. */
export const NATIVE_AUTH_STORAGE_KEY = "lotus-native-oauth";

const PENDING_KEY = "lotus_native_oauth_pending";

/** A sign-in that was started longer ago than this is no longer waited for. */
export const PENDING_MAX_AGE_MS = 15 * 60 * 1000;

/**
 * Reads the link the browser returned the user with.
 * @returns {{ valid: boolean, code: string, error: string, errorDescription: string }}
 */
export function parseNativeAuthUrl(url) {

    const empty = { valid: false, code: "", error: "", errorDescription: "" };

    let parsed;

    try {

        parsed = new URL(String(url ?? ""));

    } catch {

        return empty;
    }

    if (parsed.protocol !== "lotusai:" || parsed.hostname !== "auth") return empty;

    const query = parsed.searchParams;
    const fragment = new URLSearchParams(parsed.hash.replace(/^#/, ""));

    const get = key => query.get(key) ?? fragment.get(key) ?? "";

    return {
        valid: true,
        code: get("code"),
        error: get("error_code") || get("error"),
        errorDescription: get("error_description").replace(/\+/g, " ")
    };
}

/** Turkish text for a sign-in the user cancelled or Google/Supabase refused. */
export function nativeAuthErrorMessage({ error = "", errorDescription = "" } = {}) {

    const text = `${error} ${errorDescription}`.toLowerCase();

    if (text.includes("access_denied") || text.includes("cancel")) return "Google girişi iptal edildi.";

    if (text.includes("provider is not enabled") || text.includes("unsupported provider")) {

        return "Google ile giriş sunucuda henüz açık değil.";
    }

    if (text.includes("redirect")) {

        return "Giriş adresi (lotusai://auth) Supabase'de izinli değil. Authentication → URL Configuration → Redirect URLs listesine ekle.";
    }

    return errorDescription ? `Google girişi tamamlanamadı: ${errorDescription}` : "Google girişi tamamlanamadı. Tekrar dene.";
}

// ---------- "a sign-in is under way" marker (survives a page reload) ----------

function safeStorage(storage) {

    if (storage) return storage;

    try {

        return typeof localStorage !== "undefined" ? localStorage : null;

    } catch {

        return null;
    }
}

export function markNativeAuthPending(now = Date.now(), storage) {

    try { safeStorage(storage)?.setItem(PENDING_KEY, String(now)); } catch { /* storage unavailable */ }
}

export function isNativeAuthPending(now = Date.now(), storage) {

    try {

        const started = Number(safeStorage(storage)?.getItem(PENDING_KEY));

        return Number.isFinite(started) && started > 0 && now - started >= 0 && now - started <= PENDING_MAX_AGE_MS;

    } catch {

        return false;
    }
}

export function clearNativeAuthPending(storage) {

    try { safeStorage(storage)?.removeItem(PENDING_KEY); } catch { /* storage unavailable */ }
}

/** Storage keys the throw-away client leaves behind (session + PKCE verifier). */
export function isNativeAuthStorageKey(key) {

    return String(key ?? "").startsWith(NATIVE_AUTH_STORAGE_KEY);
}
