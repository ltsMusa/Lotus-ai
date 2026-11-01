// Tests for the image engine's pure rules (js/imagePolicy.js).
// Run:  node --test tests/image.test.mjs
import test from "node:test";
import assert from "node:assert/strict";

import {
    IMAGE_PREFIX,
    ASPECTS,
    STYLES,
    POLLINATIONS_MAX_AREA,
    DEFAULT_IMAGE_SETTINGS,
    fitToArea,
    normalizeImageSettings,
    enhancerUserMessage,
    cleanEnhanced,
    finalPrompt,
    encodePromptForPath,
    pollinationsUrl,
    msUntilNextAnonymous,
    ANON_SPACING_MS,
    RETRY_DELAYS_MS,
    secondsLabel,
    geminiImageRequest,
    classifyGeminiImage,
    shouldTryGemini,
    GEMINI_PARK_MS,
    GEMINI_NOTES,
    imagePromptFromMessage,
    historyText,
    dropOldInlineImages,
    routeHint
} from "../js/imagePolicy.js";

test("every size fits what the free endpoint allows, and keeps its proportion", () => {

    for (const aspect of Object.values(ASPECTS)) {

        assert.ok(aspect.width * aspect.height <= POLLINATIONS_MAX_AREA, `${aspect.id} is too big`);

        // the ratio label is what the size really is (to within rounding)
        const [w, h] = aspect.ratio.split(":").map(Number);

        assert.ok(Math.abs(aspect.width / aspect.height - w / h) < 0.01, aspect.id);
    }

    assert.deepEqual(fitToArea(768, 768), { width: 768, height: 768 });
    assert.deepEqual(fitToArea(400, 300), { width: 400, height: 300 });

    const big = fitToArea(2048, 1024);

    assert.ok(big.width * big.height <= POLLINATIONS_MAX_AREA);
    assert.ok(Math.abs(big.width / big.height - 2) < 0.02);
});

test("settings are repaired, never trusted", () => {

    assert.deepEqual(normalizeImageSettings(undefined), DEFAULT_IMAGE_SETTINGS);
    assert.deepEqual(normalizeImageSettings("garbage"), DEFAULT_IMAGE_SETTINGS);
    assert.deepEqual(normalizeImageSettings({ aspect: "wide", style: "anime", enhance: false }), { aspect: "wide", style: "anime", enhance: false });
    assert.deepEqual(normalizeImageSettings({ aspect: "huge", style: "__proto__", enhance: "yes" }), DEFAULT_IMAGE_SETTINGS);
    assert.deepEqual(normalizeImageSettings({ aspect: "constructor" }), DEFAULT_IMAGE_SETTINGS);
});

test("every style has a label and (except Otomatik) an English suffix", () => {

    for (const style of Object.values(STYLES)) {

        assert.ok(style.label.length >= 2, style.id);

        if (style.id === "auto") assert.equal(style.suffix, "");
        else assert.match(style.suffix, /^[\x20-\x7e]+$/, `${style.id} must be plain English`);
    }
});

test("enhancerUserMessage carries the idea and the chosen style", () => {

    assert.equal(enhancerUserMessage("  yağmurda mor lotus ", "anime"), `Image idea: yağmurda mor lotus\nStyle: ${STYLES.anime.suffix}`);
    assert.match(enhancerUserMessage("kedi"), /Style: choose what fits/);
    assert.match(enhancerUserMessage("kedi", "nope"), /Style: choose what fits/);
});

test("cleanEnhanced keeps a good English prompt and drops everything else", () => {

    const good = "A single purple lotus flower standing in falling rain, soft diffused light, glossy petals covered in droplets, calm dark teal pond, centered composition, cinematic mood";

    assert.equal(cleanEnhanced(good), good);
    assert.equal(cleanEnhanced(`"${good}"`), good);
    assert.equal(cleanEnhanced(`Prompt: ${good}`), good);
    assert.equal(cleanEnhanced(`Here is the prompt:\n${good}`), good);
    assert.equal(cleanEnhanced(`<think>hmm, lotus…</think>\n${good}`), good);
    assert.equal(cleanEnhanced("```\n" + good + "\n```"), good);
    assert.equal(cleanEnhanced(good.replace(/, /g, ",\n")), good.replace(/, /g, ", ").replace(/,\s+/g, ", "));

    // not usable
    assert.equal(cleanEnhanced(""), null);
    assert.equal(cleanEnhanced(null), null);
    assert.equal(cleanEnhanced("lotus"), null);
    assert.equal(cleanEnhanced("I'm sorry, but I can't help with that request, please try something else."), null);
    assert.equal(cleanEnhanced("Üzgünüm, bu isteği yerine getiremiyorum, başka bir şey dener misin?"), null);
    // the model handed the Turkish idea back unchanged
    assert.equal(cleanEnhanced("yağmurda duran mor bir lotus çiçeği, arkada bulanık bir göl ve şafak ışığı"), null);
});

test("cleanEnhanced cuts a runaway answer at a word", () => {

    const long = "a glowing lantern floating over a calm lake ".repeat(30);

    const cut = cleanEnhanced(long);

    assert.ok(cut.length <= 600);
    assert.ok(cut.endsWith("lake") || cut.endsWith("over") || cut.endsWith("floating") || cut.endsWith("lantern") || cut.endsWith("calm") || cut.endsWith("a") || cut.endsWith("glowing"));
    assert.ok(!/\s$/.test(cut));
});

test("finalPrompt: the enhanced idea plus the style; Gemini also gets the ratio", () => {

    assert.equal(finalPrompt({ prompt: "mor lotus" }), "mor lotus");
    assert.equal(finalPrompt({ prompt: "mor lotus", enhanced: "a purple lotus" }), "a purple lotus");
    assert.equal(finalPrompt({ prompt: "x", enhanced: "a purple lotus", style: "oil" }), `a purple lotus, ${STYLES.oil.suffix}`);
    assert.equal(finalPrompt({ prompt: "mor lotus", style: "unknown" }), "mor lotus");

    const gemini = finalPrompt({ prompt: "x", enhanced: "a purple lotus", style: "photo", aspect: "wide", forGemini: true });

    assert.match(gemini, /^Generate an image: a purple lotus, photorealistic/);
    assert.match(gemini, /Aspect ratio 16:9\./);

    assert.ok(finalPrompt({ prompt: "a".repeat(2000) }).length <= 900);
});

test("encodePromptForPath leaves no bracket that could end a markdown link", () => {

    const encoded = encodePromptForPath("kedi (mor!) 'x' *y*");

    assert.doesNotMatch(encoded, /[()!'*\s]/);
    assert.equal(decodeURIComponent(encoded), "kedi (mor!) 'x' *y*");
});

test("pollinationsUrl: size from the aspect, inside the free limit, link-safe", () => {

    const url = pollinationsUrl("kedi (mor)", { aspect: "wide", seed: 7 });

    assert.match(url, /^https:\/\/image\.pollinations\.ai\/prompt\/kedi%20%28mor%29\?width=1024&height=576&seed=7&/);

    const square = new URL(pollinationsUrl("x", { aspect: "square", seed: 1 }));

    assert.equal(square.searchParams.get("width"), "768");
    assert.equal(square.searchParams.get("height"), "768");

    for (const aspect of Object.keys(ASPECTS)) {

        const parsed = new URL(pollinationsUrl("x", { aspect, seed: 1 }));

        assert.ok(Number(parsed.searchParams.get("width")) * Number(parsed.searchParams.get("height")) <= POLLINATIONS_MAX_AREA, aspect);
    }

    // the whole address survives being a markdown image (the chat stores it that way)
    const markdown = `![kedi (mor)](${url})`;

    assert.equal(markdown.match(/!\[([^\]]*)\]\((https:\/\/image\.pollinations\.ai\/[^\s)]+)\)/)?.[2], url);

    // an unknown aspect falls back to square
    assert.match(pollinationsUrl("x", { aspect: "nope" }), /width=768&height=768/);
});

test("the free endpoint's 45 s window is respected", () => {

    const now = 1_000_000;

    assert.equal(msUntilNextAnonymous({ lastAt: 0, now }), 0);
    assert.equal(msUntilNextAnonymous({ lastAt: now - 10_000, now }), ANON_SPACING_MS - 10_000);
    assert.equal(msUntilNextAnonymous({ lastAt: now - ANON_SPACING_MS, now }), 0);
    assert.equal(msUntilNextAnonymous({ lastAt: now - 120_000, now }), 0);
    // garbage / a clock that went backwards never makes anyone wait
    assert.equal(msUntilNextAnonymous({ lastAt: now + 60_000, now }), 0);
    assert.equal(msUntilNextAnonymous({ lastAt: "x", now }), 0);

    // the old retries (6 s, 16 s) were shorter than the window — they could only fail
    assert.ok(ANON_SPACING_MS >= 45_000);
    assert.ok(RETRY_DELAYS_MS.length >= 1 && RETRY_DELAYS_MS.every(ms => ms >= 45_000));

    assert.equal(secondsLabel(46_000), "46 sn");
    assert.equal(secondsLabel(300), "1 sn");
});

test("geminiImageRequest: key in the address only, text in the body", () => {

    const request = geminiImageRequest("gemini-2.5-flash-image", "AIza key&x", "Generate an image: a lotus");

    assert.equal(request.url, "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=AIza%20key%26x");
    assert.deepEqual(request.body.generationConfig.responseModalities, ["TEXT", "IMAGE"]);
    assert.equal(request.body.contents[0].parts[0].text, "Generate an image: a lotus");
    assert.ok(!JSON.stringify(request.body).includes("AIza"));
});

test("classifyGeminiImage tells a picture from every kind of 'no'", () => {

    const picture = { candidates: [{ content: { parts: [{ text: "Here you go" }, { inlineData: { mimeType: "image/png", data: "iVBORw0KGgo=" } }] } }] };

    assert.deepEqual(classifyGeminiImage({ status: 200, body: picture }), { kind: "image", mime: "image/png", data: "iVBORw0KGgo=" });

    // snake_case, as some SDKs and docs print it
    const snake = { candidates: [{ content: { parts: [{ inline_data: { mime_type: "image/jpeg", data: "/9j/4A==" } }] } }] };

    assert.deepEqual(classifyGeminiImage({ status: 200, body: snake }), { kind: "image", mime: "image/jpeg", data: "/9j/4A==" });

    assert.equal(classifyGeminiImage({ status: 200, body: { candidates: [{ finishReason: "IMAGE_SAFETY", content: { parts: [] } }] } }).kind, "safety");
    assert.equal(classifyGeminiImage({ status: 200, body: { promptFeedback: { blockReason: "SAFETY" } } }).kind, "safety");

    const textOnly = classifyGeminiImage({ status: 200, body: { candidates: [{ content: { parts: [{ text: "I can describe it instead." }] } }] } });

    assert.deepEqual(textOnly, { kind: "no-image", text: "I can describe it instead." });

    assert.equal(classifyGeminiImage({ status: 429, body: { error: { status: "RESOURCE_EXHAUSTED", message: "Quota exceeded, limit: 0" } } }).kind, "quota");
    assert.equal(classifyGeminiImage({ status: 400, body: { error: { message: "API key not valid. Please pass a valid API key." } } }).kind, "auth");
    assert.equal(classifyGeminiImage({ status: 403, body: { error: { message: "denied" } } }).kind, "auth");
    assert.equal(classifyGeminiImage({ status: 404, body: { error: { message: "models/x is not found" } } }).kind, "unavailable");
    assert.equal(classifyGeminiImage({ status: 400, body: { error: { message: "Response modalities not supported for this model" } } }).kind, "unavailable");
    assert.equal(classifyGeminiImage({ status: 503, body: null }).kind, "transient");
    assert.equal(classifyGeminiImage({ status: 0 }).kind, "transient");
    assert.equal(classifyGeminiImage({ status: 418, body: null }).kind, "other");
});

test("every way Gemini can say no has a pause and a message", () => {

    for (const kind of ["quota", "auth", "unavailable", "transient", "no-image", "other"]) {

        assert.ok(GEMINI_PARK_MS[kind] > 0, kind);
        assert.match(GEMINI_NOTES[kind], /ücretsiz servise geçtim/, kind);
    }

    assert.match(GEMINI_NOTES.safety, /ücretsiz servisle denedim/);

    // a daily quota is not retried every few minutes
    assert.ok(GEMINI_PARK_MS.quota > GEMINI_PARK_MS.transient);
});

test("shouldTryGemini: needs a key, and not while parked", () => {

    const now = 5_000;

    assert.equal(shouldTryGemini({ hasKey: true, parkedUntil: 0, now }), true);
    assert.equal(shouldTryGemini({ hasKey: false, now }), false);
    assert.equal(shouldTryGemini({ hasKey: true, parkedUntil: now + 1, now }), false);
    assert.equal(shouldTryGemini({ hasKey: true, parkedUntil: now - 1, now }), true);
    assert.equal(shouldTryGemini({ hasKey: true, parkedUntil: "junk", now }), true);
});

test("imagePromptFromMessage: unmistakable picture requests only", () => {

    const yes = {
        [`${IMAGE_PREFIX}mor lotus`]: "mor lotus",
        "/gorsel yağmurda kedi": "yağmurda kedi",
        "/çiz uzayda bir kale": "uzayda bir kale",
        "Görsel oluştur: Dağ manzarası": "Dağ manzarası",
        "görsel oluştur dağ manzarası": "dağ manzarası",
        "Resim yap: gün batımı": "gün batımı",
        "çiz: uzayda bir kedi": "uzayda bir kedi",
        "bana bir kedi çiz": "bir kedi",
        "Lütfen gün batımında deniz kenarı çizer misin?": "gün batımında deniz kenarı",
        "uzayda uçan Bir lotus çiz": "uzayda uçan Bir lotus",
        "İstanbul Boğazı'nı çizebilir misin": "İstanbul Boğazı'nı"
    };

    for (const [text, idea] of Object.entries(yes)) assert.equal(imagePromptFromMessage(text), idea, text);

    const no = [
        "",
        "Merhaba",
        "Kuantum bilgisayar nedir kısaca anlat",
        "Python'da daire nasıl çiz",
        "matplotlib ile bir grafik çiz",
        "bu tabloyu çiz",
        "HTML canvas ile kare çiz",
        "bana çiz",
        "çiz",
        "Görsel oluşturma nasıl çalışır?",
        "resim yapmayı öğrenmek istiyorum",
        "görsel üretme sınırı nedir",
        "çizgi roman önerir misin",
        "bir kedi\nçiz",
        "```js\nkedi çiz\n```",
        "a".repeat(400) + " çiz",
        `${IMAGE_PREFIX}   `
    ];

    for (const text of no) assert.equal(imagePromptFromMessage(text), null, JSON.stringify(text).slice(0, 60));
});

test("historyText: a picture is a few words for the model, not a 600-character address", () => {

    const url = pollinationsUrl("a very long detailed prompt ".repeat(10), { seed: 3 });

    assert.equal(historyText(`![mor lotus](${url})`), "[görsel: mor lotus]");
    assert.equal(historyText("![](" + url + ")"), "[görsel: oluşturuldu]");
    assert.equal(historyText("Bak: ![kedi](data:image/jpeg;base64,/9j/4AAQSkZJRg==) güzel mi?"), "Bak: [görsel: kedi] güzel mi?");

    // normal links and other images are left alone
    assert.equal(historyText("[Lotus](https://example.com/a) ![x](https://example.com/x.png)"), "[Lotus](https://example.com/a) ![x](https://example.com/x.png)");
    assert.equal(historyText(null), "");
});

test("dropOldInlineImages frees room from the oldest pictures first", () => {

    const picture = alt => `![${alt}](data:image/jpeg;base64,${"A".repeat(2000)})`;

    const make = () => [
        { id: "new", updatedAt: "2026-11-03", messages: [{ role: "assistant", content: picture("yeni") }] },
        { id: "old", updatedAt: "2026-10-01", messages: [{ role: "user", content: "çiz" }, { role: "assistant", content: picture("eski") }] },
        { id: "mid", updatedAt: "2026-10-20", messages: [{ role: "assistant", content: `metin ${picture("orta")}` }] }
    ];

    const small = make();

    assert.deepEqual(dropOldInlineImages(small, 1_000_000).dropped, 0);
    assert.equal(JSON.stringify(small), JSON.stringify(make()));

    // room for two pictures → the oldest one goes
    const two = make();
    const result = dropOldInlineImages(two, JSON.stringify(make()).length - 1000);

    assert.equal(result.dropped, 1);
    assert.match(two.find(c => c.id === "old").messages[1].content, /^_\(Görsel yer açmak için silindi: eski\)_$/);
    assert.match(two.find(c => c.id === "new").messages[0].content, /base64/);
    assert.match(two.find(c => c.id === "mid").messages[0].content, /base64/);

    // very little room → all of them, but text is never touched
    const none = make();

    assert.equal(dropOldInlineImages(none, 500).dropped, 3);
    assert.equal(none.find(c => c.id === "mid").messages[0].content.startsWith("metin _(Görsel yer açmak için silindi: orta)_"), true);
    assert.equal(none.find(c => c.id === "old").messages[0].content, "çiz");
});

test("dropOldInlineImages reads the date names the app really stores", () => {

    const picture = alt => `![${alt}](data:image/png;base64,${"B".repeat(3000)})`;

    const chats = [
        { id: "b", updated_at: "2026-11-02T10:00:00Z", messages: [{ role: "assistant", content: picture("yeni") }] },
        { id: "a", updated_at: "2026-10-02T10:00:00Z", messages: [{ role: "assistant", content: picture("eski") }] }
    ];

    const result = dropOldInlineImages(chats, JSON.stringify(chats).length - 500);

    assert.equal(result.dropped, 1);
    assert.match(chats[1].messages[0].content, /silindi: eski/);
    assert.match(chats[0].messages[0].content, /base64/);
});

test("routeHint says what will really happen", () => {

    assert.match(routeHint({ gemini: "ready" }), /Gemini ile yapılacak/);
    assert.match(routeHint({ gemini: "no-key" }), /Ücretsiz servis.*45 sn.*768/);
    assert.match(routeHint({ gemini: "no-key" }), /Gemini anahtarı ekleyebilirsin/);
    assert.match(routeHint({ gemini: "parked", parkedKind: "quota" }), /kota ya da model.*Ücretsiz servis/);
    assert.match(routeHint({ gemini: "parked", parkedKind: "auth" }), /anahtarı kabul etmedi/);
    assert.match(routeHint({ gemini: "no-key", waitMs: 30_000 }), /yaklaşık 30 sn beklenecek/);
    assert.doesNotMatch(routeHint({ gemini: "no-key", waitMs: 0 }), /beklenecek/);
    assert.doesNotMatch(routeHint({ gemini: "ready", waitMs: 30_000 }), /beklenecek/);
});
