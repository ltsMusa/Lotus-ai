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
import DeviceProfile from "./deviceProfile.js";
import { showToast, showConfirm } from "./toast.js";

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

function panelShell(title, bodyHtml) {

    return `
        <div class="settings-panel">
            <button class="settings-back-button" type="button">← Geri</button>
            <h3 class="settings-panel-title">${title}</h3>
            ${bodyHtml}
        </div>
    `;
}

function renderAIPanel() {

    const providerOptions = Object.keys(PROVIDER_NAMES)
        .map(key => `<option value="${key}" ${config.provider === key ? "selected" : ""}>${PROVIDER_NAMES[key]}</option>`)
        .join("");

    const keyInputs = Object.keys(PROVIDER_NAMES).map(key => `
        <label class="settings-field">
            <span class="settings-field-label-row">
                <span>${PROVIDER_NAMES[key]} API Anahtarı ${key === "groq" ? "(opsiyonel)" : ""}</span>
                <a class="settings-get-key-link" href="${PROVIDER_KEY_URLS[key]}" target="_blank" rel="noopener noreferrer">
                    API Key Al↗
                </a>
            </span>
            <input type="password" data-provider-key="${key}" value="${escapeAttr(config.providers[key].apiKey)}" placeholder="${key === "groq" ? "boş bırakılırsa otomatik Groq kullanılır" : "sk-..."}">
        </label>
    `).join("");

    const tierInfo = DeviceProfile.getTierInfo();

    return panelShell("Yapay Zekâ", `
        <p class="settings-note">
            Lotus AI, Groq'u varsayılan olarak kendi paylaşılan anahtarıyla
            otomatik kullanır — ekstra bir şey girmene gerek yok. Paylaşılan
            kullanım limiti dolarsa sohbette kendi Groq anahtarını
            ekleyebileceğin ya da yerel Ollama'ya geçebileceğin bir seçim
            ekranı çıkar. Kendi anahtarını aşağıya girersen o sağlayıcı
            için otomatik olarak senin anahtarın kullanılır.
        </p>

        <label class="settings-field">
            <span>Aktif Sağlayıcı</span>
            <select id="settings-provider-select">${providerOptions}</select>
        </label>

        ${keyInputs}

        <div class="settings-divider"></div>

        <label class="settings-field">
            <span>Sunucu Proxy Adresi (uygulama olarak paketlendiyse gerekli)</span>
            <input type="text" id="settings-proxy-url" value="${escapeAttr(config.backendProxyBaseUrl)}" placeholder="https://senin-projen.vercel.app">
        </label>

        <p class="settings-note">
            Web'de (bir sunucudan) açıyorsan burayı boş bırak. AIDE/Android
            gibi bir uygulama olarak paketlediysen, otomatik Groq modu
            çalışabilsin diye buraya <code>api/chat.js</code>'i deploy ettiğin
            adresi (ör. Vercel linkin) yazman gerekir — aksi halde uygulama
            göreli "/api/chat" adresine hiç ulaşamaz.
        </p>

        <div class="settings-divider"></div>

        <label class="settings-field">
            <span>Görsel/Video Analizi — Groq Model Adı</span>
            <input type="text" id="settings-groq-vision-model" value="${escapeAttr(config.providers.groq.visionModel)}" placeholder="llama-3.2-11b-vision-preview">
        </label>

        <p class="settings-note">
            Görsel veya video yüklediğinde otomatik Groq modu DEĞİL —
            Gemini, OpenAI, Groq ya da OpenRouter'dan hangisine kendi
            anahtarını eklediysen o kullanılır (bu sırayla denenir).
            Groq'un görsel modeli zamanla değişebilir; "model bulunamadı"
            hatası alırsan buraya güncel model adını yaz.
        </p>

        <div class="settings-divider"></div>

        <label class="settings-field">
            <span>Yerel Ollama Sunucu Adresi</span>
            <input type="text" id="settings-ollama-url" value="${escapeAttr(config.providers.ollama.baseUrl)}" placeholder="http://localhost:11434">
        </label>

        <p class="settings-note">
            Ollama telefonda çalışmaz — bilgisayarında/ağındaki bir Ollama
            sunucusunun adresini gir (örn. bilgisayarının yerel ağ IP'si).
            Şu anki cihazına göre önerilen model seviyesi:
            <strong>${tierInfo.label}</strong> (${tierInfo.models[0]}).
            Yanıt süreleri sürekli yavaş/hızlı geldikçe bu seviye otomatik
            ayarlanır.
        </p>
    `);
}

function renderVoicePanel() {

    return panelShell("Ses", `
        <label class="settings-field settings-field-row">
            <span>Sesle yazma (mikrofon)</span>
            <input type="checkbox" id="settings-stt-toggle" ${config.voice.sttEnabled ? "checked" : ""}>
        </label>

        <label class="settings-field settings-field-row">
            <span>Cevapları sesli oku</span>
            <input type="checkbox" id="settings-tts-toggle" ${config.voice.ttsEnabled ? "checked" : ""}>
        </label>
    `);
}

function renderChatPanel() {

    return panelShell("Sohbet", `
        <label class="settings-field settings-field-row">
            <span>Hafızayı sohbetlerde kullan</span>
            <input type="checkbox" id="settings-memory-toggle" ${config.memoryEnabled ? "checked" : ""}>
        </label>

        <label class="settings-field settings-field-row">
            <span>Her mesajda otomatik web araması</span>
            <input type="checkbox" id="settings-websearch-toggle" ${config.webSearchEnabled ? "checked" : ""}>
        </label>

        <p class="settings-note">
            Açıkken, cevap üretmeden önce mesajınla ilgili hızlı bir web
            araması yapılır ve sonuçlar cevaba dahil edilir — güncel
            olayları, tarihleri ve "en son" bilgileri doğru vermek için.
            Her mesajı biraz yavaşlatır; hız istiyorsan kapatabilirsin.
        </p>

        <button id="settings-clear-memory-button" class="settings-inline-button danger" type="button">
            🧠 Tüm hafızayı sil
        </button>
    `);
}

function renderPersonalizationPanel() {

    return panelShell("Kişiselleştirme", `
        <p class="settings-note">
            Lotus AI'nin seninle ilgili hatırladığı şeyler burada değil,
            ayrı bir Hafıza penceresinde tutulur — ekleyebilir, silebilir,
            tamamen temizleyebilirsin.
        </p>

        <button id="settings-open-memory-button" class="settings-inline-button" type="button">
            🧠 Hafızayı Aç
        </button>
    `);
}

function renderAboutPanel() {

    return panelShell("Hakkında", `
        <p class="settings-note">Lotus AI — Düşün. Üret. Geliş. 🌸</p>
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

        container.querySelector("#settings-provider-select")?.addEventListener("change", event => {

            config.setProvider(event.target.value);
        });

        container.querySelectorAll("[data-provider-key]").forEach(input => {

            input.addEventListener("change", () => {

                config.setProviderKey(input.dataset.providerKey, input.value);
            });
        });

        container.querySelector("#settings-proxy-url")?.addEventListener("change", event => {

            config.setBackendProxyBaseUrl(event.target.value);
        });

        container.querySelector("#settings-groq-vision-model")?.addEventListener("change", event => {

            config.setGroqVisionModel(event.target.value);
        });

        container.querySelector("#settings-ollama-url")?.addEventListener("change", event => {

            config.setOllamaBaseUrl(event.target.value);
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

            const confirmed = await showConfirm("Tüm hafızanı silmek istediğine emin misin? Bu işlem geri alınamaz.");

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
    ["settings-button", "header-settings-button", "mobile-settings"].forEach(id => {

        document.getElementById(id)?.addEventListener("click", () => {

            renderMenu();
        });
    });
});
