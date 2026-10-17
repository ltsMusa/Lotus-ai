/**
 * ==========================================================
 * Lotus AI - Web Page Analysis
 * ==========================================================
 * "Web Analiz" quick action previously just filled the input
 * with starter text — the AI had no actual page content to
 * analyze, only whatever it already knew from training.
 *
 * This fetches the REAL page content via a public CORS proxy
 * (browsers block direct cross-origin fetches of arbitrary
 * sites), strips it down to plain text, and hands that to the
 * AI as context — the same "attach text" mechanism
 * js/attachments.js uses for files.
 *
 * Honesty note: this depends on a free public CORS proxy
 * (r.jina.ai's reader endpoint, which returns clean extracted
 * text specifically for this purpose). No uptime guarantee —
 * if it's down or blocked in your network, this fails with a
 * clear error rather than silently returning nothing.
 * ==========================================================
 */

const MAX_CHARS = 8000;

export async function fetchPageText(rawUrl) {

    let url;

    try {

        url = new URL(rawUrl.trim());

        if (!["http:", "https:"].includes(url.protocol)) throw new Error("not http(s)");

    } catch {

        throw new Error("Geçerli bir link değil. http:// veya https:// ile başlayan tam bir adres gir.");
    }

    // r.jina.ai/<url> fetches the page server-side and returns
    // readable extracted text — no CORS issues, no HTML parsing
    // needed on our end.
    const readerUrl = `https://r.jina.ai/${url.toString()}`;

    let response;

    try {

        response = await fetch(readerUrl);

    } catch (error) {

        throw new Error("Sayfaya ulaşılamadı. İnterneti kontrol et veya farklı bir link dene.");
    }

    if (!response.ok) {

        throw new Error(`Sayfa alınamadı (${response.status}). Link doğru mu?`);
    }

    const text = (await response.text()).trim();

    if (!text) {

        throw new Error("Sayfadan okunabilir bir metin çıkarılamadı.");
    }

    const truncated = text.length > MAX_CHARS;

    return {
        url: url.toString(),
        text: truncated ? text.slice(0, MAX_CHARS) : text,
        truncated
    };
}
