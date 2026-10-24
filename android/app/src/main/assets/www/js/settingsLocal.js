/**
 * ==========================================================
 * Lotus AI - Settings: routing + on-device model (Lotus Mini)
 * ==========================================================
 * The part of Ayarlar → Yapay Zekâ that deals with the automation:
 *
 *   • Otomatik yönlendirme  (auto / cloud only / device only)
 *   • Lotus Mini            (download · cancel · delete · live progress)
 *   • Adaptive switching    (model size follows heat, battery, RAM)
 *
 * renderLocalSettings() returns the markup, bindLocalSettings() wires it.
 * The live block (#local-ai-live) re-renders itself while the panel is
 * open — download progress, the engine loading, the thermal readout.
 * ==========================================================
 */

import config from "./config.js";
import LocalAI from "./providers/local.js";
import DeviceMonitor from "./deviceMonitor.js";
import { LOCAL_MODELS, LOCAL_MODEL_NAME, formatBytes } from "./localModels.js";
import { escapeHtml, icon } from "./utils.js";
import { showToast, showConfirm } from "./toast.js";

const THERMAL_LABEL = {
    normal: "Normal",
    warm: "Isınıyor",
    hot: "Sıcak",
    critical: "Çok sıcak"
};

let downloadController = null;
let refreshTimer = null;

function section(title, hint = "") {

    return `
        <div class="settings-section">
            <span class="settings-section-title">${title}</span>
            ${hint ? `<span class="settings-section-hint">${hint}</span>` : ""}
        </div>
    `;
}

function toggleRow(id, label, checked) {

    return `
        <label class="settings-field settings-field-row">
            <span>${label}</span>
            <input type="checkbox" id="${id}" ${checked ? "checked" : ""}>
        </label>
    `;
}

// ----------------------------------------------------------
// LIVE BLOCK
// ----------------------------------------------------------

function deviceLine(snapshot) {

    const parts = [];

    if (snapshot.ramGB) parts.push(`${snapshot.ramExact ? "" : "≈ "}${snapshot.ramGB} GB RAM`);

    if (snapshot.cores) parts.push(`${snapshot.cores} çekirdek`);

    parts.push(`ısı: ${THERMAL_LABEL[snapshot.thermal] || "Normal"}${snapshot.tempC ? ` (${Math.round(snapshot.tempC)}°C)` : ""}`);

    if (snapshot.batteryPct != null) parts.push(`pil %${snapshot.batteryPct}${snapshot.charging ? " ⚡" : ""}`);

    if (snapshot.powerSave) parts.push("güç tasarrufu açık");

    return parts.join(" · ");
}

function modelCard(model, state, recommendedId) {

    const installed = state.installed.includes(model.id);

    const downloading = state.downloading?.id === model.id ? state.downloading : null;

    const loaded = state.loadedId === model.id;

    const percent = downloading ? Math.min(100, Math.round((downloading.loaded / downloading.total) * 100)) : 0;

    let status = `${formatBytes(model.sizeBytes)} · ~${model.runtimeMB} MB RAM`;

    if (installed) status = `Kurulu · ${loaded ? "çalışıyor" : "hazır"} · ${status}`;

    let action;

    if (downloading) {

        action = `<button type="button" class="local-model-button" data-local-action="cancel">Vazgeç</button>`;

    } else if (installed) {

        action = `<button type="button" class="local-model-button danger" data-local-action="remove" data-model="${model.id}">${icon("trash")}Sil</button>`;

    } else {

        action = `<button type="button" class="local-model-button primary" data-local-action="download" data-model="${model.id}" ${state.downloading ? "disabled" : ""}>${icon("download")}İndir</button>`;
    }

    return `
        <div class="local-model-card ${installed ? "installed" : ""}">
            <div class="local-model-head">
                <div>
                    <strong>${escapeHtml(model.name)}</strong>
                    ${model.id === recommendedId && !installed ? `<span class="local-model-tag">Bu cihaz için önerilen</span>` : ""}
                    <span class="local-model-sub">${escapeHtml(model.base)} · ${escapeHtml(model.quant)}</span>
                </div>
                ${action}
            </div>
            <div class="local-model-status">${escapeHtml(status)}</div>
            ${downloading ? `
                <div class="local-progress"><span data-progress-bar style="width:${percent}%"></span></div>
                <div class="local-model-status" data-progress-text>İndiriliyor… ${formatBytes(downloading.loaded)} / ${formatBytes(downloading.total)} (%${percent})</div>
            ` : ""}
        </div>
    `;
}

function renderLive() {

    const state = LocalAI.getState();

    const snapshot = DeviceMonitor.get(state.loadedId);

    const choice = LocalAI.previewChoice();

    const chosen = LOCAL_MODELS.find(model => model.id === choice.modelId);

    const recommendedId = LocalAI.recommendedModelId();

    let engineNote = "";

    if (state.engine === "missing") {

        engineNote = `<p class="settings-note local-warning">Yerel motor dosyaları bulunamadı (<code>vendor/wllama</code>). İnternet varken CDN'den denenir; çevrimdışı kullanım için <code>tools/fetch-local-ai.sh</code> betiğini çalıştır.</p>`;

    } else if (state.engine === "unsupported") {

        engineNote = `<p class="settings-note local-warning">${escapeHtml(state.engineError || "Bu tarayıcı yerel modeli çalıştıramıyor (WebAssembly gerekli).")}</p>`;
    }

    const current = chosen
        ? `Şu an kullanılacak: <strong>${escapeHtml(chosen.name)}</strong> · ${choice.threads} iş parçacığı${choice.downgraded ? ` — küçültüldü (${escapeHtml(choice.reasons.join(", "))})` : ""}`
        : `Yerel model kurulu değil — aşağıdan indirebilirsin.`;

    return `
        <div class="local-device-box">
            <div class="local-device-line">${icon("cpu")}<span>${escapeHtml(deviceLine(snapshot))}</span></div>
            <div class="local-device-line subtle">${current}</div>
        </div>
        ${engineNote}
        ${LOCAL_MODELS.map(model => modelCard(model, state, recommendedId)).join("")}
    `;
}

// The progress numbers change many times a second; rebuilding the buttons
// that often would swallow taps (the element under the finger is replaced
// between touch-down and touch-up). So a change that only moves the progress
// bar is patched in place, and the markup is rebuilt only when it really changes.
const PROGRESS_PARTS = /width:\d+%|İndiriliyor… [^<]*/g;

let lastStructure = "";

function refreshLive() {

    const box = document.getElementById("local-ai-live");

    if (!box) {

        clearInterval(refreshTimer);

        refreshTimer = null;

        lastStructure = "";

        return;
    }

    const html = renderLive();

    const structure = html.replace(PROGRESS_PARTS, "");

    if (structure === lastStructure && box.firstElementChild) {

        const state = LocalAI.getState();

        const info = state.downloading;

        if (info) {

            const percent = Math.min(100, Math.round((info.loaded / info.total) * 100));

            const bar = box.querySelector("[data-progress-bar]");
            const text = box.querySelector("[data-progress-text]");

            if (bar) bar.style.width = `${percent}%`;

            if (text) text.textContent = `İndiriliyor… ${formatBytes(info.loaded)} / ${formatBytes(info.total)} (%${percent})`;
        }

        return;
    }

    lastStructure = structure;

    box.innerHTML = html;
}

// ----------------------------------------------------------
// PUBLIC
// ----------------------------------------------------------

export function renderLocalSettings() {

    const route = config.routeMode;

    const preferredOptions = [`<option value="auto" ${config.local.preferredModel === "auto" ? "selected" : ""}>Otomatik (cihaza göre)</option>`]
        .concat(LOCAL_MODELS.map(model => `<option value="${model.id}" ${config.local.preferredModel === model.id ? "selected" : ""}>${escapeHtml(model.name)}</option>`))
        .join("");

    lastStructure = "";

    return `
        ${section("Otomatik yönlendirme", "Mesajın nereden yanıtlanacağı.")}

        <label class="settings-field">
            <span>Mod</span>
            <select id="settings-route-mode">
                <option value="auto" ${route === "auto" ? "selected" : ""}>Otomatik (önerilen)</option>
                <option value="cloud" ${route === "cloud" ? "selected" : ""}>Yalnızca bulut sağlayıcılar</option>
                <option value="local" ${route === "local" ? "selected" : ""}>Yalnızca cihazda (internetsiz)</option>
            </select>
        </label>

        <p class="settings-note">
            <strong>Otomatik:</strong> bağlı bir sağlayıcı varsa mesaj ona gider. Kotası dolarsa ya da hata verirse
            sıradaki sağlayıcıya geçilir (bir süre dinlendirilir). Hiçbiri kullanılamıyorsa ya da internet yoksa
            cihazdaki ${LOCAL_MODEL_NAME} yanıtlar. Bir anahtar kaydedince ya da internet gelince bir sonraki mesaj
            kendiliğinden tekrar buluta döner.
        </p>

        ${section(`${LOCAL_MODEL_NAME} (cihazda)`, "İnternetsiz çalışan, indirilen küçük model.")}

        <div id="local-ai-live">${renderLive()}</div>

        <p class="settings-note">
            Model bir kez indirilir (yalnızca Wi-Fi önerilir) ve uygulamanın kendi alanında durur; mesajların cihazdan çıkmaz.
            Küçük model hızlıdır ama Türkçede ve uzun akıl yürütmede bulut sağlayıcılardan zayıftır.
        </p>

        ${toggleRow("settings-local-adaptive", "Isınmaya ve pile göre modeli otomatik değiştir", config.local.adaptive)}

        <p class="settings-note">
            Açıkken cihaz ısınınca, pil azalınca ya da güç tasarrufu açılınca daha küçük modele ve daha az işlemci
            çekirdeğine geçilir; soğuyunca büyük modele dönülür. Isı bilgisi en doğru <strong>Android uygulamasında</strong>
            okunur; tarayıcıda yalnızca tahmin edilir (yavaşlama ölçülerek).
        </p>

        <label class="settings-field">
            <span>Tercih edilen model</span>
            <select id="settings-local-preferred">${preferredOptions}</select>
        </label>

        ${toggleRow("settings-local-gpu", "Ekran kartını kullan (WebGPU, deneysel)", config.local.useGpu)}

        <label class="settings-field">
            <span>Boşta kalınca belleği boşalt (dakika, 0 = hiç)</span>
            <input type="number" id="settings-local-idle" min="0" max="120" step="1" value="${Number(config.local.idleUnloadMinutes) || 0}">
        </label>
    `;
}

export function bindLocalSettings(container) {

    container.querySelector("#settings-route-mode")?.addEventListener("change", event => {

        config.setRouteMode(event.target.value);
    });

    container.querySelector("#settings-local-adaptive")?.addEventListener("change", event => {

        config.setLocal({ adaptive: event.target.checked });

        refreshLive();
    });

    container.querySelector("#settings-local-preferred")?.addEventListener("change", event => {

        config.setLocal({ preferredModel: event.target.value });

        refreshLive();
    });

    container.querySelector("#settings-local-gpu")?.addEventListener("change", event => {

        config.setLocal({ useGpu: event.target.checked });

        // The loaded model keeps its old settings until it is reloaded.
        LocalAI.unload().catch(() => {});

        showToast(event.target.checked ? "Ekran kartı denenecek — takılırsa kapat." : "Yalnızca işlemci kullanılacak.", "info", 3500);
    });

    container.querySelector("#settings-local-idle")?.addEventListener("change", event => {

        const minutes = Math.max(0, Math.min(120, Math.round(Number(event.target.value) || 0)));

        event.target.value = minutes;

        config.setLocal({ idleUnloadMinutes: minutes });
    });

    const live = container.querySelector("#local-ai-live");

    live?.addEventListener("click", async event => {

        const button = event.target.closest("[data-local-action]");

        if (!button) return;

        const action = button.dataset.localAction;

        const id = button.dataset.model;

        if (action === "cancel") {

            downloadController?.abort();

            return;
        }

        if (action === "remove") {

            const model = LOCAL_MODELS.find(item => item.id === id);

            const confirmed = await showConfirm(`${model?.name || "Model"} cihazdan silinsin mi? İstediğinde yeniden indirebilirsin.`, { okLabel: "Sil", danger: true });

            if (!confirmed) return;

            try {

                await LocalAI.remove(id);

                showToast("Model silindi.", "success");

            } catch (error) {

                showToast(error.message || "Model silinemedi.", "error");
            }

            refreshLive();

            return;
        }

        if (action === "download") {

            downloadController = new AbortController();

            button.disabled = true;

            try {

                await LocalAI.download(id, { signal: downloadController.signal });

                showToast("Model cihaza kuruldu — artık internet olmadan da çalışır.", "success", 4500);

            } catch (error) {

                showToast(error.code === "ABORTED" ? "İndirme iptal edildi." : (error.message || "Model indirilemedi."), error.code === "ABORTED" ? "info" : "error", 6000);

            } finally {

                downloadController = null;

                refreshLive();
            }
        }
    });

    // Keep the readout alive while the panel is open.
    clearInterval(refreshTimer);

    refreshTimer = setInterval(refreshLive, 4000);

    if (!bindLocalSettings.listening) {

        bindLocalSettings.listening = true;

        window.addEventListener("lotus:local-state", refreshLive);
    }

    // Make sure the installed list is current when the panel opens.
    LocalAI.refreshInstalled().then(refreshLive).catch(() => {});
}
