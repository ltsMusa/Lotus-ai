/**
 * ==========================================================
 * Lotus AI - Image generation: pure rules
 * ==========================================================
 * No DOM, no network — everything here is tested with plain
 * `node --test` (tests/image.test.mjs). js/imageGen.js does the
 * talking; this file decides.
 *
 * What the research behind this file found (Oct–Nov 2026):
 *
 *  • Pollinations' keyless endpoint still answers but is no longer
 *    documented: at most 768×768 pixels IN AREA, one image per ≥45 s
 *    per IP (over that: HTTP 402/429), a logo in the corner (`nologo`
 *    no longer works), and no key → no way around it. The old engine
 *    retried after 6 s and 16 s — inside a 45 s window, so every retry
 *    was bound to fail. Waiting the right amount is the biggest fix.
 *
 *  • Diffusion models understand English far better than Turkish.
 *    Rewriting the idea into one detailed English prompt is the
 *    biggest quality win that costs nothing.
 *
 *  • Gemini's image model works with an API key, but sources disagree
 *    on whether the FREE tier includes it (a Feb 2026 guide says yes,
 *    Google's forum in Aug–Sep 2026 reports "limit 0"). So it is tried
 *    when a Gemini key exists and parked when Google says no — never
 *    assumed.
 * ==========================================================
 */

export const IMAGE_PREFIX = "🎨 Görsel oluştur: ";

// ----------------------------------------------------------
// Sizes — Pollinations' free endpoint allows 768×768 pixels in area
// ----------------------------------------------------------

export const POLLINATIONS_MAX_AREA = 768 * 768;

export const ASPECTS = {
    square: { id: "square", label: "Kare", ratio: "1:1", width: 768, height: 768 },
    wide: { id: "wide", label: "Yatay", ratio: "16:9", width: 1024, height: 576 },
    tall: { id: "tall", label: "Dikey", ratio: "9:16", width: 576, height: 1024 },
    photo: { id: "photo", label: "Fotoğraf", ratio: "4:3", width: 880, height: 660 },
    portrait: { id: "portrait", label: "Portre", ratio: "3:4", width: 660, height: 880 }
};

/** Scales a size down (never up) until it fits `maxArea`, keeping the proportion. */
export function fitToArea(width, height, maxArea = POLLINATIONS_MAX_AREA) {

    const area = width * height;

    if (area <= maxArea) return { width, height };

    const scale = Math.sqrt(maxArea / area);

    return { width: Math.floor(width * scale), height: Math.floor(height * scale) };
}

// ----------------------------------------------------------
// Styles — English wording, because that is what the models understand
// ----------------------------------------------------------

export const STYLES = {
    auto: { id: "auto", label: "Otomatik", suffix: "" },
    photo: { id: "photo", label: "Fotogerçekçi", suffix: "photorealistic, natural lighting, 85mm lens, shallow depth of field, highly detailed, sharp focus" },
    digital: { id: "digital", label: "Dijital sanat", suffix: "digital art, concept art, vibrant colors, intricate detail, polished" },
    anime: { id: "anime", label: "Anime", suffix: "anime illustration, cel shading, clean line art, vivid colors" },
    oil: { id: "oil", label: "Yağlı boya", suffix: "oil painting, visible brush strokes, rich texture, classical composition" },
    watercolor: { id: "watercolor", label: "Sulu boya", suffix: "watercolor painting, soft washes, paper texture, delicate edges" },
    render3d: { id: "render3d", label: "3B", suffix: "3D render, soft studio lighting, smooth materials, high detail" },
    cartoon: { id: "cartoon", label: "Çizgi film", suffix: "cartoon illustration, bold outlines, flat colors, playful" },
    sketch: { id: "sketch", label: "Karakalem", suffix: "pencil sketch, graphite, fine hatching, monochrome" }
};

export const DEFAULT_IMAGE_SETTINGS = { aspect: "square", style: "auto", enhance: true };

/** Repairs whatever was stored (older versions, hand-edited storage). */
export function normalizeImageSettings(raw) {

    const input = raw && typeof raw === "object" ? raw : {};

    return {
        aspect: Object.hasOwn(ASPECTS, input.aspect) ? input.aspect : DEFAULT_IMAGE_SETTINGS.aspect,
        style: Object.hasOwn(STYLES, input.style) ? input.style : DEFAULT_IMAGE_SETTINGS.style,
        enhance: typeof input.enhance === "boolean" ? input.enhance : DEFAULT_IMAGE_SETTINGS.enhance
    };
}

// ----------------------------------------------------------
// Prompt: Turkish idea → one detailed English prompt
// ----------------------------------------------------------

export const ENHANCER_SYSTEM =
    "You turn a short image idea (usually written in Turkish) into ONE detailed English prompt for a text-to-image model. " +
    "Keep the subject, the number of things, the colors and any text the user asked for. " +
    "Add concrete visual detail: setting, lighting, composition, mood and the medium or camera. " +
    "Do not add people, text or logos that were not asked for. " +
    "Reply with the prompt only: one paragraph of 40 to 90 words, no quotes, no list, no explanation.";

export const MAX_PROMPT_CHARS = 600;

export function enhancerUserMessage(prompt, styleId = "auto") {

    const style = STYLES[styleId] ?? STYLES.auto;

    return `Image idea: ${String(prompt).trim()}\nStyle: ${style.suffix || "choose what fits the idea best"}`;
}

const TURKISH_ONLY_LETTERS = /[ğüşıöçĞÜŞİÖÇ]/g;

const REFUSAL = /\b(?:i'?m sorry|i cannot|i can'?t|as an ai|unable to)\b|üzgünüm|yapamam/i;

/**
 * Makes a model's answer usable as an image prompt, or returns null
 * when it is not one (empty, a refusal, still Turkish, absurdly short).
 */
export function cleanEnhanced(text) {

    let value = String(text ?? "")
        .replace(/<think>[\s\S]*?<\/think>/gi, " ")
        .replace(/```[a-z]*\n?|```/gi, " ")
        .trim();

    // "Here is the prompt:" style lead-ins and "Prompt:" labels
    value = value
        .replace(/^(?:here(?:'s| is)[^:\n]*:|prompt\s*:|image prompt\s*:)\s*/i, "")
        .replace(/^["'“”‘’`]+|["'“”‘’`]+$/g, "")
        .replace(/\s*\n+\s*/g, " ")
        .replace(/\s{2,}/g, " ")
        .trim();

    if (value.length < 20) return null;

    if (REFUSAL.test(value.slice(0, 120))) return null;

    // Still Turkish: the model returned the idea as it was.
    const turkish = (value.match(TURKISH_ONLY_LETTERS) || []).length;

    if (turkish / value.length > 0.02) return null;

    if (value.length > MAX_PROMPT_CHARS) {

        value = value.slice(0, MAX_PROMPT_CHARS);

        const cut = value.lastIndexOf(" ");

        if (cut > MAX_PROMPT_CHARS * 0.6) value = value.slice(0, cut);

        value = value.replace(/[,;:\s]+$/, "");
    }

    return value;
}

/** What is finally sent to the image model. */
export function finalPrompt({ prompt, enhanced = null, style = "auto", aspect = "square", forGemini = false } = {}) {

    const base = String(enhanced || prompt || "").trim();

    const suffix = (STYLES[style] ?? STYLES.auto).suffix;

    const parts = [base];

    if (suffix) parts.push(suffix);

    if (forGemini) {

        const ratio = (ASPECTS[aspect] ?? ASPECTS.square).ratio;

        return `Generate an image: ${parts.join(", ")}. Aspect ratio ${ratio}. No text or watermark in the image.`;
    }

    return parts.join(", ").slice(0, 900);
}

// ----------------------------------------------------------
// Pollinations
// ----------------------------------------------------------

/**
 * encodeURIComponent leaves ( ) ! ' * alone — and a ")" inside the
 * address ends a markdown link early, which cut generated pictures
 * off at the first bracket of the prompt.
 */
export function encodePromptForPath(text) {

    return encodeURIComponent(text).replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

export function pollinationsUrl(prompt, { aspect = "square", seed = 1 } = {}) {

    const size = fitToArea((ASPECTS[aspect] ?? ASPECTS.square).width, (ASPECTS[aspect] ?? ASPECTS.square).height);

    return `https://image.pollinations.ai/prompt/${encodePromptForPath(prompt)}` +
        `?width=${size.width}&height=${size.height}&seed=${seed}&nologo=true&referrer=lotus-ai`;
}

/** The free endpoint lets one picture through per device every ~45 s. */
export const ANON_SPACING_MS = 46 * 1000;

/** How long to wait before the next anonymous request, given when the last one started. */
export function msUntilNextAnonymous({ lastAt = 0, now = Date.now(), spacing = ANON_SPACING_MS } = {}) {

    const last = Number(lastAt);

    // never asked, or a clock that jumped backwards: do not make anyone wait on a bad number
    if (!Number.isFinite(last) || last <= 0 || now < last) return 0;

    return Math.max(0, last + spacing - now);
}

/** Pauses between attempts: exactly one window, because a shorter wait is a guaranteed refusal. */
export const RETRY_DELAYS_MS = [ANON_SPACING_MS, ANON_SPACING_MS];

/** "47 sn" style label for the status line. */
export function secondsLabel(ms) {

    return `${Math.max(1, Math.ceil(ms / 1000))} sn`;
}

// ----------------------------------------------------------
// Gemini image generation
// ----------------------------------------------------------

export const GEMINI_IMAGE_MODEL = "gemini-2.5-flash-image";

export function geminiImageRequest(model, key, text) {

    return {
        url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`,
        body: {
            contents: [{ role: "user", parts: [{ text }] }],
            generationConfig: { responseModalities: ["TEXT", "IMAGE"] }
        }
    };
}

/**
 * Reads a generateContent answer.
 * kind: "image" | "safety" | "no-image" | "quota" | "auth" | "unavailable" | "transient" | "other"
 */
export function classifyGeminiImage({ status = 0, body = null } = {}) {

    const message = String(body?.error?.message ?? "");

    if (status >= 200 && status < 300) {

        const candidate = body?.candidates?.[0];

        const parts = candidate?.content?.parts ?? [];

        for (const part of parts) {

            const inline = part?.inlineData ?? part?.inline_data;

            if (inline?.data) {

                return { kind: "image", mime: inline.mimeType ?? inline.mime_type ?? "image/png", data: String(inline.data) };
            }
        }

        if (body?.promptFeedback?.blockReason || /SAFETY|PROHIBITED|BLOCKLIST|IMAGE_SAFETY/i.test(String(candidate?.finishReason ?? ""))) {

            return { kind: "safety" };
        }

        return { kind: "no-image", text: parts.map(part => part?.text ?? "").join(" ").trim() };
    }

    if (status === 429 || /RESOURCE_EXHAUSTED|quota|rate limit/i.test(message) && status !== 400 && status !== 404) return { kind: "quota" };

    if (status === 400 && /API key not valid|API_KEY_INVALID/i.test(message)) return { kind: "auth" };

    if (status === 401 || status === 403) return { kind: "auth" };

    // wrong model name, or a model/region that cannot make images
    if (status === 404 || (status === 400 && /not supported|not found|modalit|location/i.test(message))) return { kind: "unavailable" };

    if (status >= 500 || status === 0) return { kind: "transient" };

    return { kind: "other" };
}

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

/** How long Gemini images are left alone after each kind of "no". */
export const GEMINI_PARK_MS = {
    quota: 6 * HOUR, // daily quotas; "limit 0" on the free tier does not fix itself within minutes
    auth: 1 * HOUR, // cleared at once when the key is changed
    unavailable: 6 * HOUR,
    transient: 5 * MINUTE,
    "no-image": 10 * MINUTE,
    other: 10 * MINUTE
};

/** True when a Gemini key exists and Gemini is not parked. */
export function shouldTryGemini({ hasKey = false, parkedUntil = 0, now = Date.now() } = {}) {

    return Boolean(hasKey) && !(Number(parkedUntil) > now);
}

export const GEMINI_NOTES = {
    quota: "Gemini anahtarının görsel kotası dolu ya da ücretsiz katmanda yok — ücretsiz servise geçtim.",
    auth: "Gemini anahtarı görsel üretimi için kabul edilmedi — ücretsiz servise geçtim.",
    unavailable: "Gemini görsel modeli bu anahtarda kullanılamıyor — ücretsiz servise geçtim.",
    safety: "Gemini bu tarifi güvenlik nedeniyle üretmedi — ücretsiz servisle denedim.",
    transient: "Gemini şu an yanıt vermedi — ücretsiz servise geçtim.",
    "no-image": "Gemini bu sefer görsel döndürmedi — ücretsiz servise geçtim.",
    other: "Gemini görsel üretemedi — ücretsiz servise geçtim."
};

/**
 * One honest sentence for the studio: what will make the next picture, and what to expect.
 * @param {{ gemini: "ready"|"parked"|"no-key", parkedKind?: string|null, waitMs?: number }} route
 */
export function routeHint({ gemini = "no-key", parkedKind = null, waitMs = 0 } = {}) {

    if (gemini === "ready") return "Görsel Gemini ile yapılacak. Gemini yapamazsa ücretsiz servise geçilir.";

    const wait = waitMs > 1000 ? ` Son görselin üzerinden yeterli süre geçmedi: yaklaşık ${secondsLabel(waitMs)} beklenecek.` : "";

    const free = "Ücretsiz servis kullanılacak (görseller arasında ~45 sn bekleme, en fazla 768 piksellik boyut, küçük logo olabilir).";

    if (gemini === "parked") {

        const why = parkedKind === "auth" ? "anahtarı kabul etmedi" : parkedKind === "transient" ? "kısa süre önce yanıt vermedi" : "görsel üretemedi (kota ya da model)";

        return `Gemini ${why}, bir süre denenmeyecek. ${free}${wait}`;
    }

    return `${free} Daha iyi ve beklemesiz sonuç için Gemini anahtarı ekleyebilirsin.${wait}`;
}

// ----------------------------------------------------------
// Natural-language requests ("bana bir kedi çiz")
// ----------------------------------------------------------

const L = "\\p{L}";

// Sentences about drawing in code or charts are not picture requests.
// (Words that take Turkish endings — "tabloyu", "grafiği" — are matched by their stem.)
const NOT_A_PICTURE = new RegExp(
    `(?<![${L}\\d])(?:(?:nasıl|neden|niçin|kod|python|javascript|js|matplotlib|canvas|svg|html|css|program|api|komut)(?![${L}\\d])|(?:fonksiyon|algoritma|grafi[kğ]|tablo|diyagram|şema|çizelge|excel|kütüphane)${`[${L}]*`})`,
    "iu"
);

// "bu tabloyu çiz", "onu çiz": a text-to-image prompt cannot point at something in the chat — the picture idea must stand on its own.
const POINTS_AT_CHAT = new RegExp(`^(?:bu|şu|o|bunu|şunu|onu|bunları|şunları|onları|bunun|şunun|onun)(?![${L}\\d])`, "iu");

// "bana çiz" leaves nothing to draw.
const FILLER_ONLY = new RegExp(`^(?:bana|bir|bi|lütfen|şunu|bunu|onu|bize)$`, "iu");

const PATTERNS = [
    // /gorsel mor bir lotus
    new RegExp(`^\\/(?:gorsel|görsel|resim|cizim|çizim|ciz|çiz|image|img)\\s+(.+)$`, "isu"),
    // görsel oluştur: mor bir lotus   |   resim yap mor bir lotus
    new RegExp(`^(?:lütfen\\s+)?(?:görsel|resim|fotoğraf|çizim|illüstrasyon)\\s+(?:oluştur|üret|yap|çiz|hazırla)(?![${L}])\\s*[:\\-–—]?\\s*(.+)$`, "isu"),
    // çiz: mor bir lotus
    new RegExp(`^(?:çiz|çizim yap|resim çiz|resim yap)\\s*[:\\-–—]\\s*(.+)$`, "isu"),
    // bana bir kedi çiz   |   uzayda bir lotus çizer misin?
    new RegExp(
        `^(?:lütfen\\s+)?(?:bana\\s+)?(.{3,160}?)\\s+(?:çiz|çizer\\s*misin|çizebilir\\s*misin|çizsene|çizermisin|çizip\\s+ver|resmini\\s+çiz|resmini\\s+yap|görselini\\s+oluştur)(?![${L}])\\s*[.!?…]*$`,
        "isu"
    )
];

/**
 * The picture idea inside a chat message, or null when it is not a picture request.
 * Recognises the app's own "🎨 Görsel oluştur: …" turns and a few unmistakable phrasings;
 * everything else goes to the normal chat. Deliberately conservative.
 */
export function imagePromptFromMessage(text) {

    const raw = String(text ?? "").trim();

    if (raw.startsWith(IMAGE_PREFIX)) {

        const idea = raw.slice(IMAGE_PREFIX.length).trim();

        return idea || null;
    }

    if (!raw || raw.length > 300 || raw.includes("\n") || raw.includes("```")) return null;

    const lowered = raw.toLocaleLowerCase("tr");

    for (const [index, pattern] of PATTERNS.entries()) {

        const match = lowered.match(pattern);

        if (!match) continue;

        // Take the idea from the original text (keeps capitals and the user's own spelling).
        // Turkish lowercasing keeps the length, so the positions carry over.
        // Forms 0-2 end with the idea; form 3 starts with it.
        let idea = match[1];

        if (raw.length === lowered.length) {

            const start = index === 3 ? lowered.indexOf(match[1]) : lowered.length - match[1].length;

            idea = raw.slice(start, start + match[1].length);
        }

        const cleaned = idea.replace(/^["'“”‘’]+|["'“”‘’]+$/g, "").trim();

        if (cleaned.length < 3 || FILLER_ONLY.test(cleaned)) continue;

        // The "…çiz" ending can be about anything ("Python'da daire nasıl çiz") — check it; the explicit forms need no check.
        if (index === 3 && (NOT_A_PICTURE.test(cleaned) || POINTS_AT_CHAT.test(cleaned))) continue;

        return cleaned;
    }

    return null;
}

// ----------------------------------------------------------
// What goes into the chat history sent to a model
// ----------------------------------------------------------

const MD_IMAGE = /!\[([^\]]*)\]\((?:https:\/\/image\.pollinations\.ai\/[^\s)]*|data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+)\)/g;

/** A generated picture is a very long address (or a base64 blob): the model only needs to know it exists. */
export function historyText(content) {

    return String(content ?? "").replace(MD_IMAGE, (_, alt) => `[görsel: ${alt || "oluşturuldu"}]`);
}

// ----------------------------------------------------------
// localStorage room (guests keep chats there; ~5 MB in total)
// ----------------------------------------------------------

const INLINE_IMAGE = /!\[([^\]]*)\]\(data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+\)/;

/**
 * Makes `conversations` fit into `limitChars` once serialised by turning the
 * OLDEST inline pictures into a short note. Returns the same objects, mutated,
 * and how many pictures were dropped.
 */
export function dropOldInlineImages(conversations, limitChars) {

    let dropped = 0;

    const size = () => JSON.stringify(conversations).length;

    if (size() <= limitChars) return { conversations, dropped };

    // stored chats use updated_at / created_at; the camelCase names are accepted too
    const dateOf = chat => String(chat.updated_at ?? chat.updatedAt ?? chat.created_at ?? chat.createdAt ?? "");

    const ordered = [...conversations].sort((a, b) => dateOf(a).localeCompare(dateOf(b)));

    for (const conversation of ordered) {

        for (const message of conversation.messages ?? []) {

            while (INLINE_IMAGE.test(message.content ?? "")) {

                message.content = message.content.replace(INLINE_IMAGE, (_, alt) => `_(Görsel yer açmak için silindi: ${alt || "görsel"})_`);

                dropped++;

                if (size() <= limitChars) return { conversations, dropped };
            }
        }
    }

    return { conversations, dropped };
}
