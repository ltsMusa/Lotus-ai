// Tests for the key wizard's pure logic (js/keyTools.js).
// Run:  node --test tests/keys.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
    KEY_PROVIDERS,
    WIZARD_PROVIDERS,
    findKey,
    isWellFormed,
    maskKey,
    testRequest,
    interpretTest,
    testKey,
    hasAnyKey,
    planPull,
    classifySyncError,
    shouldOfferWizard,
    freshCandidate,
    OFFER_EVERY_MS
} from "../js/keyTools.js";

// Made-up keys with the real shapes: gsk_ + 52 chars, AIza + 35 chars.
const GROQ = "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";
const GEMINI = "AIzaSyA1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q";

test("the wizard handles Groq and Gemini, with the pages the user is sent to", () => {

    assert.deepEqual(WIZARD_PROVIDERS, ["groq", "gemini"]);
    assert.equal(KEY_PROVIDERS.groq.pageUrl, "https://console.groq.com/keys");
    assert.equal(KEY_PROVIDERS.gemini.pageUrl, "https://aistudio.google.com/apikey");
    assert.equal(GROQ.length, 56);
    assert.equal(GEMINI.length, 39);
});

test("findKey spots a key in clipboard text, with or without padding", () => {

    assert.deepEqual(findKey(GROQ), { provider: "groq", key: GROQ });
    assert.deepEqual(findKey(GEMINI), { provider: "gemini", key: GEMINI });
    assert.deepEqual(findKey(`  ${GROQ}\n`), { provider: "groq", key: GROQ });
    assert.deepEqual(findKey(`Your key: ${GEMINI}. Keep it secret!`), { provider: "gemini", key: GEMINI });
    assert.deepEqual(findKey(`export GROQ_API_KEY="${GROQ}"`), { provider: "groq", key: GROQ });
});

test("findKey ignores everything that is not a whole key", () => {

    for (const text of ["", null, undefined, "merhaba", "gsk_kisa", "AIza123", "sk-or-v1-abcdefabcdefabcdefabcdefabcdef", "https://console.groq.com/keys"]) {

        assert.equal(findKey(text), null, String(text));
    }

    // glued to other key characters → not a key of ours
    assert.equal(findKey(`x${GROQ}`), null);
    assert.equal(findKey(`${GROQ}extra_stuff`), null);
    assert.equal(findKey(`${GEMINI}-tail`), null);
});

test("findKey prefers the provider the user is getting a key for", () => {

    const both = `${GROQ} ${GEMINI}`;

    assert.equal(findKey(both, "gemini").provider, "gemini");
    assert.equal(findKey(both, "groq").provider, "groq");
    // no preference → the first one in the text
    assert.equal(findKey(`${GEMINI} ${GROQ}`).provider, "gemini");
});

test("findKey does not read an endless clipboard", () => {

    const huge = `${"a".repeat(5000)} ${GROQ}`;

    assert.equal(findKey(huge), null);
});

test("isWellFormed accepts exactly one key of that provider", () => {

    assert.equal(isWellFormed("groq", GROQ), true);
    assert.equal(isWellFormed("groq", ` ${GROQ} `), true);
    assert.equal(isWellFormed("gemini", GEMINI), true);
    assert.equal(isWellFormed("groq", GEMINI), false);
    assert.equal(isWellFormed("gemini", GROQ), false);
    assert.equal(isWellFormed("groq", `${GROQ} ${GROQ}`), false);
    assert.equal(isWellFormed("groq", ""), false);
});

test("maskKey shows enough to recognise a key and never the middle", () => {

    const masked = maskKey(GROQ);

    assert.equal(masked, "gsk_••••••••" + GROQ.slice(-4));
    assert.ok(!masked.includes(GROQ.slice(4, 20)));
    assert.equal(maskKey(GEMINI).startsWith("AIza"), true);
    assert.equal(maskKey("abc"), "••••");
    assert.equal(maskKey(null), "••••");
});

test("testRequest: models list, the key where each provider wants it", () => {

    const groq = testRequest("groq", GROQ);

    assert.equal(groq.url, "https://api.groq.com/openai/v1/models");
    assert.equal(groq.init.headers.Authorization, `Bearer ${GROQ}`);

    const gemini = testRequest("gemini", GEMINI);

    assert.ok(gemini.url.startsWith("https://generativelanguage.googleapis.com/v1beta/models?"));
    assert.ok(gemini.url.includes(`key=${GEMINI}`));

    assert.equal(testRequest("nope", "x"), null);
});

test("interpretTest: which answers mean the key is fine", () => {

    assert.deepEqual(interpretTest("groq", 200), { ok: true, reason: "ok", status: 200 });
    assert.deepEqual(interpretTest("groq", 429), { ok: true, reason: "limited", status: 429 });
    assert.equal(interpretTest("groq", 401).reason, "invalid");
    assert.equal(interpretTest("gemini", 400, '{"error":{"status":"INVALID_ARGUMENT","details":[{"reason":"API_KEY_INVALID"}]}}').reason, "invalid");
    assert.equal(interpretTest("gemini", 400, "API key not valid. Please pass a valid API key.").ok, false);
    assert.equal(interpretTest("gemini", 400, "something else").reason, "unknown");
    assert.equal(interpretTest("gemini", 403).reason, "denied");
    assert.equal(interpretTest("groq", 503).reason, "server");
    assert.equal(interpretTest("groq", 404).reason, "unknown");
});

const reply = (status, body = "") => async () => ({ ok: status >= 200 && status < 300, status, text: async () => body });

test("testKey: good key, bad key, rate limit", async () => {

    const good = await testKey("groq", GROQ, { fetchImpl: reply(200) });

    assert.equal(good.ok, true);
    assert.equal(good.message, "Anahtar çalışıyor.");

    const bad = await testKey("groq", GROQ, { fetchImpl: reply(401, "{}") });

    assert.equal(bad.ok, false);
    assert.equal(bad.reason, "invalid");
    assert.match(bad.message, /geçersiz/);

    const limited = await testKey("gemini", GEMINI, { fetchImpl: reply(429) });

    assert.equal(limited.ok, true);
    assert.equal(limited.reason, "limited");
});

test("testKey never throws: no connection is a verdict, not an error", async () => {

    const offline = await testKey("groq", GROQ, { fetchImpl: async () => { throw new TypeError("Failed to fetch"); } });

    assert.equal(offline.ok, false);
    assert.equal(offline.reason, "network");
    assert.match(offline.message, /bağlantını/);

    const unreadable = await testKey("groq", GROQ, { fetchImpl: async () => ({ ok: false, status: 401, text: async () => { throw new Error("boom"); } }) });

    assert.equal(unreadable.reason, "invalid");

    assert.equal((await testKey("nope", "x", { fetchImpl: reply(200) })).reason, "unknown");
    assert.equal((await testKey("groq", GROQ, { fetchImpl: null })).reason, "unknown");
});

test("testKey gives up after the timeout", async () => {

    const hang = (url, init) => new Promise((resolve, reject) => init.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));

    const started = Date.now();

    const result = await testKey("groq", GROQ, { fetchImpl: hang, timeoutMs: 30 });

    assert.equal(result.reason, "network");
    assert.ok(Date.now() - started < 1000);
});

test("hasAnyKey looks at every provider, ignoring blanks", () => {

    assert.equal(hasAnyKey({ groq: { apiKey: "" }, gemini: { apiKey: "  " } }), false);
    assert.equal(hasAnyKey({ groq: { apiKey: "" }, openai: { apiKey: "sk-x" } }), true);
    assert.equal(hasAnyKey({}), false);
    assert.equal(hasAnyKey(undefined), false);
});

test("planPull: the account fills only what the device is missing, and only real-looking keys", () => {

    assert.deepEqual(planPull({}, { groq: GROQ, gemini: GEMINI }), [{ provider: "groq", key: GROQ }, { provider: "gemini", key: GEMINI }]);

    // the device's own key is never overwritten
    assert.deepEqual(planPull({ groq: "gsk_mine" }, { groq: GROQ, gemini: GEMINI }), [{ provider: "gemini", key: GEMINI }]);

    // junk, wrong provider, blanks and unknown providers are dropped
    assert.deepEqual(planPull({}, { groq: "hello", gemini: GROQ, openai: "sk-123" }), []);
    assert.deepEqual(planPull({}, { groq: `  ${GROQ}  ` }), [{ provider: "groq", key: GROQ }]);
    assert.deepEqual(planPull(), []);
});

test("classifySyncError tells 'not set up yet' from 'offline' from 'signed out'", () => {

    assert.equal(classifySyncError({ code: "PGRST205", message: "Could not find the table 'public.api_keys' in the schema cache" }), "missing-table");
    assert.equal(classifySyncError({ code: "42P01", message: 'relation "public.api_keys" does not exist' }), "missing-table");
    assert.equal(classifySyncError({ message: "Could not find the table public.api_keys in the schema cache" }), "missing-table");
    assert.equal(classifySyncError({ code: "PGRST301", message: "JWT expired" }), "signed-out");
    assert.equal(classifySyncError({ status: 401, message: "x" }), "signed-out");
    assert.equal(classifySyncError({ message: "Failed to fetch" }), "network");
    assert.equal(classifySyncError({ message: "Sunucuya (Supabase) ulaşılamıyor. İnterneti kontrol et." }), "network");
    assert.equal(classifySyncError({ message: "weird" }), "other");
    assert.equal(classifySyncError(null), "other");
});

test("shouldOfferWizard: after sign-in, no key, not nagging", () => {

    const now = Date.UTC(2026, 9, 31, 12);

    assert.equal(shouldOfferWizard({ signedIn: true, hasKey: false, lastOfferAt: 0, now }), true);
    assert.equal(shouldOfferWizard({ signedIn: false, hasKey: false, now }), false);
    assert.equal(shouldOfferWizard({ signedIn: true, hasKey: true, now }), false);

    // offered an hour ago → quiet; offered 4 days ago → again
    assert.equal(shouldOfferWizard({ signedIn: true, hasKey: false, lastOfferAt: now - 3600 * 1000, now }), false);
    assert.equal(shouldOfferWizard({ signedIn: true, hasKey: false, lastOfferAt: now - OFFER_EVERY_MS - 1, now }), true);

    // a clock that went backwards must not silence it forever
    assert.equal(shouldOfferWizard({ signedIn: true, hasKey: false, lastOfferAt: now + 10 * OFFER_EVERY_MS, now }), true);
    assert.equal(shouldOfferWizard({ signedIn: true, hasKey: false, lastOfferAt: "garbage", now }), true);
});

test("freshCandidate ignores a key that was already on the clipboard when the user left", () => {

    assert.equal(freshCandidate(GROQ, GROQ), null);
    assert.equal(freshCandidate(GROQ, `old ${GROQ} text`), null);
    assert.deepEqual(freshCandidate(GROQ, ""), { provider: "groq", key: GROQ });
    assert.deepEqual(freshCandidate(GROQ, "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"), { provider: "groq", key: GROQ });
    assert.equal(freshCandidate("hello", ""), null);
    assert.equal(freshCandidate("", GROQ), null);
});

// ----------------------------------------------------------
// The database, the docs and the code have to agree
// ----------------------------------------------------------

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = path => readFile(join(root, path), "utf8");

test("schema.sql: api_keys is owner-only, repeatable, and matches what keySync.js reads and writes", async () => {

    const sql = await read("supabase/schema.sql");
    const code = await read("js/keySync.js");

    assert.match(sql, /create table if not exists public\.api_keys/);
    assert.match(sql, /primary key \(user_id, provider\)/);
    assert.match(sql, /references auth\.users\(id\) on delete cascade/);
    assert.match(sql, /alter table public\.api_keys enable row level security/);

    // only the providers the wizard knows
    assert.match(sql, new RegExp(`provider\\s+text not null check \\(provider in \\(${WIZARD_PROVIDERS.map(p => `'${p}'`).join(",\\s*")}\\)\\)`));

    // four owner-only policies, each dropped before it is created (safe to run again)
    for (const op of ["select", "insert", "update", "delete"]) {

        assert.match(sql, new RegExp(`drop policy if exists "api_keys_${op}_own" on public\\.api_keys`));
        assert.match(sql, new RegExp(`create policy "api_keys_${op}_own"\\s+on public\\.api_keys for ${op} to authenticated`));
    }

    assert.equal((sql.match(/on public\.api_keys for \w+ to authenticated[\s\S]*?\(select auth\.uid\(\)\) = user_id/g) || []).length, 4);

    // nothing for anon, the four everyday operations for signed-in users
    assert.match(sql, /revoke all on public\.api_keys\s+from anon, authenticated/);
    assert.match(sql, /grant select, insert, update, delete on public\.api_keys\s+to authenticated/);
    assert.doesNotMatch(sql, /grant [^;]*public\.api_keys[^;]*to (anon|public)/i);

    // the code uses exactly this table and these columns
    assert.match(code, /const TABLE = "api_keys"/);

    for (const column of ["user_id", "provider", "api_key", "updated_at"]) {

        assert.ok(sql.includes(column), column);
        assert.ok(code.includes(column), column);
    }

    assert.match(code, /onConflict: "user_id,provider"/);
});

test("the setup guide and the privacy note tell the truth about keys and the Android sign-in", async () => {

    const setup = await read("supabase/KURULUM.md");
    const privacy = await read("GIZLILIK.md");
    const { NATIVE_AUTH_REDIRECT } = await import("../js/nativeAuth.js");

    // The redirect the app asks Supabase for has to be on the allow-list the guide tells the user to fill.
    assert.ok(setup.includes(NATIVE_AUTH_REDIRECT), "KURULUM.md must tell the user to add the app's redirect URL");
    assert.doesNotMatch(setup, /Google girişi paketlenmiş Android uygulamasında çalışmaz/);

    assert.match(setup, /api_keys/);

    // plain text at rest and opt-in are the two things a user must be told
    assert.match(privacy, /api_keys/);
    assert.match(privacy, /düz metin/);
    assert.match(privacy, /Varsayılan kapalıdır/);
});

test("the wizard files are precached by the service worker", async () => {

    const sw = await read("sw.js");

    for (const file of ["keyTools", "keySync", "keyWizard"]) assert.ok(sw.includes(`"./js/${file}.js"`), file);
});
