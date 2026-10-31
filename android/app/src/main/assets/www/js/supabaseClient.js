/**
 * ==========================================================
 * Lotus AI - Supabase client
 * ==========================================================
 * Why this is not just `createClient(...)`:
 *
 *  • The Supabase library comes from a CDN. If that request fails or
 *    hangs (bad network, blocker, the Android WebView with no
 *    connection yet) the old code fell back to a stub FOREVER, so
 *    "giriş yapılamıyor" until the page was reloaded — and a hanging
 *    <script> held up the whole app. Now the library loads without
 *    blocking, other sources are tried, and the real client is swapped
 *    in as soon as the library arrives (ensureSupabase()).
 *
 *  • `supabase` is a thin wrapper around whichever client is current,
 *    so modules that imported it earlier (storage.js, memory.js,
 *    sidebar.js) keep working after the swap.
 *
 *  • Auth listeners are called outside supabase-js's internal lock.
 *    storage.js awaits more Supabase calls inside its listener; run
 *    inside the lock that can deadlock the whole client.
 * ==========================================================
 */

import { isSupabaseSessionKey } from "./authErrors.js";

export const SUPABASE_URL = "https://ecveafyfgelsyamoheyn.supabase.co";

export const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_qd7Eqg9Cz_9_fxqSlSFXxg_DLtUFVDb";

/** Tried in order when the page's own <script> tag did not deliver the library. */
export const LIBRARY_SOURCES = [
    "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js",
    "https://unpkg.com/@supabase/supabase-js@2/dist/umd/supabase.js",
    // Optional offline copy — put it there with tools/fetch-supabase.sh
    "vendor/supabase/supabase.js"
];

const NETWORK_MESSAGE = "Sunucuya (Supabase) ulaşılamıyor. İnterneti kontrol et.";

// ----------------------------------------------------------
// Stand-in used until the real library is available
// ----------------------------------------------------------

function createOfflineStubClient() {

    function stubQuery() {

        const result = Promise.resolve({ data: null, error: { message: NETWORK_MESSAGE } });

        for (const method of ["select", "insert", "update", "upsert", "delete", "eq", "neq", "in", "is", "gt", "gte", "lt", "lte", "like", "ilike", "or", "not", "match", "order", "limit", "range", "single", "maybeSingle"]) {

            result[method] = () => stubQuery();
        }

        return result;
    }

    const authError = () => ({ name: "AuthRetryableFetchError", message: NETWORK_MESSAGE, status: 0 });

    // Same shape the real library answers with, so callers can read data.user safely.
    const failure = () => Promise.resolve({ data: { user: null, session: null }, error: authError() });

    return {
        auth: {
            getSession: () => Promise.resolve({ data: { session: null }, error: null }),
            getUser: () => Promise.resolve({ data: { user: null }, error: null }),
            signInWithPassword: failure,
            signUp: failure,
            signInWithOAuth: failure,
            resetPasswordForEmail: failure,
            resend: failure,
            updateUser: failure,
            signOut: () => Promise.resolve({ error: null }),
            refreshSession: () => Promise.resolve({ data: { session: null }, error: null })
        },
        from() {
            return stubQuery();
        },
        rpc() {
            return stubQuery();
        }
    };
}

// ----------------------------------------------------------
// Current client + listeners
// ----------------------------------------------------------

let realClient = null;

let stubClient = null;

let detachFromClient = null;

const listeners = new Set();

function createRealClient() {

    if (typeof window === "undefined" || !window.supabase?.createClient) return null;

    try {

        return window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
            auth: {
                autoRefreshToken: true,
                persistSession: true,
                detectSessionInUrl: true
            }
        });

    } catch (error) {

        console.warn("⚠️ Supabase istemcisi oluşturulamadı:", error);

        return null;
    }
}

function current() {

    return realClient || (stubClient ||= createOfflineStubClient());
}

function runListener(callback, event, session) {

    try {

        Promise.resolve(callback(event, session)).catch(error => console.error("Auth dinleyicisi hata verdi:", error));

    } catch (error) {

        console.error("Auth dinleyicisi hata verdi:", error);
    }
}

/** Calls listeners on the next tick — outside supabase-js's internal lock. */
function emit(event, session, targets = null) {

    setTimeout(() => {

        for (const callback of [...(targets || listeners)]) runListener(callback, event, session);

    }, 0);
}

async function emitInitialSession(targets) {

    let session = null;

    try {

        const { data } = await current().auth.getSession();

        session = data?.session ?? null;

    } catch {

        // no session
    }

    emit("INITIAL_SESSION", session, targets);
}

function bindToClient() {

    detachFromClient?.();

    detachFromClient = null;

    if (!realClient) return;

    const { data } = realClient.auth.onAuthStateChange((event, session) => {

        // The wrapper hands out its own INITIAL_SESSION (see below).
        if (event === "INITIAL_SESSION") return;

        emit(event, session);
    });

    detachFromClient = () => data?.subscription?.unsubscribe?.();
}

const authWrapper = {

    onAuthStateChange(callback) {

        listeners.add(callback);

        emitInitialSession([callback]);

        return { data: { subscription: { unsubscribe: () => listeners.delete(callback) } } };
    }
};

export const supabase = {

    auth: new Proxy(authWrapper, {

        get(target, property) {

            if (property in target) return target[property];

            const auth = current().auth;

            const value = auth[property];

            return typeof value === "function" ? value.bind(auth) : value;
        }
    }),

    from: (...args) => current().from(...args),

    rpc: (...args) => current().rpc(...args)
};

// ----------------------------------------------------------
// Loading the library
// ----------------------------------------------------------

function loadScript(source, timeoutMs) {

    return new Promise((resolve, reject) => {

        const script = document.createElement("script");

        const done = (ok, reason) => {

            clearTimeout(timer);

            script.onload = script.onerror = null;

            if (ok) resolve();
            else {

                script.remove();

                reject(new Error(reason));
            }
        };

        const timer = setTimeout(() => done(false, "timeout"), timeoutMs);

        script.async = true;

        script.src = source;

        script.onload = () => done(true);

        script.onerror = () => done(false, "error");

        document.head.appendChild(script);
    });
}

/** The <script id="supabase-cdn"> in index.html reports "ok" / "fail" on window.__supabaseCdn. */
function waitForPageScript(timeoutMs) {

    return new Promise(resolve => {

        const started = Date.now();

        const check = () => {

            if (window.supabase || window.__supabaseCdn || Date.now() - started >= timeoutMs) resolve();
            else setTimeout(check, 100);
        };

        check();
    });
}

let loading = null;

/**
 * Makes sure the real Supabase client exists (loads the library if needed).
 * Resolves true when sign-in etc. can work, false when it cannot right now.
 */
export function ensureSupabase({ timeoutMs = 7000 } = {}) {

    if (realClient) return Promise.resolve(true);

    if (loading) return loading;

    loading = (async () => {

        try {

            if (!window.supabase && document.getElementById("supabase-cdn")) await waitForPageScript(timeoutMs);

            for (const source of LIBRARY_SOURCES) {

                if (window.supabase?.createClient) break;

                if (/^https?:/i.test(source) && typeof navigator !== "undefined" && navigator.onLine === false) continue;

                try {

                    await loadScript(source, timeoutMs);

                } catch {

                    // try the next source
                }
            }

            const created = createRealClient();

            if (!created) return false;

            realClient = created;

            bindToClient();

            // Anyone who subscribed while we had only the stand-in learns the real session.
            if (listeners.size) emitInitialSession([...listeners]);

            try {

                window.dispatchEvent(new CustomEvent("lotus:supabase-ready"));

            } catch {

                // no window
            }

            return true;

        } finally {

            loading = null;
        }
    })();

    return loading;
}

export function isSupabaseReady() {

    return Boolean(realClient);
}

/**
 * Last resort when signing out cannot reach the server (offline): drop the
 * saved session from this device and tell the app it is signed out.
 */
export function forgetLocalSession(storage = globalThis.localStorage) {

    try {

        for (const key of Object.keys(storage)) {

            if (isSupabaseSessionKey(key)) storage.removeItem(key);
        }

    } catch {

        // storage blocked
    }

    emit("SIGNED_OUT", null);
}

// Use the library at once if the page already has it.
realClient = createRealClient();

if (realClient) bindToClient();

if (typeof window !== "undefined") {

    // Back online with no client yet → try again without waiting for a tap.
    window.addEventListener("online", () => {

        if (!realClient) ensureSupabase();
    });
}

/**
 * A second, separate client — used only for the Google sign-in that runs in the
 * phone's browser (see nativeAuth.js). It has its own storageKey, so it never
 * touches the real session, and it never refreshes tokens on its own.
 * Resolves null when the library is not available.
 */
export async function createAuxClient(authOptions = {}) {

    if (!(await ensureSupabase())) return null;

    try {

        return window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
            auth: { autoRefreshToken: false, persistSession: true, detectSessionInUrl: false, ...authOptions }
        });

    } catch (error) {

        console.warn("⚠️ Yardımcı Supabase istemcisi oluşturulamadı:", error);

        return null;
    }
}
