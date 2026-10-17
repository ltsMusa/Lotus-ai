/**
 * ==========================================================
 * Lotus AI - Automatic Web Search
 * ==========================================================
 * "Her mesajda otomatik web araması yapsın, her bilgi güncel
 * olmalı" — every message gets a quick web search whose results
 * are injected into the system prompt (see buildSystemPrompt's
 * searchContext), so the model answers from real current
 * information instead of extrapolating from its training data.
 *
 * Uses s.jina.ai's free, keyless search-reader endpoint — same
 * family of service as js/webAnalyze.js's r.jina.ai, so it
 * shares the same honesty caveat: it's a public third-party
 * service with no uptime guarantee. If it's unreachable, search
 * is silently skipped and the message still sends — a slow or
 * dead search endpoint should never block chat entirely.
 * ==========================================================
 */

const SEARCH_TIMEOUT_MS = 6000;
const MAX_RESULT_CHARS = 3000;

// Skip search entirely for short, clearly non-factual chit-chat —
// saves a network round trip on "selam", "teşekkürler", etc. Anything
// longer or that looks like a real question still gets searched.
const SKIP_PATTERNS = [
    /^(selam|merhaba|hey|naber|nasılsın|iyiyim|teşekkür|sağol|tamam|peki|evet|hayır|ok)\b/i
];

export function shouldSearch(message) {

    const trimmed = message.trim();

    if (trimmed.length < 3) return false;

    if (trimmed.length < 25 && SKIP_PATTERNS.some(pattern => pattern.test(trimmed))) return false;

    return true;
}

/**
 * @param {string} query
 * @param {AbortController} [externalController] - chat.js's Stop-button
 *   controller. If the user hits Stop while this is running, it throws
 *   an error with `.userAborted = true` so callers can distinguish "the
 *   user cancelled the whole request" from "search just failed/timed
 *   out" (the latter returns "" and lets the message send anyway).
 */
export async function searchWeb(query, externalController = null) {

    const controller = new AbortController();

    if (externalController) {

        if (externalController.signal.aborted) controller.abort();

        else externalController.signal.addEventListener("abort", () => controller.abort(), { once: true });
    }

    const timer = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);

    try {

        const response = await fetch(`https://s.jina.ai/${encodeURIComponent(query)}`, {
            headers: { "Accept": "text/plain" },
            signal: controller.signal
        });

        if (!response.ok) return "";

        const text = (await response.text()).trim();

        if (!text) return "";

        return text.length > MAX_RESULT_CHARS ? text.slice(0, MAX_RESULT_CHARS) : text;

    } catch (error) {

        if (error.name === "AbortError" && externalController?.userStopped) {

            const abortedError = new Error("Yanıt kullanıcı tarafından durduruldu.");

            abortedError.userAborted = true;

            throw abortedError;
        }

        // Network failure, timeout, blocked — search is a best-effort
        // enhancement, never a hard requirement to send a message.
        console.warn("🔍 Web araması başarısız (mesaj yine de gönderiliyor):", error.message);

        return "";

    } finally {

        clearTimeout(timer);
    }
}
