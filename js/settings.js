/**
 * ==========================================================
 * Lotus AI - Settings Panels
 * ==========================================================
 * The settings modal previously had a static menu list
 * (account / personalization / ai / chat / voice / about)
 * where every item except "Hesap" did nothing when clicked — the HTML comment above it literally said
 * "Şimdilik gizli. İleride UI ile bağlanacak." ("hidden for
 * now, will be wired up later"). "Hesap" is wired by auth.js;
 * this file wires the rest.
 *
 * Each panel replaces #settings-content in place and offers a
 * "← Geri" button that restores the original menu.
 * ==========================================================
 */

import config from "./config.js";
import Memory from "./memory.js";
import DeviceProfile, { MODEL_BASE_CREDIT } from "./deviceProfile.js";
import { showToast, showConfirm } from "./toast.js";
import { icon } from "./utils.js";
import { renderLocalSettings, bindLocalSettings } from "./settingsLocal.js";
import { THEMES } from "./themeList.js";
import {
    PERSONALIZATION_LIMITS,
    STYLE_OPTIONS,
    TONE_OPTIONS,
    LANGUAGE_OPTIONS,
    buildPersonalizationBlock,
    DEFAULT_PERSONALIZATION
} from "./personalization.js";

function escapeAttr(value) {

    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

}

const PROVIDER_NAMES = {
    groq: "Groq",
    gemini: "Gemini",
    openai: "OpenAI",
    openrouter: "OpenRouter"
};

// Where to get a free/new API key for each provider — powers the
// "API Key Al↗" button next to each key field in Settings.
const PROVIDER_KEY_URLS = {
    groq: "https://console.groq.com/keys",
    gemini: "https://aistudio.google.com/apikey",
    openai: "https://platform.openai.com/api-keys",
    openrouter: "https://openrouter.ai/keys"
};

// Shown as the placeholder of each model-name box (the real defaults
// live in config.js; hosted providers retire models from time to time,
// which is why the name is editable at all).
const MODEL_HINTS = {
    groq: "openai/gpt-oss-120b",
    gemini: "gemini-3.8-flash",
    openai: "gpt-4o-mini",
    openrouter: "openai/gpt-4o-mini"
};

const SEARCH_KEY_LINKS = [
    ["Tavily (önerilen, ücretsiz kota)", "https://app.tavily.com/home"],
    ["Jina", "https://jina.ai/api-dashboard"]
];

function panelShell(title, bodyHtml) {

    return `
        <div class="settings-panel">
            <button class="settings-back-button" type="button">${icon("chevron-left")}Geri</button>
            <h3 class="settings-panel-title">${title}</h3>
            ${bodyHtml}
        </div>
    `;
}

function section(title, hint = "") {

    return `
        <div class="settings-section">
            <span class="settings-section-title">${title}</span>
            ${hint ? `<span class="settings-section-hint">${hint}</span>` : ""}
        </div>
    `;
}

function renderAIPanel() {

    const providerOptions = Object.keys(PROVIDER_NAMES)
        .map(key => `<option value="${key}" ${config.provider === key ? "selected" : ""}>${PROVIDER_NAMES[key]}</option>`)
        .join("");

    const providerFields = Object.keys(PROVIDER_NAMES).map(key => `
        <div class="settings-provider-card">
            <div class="settings-field-label-row">
                <strong>${PROVIDER_NAMES[key]}</strong>
                <a class="settings-get-key-link" href="${PROVIDER_KEY_URLS[key]}" target="_blank" rel="noopener noreferrer">
                    API Key Al↗
                </a>
            </div>

            <label class="settings-field">
                <span>API anahtarı ${key === "groq" ? "(isteğe bağlı)" : ""}</span>
                <input type="password" data-provider-key="${key}" value="${escapeAttr(config.providers[key].apiKey)}" placeholder="${key === "groq" ? "boş bırakılırsa ortak Groq kullanılır" : "anahtarını yapıştır"}" autocomplete="off">
            </label>

            <label class="settings-field">
                <span>Model adı</span>
                <input type="text" data-provider-model="${key}" value="${escapeAttr(config.providers[key].model)}" placeholder="${MODEL_HINTS[key]}" autocomplete="off" autocapitalize="off" spellcheck="false">
            </label>
        </div>
    `).join("");

    const tierInfo = DeviceProfile.getTierInfo();

    return panelShell("Yapay Zekâ", `
        <p class="settings-note">
            Lotus AI varsayılan olarak ortak Groq anahtarıyla çalışır — bir şey girmen gerekmez.
            Kendi anahtarını eklersen o sağlayıcı senin hakkından kullanılır. Ortak hak dolarsa
            sohbette kendi anahtarını ekleyebileceğin bir seçim ekranı çıkar. Bir sağlayıcı
            hata verirse ya da kotası dolarsa sıradaki otomatik denenir (Groq → OpenRouter → Gemini → OpenAI);
            hiçbiri çalışmazsa cihazdaki Lotus Mini devreye girer.
        </p>

        <label class="settings-field">
            <span>Aktif sağlayıcı</span>
            <select id="settings-provider-select">${providerOptions}</select>
        </label>

        ${section("Sağlayıcılar", "Model adları zamanla değişir; “model bulunamadı” hatası alırsan güncel adı buraya yaz.")}

        ${providerFields}

        ${renderLocalSettings()}

        ${section("Görsel / video analizi")}

        <label class="settings-field">
            <span>Groq görsel model adı</span>
            <input type="text" id="settings-groq-vision-model" value="${escapeAttr(config.providers.groq.visionModel)}" placeholder="qwen/qwen3.8-27b" autocomplete="off" autocapitalize="off" spellcheck="false">
        </label>

        <p class="settings-note">
            Görsel veya video eklediğinde sırayla Gemini, OpenAI, Groq ve OpenRouter denenir —
            yalnızca <strong>kendi anahtarını</strong> girdiğin sağlayıcılar kullanılır.
        </p>

        ${section("Web araması", "Her mesajda otomatik arama Sohbet bölümünden açılıp kapatılır.")}

        <label class="settings-field">
            <span>Arama sağlayıcısı</span>
            <select id="settings-search-provider">
                <option value="auto" ${config.searchProvider === "auto" ? "selected" : ""}>Otomatik (anahtardan anla)</option>
                <option value="tavily" ${config.searchProvider === "tavily" ? "selected" : ""}>Tavily</option>
                <option value="jina" ${config.searchProvider === "jina" ? "selected" : ""}>Jina</option>
            </select>
        </label>

        <label class="settings-field">
            <span class="settings-field-label-row">
                <span>Arama API anahtarı (isteğe bağlı)</span>
                <a class="settings-get-key-link" href="${SEARCH_KEY_LINKS[0][1]}" target="_blank" rel="noopener noreferrer">API Key Al↗</a>
            </span>
            <input type="password" id="settings-search-key" value="${escapeAttr(config.searchApiKey)}" placeholder="tvly-… ya da jina_…" autocomplete="off">
        </label>

        <p class="settings-note">
            Anahtar girmezsen sunucunun araması (varsa), o da yoksa Vikipedi kullanılır —
            Vikipedi ansiklopedik bilgi verir, <strong>son dakika haberi vermez</strong>.
            Ücretsiz kotası olan Tavily ile güncel haberleri alabilirsin.
        </p>

        ${section("Gelişmiş")}

        <label class="settings-field">
            <span>Sunucu (proxy) adresi</span>
            <input type="text" id="settings-proxy-url" value="${escapeAttr(config.backendProxyBaseUrl)}" placeholder="https://senin-projen.vercel.app" autocomplete="off" autocapitalize="off" spellcheck="false">
        </label>

        <p class="settings-note">
            Web'de (Vercel gibi bir sunucudan) açıyorsan boş bırak. Android uygulaması olarak
            paketlediysen ortak Groq modunun çalışması için <code>api/chat.js</code>'i yayınladığın
            adresi (ör. Vercel linkin) buraya yazman gerekir.
        </p>

        <label class="settings-field">
            <span>Yerel Ollama adresi</span>
            <input type="text" id="settings-ollama-url" value="${escapeAttr(config.providers.ollama.baseUrl)}" placeholder="http://localhost:11434" autocomplete="off" autocapitalize="off" spellcheck="false">
        </label>

        <p class="settings-note">
            Telefonda yerel çalıştırmak için Termux'ta Ollama'yı kur (<code>ollama/termux-kurulum.sh</code>)
            ve adresi <strong>http://localhost:11434</strong> bırak. Bilgisayardaki bir Ollama için o cihazın
            yerel ağ IP'sini yazabilirsin. Bu cihaz için önerilen model seviyesi:
            <strong>${tierInfo.label}</strong> (${DeviceProfile.getDisplayName()}).
        </p>
    `);
}

function toggleRow(id, label, checked) {

    return `
        <label class="settings-field settings-field-row">
            <span>${label}</span>
            <input type="checkbox" id="${id}" ${checked ? "checked" : ""}>
        </label>
    `;
}

function renderVoicePanel() {

    return panelShell("Ses", `
        ${toggleRow("settings-stt-toggle", "Sesle yazma (mikrofon)", config.voice.sttEnabled)}
        ${toggleRow("settings-tts-toggle", "Cevapları sesli oku", config.voice.ttsEnabled)}

        <p class="settings-note">
            Sesli yazma ve okuma, tarayıcının/telefonun kendi ses motorunu kullanır; desteklenmeyen
            cihazlarda ilgili düğme çalışmaz.
        </p>
    `);
}

function renderChatPanel() {

    return panelShell("Sohbet", `
        ${toggleRow("settings-memory-toggle", "Hafızayı sohbetlerde kullan", config.memoryEnabled)}
        ${toggleRow("settings-websearch-toggle", "Her mesajda otomatik web araması", config.webSearchEnabled)}

        <p class="settings-note">
            Web araması açıkken cevaptan önce mesajınla ilgili hızlı bir arama yapılır ve sonuçlar
            cevaba eklenir — güncel olayları, tarihleri ve “en son” bilgileri doğru vermek için.
            Her mesajı biraz yavaşlatır; hız istiyorsan kapat. Sorun için sohbette
            <strong>Web Araçları → Web'de Ara</strong> ile tek seferlik arama da yapabilirsin.
        </p>

        <button id="settings-clear-memory-button" class="settings-inline-button danger" type="button">
            ${icon("trash")}Tüm hafızayı sil
        </button>
    `);
}

function selectOptions(options, current) {

    return options
        .map(([value, label]) => `<option value="${value}" ${current === value ? "selected" : ""}>${label}</option>`)
        .join("");
}

function counterText(length, max) {

    return `${length} / ${max}`;
}

/** What Lotus will actually receive, shown as plain text in the preview box. */
function personalizationPreviewText(personalization) {

    const block = buildPersonalizationBlock(personalization).trim();

    return block || "Henüz Lotus'a gönderilecek ek bir talimat yok. Bir alan doldurduğunda burada görünür.";
}

function renderThemeCards(currentId) {

    const cards = THEMES.map(theme => {

        const sw = theme.swatch;

        const selected = theme.id === currentId;

        return `
            <button type="button" class="theme-card ${selected ? "is-selected" : ""}"
                role="radio" aria-checked="${selected}" data-theme-id="${theme.id}">
                <span class="theme-preview" aria-hidden="true"
                    style="background:${sw.bg};border-color:${sw.panel}">
                    <span class="theme-preview-bubble" style="background:linear-gradient(135deg,${sw.from},${sw.to})"></span>
                    <span class="theme-preview-line" style="background:${sw.panel}"></span>
                    <span class="theme-preview-line short" style="background:${sw.panel}"></span>
                    <span class="theme-preview-bar" style="background:${sw.panel}">
                        <span style="background:linear-gradient(135deg,${sw.from},${sw.to})"></span>
                    </span>
                </span>
                <span class="theme-card-name">${theme.name}</span>
                <span class="theme-card-hint">${theme.hint}</span>
                <span class="theme-card-check" aria-hidden="true">${icon("check")}</span>
            </button>
        `;
    }).join("");

    return `<div class="theme-grid" role="radiogroup" aria-label="Tema">${cards}</div>`;
}

function renderPersonalizationPanel() {

    const p = config.personalization;

    const limits = PERSONALIZATION_LIMITS;

    return panelShell("Kişiselleştirme", `
        ${section("Tema", "Uygulamanın görünümü; bu cihazda hatırlanır")}

        ${renderThemeCards(config.theme)}

        ${section("Lotus'a söyle", "Sohbetlerde Lotus'un nasıl davranacağı")}

        ${toggleRow("personalization-enabled", "Kişiselleştirmeyi kullan", p.enabled)}

        <p class="settings-note">
            Burada yazdıkların <strong>her sohbette</strong> Lotus'a ek talimat olarak gider; bu cihazda
            kayıtlı kalır, kapatırsan silinmeden beklemeye alınır.
        </p>

        <div id="personalization-fields" class="settings-fields ${p.enabled ? "" : "is-off"}">

            ${section("Seni tanısın")}

            <label class="settings-field">
                <span class="settings-field-label-row">
                    <span>Sana nasıl hitap etsin?</span>
                    <span class="settings-counter" data-counter-for="personalization-nickname">${counterText(p.nickname.length, limits.nickname)}</span>
                </span>
                <input type="text" id="personalization-nickname" maxlength="${limits.nickname}"
                    value="${escapeAttr(p.nickname)}" placeholder="Örn. Musa" autocomplete="off">
            </label>

            <label class="settings-field">
                <span class="settings-field-label-row">
                    <span>Senin hakkında</span>
                    <span class="settings-counter" data-counter-for="personalization-about">${counterText(p.about.length, limits.about)}</span>
                </span>
                <textarea id="personalization-about" rows="3" maxlength="${limits.about}"
                    placeholder="Ne iş yaparsın, neyle ilgilenirsin, nelerde yardım istersin?">${escapeAttr(p.about)}</textarea>
            </label>

            ${section("Konuşma tarzı")}

            <label class="settings-field">
                <span>Cevap uzunluğu</span>
                <select id="personalization-style">${selectOptions(STYLE_OPTIONS, p.style)}</select>
            </label>

            <label class="settings-field">
                <span>Üslup</span>
                <select id="personalization-tone">${selectOptions(TONE_OPTIONS, p.tone)}</select>
            </label>

            <label class="settings-field">
                <span>Dil</span>
                <select id="personalization-language">${selectOptions(LANGUAGE_OPTIONS, p.language)}</select>
            </label>

            ${section("Özel talimatlar", "İstediğin her şeyi yazabilirsin")}

            <label class="settings-field">
                <span class="settings-field-label-row">
                    <span>Lotus'un hep uyması gerekenler</span>
                    <span class="settings-counter" data-counter-for="personalization-instructions">${counterText(p.instructions.length, limits.instructions)}</span>
                </span>
                <textarea id="personalization-instructions" rows="5" maxlength="${limits.instructions}"
                    placeholder="Örn. Kod yazarken açıklamayı kısa tut. Cevapları madde madde verme.">${escapeAttr(p.instructions)}</textarea>
            </label>

            <details class="settings-details">
                <summary>Lotus'a giden ek talimatı gör</summary>
                <pre id="personalization-preview" class="settings-preview">${escapeAttr(personalizationPreviewText(p))}</pre>
            </details>

            <button id="personalization-reset" class="settings-inline-button danger" type="button">
                ${icon("trash")}Kişiselleştirmeyi sıfırla
            </button>

        </div>

        ${section("Hafıza", "Ayrı bir şey")}

        <p class="settings-note">
            Lotus'un senden <strong>öğrendiği kısa bilgiler</strong> (<code>hatırla: …</code>) Hafıza'da tutulur;
            yukarıdakiler ise senin kendi koyduğun kalıcı tercihlerin. Hafızada
            <strong id="personalization-memory-count">…</strong> kayıt var.
        </p>

        <button id="settings-open-memory-button" class="settings-inline-button" type="button">
            ${icon("brain")}Hafızayı aç
        </button>
    `);
}

function renderAboutPanel() {

    return panelShell("Hakkında", `
        <p class="settings-note">Lotus AI — Düşün. Üret. Geliş.</p>
        <p class="settings-note">Yerel model olan <strong>Lotus Mini</strong>, açık kaynak ${MODEL_BASE_CREDIT} bir modeldir; sıfırdan eğitilmemiştir.</p>
    `);
}

const PANEL_RENDERERS = {
    ai: renderAIPanel,
    voice: renderVoicePanel,
    chat: renderChatPanel,
    personalization: renderPersonalizationPanel,
    about: renderAboutPanel
};

/**
 * Wires the Kişiselleştirme panel: text boxes save while typing (debounced,
 * and always when leaving the panel), the preview and counters follow along,
 * and the Hafıza button opens the memory window.
 */
function bindPersonalizationPanel(container) {

    const $ = id => container.querySelector(`#${id}`);

    container.querySelectorAll(".theme-card").forEach(card => {

        card.addEventListener("click", () => {

            const id = card.dataset.themeId;

            if (id === config.theme) return;

            config.setTheme(id);

            container.querySelectorAll(".theme-card").forEach(other => {

                const on = other === card;

                other.classList.toggle("is-selected", on);

                other.setAttribute("aria-checked", String(on));
            });

            showToast(`Tema: ${THEMES.find(theme => theme.id === config.theme).name}`, "success");
        });
    });

    const enabledBox = $("personalization-enabled");
    const fields = $("personalization-fields");
    const preview = $("personalization-preview");

    const textIds = {
        "personalization-nickname": "nickname",
        "personalization-about": "about",
        "personalization-instructions": "instructions"
    };

    const selectIds = {
        "personalization-style": "style",
        "personalization-tone": "tone",
        "personalization-language": "language"
    };

    let timer = null;

    const collect = () => {

        const updates = { enabled: Boolean(enabledBox?.checked) };

        for (const [id, key] of Object.entries({ ...textIds, ...selectIds })) {

            const element = $(id);

            if (element) updates[key] = element.value;
        }

        return updates;
    };

    const refreshPreview = () => {

        if (preview) preview.textContent = personalizationPreviewText(config.personalization);
    };

    const save = () => {

        clearTimeout(timer);

        timer = null;

        config.setPersonalization(collect());

        refreshPreview();
    };

    const updateCounters = () => {

        for (const [id] of Object.entries(textIds)) {

            const counter = container.querySelector(`[data-counter-for="${id}"]`);

            const element = $(id);

            if (counter && element) {

                const max = PERSONALIZATION_LIMITS[textIds[id]];

                counter.textContent = counterText(element.value.length, max);

                counter.classList.toggle("is-near-limit", element.value.length >= max * 0.9);
            }
        }
    };

    enabledBox?.addEventListener("change", () => {

        fields?.classList.toggle("is-off", !enabledBox.checked);

        save();

        showToast(enabledBox.checked ? "Kişiselleştirme açık." : "Kişiselleştirme kapatıldı (ayarların silinmedi).", "info");
    });

    for (const id of Object.keys(textIds)) {

        const element = $(id);

        element?.addEventListener("input", () => {

            updateCounters();

            clearTimeout(timer);

            timer = setTimeout(save, 350);
        });

        // Leaving the box: save now and show the cleaned-up text
        // (trimmed, control characters removed). Not while typing — that
        // would move the cursor.
        element?.addEventListener("change", () => {

            save();

            element.value = config.personalization[textIds[id]];

            updateCounters();
        });
    }

    for (const id of Object.keys(selectIds)) {

        $(id)?.addEventListener("change", save);
    }

    $("personalization-reset")?.addEventListener("click", async () => {

        if (JSON.stringify(config.personalization) === JSON.stringify(DEFAULT_PERSONALIZATION)) {

            showToast("Sıfırlanacak bir şey yok.", "info");

            return;
        }

        const confirmed = await showConfirm("Kişiselleştirmedeki her şey (hitap, hakkında, tarz, özel talimatlar) silinsin mi? Hafıza etkilenmez.", { okLabel: "Sıfırla", danger: true });

        if (!confirmed) return;

        config.resetPersonalization();

        renderPanel("personalization");

        showToast("Kişiselleştirme sıfırlandı.", "success");
    });

    // The back button must not lose an edit that is still waiting for the timer.
    container.querySelector(".settings-back-button")?.addEventListener("click", () => {

        if (timer) save();
    }, { capture: true });

    $("settings-open-memory-button")?.addEventListener("click", () => {

        if (timer) save();

        document.getElementById("settings-modal")?.classList.add("hidden");

        document.getElementById("memory-modal")?.classList.remove("hidden");

        Memory.renderModal();
    });

    Memory.getMemories()
        .then(list => {

            const count = $("personalization-memory-count");

            if (count) count.textContent = String(Array.isArray(list) ? list.length : 0);
        })
        .catch(() => {

            const count = $("personalization-memory-count");

            if (count) count.textContent = "—";
        });
}

function bindPanelEvents(container, key) {

    container.querySelector(".settings-back-button")?.addEventListener("click", () => {

        renderMenu();
    });

    if (key === "ai") {

        bindLocalSettings(container);

        container.querySelector("#settings-provider-select")?.addEventListener("change", event => {

            config.setProvider(event.target.value);
        });

        container.querySelectorAll("[data-provider-key]").forEach(input => {

            input.addEventListener("change", () => {

                config.setProviderKey(input.dataset.providerKey, input.value);
            });
        });

        container.querySelectorAll("[data-provider-model]").forEach(input => {

            input.addEventListener("change", () => {

                const name = input.dataset.providerModel;

                // An emptied box goes back to the built-in default.
                config.setProviderModel(name, input.value.trim() || MODEL_HINTS[name]);

                input.value = config.providers[name].model;
            });
        });

        container.querySelector("#settings-proxy-url")?.addEventListener("change", event => {

            config.setBackendProxyBaseUrl(event.target.value);
        });

        container.querySelector("#settings-groq-vision-model")?.addEventListener("change", event => {

            config.setGroqVisionModel(event.target.value);

            event.target.value = config.providers.groq.visionModel;
        });

        container.querySelector("#settings-ollama-url")?.addEventListener("change", event => {

            config.setOllamaBaseUrl(event.target.value);
        });

        container.querySelector("#settings-search-provider")?.addEventListener("change", event => {

            config.setSearchProvider(event.target.value);
        });

        container.querySelector("#settings-search-key")?.addEventListener("change", event => {

            config.setSearchApiKey(event.target.value);
        });
    }

    if (key === "personalization") {

        bindPersonalizationPanel(container);
    }

    if (key === "voice") {

        container.querySelector("#settings-stt-toggle")?.addEventListener("change", event => {

            config.setVoice({ sttEnabled: event.target.checked });
        });

        container.querySelector("#settings-tts-toggle")?.addEventListener("change", event => {

            config.setVoice({ ttsEnabled: event.target.checked });
        });
    }

    if (key === "chat") {

        container.querySelector("#settings-memory-toggle")?.addEventListener("change", event => {

            config.setMemoryEnabled(event.target.checked);
        });

        container.querySelector("#settings-websearch-toggle")?.addEventListener("change", event => {

            config.setWebSearchEnabled(event.target.checked);
        });

        container.querySelector("#settings-clear-memory-button")?.addEventListener("click", async () => {

            const confirmed = await showConfirm("Tüm hafızanı silmek istediğine emin misin? Bu işlem geri alınamaz.", { okLabel: "Hepsini sil", danger: true });

            if (!confirmed) return;

            const result = await Memory.clearAll();

            showToast(
                result.success ? "Hafıza temizlendi." : `Hafıza temizlenemedi: ${result.error}`,
                result.success ? "success" : "error"
            );
        });
    }
}

function renderPanel(key) {

    const renderer = PANEL_RENDERERS[key];

    if (!renderer) return;

    const menuView = document.getElementById("settings-menu-view");
    const panelView = document.getElementById("settings-panel-view");

    panelView.innerHTML = renderer();

    menuView.classList.add("hidden");
    panelView.classList.remove("hidden");

    bindPanelEvents(panelView, key);
}

function renderMenu() {

    const menuView = document.getElementById("settings-menu-view");
    const panelView = document.getElementById("settings-panel-view");

    panelView.classList.add("hidden");
    panelView.innerHTML = "";

    menuView.classList.remove("hidden");
}

function bindMenuClicks(container) {

    container.querySelectorAll(".settings-item").forEach(item => {

        const key = item.dataset.setting;

        if (key === "account" || !PANEL_RENDERERS[key]) return;

        item.addEventListener("click", event => {

            event.preventDefault();
            event.stopPropagation();

            renderPanel(key);
        });
    });
}

document.addEventListener("DOMContentLoaded", () => {

    const menuView = document.getElementById("settings-menu-view");

    if (!menuView) return;

    // FIX: this used to be a single #settings-content container whose
    // ENTIRE innerHTML (including the static "Hesap" button) got
    // replaced with a cached HTML string every time a panel opened or
    // the menu reset. That silently destroyed and recreated the
    // "Hesap" button's DOM node — and since auth.js attaches its login
    // click listener directly to that node once at page load, the
    // brand new (string-cloned) node had NO listener at all. Clicking
    // "Hesap" after opening any other settings panel (or even just
    // after settings.js's own reset-on-open) did nothing, no error, no
    // console output — because the click never reached any listener.
    //
    // Fix: the menu buttons (#settings-menu-view) are now a PERMANENT
    // part of the DOM, never rebuilt from an HTML string. Only
    // #settings-panel-view's content is generated/replaced — switching
    // back to the menu is a CSS class toggle (renderMenu above), not a
    // DOM rebuild. auth.js's listener on "Hesap" stays valid forever.
    bindMenuClicks(menuView);

    // Reset to the menu every time settings is opened, so a
    // previously-open sub-panel doesn't linger the next time (see
    // renderMenu — this is now a cheap class toggle, not a rebuild).
    ["settings-button", "header-settings-button"].forEach(id => {

        document.getElementById(id)?.addEventListener("click", () => {

            renderMenu();
        });
    });
});
