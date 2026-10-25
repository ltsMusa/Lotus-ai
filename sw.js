/**
 * ==========================================================
 * Lotus AI - Service Worker
 * ==========================================================
 * Makes Lotus AI installable (Chrome needs a registered worker
 * with a fetch handler) and lets the app shell open offline.
 *
 * Strategy
 *  - API / AI / database calls      → network only (a cached AI
 *                                     answer would be plain wrong)
 *  - pages, scripts, styles, fonts  → NETWORK FIRST, cache as the
 *                                     offline fallback. The old
 *                                     cache-first worker kept
 *                                     serving the first version of
 *                                     every file forever, so users
 *                                     never saw an update.
 *  - images / fonts / icons         → stale-while-revalidate
 *
 * Bump VERSION when you want every client to drop its old cache.
 * (A new sw.js is detected by the browser on its own — app.js then
 * offers a one-tap "Yenile" refresh.)
 * ==========================================================
 */

const VERSION = "7.0";
const SHELL_CACHE = `lotus-shell-${VERSION}`;
const ASSET_CACHE = `lotus-assets-${VERSION}`;

const APP_SHELL = [
    "./",
    "./index.html",
    "./manifest.json",
    "./css/animations.css",
    "./css/chat.css",
    "./css/fonts.css",
    "./css/main.css",
    "./css/markdown.css",
    "./css/premium.css",
    "./css/settings.css",
    "./css/themes.css",
    "./js/api.js",
    "./js/app.js",
    "./js/attachments.js",
    "./js/auth.js",
    "./js/autoSwitch.js",
    "./js/chat.js",
    "./js/clipboard.js",
    "./js/commands.js",
    "./js/composer.js",
    "./js/config.js",
    "./js/deviceMonitor.js",
    "./js/deviceProfile.js",
    "./js/env.js",
    "./js/imageGen.js",
    "./js/localModels.js",
    "./js/localPolicy.js",
    "./js/markdown.js",
    "./js/memory.js",
    "./js/personalization.js",
    "./js/prompts/systemPrompt.js",
    "./js/providers/gemini.js",
    "./js/providers/groq.js",
    "./js/providers/local.js",
    "./js/providers/ollama.js",
    "./js/providers/openai.js",
    "./js/providers/openrouter.js",
    "./js/providers/providerError.js",
    "./js/quickActions.js",
    "./js/router.js",
    "./js/settings.js",
    "./js/settingsLocal.js",
    "./js/sidebar.js",
    "./js/speech.js",
    "./js/statusIndicator.js",
    "./js/storage.js",
    "./js/streaming.js",
    "./js/themeList.js",
    "./js/themes.js",
    "./js/toast.js",
    "./js/tools.js",
    "./js/ui.js",
    "./js/utils.js",
    "./js/viewer.js",
    "./js/webAnalyze.js",
    "./js/webSearch.js",
    "./assets/icons/icon-192.png",
    "./assets/icons/icon-512.png",
    "./assets/icons/logo.png",
    "./assets/fonts/CormorantGaramond-Regular.ttf",
    "./assets/fonts/DMSans_18pt-Regular.ttf"
];

// ------------------------------------------------------
// INSTALL — pre-cache the shell (one missing file must not
// make the whole install fail, so each is added on its own)
// ------------------------------------------------------

self.addEventListener("install", event => {

    event.waitUntil(
        caches.open(SHELL_CACHE).then(cache =>
            Promise.all(APP_SHELL.map(url => cache.add(url).catch(() => null)))
        )
    );

    // No skipWaiting() here: the page asks for it (SKIP_WAITING) when
    // the user taps "Yenile", so a running chat is never swapped
    // underneath them.
});

self.addEventListener("message", event => {

    if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

// ------------------------------------------------------
// ACTIVATE — drop caches from older versions
// ------------------------------------------------------

self.addEventListener("activate", event => {

    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys
                    .filter(key => key !== SHELL_CACHE && key !== ASSET_CACHE)
                    .map(key => caches.delete(key))
            ))
            .then(() => self.clients.claim())
    );
});

// ------------------------------------------------------
// FETCH
// ------------------------------------------------------

const NETWORK_ONLY = [
    /\/api\//,
    /supabase\.co/,
    /groq\.com/,
    /openai\.com/,
    /openrouter\.ai/,
    /generativelanguage\.googleapis\.com/,
    /pollinations\.ai/,
    /jina\.ai/,
    /tavily\.com/,
    /search\.brave\.com/,
    /duckduckgo\.com/,
    /wikipedia\.org/,
    /localhost:11434/,
    /huggingface\.co/,
    /hf\.co/,
    /\/models\/.*\.gguf/i
];

const isAsset = request =>
    request.destination === "image" || request.destination === "font";

async function networkFirst(request) {

    try {

        const response = await fetch(request);

        if (response && response.ok && response.type === "basic") {

            const copy = response.clone();

            caches.open(SHELL_CACHE).then(cache => cache.put(request, copy));
        }

        return response;

    } catch (error) {

        const cached = await caches.match(request, { ignoreSearch: true });

        if (cached) return cached;

        // Offline navigation → the cached app shell.
        if (request.mode === "navigate") {

            const shell = await caches.match("./index.html");

            if (shell) return shell;
        }

        throw error;
    }
}

async function staleWhileRevalidate(request) {

    const cache = await caches.open(ASSET_CACHE);

    const cached = await cache.match(request);

    const refresh = fetch(request)
        .then(response => {

            if (response && response.ok) cache.put(request, response.clone());

            return response;
        })
        .catch(() => cached);

    return cached || refresh;
}

self.addEventListener("fetch", event => {

    const { request } = event;

    if (request.method !== "GET") return;

    if (NETWORK_ONLY.some(pattern => pattern.test(request.url))) return; // browser default

    const sameOrigin = new URL(request.url).origin === self.location.origin;

    if (!sameOrigin) return;

    if (isAsset(request)) {

        event.respondWith(staleWhileRevalidate(request));

        return;
    }

    event.respondWith(networkFirst(request));
});
