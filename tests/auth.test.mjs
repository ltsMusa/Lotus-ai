// Unit tests for sign-in: the Turkish error texts, the input rules and the
// resilient Supabase client wrapper (library arriving late / never).
// Run:  node --test tests/
import test from "node:test";
import assert from "node:assert/strict";

const {
    PASSWORD_MIN, PASSWORD_MAX, normalizeEmail, isValidEmail, passwordProblem,
    describeAuthError, readAuthRedirect, authRedirectUrl, isSupabaseSessionKey
} = await import("../js/authErrors.js");

const tick = (ms = 5) => new Promise(resolve => setTimeout(resolve, ms));

// ---------- input rules ----------

test("normalizeEmail trims and lower-cases; isValidEmail rejects typos", () => {
    assert.equal(normalizeEmail("  Musa@Gmail.COM \n"), "musa@gmail.com");
    assert.equal(normalizeEmail(null), "");
    for (const ok of ["a@b.co", "musa.lotus+test@gmail.com", " A@B.CO "]) assert.equal(isValidEmail(ok), true, ok);
    for (const bad of ["", "abc", "a@b", "a@b.", "a b@c.com", "@c.com", "a@@c.com", undefined]) assert.equal(isValidEmail(bad), false, String(bad));
});

test("passwordProblem enforces 6..72 characters", () => {
    assert.equal(PASSWORD_MIN, 6);
    assert.equal(passwordProblem(""), "Şifre gerekli.");
    assert.match(passwordProblem("12345"), /en az 6/);
    assert.equal(passwordProblem("123456"), "");
    assert.equal(passwordProblem("a".repeat(PASSWORD_MAX)), "");
    assert.match(passwordProblem("a".repeat(PASSWORD_MAX + 1)), /en fazla 72/);
    // bcrypt counts bytes: 40 × "ş" is 80 bytes
    assert.match(passwordProblem("ş".repeat(40)), /en fazla 72/);
});

// ---------- Supabase errors → Turkish ----------

const kind = error => describeAuthError(error).kind;

test("describeAuthError: the common sign-in failures", () => {
    assert.equal(kind({ code: "invalid_credentials", message: "Invalid login credentials" }), "credentials");
    assert.equal(kind({ message: "Invalid login credentials", status: 400 }), "credentials");
    assert.equal(kind({ code: "email_not_confirmed", message: "Email not confirmed" }), "unconfirmed");
    assert.equal(kind({ message: "Email not confirmed" }), "unconfirmed");
    assert.equal(kind({ code: "user_already_exists", message: "User already registered" }), "exists");
    assert.equal(kind({ message: "User already registered" }), "exists");
    assert.equal(kind({ code: "weak_password", message: "Password should be at least 6 characters." }), "weak");
    assert.equal(kind({ code: "same_password", message: "New password should be different from the old password." }), "same-password");
    assert.equal(kind({ code: "over_email_send_rate_limit", message: "email rate limit exceeded" }), "rate");
    assert.equal(kind({ status: 429, message: "x" }), "rate");
    assert.equal(kind({ code: "otp_expired", message: "Email link is invalid or has expired" }), "expired");
    assert.equal(kind({ code: "signup_disabled", message: "Signups not allowed for this instance" }), "disabled");
    assert.equal(kind({ code: "provider_disabled", message: "Unsupported provider: provider is not enabled" }), "disabled");
    assert.equal(kind({ code: "email_address_invalid", message: "Email address \"a@b\" is invalid" }), "invalid-email");
    assert.equal(kind({ code: "session_not_found", message: "Session not found" }), "session");
    assert.equal(kind({ message: "Error sending confirmation email" }), "mail");
});

test("describeAuthError: offline wins over everything and a JWT problem is not 'expired link'", () => {
    assert.equal(kind(new TypeError("Failed to fetch")), "network");
    assert.equal(kind({ name: "AuthRetryableFetchError", message: "x", status: 0 }), "network");
    assert.equal(kind({ message: "NetworkError when attempting to fetch resource." }), "network");
    assert.equal(kind({ message: "JWT expired" }), "session");
    assert.equal(kind({ message: "Invalid Refresh Token: Refresh Token Not Found" }), "session");
});

test("describeAuthError: every message is Turkish text, unknown errors keep the original detail", () => {
    const samples = [
        { code: "invalid_credentials" }, { code: "email_not_confirmed" }, { code: "user_already_exists" },
        { code: "weak_password" }, { code: "same_password" }, { code: "over_email_send_rate_limit" },
        { code: "otp_expired" }, { code: "signup_disabled" }, { code: "session_not_found" }, new TypeError("Failed to fetch")
    ];
    for (const sample of samples) {
        const { message } = describeAuthError(sample);
        assert.ok(message.length > 15, JSON.stringify(sample));
        assert.doesNotMatch(message, /^(invalid|email|user|password|signups?|failed)\b/i, message);
    }
    const other = describeAuthError({ message: "Database error saving new user" });
    assert.equal(other.kind, "other");
    assert.match(other.message, /Database error saving new user/);
    assert.equal(describeAuthError(null).kind, "other");
    assert.equal(describeAuthError(undefined).message.length > 5, true);
});

// ---------- links in e-mails ----------

test("readAuthRedirect understands recovery, confirmation and error links", () => {
    const recovery = readAuthRedirect("#access_token=a&refresh_token=b&type=recovery");
    assert.equal(recovery.isRecovery, true);
    assert.equal(recovery.hasError, false);

    const signup = readAuthRedirect("#access_token=a&type=signup");
    assert.equal(signup.isConfirmation, true);
    assert.equal(signup.isRecovery, false);

    const expired = readAuthRedirect("#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired");
    assert.equal(expired.hasError, true);
    assert.equal(expired.errorCode, "otp_expired");
    assert.equal(expired.errorDescription, "Email link is invalid or has expired");
    assert.equal(describeAuthError({ code: expired.errorCode, message: expired.errorDescription }).kind, "expired");

    const plain = readAuthRedirect("", "");
    assert.deepEqual([plain.isRecovery, plain.isConfirmation, plain.hasError], [false, false, false]);

    assert.equal(readAuthRedirect("", "?error=server_error&error_code=unexpected_failure").hasError, true);
});

test("authRedirectUrl: web uses its own address, the packaged app uses the server address", () => {
    assert.equal(authRedirectUrl({ packaged: false, origin: "https://lotus.vercel.app", pathname: "/" }), "https://lotus.vercel.app/");
    assert.equal(authRedirectUrl({ packaged: false, origin: "https://x.github.io", pathname: "/Lotus-ai/index.html" }), "https://x.github.io/Lotus-ai/");
    assert.equal(authRedirectUrl({ packaged: false, origin: "file://", pathname: "/a/index.html" }), undefined);
    assert.equal(authRedirectUrl({ packaged: true, origin: "https://appassets.androidplatform.net", pathname: "/www/index.html", proxyBaseUrl: "https://lotus.vercel.app/" }), "https://lotus.vercel.app/");
    // no server set → nothing (Supabase falls back to the Site URL), never the fake appassets address
    assert.equal(authRedirectUrl({ packaged: true, origin: "https://appassets.androidplatform.net", pathname: "/www/index.html", proxyBaseUrl: "" }), undefined);
    assert.equal(authRedirectUrl({ packaged: true, proxyBaseUrl: "not a url" }), undefined);
});

test("isSupabaseSessionKey matches only the saved-session keys", () => {
    assert.equal(isSupabaseSessionKey("sb-ecveafyfgelsyamoheyn-auth-token"), true);
    assert.equal(isSupabaseSessionKey("sb-ecveafyfgelsyamoheyn-auth-token-code-verifier"), true);
    for (const other of ["lotus_auth_method", "sb-x", "sb--auth-token", "my-sb-a-auth-token", "", null]) assert.equal(isSupabaseSessionKey(other), false, String(other));
});

// ---------- the client wrapper ----------

// A page without the library yet, like the first seconds of a slow load.
const scripts = [];
let nextScriptOutcome = "error";   // what the next appended <script> does
globalThis.window = { addEventListener() {}, dispatchEvent() {}, supabase: undefined, __supabaseCdn: undefined };
globalThis.document = {
    getElementById: () => null,
    createElement: () => ({ remove() {} }),
    head: {
        appendChild(script) {
            scripts.push(script.src);
            setTimeout(() => (nextScriptOutcome === "load" ? (script.onload?.(), null) : script.onerror?.()), 1);
        }
    }
};

const client = await import("../js/supabaseClient.js");
const { supabase, ensureSupabase, isSupabaseReady, forgetLocalSession, LIBRARY_SOURCES } = client;

test("before the library exists: calls fail with a network error instead of throwing", async () => {
    assert.equal(isSupabaseReady(), false);

    const { error, data } = await supabase.auth.signInWithPassword({ email: "a@b.co", password: "123456" });
    assert.equal(data.user ?? null, null);
    assert.equal(describeAuthError(error).kind, "network");

    for (const method of ["signUp", "resetPasswordForEmail", "resend", "updateUser", "signInWithOAuth"]) {
        const result = await supabase.auth[method]({});
        assert.equal(describeAuthError(result.error).kind, "network", method);
    }

    assert.deepEqual((await supabase.auth.getSession()).data, { session: null });

    const query = await supabase.from("memories").select("id").eq("user_id", "x").order("created_at");
    assert.ok(query.error);
});

test("a subscriber hears INITIAL_SESSION on the next tick, can unsubscribe, and one bad listener hurts nobody", async () => {
    const seen = [];
    let sync = true;

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
        seen.push([event, session, sync]);
    });
    sync = false;
    assert.equal(seen.length, 0, "never called inside the subscribe call");

    const quiet = console.error;
    console.error = () => {};   // the two bad listeners below are logged on purpose

    const bad = [
        supabase.auth.onAuthStateChange(() => { throw new Error("boom"); }),
        supabase.auth.onAuthStateChange(async () => { throw new Error("async boom"); })
    ];

    await tick(20);
    console.error = quiet;

    assert.deepEqual(seen, [["INITIAL_SESSION", null, false]]);

    data.subscription.unsubscribe();
    for (const entry of bad) entry.data.subscription.unsubscribe();
});

test("a library that cannot be loaded: every source is tried, the answer is false, nothing hangs", async () => {
    nextScriptOutcome = "error";
    scripts.length = 0;

    const ready = await ensureSupabase({ timeoutMs: 50 });

    assert.equal(ready, false);
    assert.equal(isSupabaseReady(), false);
    assert.deepEqual(scripts, LIBRARY_SOURCES);
    assert.ok(LIBRARY_SOURCES.length >= 3);
    assert.ok(LIBRARY_SOURCES.every(source => /supabase\.js$/.test(source)));
});

test("the library arrives late: the real client replaces the stand-in and everyone hears the real session", async () => {
    const listeners = [];
    let signedOut = false;

    const fakeSession = { user: { id: "u1", email: "a@b.co" } };

    const real = {
        auth: {
            getSession: async () => ({ data: { session: fakeSession }, error: null }),
            signInWithPassword: async ({ email }) => ({ data: { user: { email }, session: fakeSession }, error: null }),
            signOut: async () => { signedOut = true; return { error: null }; },
            onAuthStateChange(callback) {
                listeners.push(callback);
                return { data: { subscription: { unsubscribe: () => listeners.splice(listeners.indexOf(callback), 1) } } };
            }
        },
        from: table => ({ select: async () => ({ data: [{ table }], error: null }) })
    };

    const heard = [];
    supabase.auth.onAuthStateChange((event, session) => heard.push([event, session?.user?.email ?? null]));
    await tick(20);
    assert.deepEqual(heard, [["INITIAL_SESSION", null]], "still the stand-in");

    window.supabase = { createClient: () => real };

    assert.equal(await ensureSupabase({ timeoutMs: 50 }), true);
    assert.equal(isSupabaseReady(), true);
    assert.equal(await ensureSupabase(), true, "second call is instant");

    await tick(20);
    assert.deepEqual(heard.at(-1), ["INITIAL_SESSION", "a@b.co"]);

    // modules that imported `supabase` before the swap now talk to the real client
    const login = await supabase.auth.signInWithPassword({ email: "x@y.co", password: "123456" });
    assert.equal(login.data.user.email, "x@y.co");
    assert.deepEqual((await supabase.from("messages").select()).data, [{ table: "messages" }]);

    // real events are forwarded — on the next tick, never inside the library's own call
    assert.equal(listeners.length, 1);
    let inside = true;
    const after = [];
    supabase.auth.onAuthStateChange(event => after.push([event, inside]));
    await tick(20);
    after.length = 0;

    listeners[0]("SIGNED_IN", fakeSession);
    inside = false;
    await tick(20);
    assert.deepEqual(after, [["SIGNED_IN", false]]);

    // the library's own INITIAL_SESSION is not passed on twice
    after.length = 0;
    listeners[0]("INITIAL_SESSION", fakeSession);
    await tick(20);
    assert.deepEqual(after, []);

    await supabase.auth.signOut({ scope: "local" });
    assert.equal(signedOut, true);
});

test("forgetLocalSession removes only the Supabase session keys and announces SIGNED_OUT", async () => {
    const data = {
        "sb-abc-auth-token": "{}",
        "sb-abc-auth-token-code-verifier": "v",
        lotus_auth_method: "password",
        lotus_config: "{}"
    };
    const storage = {};
    for (const [key, value] of Object.entries(data)) storage[key] = value;
    Object.defineProperty(storage, "removeItem", { enumerable: false, value: key => { delete storage[key]; } });

    const events = [];
    supabase.auth.onAuthStateChange(event => events.push(event));
    await tick(20);
    events.length = 0;

    forgetLocalSession(storage);
    await tick(20);

    assert.deepEqual(Object.keys(storage).sort(), ["lotus_auth_method", "lotus_config"]);
    assert.deepEqual(events, ["SIGNED_OUT"]);

    // blocked storage must not throw
    assert.doesNotThrow(() => forgetLocalSession({ get length() { throw new Error("blocked"); } }));
});
