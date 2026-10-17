/**
 * ==========================================================
 * Lotus AI - Application
 * Version : 4.1
 * Description : Initializes Lotus AI and controls the splash screen.
 * ==========================================================
 */

console.log("🌸 Lotus AI başlatılıyor...");

document.addEventListener("DOMContentLoaded", () => {

    const splash = document.getElementById("splash-screen");
    const app = document.getElementById("app");
    const splashText = document.getElementById("splash-text");

    if (splashText) {
        splashText.textContent = "Düşün. Üret. Geliş.";
    }

    if (app) {
        app.style.display = "block";
    }

    window.setTimeout(() => {

        splash?.classList.add("hidden");

        console.log("🌸 Lotus AI hazır.");

    }, 1600);

});

// ----------------------------------------------------------
// PWA SERVICE WORKER
// ----------------------------------------------------------
// Required (alongside manifest.json) for Android/Chrome to
// treat Lotus AI as a real installable app — a manifest alone
// does not trigger the install prompt.

if ("serviceWorker" in navigator) {

    window.addEventListener("load", () => {

        navigator.serviceWorker
            .register("./sw.js")
            .then(registration => {

                console.log("🌸 Service worker kayıtlı:", registration.scope);
            })
            .catch(error => {

                console.warn("⚠️ Service worker kaydedilemedi:", error);
            });
    });
}
