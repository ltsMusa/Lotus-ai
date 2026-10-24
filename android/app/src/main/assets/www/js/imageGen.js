/**
 * ==========================================================
 * Lotus AI - Image Generation
 * ==========================================================
 * Uses Pollinations.ai's keyless text-to-image endpoint
 * (https://image.pollinations.ai/prompt/<text>) — no key, no
 * account, no backend.
 *
 * HONEST LIMITS (checked Oct 2026): this is a free third-party
 * service. Anonymous use is throttled to roughly one image every
 * 15 seconds and may carry a watermark; Pollinations' newer
 * gen.pollinations.ai API needs a key and the keyless endpoint
 * is not formally guaranteed. So this file:
 *   - waits and retries when the service pushes back (a throttled
 *     request looks like a plain load error to the browser),
 *   - can be stopped by the Stop button,
 *   - fails with a clear message instead of hanging forever.
 *
 * The chat stores the image as a plain markdown URL, so reopening
 * an old chat asks the service for it again (see the retry card in
 * js/viewer.js for images that fail to load later).
 * ==========================================================
 */

const ATTEMPT_TIMEOUT_MS = 50000;
const RETRY_DELAYS_MS = [6000, 16000];

function abortError() {

    const error = new Error("Yanıt kullanıcı tarafından durduruldu.");

    error.code = "ABORTED";

    return error;
}

function wait(ms, signal) {

    return new Promise((resolve, reject) => {

        if (signal?.aborted) {

            reject(abortError());

            return;
        }

        const timer = setTimeout(resolve, ms);

        signal?.addEventListener("abort", () => {

            clearTimeout(timer);

            reject(abortError());

        }, { once: true });
    });
}

function preload(url, signal) {

    return new Promise((resolve, reject) => {

        if (signal?.aborted) {

            reject(abortError());

            return;
        }

        const image = new Image();

        const finish = (callback, value) => {

            clearTimeout(timer);

            image.onload = null;
            image.onerror = null;

            callback(value);
        };

        const timer = setTimeout(() => {

            // Stop downloading and treat as a failed attempt.
            image.src = "";

            finish(reject, new Error("TIMEOUT"));

        }, ATTEMPT_TIMEOUT_MS);

        image.onload = () => finish(resolve);

        image.onerror = () => finish(reject, new Error("LOAD_FAILED"));

        signal?.addEventListener("abort", () => {

            image.src = "";

            finish(reject, abortError());

        }, { once: true });

        image.src = url;
    });
}

/**
 * @param {string} prompt
 * @param {{ signal?: AbortSignal, onStatus?: (label: string) => void }} [options]
 * @returns {Promise<string>} the image URL, once it has actually loaded
 */
export async function generateImage(prompt, { signal, onStatus } = {}) {

    const seed = Math.floor(Math.random() * 1_000_000);

    const url =
        `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}` +
        `?width=768&height=768&seed=${seed}&nologo=true&referrer=lotus-ai`;

    let lastError = null;

    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {

        try {

            await preload(url, signal);

            return url;

        } catch (error) {

            if (error.code === "ABORTED") throw error;

            lastError = error;

            if (attempt < RETRY_DELAYS_MS.length) {

                onStatus?.("Görsel servisi yoğun, tekrar deneniyor...");

                await wait(RETRY_DELAYS_MS[attempt], signal);

                onStatus?.("Görsel oluşturuluyor...");
            }
        }
    }

    const reason = lastError?.message === "TIMEOUT" ? "Servis zamanında yanıt vermedi." : "Servis isteği reddetti veya ulaşılamadı.";

    throw new Error(
        `Görsel üretilemedi. ${reason} Ücretsiz Pollinations.ai servisi yoğun olabilir ` +
        "(anonim kullanımda yaklaşık 15 saniyede bir görsel sınırı var) — biraz bekleyip tekrar dene."
    );
}
