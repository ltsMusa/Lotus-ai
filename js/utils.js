/**
 * ==========================================================
 * Lotus AI - Shared Utilities
 * ==========================================================
 */

export function escapeHtml(value) {

    const div = document.createElement("div");

    div.textContent = String(value ?? "");

    return div.innerHTML;
}

export function generateId() {

    if (window.crypto?.randomUUID) return window.crypto.randomUUID();

    return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

export function formatTime(dateInput) {

    const date = dateInput ? new Date(dateInput) : new Date();

    return date.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
}

export function formatRelativeDate(dateInput) {

    const date = new Date(dateInput);

    const now = new Date();

    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffDays <= 0) return "Bugün";
    if (diffDays === 1) return "Dün";
    if (diffDays < 7) return `${diffDays} gün önce`;

    return date.toLocaleDateString("tr-TR");
}

export function debounce(fn, delay = 300) {

    let timer = null;

    return (...args) => {

        clearTimeout(timer);

        timer = setTimeout(() => fn(...args), delay);
    };
}

/**
 * fetch() with a hard timeout via AbortController.
 * Rejects with an Error whose `.code` is "TIMEOUT" when the
 * request takes longer than `timeoutMs`, so callers can tell
 * a timeout apart from a network failure or an HTTP error.
 */
export async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {

    const controller = new AbortController();

    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {

        return await fetch(url, { ...options, signal: controller.signal });

    } catch (error) {

        if (error.name === "AbortError") {

            const timeoutError = new Error("İstek zaman aşımına uğradı.");

            timeoutError.code = "TIMEOUT";

            throw timeoutError;
        }

        error.code = error.code || "NETWORK";

        throw error;

    } finally {

        clearTimeout(timer);
    }
}
