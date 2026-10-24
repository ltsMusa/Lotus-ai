/**
 * ==========================================================
 * Lotus AI - Connection/Generating Status Indicator
 * ==========================================================
 * The "● Hazır" badge in the header existed as static markup —
 * it always said "Hazır" (Ready) no matter what was actually
 * happening: offline, mid-generation, or erroring all looked
 * identical. Now it reflects real state:
 *   - Çevrimdışı (gray)  → navigator.onLine is false
 *   - Yazıyor... (pulsing accent) → a message is generating
 *   - Hazır (accent)     → idle and online
 * ==========================================================
 */

import config from "./config.js";
import LocalAI from "./providers/local.js";

// Where the last answer came from — shown next to "Hazır" when it was the
// on-device model, so the automatic switch is visible at a glance.
let lastRoute = null;

function localSuffix() {

    if (config.routeMode === "local") return " · yerel";

    if (lastRoute?.kind === "local") return ` · ${lastRoute.label || "Lotus Mini"}`;

    return "";
}

function setStatus(text, modifier) {

    const dot = document.getElementById("status-dot");
    const label = document.getElementById("status-text");

    if (!dot || !label) return;

    label.textContent = text;

    dot.classList.remove("status-offline", "status-generating");

    if (modifier) dot.classList.add(modifier);
}

function refreshConnectivity() {

    if (!navigator.onLine) {

        setStatus(LocalAI.hasModel() && config.routeMode !== "cloud" ? "Çevrimdışı · cihazda" : "Çevrimdışı", "status-offline");

    } else if (document.body.classList.contains("lotus-generating")) {

        setStatus("Yazıyor...", "status-generating");

    } else {

        setStatus(`Hazır${localSuffix()}`, null);
    }
}

window.addEventListener("lotus:route-changed", event => {

    lastRoute = event.detail?.to || null;

    refreshConnectivity();
});

window.addEventListener("lotus:local-state", refreshConnectivity);

window.addEventListener("online", refreshConnectivity);
window.addEventListener("offline", refreshConnectivity);

// chat.js toggles this body class in setGenerating() — a simple,
// decoupled way for this module to know without importing chat.js
// (which would create a circular import back the other way).
const observer = new MutationObserver(refreshConnectivity);

document.addEventListener("DOMContentLoaded", () => {

    refreshConnectivity();

    observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });
});
