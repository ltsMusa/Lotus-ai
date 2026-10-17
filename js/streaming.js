/**
 * ==========================================================
 * Lotus AI - Streaming (SSE) Helper
 * ==========================================================
 * Shared by every provider (direct calls) AND by the backend
 * proxy path in api.js, so there's one place that knows how to
 * read a Server-Sent-Events response body and hand back parsed
 * JSON events.
 * ==========================================================
 */

import { ProviderError, classifyHttpStatus } from "./providers/providerError.js";

/**
 * POSTs to `url`, reads the response as SSE, and calls
 * onEvent(parsedJson) for every "data: {...}" line. Lines that
 * aren't valid JSON (or the "[DONE]" sentinel) are ignored.
 * Aborts after `timeoutMs` of total stream time, OR immediately
 * if `externalController` (the Stop button's controller from
 * chat.js) aborts. Either way the caller just gets a thrown
 * ProviderError — check `.code`: "ABORTED" for a user-initiated
 * stop, "TIMEOUT" for the timeout.
 */
export async function streamSSE(url, fetchOptions, onEvent, providerLabel = "Sağlayıcı", timeoutMs = 60000, externalController = null) {

    // IMPORTANT: always use our OWN controller for this one attempt,
    // never the shared externalController directly. AbortController
    // can only ever be aborted once — if every fallback provider in
    // api.js's loop shared the same controller, one provider timing
    // out would permanently abort it, and every subsequent fallback
    // attempt in the same request would instantly fail as "timed out"
    // without even trying. Instead we relay: if the external ("Stop"
    // button) controller aborts, this attempt's own controller aborts
    // too — but a timeout on THIS attempt never touches the external
    // one, so the next fallback attempt still gets a clean, working
    // controller.
    const controller = new AbortController();

    if (externalController) {

        if (externalController.signal.aborted) {

            controller.userStopped = true;
            controller.abort();

        } else {

            externalController.signal.addEventListener("abort", () => {

                controller.userStopped = true;
                controller.abort();

            }, { once: true });
        }
    }

    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response;

    try {

        response = await fetch(url, { ...fetchOptions, signal: controller.signal });

    } catch (error) {

        clearTimeout(timer);

        if (error.name === "AbortError") {

            if (controller.userStopped) {

                throw new ProviderError("Yanıt kullanıcı tarafından durduruldu.", "ABORTED");
            }

            throw new ProviderError(`${providerLabel} zaman aşımına uğradı.`, "TIMEOUT");
        }

        throw new ProviderError(`${providerLabel} bağlantısı başarısız.`, "NETWORK");
    }

    if (!response.ok || !response.body) {

        clearTimeout(timer);

        let detail = "";
        let keysExhausted = false;

        try {

            const errorBody = await response.json();

            detail = errorBody?.error || "";
            keysExhausted = Boolean(errorBody?.keysExhausted);

        } catch { /* not JSON, ignore */ }

        // A dedicated code: every key in the server-side pool for this
        // provider is rate-limited right now — distinct from a plain
        // "RATE_LIMIT" so callers know retrying the same provider is
        // pointless until the window resets, not just this one request.
        if (keysExhausted) {

            throw new ProviderError(detail || `${providerLabel} için tüm anahtarlar limitte.`, "KEYS_EXHAUSTED");
        }

        const code = classifyHttpStatus(response.status);

        throw new ProviderError(detail || `${providerLabel} hatası (${response.status})`, code);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    let buffer = "";

    try {

        while (true) {

            const { value, done } = await reader.read();

            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            const lines = buffer.split("\n");

            buffer = lines.pop() ?? "";

            for (const line of lines) {

                const trimmed = line.trim();

                if (!trimmed.startsWith("data:")) continue;

                const payload = trimmed.slice(5).trim();

                if (!payload || payload === "[DONE]") continue;

                try {

                    onEvent(JSON.parse(payload));

                } catch {

                    // Partial/non-JSON chunk — normal for SSE line
                    // splitting across reads, safe to skip.
                }
            }
        }

    } catch (error) {

        if (error.name === "AbortError") {

            throw new ProviderError(
                controller.userStopped ? "Yanıt kullanıcı tarafından durduruldu." : `${providerLabel} zaman aşımına uğradı.`,
                controller.userStopped ? "ABORTED" : "TIMEOUT"
            );
        }

        throw error;

    } finally {

        clearTimeout(timer);
    }
}

export function extractOpenAIDelta(json) {

    return json?.choices?.[0]?.delta?.content || "";
}

export function extractGeminiDelta(json) {

    return json?.candidates?.[0]?.content?.parts?.map(part => part.text).join("") || "";
}
