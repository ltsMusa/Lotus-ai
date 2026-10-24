/**
 * ==========================================================
 * Lotus AI - Kişiselleştirme (personalization)
 * ==========================================================
 * What the user can tell Lotus about themselves and how they want
 * it to talk — saved on the device (config) and added to the system
 * prompt of every request (js/prompts/systemPrompt.js).
 *
 * Pure functions only (no DOM, no storage), so they are unit-tested
 * in tests/personalization.test.mjs.
 *
 * This is separate from Hafıza (js/memory.js): memory holds short
 * facts Lotus collects ("hatırla: …"); this holds the user's own
 * standing instructions and style preferences.
 * ==========================================================
 */

export const PERSONALIZATION_LIMITS = {
    nickname: 40,
    about: 600,
    instructions: 1200
};

export const STYLE_OPTIONS = [
    ["auto", "Otomatik (varsayılan)"],
    ["short", "Çok kısa ve net"],
    ["detailed", "Ayrıntılı ve kapsamlı"]
];

export const TONE_OPTIONS = [
    ["auto", "Doğal (varsayılan)"],
    ["casual", "Daha samimi ve esprili"],
    ["professional", "Daha ciddi ve profesyonel"]
];

export const LANGUAGE_OPTIONS = [
    ["auto", "Otomatik (benim dilimde)"],
    ["tr", "Hep Türkçe"],
    ["en", "Hep İngilizce"]
];

export const DEFAULT_PERSONALIZATION = {
    enabled: true,
    nickname: "",
    about: "",
    instructions: "",
    style: "auto",
    tone: "auto",
    language: "auto"
};

const allowed = options => options.map(([value]) => value);

/** Removes control characters and keeps at most `max` characters. */
export function cleanText(value, max) {

    const text = String(value ?? "")
        // eslint-disable-next-line no-control-regex
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
        .replace(/\r\n?/g, "\n")
        .trim();

    return text.length > max ? text.slice(0, max).trimEnd() : text;
}

/** Always returns a complete, valid personalization object. */
export function normalizePersonalization(input = {}) {

    const source = input && typeof input === "object" ? input : {};

    const pick = (value, options, fallback) => (allowed(options).includes(value) ? value : fallback);

    return {
        enabled: source.enabled !== false,
        nickname: cleanText(source.nickname, PERSONALIZATION_LIMITS.nickname).replace(/\s*\n+\s*/g, " "),
        about: cleanText(source.about, PERSONALIZATION_LIMITS.about),
        instructions: cleanText(source.instructions, PERSONALIZATION_LIMITS.instructions),
        style: pick(source.style, STYLE_OPTIONS, "auto"),
        tone: pick(source.tone, TONE_OPTIONS, "auto"),
        language: pick(source.language, LANGUAGE_OPTIONS, "auto")
    };
}

/** True when there is anything to send to the model. */
export function hasPersonalization(input) {

    const p = normalizePersonalization(input);

    return p.enabled && Boolean(
        p.nickname || p.about || p.instructions ||
        p.style !== "auto" || p.tone !== "auto" || p.language !== "auto"
    );
}

const STYLE_TEXT = {
    short: "Cevapları olabildiğince kısa tut (çoğu zaman 1-2 cümle); kullanıcı istemedikçe ayrıntıya girme.",
    detailed: "Cevapları ayrıntılı ve kapsamlı ver; gerektiğinde adım adım açıkla, örnek ekle."
};

const TONE_TEXT = {
    casual: "Daha samimi ve esprili konuş.",
    professional: "Daha ciddi, düzgün ve profesyonel bir üslup kullan; argo ve gereksiz esprilerden kaçın."
};

const LANGUAGE_TEXT = {
    tr: "Her zaman Türkçe cevap ver (kod ve özel adlar hariç), kullanıcı başka dilde yazsa bile.",
    en: "Her zaman İngilizce cevap ver (kullanıcı Türkçe yazsa bile)."
};

/**
 * The block added to the system prompt. Empty string when nothing is set.
 * @param {object} input        a personalization object (normalized here)
 * @param {{compact?: boolean}} [options]  compact = for the small on-device model
 */
export function buildPersonalizationBlock(input, { compact = false } = {}) {

    const p = normalizePersonalization(input);

    if (!hasPersonalization(p)) return "";

    const lines = [];

    if (p.nickname) lines.push(`Kullanıcıya "${p.nickname}" diye hitap et.`);

    const clip = (text, max) => (text.length > max ? `${text.slice(0, max)}…` : text);

    if (p.about) lines.push(`Kullanıcı hakkında bilmen gerekenler: ${compact ? clip(p.about, 200) : p.about}`);

    if (p.style !== "auto") lines.push(STYLE_TEXT[p.style]);
    if (p.tone !== "auto") lines.push(TONE_TEXT[p.tone]);
    if (p.language !== "auto") lines.push(LANGUAGE_TEXT[p.language]);

    if (p.instructions) lines.push(`Kullanıcının özel talimatları: ${compact ? clip(p.instructions, 300) : p.instructions}`);

    if (compact) return `\n\nKullanıcı tercihleri (uy):\n- ${lines.join("\n- ")}`;

    return `

KULLANICININ KİŞİSEL AYARLARI

Bunlar kullanıcının kendi koyduğu kalıcı tercihler. Yukarıdaki genel tarz ve uzunluk kurallarıyla çakışırsa BU AYARLAR geçerlidir; ama dürüstlük ve doğruluk kuralları her durumda aynen geçerli kalır.

- ${lines.join("\n- ")}`;
}
