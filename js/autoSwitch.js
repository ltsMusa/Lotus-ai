/**
 * ==========================================================
 * Lotus AI - Auto-switch notices
 * ==========================================================
 * The routing itself happens in js/router.js + js/api.js and the model
 * choice in js/localPolicy.js. This module only TELLS the user what the
 * automation did, in one short toast, so the switch never feels like a
 * mystery:
 *
 *   • "Groq limiti doldu — Gemini ile devam ediliyor."
 *   • "Bağlı sağlayıcı yok — Lotus Mini cihazda yanıtlıyor."
 *   • "Cihaz ısındı — Lotus Mini Hafif'e geçildi."
 *   • "Cihaz soğudu — Lotus Mini Güçlü'ye dönüldü."
 *
 * It also starts the passive device sensors. (The engine is NOT loaded at
 * start-up — see initAutoSwitch.)
 * ==========================================================
 */

import { showToast } from "./toast.js";
import LocalAI from "./providers/local.js";
import DeviceMonitor from "./deviceMonitor.js";
import { getLocalModel } from "./localModels.js";

// The same notice is never shown twice within this window.
const REPEAT_WINDOW_MS = 25 * 1000;

const recent = new Map();

function notify(key, message, type = "info", duration = 5200) {

    const now = Date.now();

    if (now - (recent.get(key) || 0) < REPEAT_WINDOW_MS) return;

    recent.set(key, now);

    showToast(message, type, duration);
}

const providerName = route => route?.label || route?.name || "Sağlayıcı";

function onRouteChanged(event) {

    const { from, to, changed, reason, label } = event.detail || {};

    if (!changed || !to) return;

    // The very first answer of a session needs no announcement…
    if (!from && reason === "") return;

    const target = label || providerName(to);

    switch (reason) {

        case "offline":

            notify("offline", `Çevrimdışısın — ${target} cihazda yanıtlıyor.`);

            break;

        case "quota":

            notify(
                `quota-${to.name}`,
                to.kind === "local"
                    ? `Sağlayıcı limitleri doldu — ${target} cihazda devam ediyor.`
                    : `${providerName(from)} limiti doldu — ${target} ile devam ediliyor.`
            );

            break;

        case "no-provider":

            notify("no-provider", `Bağlı sağlayıcı yok — ${target} cihazda yanıtlıyor.`);

            break;

        case "failure":

            notify(
                `failure-${to.name}`,
                to.kind === "local"
                    ? `Sağlayıcılara ulaşılamadı — ${target} cihazda devam ediyor.`
                    : `${providerName(from)} yanıt vermedi — ${target} ile devam ediliyor.`
            );

            break;

        case "provider-available":

            notify("provider-back", `${target} yeniden kullanılabilir — buluta dönüldü.`, "success");

            break;

        default:

            break;
    }
}

// ---------- the local model changing because of heat / battery ----------

let lastLoaded = null;

function onLocalState(event) {

    const loaded = event.detail?.loadedId || null;

    // An unload (before a reload, or after idling) says nothing by itself —
    // keep remembering the last model that actually ran.
    if (!loaded || loaded === lastLoaded) return;

    const before = getLocalModel(lastLoaded);
    const after = getLocalModel(loaded);

    lastLoaded = loaded;

    // The very first model of the session is not a "switch".
    if (!before || !after) return;

    if (after.rank < before.rank) {

        const reasons = LocalAI.previewChoice().reasons.filter(reason => reason !== "cihaz büyük modele yetmiyor");

        const why = reasons.length ? reasons.join(", ") : "cihaz yoruldu";

        notify(`down-${after.id}`, `${why[0].toUpperCase()}${why.slice(1)} — ${after.name} modeline geçildi.`, "info", 6000);

    } else if (after.rank > before.rank) {

        notify(`up-${after.id}`, `Cihaz rahatladı — ${after.name} modeline dönüldü.`, "success");
    }
}

export function initAutoSwitch() {

    DeviceMonitor.init();

    window.addEventListener("lotus:route-changed", onRouteChanged);
    window.addEventListener("lotus:local-state", onLocalState);

    // The list of installed models comes from the small hint LocalAI keeps in
    // localStorage; the engine itself is only loaded when it is needed (the
    // first local answer, or the settings panel) so starting the app never
    // downloads or runs anything.
}

if (typeof document !== "undefined") {

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initAutoSwitch, { once: true });
    else initAutoSwitch();
}
