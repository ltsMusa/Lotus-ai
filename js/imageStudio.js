/**
 * ==========================================================
 * Lotus AI - Görsel stüdyosu
 * ==========================================================
 * The window behind "Görsel Oluştur": the idea, the shape of the
 * picture (aspect), a style and whether Lotus should first rewrite
 * the idea as a detailed English prompt. The choices are remembered
 * (config.image) and used for the next pictures — including a
 * regenerate and "bana bir kedi çiz" typed in the chat.
 *
 * Also tells the truth about what will make the picture: Gemini (with
 * a key) or the free service and its limits (js/imagePolicy.js).
 *
 * openImageStudio() resolves with { prompt } when the user taps
 * "Oluştur", or null when the window was closed.
 * ==========================================================
 */

import config from "./config.js";
import { ASPECTS, STYLES, normalizeImageSettings, routeHint } from "./imagePolicy.js";
import { imageRoute } from "./imageGen.js";
import { icon, escapeHtml } from "./utils.js";

const MAX_IDEA_CHARS = 400;

let root = null;

let session = null;

function ensureRoot() {

    if (root?.isConnected) return root;

    root = document.createElement("div");

    root.id = "image-studio";
    root.className = "modal imgstudio hidden";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-labelledby", "imgstudio-title");

    root.innerHTML = `
        <div class="modal-content imgstudio-content">
            <div class="modal-header">
                <h2 id="imgstudio-title">${icon("palette")}Görsel stüdyosu</h2>
                <button type="button" class="imgstudio-close" data-action="close" aria-label="Kapat">${icon("x")}</button>
            </div>

            <div class="imgstudio-body">
                <label class="settings-field">
                    <span>Ne çizmemi istersin?</span>
                    <textarea id="imgstudio-idea" rows="3" maxlength="${MAX_IDEA_CHARS}" placeholder="örn. yağmurda duran mor bir lotus çiçeği"></textarea>
                </label>

                <div class="imgstudio-group" role="radiogroup" aria-label="Görsel şekli">
                    <span class="imgstudio-label">Şekil</span>
                    <div class="imgstudio-chips" id="imgstudio-aspects"></div>
                </div>

                <div class="imgstudio-group" role="radiogroup" aria-label="Görsel stili">
                    <span class="imgstudio-label">Stil</span>
                    <div class="imgstudio-chips" id="imgstudio-styles"></div>
                </div>

                <label class="settings-field settings-field-row">
                    <span>Fikrimi İngilizce, ayrıntılı bir tarife çevir (genelde daha iyi sonuç verir)</span>
                    <input type="checkbox" id="imgstudio-enhance">
                </label>

                <p class="imgstudio-hint" id="imgstudio-hint"></p>

                <div class="imgstudio-actions">
                    <button type="button" class="message-choice-button secondary" data-action="close">Vazgeç</button>
                    <button type="button" class="message-choice-button primary" data-action="create">${icon("sparkles")}Oluştur</button>
                </div>
            </div>
        </div>
    `;

    root.addEventListener("click", event => {

        if (event.target === root) return finish(null);

        const chip = event.target.closest("[data-chip]");

        if (chip && session) {

            session[chip.dataset.chip] = chip.dataset.value;

            renderChips();

            return;
        }

        const button = event.target.closest("[data-action]");

        if (!button) return;

        if (button.dataset.action === "close") finish(null);

        if (button.dataset.action === "create") submit();
    });

    root.addEventListener("keydown", event => {

        // Ctrl/⌘ + Enter inside the idea box = create
        if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && event.target.id === "imgstudio-idea") {

            event.preventDefault();

            submit();
        }
    });

    root.addEventListener("change", event => {

        if (event.target.id === "imgstudio-enhance" && session) session.enhance = event.target.checked;
    });

    document.body.appendChild(root);

    return root;
}

function chipHtml(kind, item, selected) {

    const detail = item.ratio ? `<small>${escapeHtml(item.ratio)}</small>` : "";

    return `
        <button type="button" class="imgstudio-chip${selected ? " is-selected" : ""}" role="radio"
                aria-checked="${selected}" data-chip="${kind}" data-value="${escapeHtml(item.id)}">
            ${escapeHtml(item.label)}${detail}
        </button>
    `;
}

function renderChips() {

    if (!session || !root) return;

    root.querySelector("#imgstudio-aspects").innerHTML = Object.values(ASPECTS)
        .map(item => chipHtml("aspect", item, item.id === session.aspect)).join("");

    root.querySelector("#imgstudio-styles").innerHTML = Object.values(STYLES)
        .map(item => chipHtml("style", item, item.id === session.style)).join("");
}

function finish(result) {

    if (!session) return;

    document.removeEventListener("keydown", session.onKeydown);

    const { resolve, opener } = session;

    session = null;

    root?.classList.add("hidden");

    // Hand the focus back to the button that opened the window.
    try { opener?.focus?.(); } catch { /* element gone */ }

    resolve(result);
}

function submit() {

    if (!session) return;

    const idea = root.querySelector("#imgstudio-idea").value.replace(/\s+/g, " ").trim();

    if (!idea) {

        root.querySelector("#imgstudio-idea").focus();

        root.querySelector("#imgstudio-hint").textContent = "Önce ne çizmemi istediğini yaz.";

        return;
    }

    // These stay for the next pictures (and for "yeniden oluştur").
    config.setImageSettings({ aspect: session.aspect, style: session.style, enhance: session.enhance });

    finish({ prompt: idea });
}

/**
 * @param {{ prompt?: string }} [options]
 * @returns {Promise<{ prompt: string } | null>}
 */
export function openImageStudio({ prompt = "" } = {}) {

    if (session) return Promise.resolve(null);

    ensureRoot();

    const settings = normalizeImageSettings(config.image);

    return new Promise(resolve => {

        session = {
            ...settings,
            resolve,
            opener: document.activeElement,
            onKeydown: event => { if (event.key === "Escape") finish(null); }
        };

        document.addEventListener("keydown", session.onKeydown);

        root.querySelector("#imgstudio-idea").value = String(prompt).slice(0, MAX_IDEA_CHARS);
        root.querySelector("#imgstudio-enhance").checked = session.enhance;
        root.querySelector("#imgstudio-hint").textContent = routeHint(imageRoute());

        renderChips();

        root.classList.remove("hidden");

        // On a phone the keyboard would cover the shape/style choices; focus only when it is a roomy screen.
        if (window.matchMedia?.("(min-width: 700px)").matches) root.querySelector("#imgstudio-idea").focus();
    });
}

export const isImageStudioOpen = () => Boolean(session);

export default { open: openImageStudio, isOpen: isImageStudioOpen };
