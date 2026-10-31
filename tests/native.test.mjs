// Tests for the pure parts of the Android integration: the Google sign-in link,
// the notification rules, and the notification settings kept in config.
// Run:  node --test tests/native.test.mjs
import test from "node:test";
import assert from "node:assert/strict";

const store = new Map();
globalThis.localStorage = {
    getItem: key => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: key => store.delete(key),
    key: index => [...store.keys()][index] ?? null,
    get length() { return store.size; }
};

const {
    NATIVE_AUTH_REDIRECT, NATIVE_AUTH_STORAGE_KEY, PENDING_MAX_AGE_MS, parseNativeAuthUrl, nativeAuthErrorMessage,
    markNativeAuthPending, isNativeAuthPending, clearNativeAuthPending, isNativeAuthStorageKey
} = await import("../js/nativeAuth.js");

const {
    DEFAULT_NOTIFICATIONS, normalizeNotifications, shouldNotify, previewText, replyNotification,
    percentOf, downloadNotification, keepAliveText, shouldPostProgress
} = await import("../js/notifyPolicy.js");

// ---------- Google sign-in link ----------

test("parseNativeAuthUrl reads the code, errors and rejects foreign links", () => {
    assert.deepEqual(parseNativeAuthUrl("lotusai://auth?code=abc123"), { valid: true, code: "abc123", error: "", errorDescription: "" });

    const denied = parseNativeAuthUrl("lotusai://auth#error=access_denied&error_description=User+denied+access");
    assert.equal(denied.valid, true);
    assert.equal(denied.error, "access_denied");
    assert.equal(denied.errorDescription, "User denied access");

    const supabaseError = parseNativeAuthUrl("lotusai://auth?error_code=provider_disabled&error_description=Unsupported+provider");
    assert.equal(supabaseError.error, "provider_disabled");

    // Anything that is not exactly our link is ignored.
    for (const url of ["https://auth/?code=1", "lotusai://other?code=1", "http://evil.example/?code=1", "javascript:alert(1)", "", null, undefined, "not a url"]) {
        assert.equal(parseNativeAuthUrl(url).valid, false, String(url));
    }
});

test("the sign-in redirect is the link the parser accepts", () => {
    assert.equal(NATIVE_AUTH_REDIRECT, "lotusai://auth");
    assert.equal(parseNativeAuthUrl(`${NATIVE_AUTH_REDIRECT}?code=x`).valid, true);
});

test("nativeAuthErrorMessage speaks Turkish and names the Supabase fix", () => {
    assert.match(nativeAuthErrorMessage({ error: "access_denied" }), /iptal/);
    assert.match(nativeAuthErrorMessage({ errorDescription: "Unsupported provider: provider is not enabled" }), /açık değil/);
    assert.match(nativeAuthErrorMessage({ errorDescription: "redirect URL not allowed" }), /Redirect URLs/);
    assert.match(nativeAuthErrorMessage({}), /tamamlanamadı/);
    assert.match(nativeAuthErrorMessage({ errorDescription: "boom" }), /boom/);
});

test("a started sign-in is remembered for 15 minutes, never from the future, and can be cleared", () => {
    clearNativeAuthPending();
    assert.equal(isNativeAuthPending(), false);

    const start = 1_000_000;
    markNativeAuthPending(start);

    assert.equal(isNativeAuthPending(start + 1000), true);
    assert.equal(isNativeAuthPending(start + PENDING_MAX_AGE_MS), true);
    assert.equal(isNativeAuthPending(start + PENDING_MAX_AGE_MS + 1), false);
    assert.equal(isNativeAuthPending(start - 1), false);

    clearNativeAuthPending();
    assert.equal(isNativeAuthPending(start + 1000), false);

    // Damaged marker
    store.set("lotus_native_oauth_pending", "abc");
    assert.equal(isNativeAuthPending(start), false);
    clearNativeAuthPending();
});

test("only the helper client's own storage keys are treated as leftovers", () => {
    assert.equal(isNativeAuthStorageKey(NATIVE_AUTH_STORAGE_KEY), true);
    assert.equal(isNativeAuthStorageKey(`${NATIVE_AUTH_STORAGE_KEY}-code-verifier`), true);
    assert.equal(isNativeAuthStorageKey("sb-ecveafyfgelsyamoheyn-auth-token"), false);
    assert.equal(isNativeAuthStorageKey("lotus_config_v1"), false);
});

// ---------- notification rules ----------

test("normalizeNotifications always returns a complete, boolean-only object", () => {
    assert.deepEqual(normalizeNotifications(undefined), DEFAULT_NOTIFICATIONS);
    assert.deepEqual(normalizeNotifications("bozuk"), DEFAULT_NOTIFICATIONS);
    assert.deepEqual(normalizeNotifications([1, 2]), DEFAULT_NOTIFICATIONS);
    assert.deepEqual(normalizeNotifications({ reply: false, alert: "evet", hack: true }), { ...DEFAULT_NOTIFICATIONS, reply: false });
});

test("shouldNotify: only when switched on, permitted and the app is not on screen", () => {
    const base = { settings: DEFAULT_NOTIFICATIONS, foreground: false, permission: "granted" };

    assert.equal(shouldNotify("reply", base), true);
    assert.equal(shouldNotify("download", base), true);
    assert.equal(shouldNotify("alert", base), true);

    assert.equal(shouldNotify("reply", { ...base, foreground: true }), false, "the answer is already on screen");
    assert.equal(shouldNotify("reply", { ...base, permission: "denied" }), false);
    assert.equal(shouldNotify("reply", { ...base, permission: "default" }), false);
    assert.equal(shouldNotify("reply", { ...base, settings: { ...DEFAULT_NOTIFICATIONS, enabled: false } }), false);
    assert.equal(shouldNotify("reply", { ...base, settings: { ...DEFAULT_NOTIFICATIONS, reply: false } }), false);
    assert.equal(shouldNotify("alert", { ...base, settings: { ...DEFAULT_NOTIFICATIONS, reply: false } }), true);
    assert.equal(shouldNotify("sparkle", base), false);
    assert.equal(shouldNotify("reply", {}), false);
});

test("previewText turns markdown into a short plain line", () => {
    assert.equal(previewText("**Merhaba** _dünya_!"), "Merhaba dünya!");
    assert.equal(previewText("# Başlık\n\n- bir\n- iki"), "Başlık • bir • iki");
    assert.equal(previewText("Bak [şuraya](https://example.com) ve ![resim](https://x/y.png) tamam"), "Bak şuraya ve tamam");
    assert.equal(previewText("önce ```js\nconst a = 1;\n``` sonra"), "önce (kod) sonra");
    assert.equal(previewText("<think>gizli düşünce</think>Cevap bu"), "Cevap bu");

    const long = previewText("a".repeat(500));
    assert.equal(long.length, 140);
    assert.ok(long.endsWith("…"));

    assert.equal(previewText(null), "");
});

test("reply notifications: text for answers and for images", () => {
    assert.deepEqual(replyNotification({ text: "**Selam** nasılsın" }), { title: "Lotus yanıtladı", body: "Selam nasılsın" });
    assert.deepEqual(replyNotification({ text: "" }), { title: "Lotus yanıtladı", body: "Yanıtın hazır." });
    assert.deepEqual(replyNotification({ text: "bir kedi", image: true }), { title: "Görselin hazır", body: "bir kedi" });
    assert.equal(replyNotification({ image: true }).body, "Dokun ve gör.");
});

test("download progress: percent, text and throttling", () => {
    assert.equal(percentOf(50, 200), 25);
    assert.equal(percentOf(300, 200), 100);
    assert.equal(percentOf(5, 0), -1);
    assert.equal(percentOf(-1, 10), -1);

    const note = downloadNotification({ name: "Lotus Mini Hafif", loaded: 235 * 1024 * 1024, total: 470 * 1024 * 1024 });
    assert.equal(note.title, "Lotus Mini Hafif indiriliyor");
    assert.equal(note.percent, 50);
    assert.match(note.body, /%50 — 235 \/ 470 MB/);
    assert.equal(downloadNotification({ loaded: 5, total: 0 }).body, "İndiriliyor…");

    assert.equal(keepAliveText("download"), "Lotus Mini indiriliyor…");
    assert.equal(keepAliveText("image"), "Görsel hazırlanıyor…");
    assert.equal(keepAliveText(), "Lotus yanıt hazırlıyor…");

    // same percent: skip; a quick follow-up: skip; later and higher: post; done: always post
    assert.equal(shouldPostProgress({ lastPercent: 10, lastAt: 0, percent: 10, now: 99999 }), false);
    assert.equal(shouldPostProgress({ lastPercent: 10, lastAt: 1000, percent: 11, now: 1500 }), false);
    assert.equal(shouldPostProgress({ lastPercent: 10, lastAt: 1000, percent: 11, now: 2600 }), true);
    assert.equal(shouldPostProgress({ lastPercent: 99, lastAt: 1000, percent: 100, now: 1001 }), true);
});

// ---------- config ----------

test("config.notifications: defaults, validation, persistence and repair of damaged storage", async () => {
    store.clear();

    const { default: config } = await import("../js/config.js?notif-1");

    assert.deepEqual(config.notifications, DEFAULT_NOTIFICATIONS);

    config.setNotifications({ reply: false, background: false, bogus: true });

    assert.deepEqual(config.notifications, { ...DEFAULT_NOTIFICATIONS, reply: false, background: false });

    const saved = JSON.parse(store.get("lotus_config_v1"));
    assert.equal(saved.notifications.reply, false);
    assert.equal("bogus" in saved.notifications, false);

    // damaged storage is repaired on load
    store.set("lotus_config_v1", JSON.stringify({ notifications: "bozuk", routeMode: "local" }));

    const { default: reloaded } = await import("../js/config.js?notif-2");

    assert.deepEqual(reloaded.notifications, DEFAULT_NOTIFICATIONS);
    assert.equal(reloaded.routeMode, "local");
});
