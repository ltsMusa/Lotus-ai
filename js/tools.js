/**
 * ==========================================================
 * Lotus AI - Web Tools panel
 * ==========================================================
 * The sidebar's "Web Araçları" used to be a placeholder with four
 * cards and nothing behind them. Each card now opens a small form
 * and turns it into a real chat message:
 *
 *   📰 Özetle      link (page is fetched and read) or pasted text
 *   🌍 Çevir       link or text → any language
 *   🔎 Web'de Ara  forces a live web search for this one question,
 *                  even if automatic search is off in Settings
 *   🗞 Haberler    today's news on a topic, from live results
 *
 * Everything goes through chatManager.sendPrompt(), so answers
 * stream, get saved, and can be regenerated like any other turn.
 * ==========================================================
 */

import chatManager from "./chat.js";
import { fetchPageText } from "./webAnalyze.js";
import { icon } from "./utils.js";

const $ = id => document.getElementById(id);

const MAX_PASTED_CHARS = 12000;

// The submit handler of the form that is currently on screen. One
// keydown listener (bound once in init) calls it — binding a listener
// per form would stack up every time the panel is reopened.
let activeRun = null;

const LANGUAGES = [
    "Türkçe", "İngilizce", "Almanca", "Fransızca", "İspanyolca", "İtalyanca",
    "Rusça", "Arapça", "Japonca", "Korece", "Çince"
];

// [label shown, query sent to the search engine]
const NEWS_TOPICS = [
    ["Gündem (Türkiye)", "Türkiye gündem son dakika"],
    ["Dünya", "dünya haberleri son dakika"],
    ["Ekonomi ve finans", "ekonomi borsa dolar altın son durum"],
    ["Spor", "spor haberleri bugün maç sonuçları"],
    ["Teknoloji", "teknoloji haberleri bugün"],
    ["Bilim", "bilim haberleri bu hafta"],
    ["Sağlık", "sağlık haberleri bugün"],
    ["Eğlence", "magazin ve eğlence haberleri bugün"]
];

/** "https://x.y/z" or a bare "x.y/z" → a full URL; anything else → null. */
export function normalizeUrl(value) {

    const text = String(value ?? "").trim();

    if (!text || /\s/.test(text)) return null;

    if (/^https?:\/\//i.test(text)) return text;

    if (/^([\w-]+\.)+[a-z]{2,}(\/\S*)?$/i.test(text)) return `https://${text}`;

    return null;
}

function clipText(text) {

    const clean = String(text).trim();

    return clean.length > MAX_PASTED_CHARS
        ? { text: clean.slice(0, MAX_PASTED_CHARS), truncated: true }
        : { text: clean, truncated: false };
}

function truncationNote(truncated) {

    return truncated ? " (içerik uzun olduğu için kısaltıldı)" : "";
}

// ----------------------------------------------------------
// TOOL DEFINITIONS
// ----------------------------------------------------------

const TOOLS = {

    summarize: {
        svg: "file",
        title: "Özetle",
        intro: "Bir sayfanın linkini ya da uzun bir metni yapıştır — ana noktalarını çıkarayım.",
        submit: "Özetle",
        fields: [
            { name: "source", kind: "textarea", rows: 6, label: "Link veya metin", placeholder: "https://… ya da özetlenecek metin" }
        ],

        async build({ source }, setStatus) {

            const url = normalizeUrl(source);

            if (url) {

                setStatus("Sayfa okunuyor…");

                const page = await fetchPageText(url);

                return {
                    prompt:
                        `🌐 Bu sayfayı özetle: ${page.url}${truncationNote(page.truncated)}\n\n` +
                        `[Sayfa içeriği]\n${page.text}`
                };
            }

            const { text, truncated } = clipText(source);

            return {
                prompt:
                    `📰 Bu metni özetle: önce tek cümlelik genel bakış, sonra madde madde ana noktalar${truncationNote(truncated)}.\n\n` +
                    `[Metin]\n${text}`
            };
        }
    },

    translate: {
        svg: "languages",
        title: "Çevir",
        intro: "Bir sayfanın linkini ya da bir metni istediğin dile çevireyim.",
        submit: "Çevir",
        fields: [
            { name: "source", kind: "textarea", rows: 6, label: "Link veya metin", placeholder: "https://… ya da çevrilecek metin" },
            { name: "language", kind: "select", label: "Hedef dil", options: LANGUAGES, value: "Türkçe" }
        ],

        async build({ source, language }, setStatus) {

            const style = "Çeviriyi akıcı ve doğal yap; başlıkları ve madde yapısını koru.";

            const url = normalizeUrl(source);

            if (url) {

                setStatus("Sayfa okunuyor…");

                const page = await fetchPageText(url);

                return {
                    prompt:
                        `🌍 Bu sayfayı ${language} diline çevir: ${page.url}${truncationNote(page.truncated)}\n${style}\n\n` +
                        `[Sayfa içeriği]\n${page.text}`
                };
            }

            const { text, truncated } = clipText(source);

            return {
                prompt: `🌍 Bu metni ${language} diline çevir${truncationNote(truncated)}. ${style}\n\n[Metin]\n${text}`
            };
        }
    },

    search: {
        svg: "search",
        title: "Web'de Ara",
        intro: "Sorunu güncel web sonuçlarıyla araştırıp kaynaklarıyla cevaplayayım.",
        submit: "Ara ve cevapla",
        fields: [
            { name: "query", kind: "input", label: "Ne öğrenmek istiyorsun?", placeholder: "örn. Bu hafta İstanbul'da hava nasıl olacak?" }
        ],

        async build({ query }) {

            const text = query.trim();

            return { prompt: text, options: { forceSearch: true, searchQuery: text } };
        }
    },

    news: {
        svg: "news",
        title: "Bugünün Haberleri",
        intro: "Seçtiğin konudaki güncel gelişmeleri derleyip kaynaklarıyla özetleyeyim.",
        submit: "Haberleri getir",
        optional: ["custom"],
        fields: [
            { name: "topic", kind: "select", label: "Konu", options: NEWS_TOPICS.map(([label]) => label), value: NEWS_TOPICS[0][0] },
            { name: "custom", kind: "input", label: "veya kendi konunu yaz (isteğe bağlı)", placeholder: "örn. yapay zekâ, Galatasaray, deprem" }
        ],

        async build({ topic, custom }) {

            const own = custom.trim();

            const preset = NEWS_TOPICS.find(([label]) => label === topic) || NEWS_TOPICS[0];

            const label = own || preset[0];

            const query = own ? `${own} son haberler` : preset[1];

            return {
                prompt:
                    `🗞 Bugünün "${label}" haberlerini derle: en önemli 5–7 gelişmeyi kısa maddeler halinde, ` +
                    "her birinin kaynağını ve tarihini belirterek özetle.",
                options: { forceSearch: true, searchQuery: query }
            };
        }
    }
};

// ----------------------------------------------------------
// FORM RENDERING
// ----------------------------------------------------------

function el(tag, props = {}, ...children) {

    const node = document.createElement(tag);

    Object.entries(props).forEach(([key, value]) => {

        if (key === "class") node.className = value;
        else if (key === "text") node.textContent = value;
        else if (value !== undefined && value !== null) node.setAttribute(key, value);
    });

    children.flat().forEach(child => {

        if (child) node.append(child);
    });

    return node;
}

function renderField(field) {

    let control;

    if (field.kind === "textarea") {

        control = el("textarea", { rows: field.rows || 4, placeholder: field.placeholder, "data-name": field.name });

    } else if (field.kind === "select") {

        control = el(
            "select",
            { "data-name": field.name },
            field.options.map(option => el("option", { value: option, text: option }))
        );

        if (field.value) control.value = field.value;

    } else {

        control = el("input", { type: "text", placeholder: field.placeholder, "data-name": field.name, autocomplete: "off" });
    }

    return el("label", { class: "tools-field" }, el("span", { text: field.label }), control);
}

function showGrid() {

    activeRun = null;

    $("tools-grid")?.classList.remove("hidden");

    const form = $("tools-form");

    if (form) {

        form.classList.add("hidden");
        form.replaceChildren();
    }

    const title = document.querySelector("#tools-modal .modal-header h2");

    if (title) title.textContent = "Web Araçları";
}

function closeModal() {

    $("tools-modal")?.classList.add("hidden");
}

function showForm(name) {

    const tool = TOOLS[name];
    const grid = $("tools-grid");
    const form = $("tools-form");

    if (!tool || !grid || !form) return;

    const status = el("p", { class: "tools-status", role: "status" });

    const submit = el("button", { class: "message-choice-button primary tools-submit", type: "button", text: tool.submit });

    const back = el("button", { class: "tools-back", type: "button", text: "‹ Araçlar" });

    form.replaceChildren(
        back,
        el("p", { class: "tools-intro", text: tool.intro }),
        ...tool.fields.map(renderField),
        el("div", { class: "tools-form-actions" }, submit),
        status
    );

    grid.classList.add("hidden");
    form.classList.remove("hidden");

    const title = document.querySelector("#tools-modal .modal-header h2");

    if (title) {

        title.innerHTML = icon(tool.svg);

        title.append(tool.title);
    }

    const setStatus = (message, kind = "info") => {

        status.textContent = message;
        status.className = `tools-status ${kind}`;
    };

    const run = async () => {

        const values = {};

        form.querySelectorAll("[data-name]").forEach(control => {

            values[control.dataset.name] = control.value;
        });

        const missing = tool.fields.find(field => !(tool.optional || []).includes(field.name) && !String(values[field.name] || "").trim());

        if (missing) {

            setStatus("Lütfen boş alanı doldur.", "error");

            form.querySelector(`[data-name="${missing.name}"]`)?.focus();

            return;
        }

        submit.disabled = true;

        setStatus("Hazırlanıyor…");

        try {

            const { prompt, options } = await tool.build(values, setStatus);

            if (!chatManager.sendPrompt(prompt, options)) {

                setStatus("Lotus şu an bir yanıt hazırlıyor — bitince tekrar dene.", "error");

                return;
            }

            closeModal();

        } catch (error) {

            setStatus(error.message || "Bir şey ters gitti, tekrar dene.", "error");

        } finally {

            submit.disabled = false;
        }
    };

    submit.addEventListener("click", run);

    back.addEventListener("click", showGrid);

    activeRun = run;

    requestAnimationFrame(() => form.querySelector("[data-name]")?.focus({ preventScroll: true }));
}

// ----------------------------------------------------------
// PUBLIC
// ----------------------------------------------------------

/** Opens the panel; with a tool name, jumps straight to that tool's form. */
export function openTools(name) {

    const modal = $("tools-modal");

    if (!modal) return;

    showGrid();

    modal.classList.remove("hidden");

    if (name && TOOLS[name]) showForm(name);
}

function init() {

    document.querySelectorAll("#tools-grid .tool-card").forEach(card => {

        card.addEventListener("click", () => showForm(card.dataset.tool));
    });

    $("tools-form")?.addEventListener("keydown", event => {

        if (event.key !== "Enter" || !activeRun || event.isComposing) return;

        const isTextarea = event.target.tagName === "TEXTAREA";

        // Enter submits one-line fields; Ctrl/⌘+Enter submits the big box.
        if (!isTextarea || event.ctrlKey || event.metaKey) {

            event.preventDefault();

            activeRun();
        }
    });

    document.addEventListener("lotus:open-tools", () => openTools());
}

if (document.readyState === "loading") {

    document.addEventListener("DOMContentLoaded", init);

} else {

    init();
}
