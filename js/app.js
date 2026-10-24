/**
 * ==========================================================
 * Lotus AI - Application
 * ==========================================================
 * Boots the app: fades the splash screen out and keeps the
 * installed (PWA) copy up to date.
 * ==========================================================
 */

import { showToast } from "./toast.js";
import { isPackagedApp } from "./env.js";

console.log("🌸 Lotus AI başlatılıyor...");

// ----------------------------------------------------------
// SPLASH
// ----------------------------------------------------------
// #app is laid out by the stylesheet (flex row: sidebar + main).
// It used to get an inline `display: block` here, which stacked
// the sidebar on top of the chat on desktop — don't touch it.

const SPLASH_MIN_MS = 1200;
const SPLASH_MAX_MS = 3000;

function hideSplash() {

    const splash = document.getElementById("splash-screen");

    if (!splash || splash.dataset.leaving) return;

    splash.dataset.leaving = "1";

    splash.classList.add("hidden");

    // Free the memory once the fade is over.
    window.setTimeout(() => splash.remove(), 900);

    console.log("🌸 Lotus AI hazır.");
}

function startSplash() {

    const splashText = document.getElementById("splash-text");

    if (splashText) splashText.textContent = "Düşün. Üret. Geliş.";

    const minimum = new Promise(resolve => window.setTimeout(resolve, SPLASH_MIN_MS));

    // Wait for the web fonts too (so the title doesn't jump when it
    // fades in) — but never longer than SPLASH_MAX_MS, and offline the
    // promise settles right away.
    const fonts = document.fonts?.ready
        ? Promise.race([document.fonts.ready, new Promise(resolve => window.setTimeout(resolve, SPLASH_MAX_MS - SPLASH_MIN_MS))])
        : Promise.resolve();

    Promise.all([minimum, fonts]).then(hideSplash, hideSplash);

    // Belt and braces: the splash must never trap the user.
    window.setTimeout(hideSplash, SPLASH_MAX_MS + 500);
}

if (document.readyState === "loading") {

    document.addEventListener("DOMContentLoaded", startSplash);

} else {

    startSplash();
}

// ----------------------------------------------------------
// PWA SERVICE WORKER (offline + "new version" prompt)
// ----------------------------------------------------------
// Needed alongside manifest.json for Android/Chrome to treat Lotus AI
// as an installable app. sw.js is network-first, so a deployed update
// is picked up on the next load; when a new worker finishes installing
// while the app is open, offer a one-tap refresh instead of silently
// swapping files under a running chat.

function offerUpdate(worker) {

    let shown = false;

    const show = () => {

        if (shown) return;

        shown = true;

        showToast("Lotus AI'nin yeni sürümü hazır.", "success", 0, {
            actionLabel: "Yenile",
            onAction: () => worker.postMessage({ type: "SKIP_WAITING" })
        });
    };

    if (worker.state === "installed") show();

    worker.addEventListener("statechange", () => {

        if (worker.state === "installed") show();
    });
}

// Not inside the Android app: files there come straight from the APK, and an
// intercepted private origin is no place for a caching worker.
if ("serviceWorker" in navigator && !isPackagedApp()) {

    window.addEventListener("load", () => {

        navigator.serviceWorker
            .register("./sw.js")
            .then(registration => {

                console.log("🌸 Service worker kayıtlı:", registration.scope);

                // A worker that was already waiting when the page opened.
                if (registration.waiting && navigator.serviceWorker.controller) offerUpdate(registration.waiting);

                registration.addEventListener("updatefound", () => {

                    const worker = registration.installing;

                    // First-ever install: nothing to refresh.
                    if (worker && navigator.serviceWorker.controller) offerUpdate(worker);
                });

                // Look for a new version whenever the app comes back to the foreground.
                document.addEventListener("visibilitychange", () => {

                    if (document.visibilityState === "visible") registration.update().catch(() => {});
                });
            })
            .catch(error => {

                console.warn("⚠️ Service worker kaydedilemedi:", error);
            });

        let reloading = false;

        navigator.serviceWorker.addEventListener("controllerchange", () => {

            if (reloading || !navigator.serviceWorker.controller) return;

            reloading = true;

            window.location.reload();
        });
    });
}
