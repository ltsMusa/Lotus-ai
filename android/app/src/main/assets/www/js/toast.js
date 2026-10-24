/**
 * ==========================================================
 * Lotus AI - Toast Notifications
 * ==========================================================
 * Replaces jarring native alert()/confirm() popups — which
 * completely break the "premium" feel and even look out of
 * place inside a packaged Android WebView — with small,
 * animated, on-brand notifications.
 * ==========================================================
 */

import { icon } from "./utils.js";

let container = null;

function ensureContainer() {

    if (container) return container;

    container = document.createElement("div");

    container.id = "toast-container";

    document.body.appendChild(container);

    return container;
}

/**
 * @param {string} message
 * @param {"info"|"error"|"success"} type
 * @param {number} durationMs   0 = stays until dismissed
 * @param {{actionLabel?: string, onAction?: Function}} [options]
 *        optional button inside the toast (e.g. "Yenile")
 */
export function showToast(message, type = "info", durationMs = 4000, options = {}) {

    const root = ensureContainer();

    const toast = document.createElement("div");

    toast.className = `toast toast-${type}`;

    const iconName = { info: "info", error: "alert", success: "check-circle" }[type] || "info";

    toast.setAttribute("role", type === "error" ? "alert" : "status");

    toast.innerHTML = `
        <span class="toast-icon">${icon(iconName)}</span>
        <span class="toast-message"></span>
        ${options.actionLabel ? '<button class="toast-action" type="button"></button>' : ""}
        <button class="toast-close" type="button" aria-label="Kapat">${icon("x")}</button>
    `;

    // Set via textContent, not innerHTML — message may contain
    // user-controlled text (filenames, error details).
    toast.querySelector(".toast-message").textContent = message;

    const dismiss = () => {

        toast.classList.add("toast-leaving");

        toast.addEventListener("animationend", () => toast.remove(), { once: true });
    };

    toast.querySelector(".toast-close").addEventListener("click", dismiss);

    const actionButton = toast.querySelector(".toast-action");

    if (actionButton) {

        actionButton.textContent = options.actionLabel;

        actionButton.addEventListener("click", () => {

            try { options.onAction?.(); } finally { dismiss(); }
        });
    }

    root.appendChild(toast);

    if (durationMs > 0) setTimeout(dismiss, durationMs);

    return dismiss;
}

/** Drop-in-ish replacement for prompt() with the same on-brand look. */
export function showPrompt(message, placeholder = "", defaultValue = "") {

    return new Promise(resolve => {

        const overlay = document.createElement("div");

        overlay.className = "toast-confirm-overlay";

        overlay.innerHTML = `
            <div class="toast-confirm-card" role="dialog" aria-modal="true">
                <p class="toast-confirm-message"></p>
                <input type="text" class="toast-prompt-input limit-key-input">
                <div class="toast-confirm-actions">
                    <button class="message-choice-button secondary toast-confirm-cancel">İptal</button>
                    <button class="message-choice-button primary toast-confirm-ok">Tamam</button>
                </div>
            </div>
        `;

        overlay.querySelector(".toast-confirm-message").textContent = message;

        const input = overlay.querySelector(".toast-prompt-input");

        // Set through the DOM, never by string-building the markup —
        // the placeholder/value can contain quotes (chat titles do).
        input.placeholder = placeholder;
        input.value = defaultValue;

        document.body.appendChild(overlay);

        input.focus();
        input.select();

        const close = result => {

            document.removeEventListener("keydown", onKey, true);

            overlay.classList.add("closing");

            setTimeout(() => overlay.remove(), 140);

            resolve(result);
        };

        const onKey = event => {

            if (event.key === "Escape") {

                event.preventDefault();
                event.stopPropagation();

                close(null);
            }
        };

        document.addEventListener("keydown", onKey, true);

        overlay.querySelector(".toast-confirm-cancel").addEventListener("click", () => close(null));
        overlay.querySelector(".toast-confirm-ok").addEventListener("click", () => close(input.value.trim() || null));

        input.addEventListener("keydown", event => {

            if (event.key === "Enter") close(input.value.trim() || null);
        });

        overlay.addEventListener("click", event => {

            if (event.target === overlay) close(null);
        });
    });
}

export function showConfirm(message, { okLabel = "Onayla", danger = false } = {}) {

    return new Promise(resolve => {

        const overlay = document.createElement("div");

        overlay.className = "toast-confirm-overlay";

        overlay.innerHTML = `
            <div class="toast-confirm-card" role="alertdialog" aria-modal="true">
                <p class="toast-confirm-message"></p>
                <div class="toast-confirm-actions">
                    <button class="message-choice-button secondary toast-confirm-cancel">İptal</button>
                    <button class="message-choice-button primary toast-confirm-ok"></button>
                </div>
            </div>
        `;

        overlay.querySelector(".toast-confirm-message").textContent = message;

        const okButton = overlay.querySelector(".toast-confirm-ok");

        okButton.textContent = okLabel;

        if (danger) okButton.classList.add("danger");

        document.body.appendChild(overlay);

        okButton.focus();

        const close = result => {

            document.removeEventListener("keydown", onKey, true);

            overlay.classList.add("closing");

            setTimeout(() => overlay.remove(), 140);

            resolve(result);
        };

        const onKey = event => {

            if (event.key === "Escape") {

                event.preventDefault();
                event.stopPropagation();

                close(false);
            }
        };

        document.addEventListener("keydown", onKey, true);

        overlay.querySelector(".toast-confirm-cancel").addEventListener("click", () => close(false));
        okButton.addEventListener("click", () => close(true));
        overlay.addEventListener("click", event => {

            if (event.target === overlay) close(false);
        });
    });
}
