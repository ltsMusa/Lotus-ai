/**
 * ==========================================================
 * Lotus AI - Service Worker
 * ==========================================================
 * A manifest.json alone is NOT enough for Android to treat
 * Lotus AI as an installable PWA (a "gerçek yükle isteği" /
 * beforeinstallprompt) — Chrome also requires a registered
 * service worker with a fetch handler. This is the minimal
 * version of that: cache the static app shell so the UI still
 * loads (offline / flaky network), while every API/AI request
 * always goes to the network — cached AI answers would be
 * actively wrong.
 *
 * Bump CACHE_NAME whenever the app-shell file list below
 * changes, so old clients pick up the new files instead of
 * serving a stale cached shell forever.
 * ==========================================================
 */

const CACHE_NAME = "lotus-shell-v1";

const APP_SHELL = [
    "./",
    "./index.html",
    "./manifest.json",
    "./css/main.css",
    "./css/chat.css",
    "./css/settings.css",
    "./css/themes.css",
    "./css/fonts.css",
    "./js/app.js",
    "./js/api.js",
    "./js/auth.js",
    "./js/chat.js",
    "./js/commands.js",
    "./js/config.js",
    "./js/markdown.js",
    "./js/memory.js",
    "./js/settings.js",
    "./js/speech.js",
    "./js/storage.js",
    "./js/themes.js",
    "./js/ui.js",
    "./js/utils.js",
    "./assets/icons/icon-192.png",
    "./assets/icons/icon-512.png",
    "./assets/fonts/CormorantGaramond-Regular.ttf",
    "./assets/fonts/DMSans_18pt-Regular.ttf"
];

// ------------------------------------------------------
// INSTALL — pre-cache the app shell
// ------------------------------------------------------

self.addEventListener("install", event => {

    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(APP_SHELL))
            .then(() => self.skipWaiting())
    );
});

// ------------------------------------------------------
// ACTIVATE — drop old caches from previous versions
// ------------------------------------------------------

self.addEventListener("activate", event => {

    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys
                    .filter(key => key !== CACHE_NAME)
                    .map(key => caches.delete(key))
            ))
            .then(() => self.clients.claim())
    );
});

// ------------------------------------------------------
// FETCH
// ------------------------------------------------------
// AI providers, the Vercel proxy (/api/*), and Supabase must
// never be served from cache — always hit the network.
// Everything else: cache-first, falling back to network and
// caching the result for next time.
// ------------------------------------------------------

const NETWORK_ONLY_PATTERNS = [
    /\/api\//,
    /supabase\.co/,
    /groq\.com/,
    /openai\.com/,
    /openrouter\.ai/,
    /generativelanguage\.googleapis\.com/
];

self.addEventListener("fetch", event => {

    if (event.request.method !== "GET") return;

    const url = event.request.url;

    if (NETWORK_ONLY_PATTERNS.some(pattern => pattern.test(url))) {

        event.respondWith(fetch(event.request));

        return;
    }

    event.respondWith(
        caches.match(event.request).then(cached => {

            if (cached) return cached;

            return fetch(event.request).then(response => {

                if (response.ok) {

                    const clone = response.clone();

                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                }

                return response;

            }).catch(() => cached);
        })
    );
});
