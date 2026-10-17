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
 * @param {number} durationMs
 */
export function showToast(message, type = "info", durationMs = 4000) {

    const root = ensureContainer();

    const toast = document.createElement("div");

    toast.className = `toast toast-${type}`;

    const icon = { info: "ℹ️", error: "⚠️", success: "✅" }[type] || "ℹ️";

    toast.innerHTML = `
        <span class="toast-icon">${icon}</span>
        <span class="toast-message"></span>
        <button class="toast-close" aria-label="Kapat">✕</button>
    `;

    // Set via textContent, not innerHTML — message may contain
    // user-controlled text (filenames, error details).
    toast.querySelector(".toast-message").textContent = message;

    const dismiss = () => {

        toast.classList.add("toast-leaving");

        toast.addEventListener("animationend", () => toast.remove(), { once: true });
    };

    toast.querySelector(".toast-close").addEventListener("click", dismiss);

    root.appendChild(toast);

    if (durationMs > 0) setTimeout(dismiss, durationMs);

    return dismiss;
}

/** Drop-in-ish replacement for prompt() with the same on-brand look. */
export function showPrompt(message, placeholder = "") {

    return new Promise(resolve => {

        const overlay = document.createElement("div");

        overlay.className = "toast-confirm-overlay";

        overlay.innerHTML = `
            <div class="toast-confirm-card">
                <p class="toast-confirm-message"></p>
                <input type="text" class="toast-prompt-input limit-key-input" placeholder="${placeholder}">
                <div class="toast-confirm-actions">
                    <button class="message-choice-button secondary toast-confirm-cancel">İptal</button>
                    <button class="message-choice-button primary toast-confirm-ok">Tamam</button>
                </div>
            </div>
        `;

        overlay.querySelector(".toast-confirm-message").textContent = message;

        const input = overlay.querySelector(".toast-prompt-input");

        document.body.appendChild(overlay);

        input.focus();

        const close = result => {

            overlay.remove();

            resolve(result);
        };

        overlay.querySelector(".toast-confirm-cancel").addEventListener("click", () => close(null));
        overlay.querySelector(".toast-confirm-ok").addEventListener("click", () => close(input.value.trim() || null));

        input.addEventListener("keydown", event => {

            if (event.key === "Enter") close(input.value.trim() || null);

            if (event.key === "Escape") close(null);
        });

        overlay.addEventListener("click", event => {

            if (event.target === overlay) close(null);
        });
    });
}
export function showConfirm(message) {

    return new Promise(resolve => {

        const overlay = document.createElement("div");

        overlay.className = "toast-confirm-overlay";

        overlay.innerHTML = `
            <div class="toast-confirm-card">
                <p class="toast-confirm-message"></p>
                <div class="toast-confirm-actions">
                    <button class="message-choice-button secondary toast-confirm-cancel">İptal</button>
                    <button class="message-choice-button primary toast-confirm-ok">Onayla</button>
                </div>
            </div>
        `;

        overlay.querySelector(".toast-confirm-message").textContent = message;

        document.body.appendChild(overlay);

        const close = result => {

            overlay.remove();

            resolve(result);
        };

        overlay.querySelector(".toast-confirm-cancel").addEventListener("click", () => close(false));
        overlay.querySelector(".toast-confirm-ok").addEventListener("click", () => close(true));
        overlay.addEventListener("click", event => {

            if (event.target === overlay) close(false);
        });
    });
}
