/**
 * ==========================================================
 * Lotus AI - Application
 * Version : 3.0 Alpha
 * Description : Initializes Lotus AI.
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

    setTimeout(() => {

        if (splash) {
            splash.classList.add("hidden");
        }

        console.log("🌸 Lotus AI hazır.");

    }, 1800);

});
