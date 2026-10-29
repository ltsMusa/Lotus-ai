// Tests for Kişiselleştirme (personalization), the system prompt and the
// version / cache bookkeeping around them.
// Run:  node --test tests/personalization.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = path => readFile(join(root, path), "utf8");

const store = new Map();
globalThis.localStorage = {
    getItem: key => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: key => store.delete(key)
};

const {
    PERSONALIZATION_LIMITS, DEFAULT_PERSONALIZATION, normalizePersonalization,
    hasPersonalization, buildPersonalizationBlock, cleanText
} = await import("../js/personalization.js");

const { LOTUS_SYSTEM_PROMPT, buildSystemPrompt, buildCompactSystemPrompt } =
    await import("../js/prompts/systemPrompt.js");

// ---------- normalize ----------

test("normalize: anything becomes a complete, valid object", () => {
    for (const input of [undefined, null, "oops", 42, [], {}]) {
        assert.deepEqual(normalizePersonalization(input), DEFAULT_PERSONALIZATION);
    }
});

test("normalize: enforces limits, trims, strips control characters", () => {
    const p = normalizePersonalization({
        nickname: `  ${"a".repeat(100)}\nb  `,
        about: "x".repeat(5000),
        instructions: "y".repeat(5000)
    });

    assert.equal(p.nickname.length <= PERSONALIZATION_LIMITS.nickname, true);
    assert.equal(p.nickname.includes("\n"), false);
    assert.equal(p.about.length, PERSONALIZATION_LIMITS.about);
    assert.equal(p.instructions.length, PERSONALIZATION_LIMITS.instructions);
    assert.equal(cleanText("a\u0000b\u0007c\r\nd", 50), "abc\nd");
});

test("normalize: unknown select values fall back to auto; enabled only false when explicitly false", () => {
    const p = normalizePersonalization({ style: "x", tone: 3, language: "de", enabled: 0 });
    assert.equal(p.style, "auto");
    assert.equal(p.tone, "auto");
    assert.equal(p.language, "auto");
    assert.equal(p.enabled, true);
    assert.equal(normalizePersonalization({ enabled: false }).enabled, false);
});

// ---------- has / block ----------

test("nothing set → no block, nothing sent", () => {
    assert.equal(hasPersonalization(DEFAULT_PERSONALIZATION), false);
    assert.equal(buildPersonalizationBlock(DEFAULT_PERSONALIZATION), "");
    assert.equal(buildPersonalizationBlock(null, { compact: true }), "");
});

test("each field alone is enough to produce a block", () => {
    for (const patch of [
        { nickname: "Musa" }, { about: "geliştirici" }, { instructions: "kısa yaz" },
        { style: "short" }, { tone: "professional" }, { language: "en" }
    ]) {
        assert.equal(hasPersonalization(patch), true, JSON.stringify(patch));
        assert.notEqual(buildPersonalizationBlock(patch), "", JSON.stringify(patch));
    }
});

test("switched off keeps the text but sends nothing", () => {
    const off = { enabled: false, nickname: "Musa", instructions: "kısa yaz" };
    assert.equal(hasPersonalization(off), false);
    assert.equal(buildPersonalizationBlock(off), "");
    assert.equal(normalizePersonalization(off).nickname, "Musa");
});

test("block carries the user's words and says honesty rules still apply", () => {
    const block = buildPersonalizationBlock({
        nickname: "Musa", about: "Android geliştiriyorum", instructions: "Hep madde madde yaz", style: "short", language: "tr"
    });
    assert.match(block, /KULLANICININ KİŞİSEL AYARLARI/);
    assert.match(block, /"Musa" diye hitap et/);
    assert.match(block, /Android geliştiriyorum/);
    assert.match(block, /Hep madde madde yaz/);
    assert.match(block, /1-2 cümle/);
    assert.match(block, /Her zaman Türkçe/);
    assert.match(block, /dürüstlük ve doğruluk kuralları/);
});

test("compact block is shorter and clips long text", () => {
    const input = { nickname: "Musa", about: "a".repeat(600), instructions: "b".repeat(1200) };
    const full = buildPersonalizationBlock(input);
    const compact = buildPersonalizationBlock(input, { compact: true });
    assert.equal(compact.length < full.length / 2, true);
    assert.match(compact, /…/);
});

// ---------- system prompt ----------

test("system prompt: persona is the owner's text (key lines + exact exported copy)", async () => {
    assert.match(LOTUS_SYSTEM_PROMPT, /^Sen Lotus'sun\. Doğal, samimi, zeki/);
    assert.match(LOTUS_SYSTEM_PROMPT, /KONUŞMA TARZIN/);
    assert.match(LOTUS_SYSTEM_PROMPT, /TEMEL KURAL/);
    assert.match(LOTUS_SYSTEM_PROMPT, /asla sırf uzun görünmek için uzatma\.$/);
    assert.equal(LOTUS_SYSTEM_PROMPT.includes("LOTUS AI CORE"), false, "old prompt must be gone");

    assert.equal(await read("ollama/lotus-system-prompt.txt"), `${LOTUS_SYSTEM_PROMPT}\n`,
        "ollama/lotus-system-prompt.txt is stale — run: node tools/export-system-prompt.mjs");

    const script = await read("ollama/termux-kurulum.sh");
    assert.equal(script.includes(`<<'LOTUS_PROMPT_EOF'\n${LOTUS_SYSTEM_PROMPT}\nLOTUS_PROMPT_EOF`), true,
        "termux-kurulum.sh is stale — run: node tools/export-system-prompt.mjs");
});

test("buildSystemPrompt: persona first, then personalization, date, search, memory", () => {
    const prompt = buildSystemPrompt({
        memoryContext: "- [bilgi] Kedisi var",
        searchContext: "1. Örnek sonuç",
        personalization: { nickname: "Musa" }
    });

    const order = [LOTUS_SYSTEM_PROMPT, "KULLANICININ KİŞİSEL AYARLARI", "GÜNCEL BİLGİ", "WEB ARAMA SONUÇLARI", "HAFIZA"]
        .map(part => prompt.indexOf(part));

    assert.equal(order.every(index => index >= 0), true, JSON.stringify(order));
    assert.deepEqual([...order].sort((a, b) => a - b), order);
    assert.equal(prompt.startsWith(LOTUS_SYSTEM_PROMPT), true);
    assert.match(prompt, new RegExp(String(new Date().getFullYear())));
});

test("buildSystemPrompt: without extras it is just persona + date", () => {
    const prompt = buildSystemPrompt();
    assert.equal(prompt.includes("KİŞİSEL AYARLARI"), false);
    assert.equal(prompt.includes("WEB ARAMA"), false);
    assert.equal(prompt.includes("HAFIZA"), false);
    assert.equal(prompt.includes("GÜNCEL BİLGİ"), true);
});

test("compact prompt: short, same persona idea, carries personalization", () => {
    const compact = buildCompactSystemPrompt({ personalization: { nickname: "Musa", style: "short" } });
    assert.match(compact, /^Sen Lotus'sun/);
    assert.match(compact, /Musa/);
    assert.equal(compact.length < LOTUS_SYSTEM_PROMPT.length / 3, true, `${compact.length}`);
});

// ---------- config ----------

test("config: setPersonalization normalizes, persists and survives reload; damaged value is repaired", async () => {
    store.clear();

    const { default: config } = await import("../js/config.js");

    assert.deepEqual(config.personalization, DEFAULT_PERSONALIZATION);

    config.setPersonalization({ nickname: "  Musa  ", tone: "casual", style: "nope" });

    assert.equal(config.personalization.nickname, "Musa");
    assert.equal(config.personalization.style, "auto");
    assert.equal(JSON.parse(store.get("lotus_config_v1")).personalization.tone, "casual");

    // a partial update keeps the rest
    config.setPersonalization({ about: "merhaba" });
    assert.equal(config.personalization.nickname, "Musa");
    assert.equal(config.personalization.about, "merhaba");

    config.resetPersonalization();
    assert.deepEqual(config.personalization, DEFAULT_PERSONALIZATION);

    // damaged storage is repaired on load
    store.set("lotus_config_v1", JSON.stringify({ personalization: "bozuk", routeMode: "local" }));

    const { default: reloaded } = await import("../js/config.js?damaged");

    assert.deepEqual(reloaded.personalization, DEFAULT_PERSONALIZATION);
    assert.equal(reloaded.routeMode, "local");
});

// ---------- version 7.0 Beta 1 everywhere ----------

test("version is 7.0 Beta 1 everywhere", async () => {
    const pkg = JSON.parse(await read("package.json"));
    assert.equal(pkg.version, "7.0.0-beta.1");

    assert.match(await read("index.html"), /Lotus AI · v7\.0 Beta 1</);
    assert.match(await read("index.html"), /Sürüm 7\.0 Beta 1/);
    assert.match(await read("sw.js"), /const VERSION = "7\.0-beta\.1";/);
    // The web package ships without android/, so only check it when present.
    const gradle = await read("android/app/build.gradle").catch(() => null);
    if (gradle) {
        assert.match(gradle, /versionName "7\.0-beta\.1"/);
        assert.match(gradle, /versionCode 72/);
    }

    for (const file of ["js/api.js", "js/chat.js", "js/commands.js"]) {
        assert.match(await read(file), /Version : 7\.0/, file);
    }
});

// ---------- offline shell ----------

test("service worker precaches every module under js/", async () => {
    const sw = await read("sw.js");

    const walk = async dir => {
        const out = [];
        for (const entry of await readdir(join(root, dir), { withFileTypes: true })) {
            const path = `${dir}/${entry.name}`;
            if (entry.isDirectory()) out.push(...await walk(path));
            else if (entry.name.endsWith(".js")) out.push(path);
        }
        return out;
    };

    const missing = (await walk("js")).filter(path => !sw.includes(`"./${path}"`));

    assert.deepEqual(missing, [], "add these to APP_SHELL in sw.js");
});

// ---------- themes ----------

const { THEMES, DEFAULT_THEME, normalizeTheme, themeById } = await import("../js/themeList.js");

const cssBlock = (css, selector) => {
    const start = css.indexOf(selector);
    assert.notEqual(start, -1, `${selector} not found in css/themes.css`);
    const open = css.indexOf("{", start);
    const close = css.indexOf("\n}\n", open);
    return css.slice(open + 1, close);
};

const declaredVars = block => new Set([...block.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm)].map(m => m[1]));

test("themes: list, default and validation", () => {
    assert.deepEqual(THEMES.map(theme => theme.id), ["neon-purple", "dark-gray", "ocean-blue", "sun-green"]);
    assert.equal(DEFAULT_THEME, "neon-purple");
    assert.equal(normalizeTheme("dark-gray"), "dark-gray");
    for (const bad of [undefined, null, "", "light", "DARK-GRAY", 3, {}]) assert.equal(normalizeTheme(bad), "neon-purple");
    assert.equal(themeById("nope").id, "neon-purple");
    for (const theme of THEMES) {
        assert.match(theme.browserColor, /^#[0-9A-Fa-f]{6}$/);
        assert.equal(Boolean(theme.name && theme.hint && theme.swatch?.bg), true, theme.id);
    }
});

test("themes: every theme has its css block and the early script knows it", async () => {
    const css = await read("css/themes.css");
    const html = await read("index.html");

    for (const theme of THEMES) {
        if (theme.id !== DEFAULT_THEME) {
            assert.equal(css.includes(`:root[data-theme="${theme.id}"] {`), true, `css block for ${theme.id}`);
            assert.equal(html.includes(`"${theme.id}": "${theme.browserColor.toLowerCase()}"`), true, `index.html early script knows ${theme.id} and its theme-color`);
        }
    }
});

test("themes: every theme overrides every color token (nothing stays purple by accident)", async () => {
    const css = await read("css/themes.css");

    const base = declaredVars(cssBlock(css, ':root,\n:root[data-theme="neon-purple"]'));

    // Not colors, or derived from other tokens (they follow the override automatically),
    // or meaningful in every theme (state colors, line-accent via accent-2-rgb).
    const shared = new Set([
        "--panel", // overridden anyway; kept in the list for clarity
        "--text-2", "--faint", "--line-accent", "--accent-glow", "--grad-soft", "--grad-border",
        "--danger", "--success", "--warn",
        "--ease", "--ease-spring", "--ease-in", "--font-ui", "--font-display", "--font-mono",
        "--sidebar-w", "--chat-w", "--header-h", "--r-sm", "--r-md", "--r-lg", "--r-xl"
    ]);

    for (const theme of THEMES.filter(item => item.id !== DEFAULT_THEME)) {

        const own = declaredVars(cssBlock(css, `:root[data-theme="${theme.id}"] {`));

        // the gray theme tints the default avatar logo with a filter instead of a second image
        const skip = theme.id === "dark-gray" ? new Set([...shared, "--logo-avatar"]) : shared;

        const missing = [...base].filter(name => !own.has(name) && !skip.has(name));

        assert.deepEqual(missing, [], `${theme.id} must override these tokens in css/themes.css`);

        // and every override really is a token the default theme defines
        assert.deepEqual([...own].filter(name => !base.has(name)), [], theme.id);
    }
});

test("themes: each theme's avatar logo exists and is cached offline", async () => {
    const css = await read("css/themes.css");
    const sw = await read("sw.js");

    for (const match of css.matchAll(/--logo-avatar:\s*url\("\.\.\/(assets\/[^"]+)"\)/g)) {
        await access(join(root, match[1])); // throws when the file is missing
        assert.equal(sw.includes(`"./${match[1]}"`), true, `${match[1]} missing from APP_SHELL in sw.js`);
    }
});

test("themes: no hard-coded purple outside css/themes.css", async () => {
    const files = (await readdir(join(root, "css"))).filter(name => name.endsWith(".css") && name !== "themes.css");

    const purple = /rgba?\(\s*(168|192|244|147|124|216)\s*,\s*(85|132|114|51|58|180|38)\s*,|#(a855f7|7c3aed|9333ea|c026d3|8b5cf6|d8b4fe|c084fc|f472b6|f0abfc|e9d5ff|f9a8d4|a21caf|db2777|6d28d9)\b/i;

    for (const name of files) {
        const text = await read(`css/${name}`);
        text.split("\n").forEach((line, index) => {
            assert.equal(purple.test(line), false, `css/${name}:${index + 1} hard-codes a theme color: ${line.trim()}`);
        });
    }
});

test("themes: every var(--x-rgb) used in css is defined", async () => {
    const themes = await read("css/themes.css");
    const defined = declaredVars(cssBlock(themes, ':root,\n:root[data-theme="neon-purple"]'));

    const used = new Set();
    for (const name of (await readdir(join(root, "css"))).filter(file => file.endsWith(".css"))) {
        for (const m of (await read(`css/${name}`)).matchAll(/var\((--[a-z0-9-]+-rgb)\)/g)) used.add(m[1]);
    }

    assert.deepEqual([...used].filter(name => !defined.has(name)), []);
});

test("themes: config.setTheme validates, persists and repairs damaged storage", async () => {
    store.clear();

    const { default: config } = await import("../js/config.js?theme-a");

    assert.equal(config.theme, "neon-purple");
    assert.equal(config.setTheme("dark-gray"), "dark-gray");
    assert.equal(JSON.parse(store.get("lotus_config_v1")).theme, "dark-gray");
    assert.equal(config.setTheme("pink"), "neon-purple");

    // personalization reset must not touch the look
    config.setTheme("dark-gray");
    config.resetPersonalization();
    assert.equal(config.theme, "dark-gray");

    store.set("lotus_config_v1", JSON.stringify({ theme: "hotpink" }));
    const { default: repaired } = await import("../js/config.js?theme-b");
    assert.equal(repaired.theme, "neon-purple");

    store.set("lotus_config_v1", JSON.stringify({ theme: "dark-gray" }));
    const { default: restored } = await import("../js/config.js?theme-c");
    assert.equal(restored.theme, "dark-gray");
});
