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
 * WHY THIS CHANGED: the original version called s.jina.ai without
 * a key. Jina now requires an API key for search, so that call
 * failed and was silently swallowed — search quietly never ran.
 * Sources are now tried in this order, first one that returns
 * results wins:
 *
 *   1. the user's own search key (Settings → Sohbet → Web araması):
 *      Tavily or Jina, both have a free tier
 *   2. the Lotus server's /api/search (api/search.js): holds the
 *      keys server-side, falls back to Google News + Wikipedia
 *   3. Wikipedia straight from the browser (keyless, CORS-enabled)
 *      — encyclopedic, NOT breaking news
 *
 * A dead search source never blocks chat: on failure the message
 * just sends without search results.
 * ==========================================================
 */

import config from "./config.js";
import { showToast } from "./toast.js";

const OVERALL_TIMEOUT_MS = 7000;
const MAX_CONTEXT_CHARS = 3500;
const MAX_RESULTS = 5;

// Skip search entirely for short, clearly non-factual chit-chat.
const SKIP_PATTERNS = [
    /^(selam|merhaba|hey|naber|nasılsın|iyiyim|teşekkür|sağol|tamam|peki|evet|hayır|ok)(\s|$|[!.?,])/i
];

const NEWS_HINT = /haber|son dakika|bugün|dün|açıkladı|açıklandı|maç|skor|seçim|dolar|euro|altın|borsa|hava durumu|deprem|gündem/i;

let lastProvider = "";
let hintShown = false;

export function getLastSearchProvider() {

    return lastProvider;
}

/**
 * The text that actually goes to the search engine. The raw message can
 * carry a whole attached file or fetched web page — sending that as a
 * search URL fails outright, and it isn't what the user is asking about.
 */
export function buildSearchQuery(message) {

    return String(message || "")
        .replace(/\[Eklenen dosya:[\s\S]*$/, " ")
        .replace(/\[Sayfa içeriği\][\s\S]*$/, " ")
        .replace(/\[Metin\][\s\S]*$/, " ")
        .replace(/^[\p{Extended_Pictographic}️‍\s]+/u, "")
        .replace(/https?:\/\/\S+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 220);
}

export function shouldSearch(message) {

    const text = String(message || "");

    // Messages that already carry their own source material (an attached
    // file, a fetched page) don't need a second round of search results.
    if (text.includes("[Eklenen dosya:") || text.includes("[Sayfa içeriği]") || text.includes("[Metin]")) return false;

    const query = buildSearchQuery(text);

    if (query.length < 3) return false;

    if (query.length < 25 && SKIP_PATTERNS.some(pattern => pattern.test(query))) return false;

    return true;
}

// ----------------------------------------------------------
// SOURCES
// ----------------------------------------------------------

function clip(text, max) {

    const clean = String(text || "").replace(/\s+/g, " ").trim();

    return clean.length > max ? clean.slice(0, max).trimEnd() + "…" : clean;
}

function detectProvider(key) {

    if (config.searchProvider === "tavily" || config.searchProvider === "jina") return config.searchProvider;

    if (/^tvly-/i.test(key)) return "tavily";

    return "jina";
}

async function viaTavily(query, key, signal) {

    const response = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
        body: JSON.stringify({
            query,
            max_results: MAX_RESULTS,
            search_depth: "basic",
            topic: NEWS_HINT.test(query) ? "news" : "general"
        }),
        signal
    });

    if (!response.ok) throw new Error(`Tavily ${response.status}`);

    const data = await response.json();

    return (data.results || []).map(item => ({
        title: item.title,
        url: item.url,
        snippet: clip(item.content, 420),
        date: item.published_date || ""
    }));
}

async function viaJina(query, key, signal) {

    const response = await fetch(`https://s.jina.ai/?q=${encodeURIComponent(query)}`, {
        headers: {
            "Accept": "application/json",
            "Authorization": `Bearer ${key}`,
            "X-Respond-With": "no-content"
        },
        signal
    });

    if (!response.ok) throw new Error(`Jina ${response.status}`);

    const data = await response.json();

    return (data.data || []).map(item => ({
        title: item.title,
        url: item.url,
        snippet: clip(item.description || item.content, 420),
        date: item.date || ""
    }));
}

async function viaProxy(query, signal) {

    if (!config.useBackendProxy || config.isProxyUnreachable()) throw new Error("proxy yok");

    const response = await fetch(`${config.backendProxyBaseUrl}/api/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
        signal
    });

    if (!response.ok) throw new Error(`proxy ${response.status}`);

    const data = await response.json();

    return { provider: data.provider || "Sunucu", results: Array.isArray(data.results) ? data.results : [] };
}

async function viaWikipedia(query, signal) {

    for (const lang of ["tr", "en"]) {

        const url =
            `https://${lang}.wikipedia.org/w/api.php?action=query&generator=search` +
            `&gsrsearch=${encodeURIComponent(query)}&gsrlimit=3&prop=extracts|info` +
            `&exintro=1&explaintext=1&exlimit=3&exchars=600&inprop=url&format=json&origin=*`;

        const response = await fetch(url, { signal });

        if (!response.ok) continue;

        const data = await response.json();

        const pages = Object.values(data?.query?.pages || {}).sort((a, b) => (a.index || 0) - (b.index || 0));

        const results = pages
            .filter(page => page.extract)
            .map(page => ({ title: page.title, url: page.fullurl, snippet: clip(page.extract, 500), date: "" }));

        if (results.length) return results;
    }

    return [];
}

function formatResults(results, provider) {

    const body = results.slice(0, MAX_RESULTS).map((item, index) => {

        const head = `[${index + 1}] ${clip(item.title, 140)}${item.date ? ` — ${item.date}` : ""}`;

        return `${head}\n${clip(item.snippet, 460)}\n${item.url}`;

    }).join("\n\n");

    const note = provider === "Vikipedi"
        ? "\n\n(Not: Vikipedi özetleri son dakika gelişmelerini içermeyebilir; güncel bir olay soruluyorsa bunu belirt.)"
        : "";

    return `Arama kaynağı: ${provider}\n\n${body}${note}`.slice(0, MAX_CONTEXT_CHARS);
}

/** True when search has a source better than keyless Wikipedia. */
export function isSearchConfigured() {

    return Boolean(config.searchApiKey) || (config.useBackendProxy && !config.isProxyUnreachable());
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

    const text = buildSearchQuery(query);

    if (text.length < 3) return "";

    const controller = new AbortController();

    if (externalController) {

        if (externalController.signal.aborted) controller.abort();

        else externalController.signal.addEventListener("abort", () => controller.abort(), { once: true });
    }

    const timer = setTimeout(() => controller.abort(), OVERALL_TIMEOUT_MS);

    const { signal } = controller;

    lastProvider = "";

    const attempts = [];

    const key = config.searchApiKey;

    if (key) {

        attempts.push(async () => {

            const provider = detectProvider(key);

            const results = provider === "tavily" ? await viaTavily(text, key, signal) : await viaJina(text, key, signal);

            return { provider: provider === "tavily" ? "Tavily" : "Jina", results };
        });
    }

    attempts.push(() => viaProxy(text, signal));

    attempts.push(async () => ({ provider: "Vikipedi", results: await viaWikipedia(text, signal) }));

    try {

        for (const attempt of attempts) {

            try {

                const { provider, results } = await attempt();

                if (results?.length) {

                    lastProvider = provider;

                    return formatResults(results, provider);
                }

            } catch (error) {

                if (error.name === "AbortError") throw error;

                console.warn("🔍 Arama kaynağı başarısız, sıradaki deneniyor:", error.message);
            }
        }

        // Nothing came back. If search was never really set up, tell the
        // user once — otherwise "güncel arama" would fail silently again.
        if (!isSearchConfigured() && !hintShown) {

            hintShown = true;

            showToast("Güncel web araması için Ayarlar → Sohbet bölümüne ücretsiz bir arama anahtarı (Tavily/Jina) ekle.", "info", 7000);
        }

        return "";

    } catch (error) {

        if (error.name === "AbortError" && externalController?.userStopped) {

            const abortedError = new Error("Yanıt kullanıcı tarafından durduruldu.");

            abortedError.userAborted = true;

            throw abortedError;
        }

        console.warn("🔍 Web araması zaman aşımı/engellendi (mesaj yine de gönderiliyor):", error.message);

        return "";

    } finally {

        clearTimeout(timer);
    }
}
