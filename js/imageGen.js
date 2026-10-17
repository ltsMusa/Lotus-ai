/**
 * ==========================================================
 * Lotus AI - Image Generation
 * ==========================================================
 * "Görsel Oluştur" quick action previously just filled the
 * input with starter text — clicking it didn't actually
 * generate anything, despite the label implying it would.
 *
 * Uses Pollinations.ai's free, keyless text-to-image endpoint
 * (https://image.pollinations.ai/prompt/<text>) — no API key,
 * no account, no backend needed. It's a public third-party
 * service: no uptime guarantee, and prompts are sent to their
 * servers, not Lotus AI's.
 * ==========================================================
 */

export async function generateImage(prompt) {

    const seed = Math.floor(Math.random() * 1_000_000);

    const url =
        `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}` +
        `?width=768&height=768&seed=${seed}&nologo=true`;

    // The endpoint returns the image directly with no JSON wrapper —
    // there's nothing meaningful to await beyond confirming it loads,
    // so we preload it as an Image() and let the caller use `url`
    // once this resolves (or reject with a clear reason if it fails).
    await new Promise((resolve, reject) => {

        const preload = new Image();

        preload.onload = () => resolve();

        preload.onerror = () => reject(new Error(
            "Görsel üretilemedi. Pollinations.ai şu an ulaşılamıyor olabilir, ya da istek reddedildi."
        ));

        preload.src = url;
    });

    return url;
}
