/**
 * ==========================================================
 * Lotus AI - Web Search Proxy (Vercel Serverless Function)
 * ==========================================================
 * Gives the app current web results without putting any search
 * API key in the browser. js/webSearch.js calls this when the
 * user hasn't entered a personal search key.
 *
 * Sources, first one that returns results wins:
 *   1. TAVILY_API_KEY  (or TAVILY_API_KEYS="k1,k2")   free tier
 *   2. JINA_API_KEY    (or JINA_API_KEYS)             free tier
 *   3. BRAVE_API_KEY   (or BRAVE_API_KEYS)            free tier
 *   4. keyless fallback: Google News RSS + Wikipedia
 *
 * Request : POST { query: string }
 * Response: { provider, results: [{ title, url, snippet, date }] }
 *
 * DEPLOY: set at least one key as a Vercel environment variable
 * (e.g. `vercel env add TAVILY_API_KEY`). With none set, the
 * keyless fallback still works, but it is headlines + encyclopedia
 * summaries, not full web search.
 * ==========================================================
 */

const TIMEOUT_MS = 6000;
const MAX_RESULTS = 5;

const requestLog = new Map();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 30;

function isRateLimited(clientId) {

    const now = Date.now();

    const timestamps = (requestLog.get(clientId) || []).filter(ts => now - ts < RATE_LIMIT_WINDOW_MS);

    timestamps.push(now);

    requestLog.set(clientId, timestamps);

    return timestamps.length > RATE_LIMIT_MAX;
}

function setCors(res) {

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Max-Age", "86400");
}

function keyPool(base) {

    const plural = process.env[`${base}S`];

    if (plural) return plural.split(",").map(key => key.trim()).filter(Boolean);

    return process.env[base] ? [process.env[base]] : [];
}

function clip(text, max) {

    const clean = String(text || "").replace(/\s+/g, " ").trim();

    return clean.length > max ? clean.slice(0, max).trimEnd() + "…" : clean;
}

function decodeEntities(text) {

    return String(text || "")
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, "\"")
        .replace(/&#39;|&apos;/g, "'")
        .replace(/&amp;/g, "&");
}

function stripTags(text) {

    return decodeEntities(text).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

const NEWS_HINT = /haber|son dakika|bugün|dün|açıkladı|açıklandı|maç|skor|seçim|dolar|euro|altın|borsa|hava durumu|deprem|gündem/i;

// ----------------------------------------------------------
// KEYED SOURCES — each throws on a non-2xx so the pool / chain
// can move on; a 429/401 rotates to the next key.
// ----------------------------------------------------------

async function tavily(query, key, signal) {

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

    if (!response.ok) throw Object.assign(new Error(`Tavily ${response.status}`), { status: response.status });

    const data = await response.json();

    return (data.results || []).map(item => ({
        title: item.title,
        url: item.url,
        snippet: clip(item.content, 420),
        date: item.published_date || ""
    }));
}

async function jina(query, key, signal) {

    const response = await fetch(`https://s.jina.ai/?q=${encodeURIComponent(query)}`, {
        headers: { "Accept": "application/json", "Authorization": `Bearer ${key}`, "X-Respond-With": "no-content" },
        signal
    });

    if (!response.ok) throw Object.assign(new Error(`Jina ${response.status}`), { status: response.status });

    const data = await response.json();

    return (data.data || []).slice(0, MAX_RESULTS).map(item => ({
        title: item.title,
        url: item.url,
        snippet: clip(item.description || item.content, 420),
        date: item.date || ""
    }));
}

async function brave(query, key, signal) {

    const url =
        `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}` +
        `&count=${MAX_RESULTS}&search_lang=tr&country=TR`;

    const response = await fetch(url, {
        headers: { "Accept": "application/json", "X-Subscription-Token": key },
        signal
    });

    if (!response.ok) throw Object.assign(new Error(`Brave ${response.status}`), { status: response.status });

    const data = await response.json();

    return (data?.web?.results || []).slice(0, MAX_RESULTS).map(item => ({
        title: stripTags(item.title),
        url: item.url,
        snippet: clip(stripTags(item.description), 420),
        date: item.age || ""
    }));
}

async function tryPool(base, searcher, query, signal) {

    for (const key of keyPool(base)) {

        try {

            const results = await searcher(query, key, signal);

            if (results.length) return results;

        } catch (error) {

            if (error.name === "AbortError") throw error;

            // 401/402/429 → this key is spent or bad; try the next one.
            console.warn(`⚠️ ${base} anahtarı başarısız (${error.message}), sıradaki deneniyor...`);
        }
    }

    return [];
}

// ----------------------------------------------------------
// KEYLESS FALLBACK
// ----------------------------------------------------------

async function googleNews(query, signal) {

    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=tr&gl=TR&ceid=TR:tr`;

    const response = await fetch(url, { signal, headers: { "User-Agent": "Mozilla/5.0 (compatible; LotusAI/1.0)" } });

    if (!response.ok) throw new Error(`Google News ${response.status}`);

    const xml = await response.text();

    const tag = (block, name) => (block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`)) || [])[1] || "";

    return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 6).map(match => {

        const block = match[1];

        const published = new Date(decodeEntities(tag(block, "pubDate")));

        const source = stripTags(tag(block, "source"));

        return {
            title: stripTags(tag(block, "title")),
            url: decodeEntities(tag(block, "link")).trim(),
            snippet: source ? `Kaynak: ${source}` : "",
            date: isNaN(published) ? "" : published.toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" })
        };

    }).filter(item => item.title && item.url);
}

async function wikipedia(query, signal) {

    for (const lang of ["tr", "en"]) {

        const url =
            `https://${lang}.wikipedia.org/w/api.php?action=query&generator=search` +
            `&gsrsearch=${encodeURIComponent(query)}&gsrlimit=3&prop=extracts|info` +
            `&exintro=1&explaintext=1&exlimit=3&exchars=600&inprop=url&format=json`;

        const response = await fetch(url, { signal, headers: { "User-Agent": "LotusAI/1.0 (web search proxy)" } });

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

async function keyless(query, signal) {

    const [news, wiki] = await Promise.allSettled([googleNews(query, signal), wikipedia(query, signal)]);

    const newsResults = news.status === "fulfilled" ? news.value : [];
    const wikiResults = wiki.status === "fulfilled" ? wiki.value : [];

    // Headlines first when the question smells like current events.
    const merged = NEWS_HINT.test(query)
        ? [...newsResults.slice(0, 4), ...wikiResults.slice(0, 1)]
        : [...wikiResults.slice(0, 2), ...newsResults.slice(0, 3)];

    const label =
        newsResults.length && wikiResults.length ? "Google Haberler + Vikipedi" :
        newsResults.length ? "Google Haberler" :
        wikiResults.length ? "Vikipedi" : "";

    return { provider: label, results: merged.slice(0, MAX_RESULTS) };
}

// ----------------------------------------------------------
// HANDLER
// ----------------------------------------------------------

export default async function handler(req, res) {

    setCors(res);

    if (req.method === "OPTIONS") {

        res.status(204).end();

        return;
    }

    if (req.method !== "POST") {

        res.status(405).json({ error: "Yalnızca POST destekleniyor." });

        return;
    }

    const clientId = req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown";

    if (isRateLimited(clientId)) {

        res.status(429).json({ error: "Çok fazla arama isteği." });

        return;
    }

    const query = String(req.body?.query || "").replace(/\s+/g, " ").trim().slice(0, 300);

    if (query.length < 3) {

        res.status(400).json({ error: "'query' gerekli." });

        return;
    }

    const controller = new AbortController();

    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {

        const chain = [
            ["Tavily", () => tryPool("TAVILY_API_KEY", tavily, query, controller.signal)],
            ["Jina", () => tryPool("JINA_API_KEY", jina, query, controller.signal)],
            ["Brave", () => tryPool("BRAVE_API_KEY", brave, query, controller.signal)]
        ];

        for (const [provider, run] of chain) {

            const results = await run();

            if (results.length) {

                res.status(200).json({ provider, results });

                return;
            }
        }

        const fallback = await keyless(query, controller.signal);

        res.status(200).json(fallback);

    } catch (error) {

        if (error.name === "AbortError") {

            res.status(504).json({ error: "Arama zaman aşımına uğradı." });

            return;
        }

        console.error("Lotus search proxy error:", error);

        res.status(500).json({ error: "Arama sunucu hatası." });

    } finally {

        clearTimeout(timer);
    }
}
