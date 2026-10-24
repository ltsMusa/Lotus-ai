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

function renderPersonalizationPanel() {

    return panelShell("Kişiselleştirme", `
        <p class="settings-note">
            Lotus AI'nin seninle ilgili hatırladıkları ayrı bir <strong>Hafıza</strong> penceresinde tutulur —
            ekleyebilir, silebilir, tamamen temizleyebilirsin. Sohbette de yönetebilirsin:
            <code>hatırla: …</code>, <code>unut: …</code>, <code>neler hatırlıyorsun?</code>
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

        container.querySelector("#settings-open-memory-button")?.addEventListener("click", () => {

            const settingsModal = document.getElementById("settings-modal");
            const memoryModal = document.getElementById("memory-modal");

            settingsModal?.classList.add("hidden");

            memoryModal?.classList.remove("hidden");

            Memory.renderModal();
        });
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
