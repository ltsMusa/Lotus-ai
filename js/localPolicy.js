/**
 * ==========================================================
 * Lotus AI - Local model policy (pure functions)
 * ==========================================================
 * "Cihazın gücüne ve ısınmasına göre model değiştirsin":
 *
 *   1. What can this device run at all?      (RAM, cores)
 *   2. How hot / drained is it right now?    (thermal state, battery)
 *   3. Which INSTALLED model fits both?      → pickLocalModel()
 *
 * Nothing here touches the DOM, storage or the network, so the
 * decisions are easy to unit-test (see the test notes in README).
 *
 * Thermal states, coolest first: normal < warm < hot < critical.
 * js/deviceMonitor.js produces them from the Android thermal API,
 * the battery temperature, the Compute Pressure API (where it
 * exists) and measured generation speed.
 * ==========================================================
 */

import { LOCAL_MODELS } from "./localModels.js";

export const THERMAL_ORDER = ["normal", "warm", "hot", "critical"];

export const worstThermal = (...states) =>
    states.reduce(
        (worst, state) => (THERMAL_ORDER.indexOf(state) > THERMAL_ORDER.indexOf(worst) ? state : worst),
        "normal"
    );

/**
 * Highest model rank this hardware can run without risking an
 * out-of-memory kill. `snapshot.ramGB` is exact on the Android app
 * and a capped estimate (≤ 8) in a browser.
 */
export function hardwareCeilingRank(snapshot = {}) {

    const ram = Number(snapshot.ramGB) || 0;
    const cores = Number(snapshot.cores) || 0;
    const exact = Boolean(snapshot.ramExact);

    // Unknown hardware (Safari, privacy modes): assume a modest phone.
    if (!ram) return 1;

    if (ram < 1.9) return 0;

    // The big model needs ~1.7 GB of runtime memory. Browsers round RAM
    // down to a power of two (a 6 GB phone reports 4), so there the bar is
    // the cap (8); with an exact reading 5.5 GB is enough.
    const bigOk = exact ? ram >= 5.5 : ram >= 8;

    if (bigOk && (!cores || cores >= 6)) return 2;

    return 1;
}

/** Highest rank allowed by temperature, battery and power-saver. */
export function runtimeCeilingRank(snapshot = {}) {

    let ceiling = 2;

    const thermal = snapshot.thermal || "normal";

    if (thermal === "hot" || thermal === "critical") ceiling = Math.min(ceiling, 1);

    const lowBattery = snapshot.batteryPct != null && snapshot.batteryPct <= 15 && snapshot.charging === false;

    if (lowBattery || snapshot.powerSave) ceiling = Math.min(ceiling, 1);

    return ceiling;
}

/** How many CPU threads the engine should use right now. */
export function pickThreadCount(snapshot = {}, adaptive = true) {

    const cores = Math.max(1, Number(snapshot.cores) || 2);

    // The engine's own default is half the logical cores; big.LITTLE phones
    // gain nothing beyond 4, and the rest only adds heat.
    let threads = Math.min(4, Math.max(1, Math.floor(cores / 2)));

    if (!adaptive) return threads;

    const thermal = snapshot.thermal || "normal";

    if (thermal === "warm") threads = Math.max(1, Math.ceil(threads * 0.75));
    if (thermal === "hot") threads = Math.max(1, Math.floor(threads / 2));
    if (thermal === "critical") threads = 1;

    if (snapshot.powerSave) threads = Math.max(1, Math.floor(threads / 2));

    return threads;
}

/**
 * Chooses which installed model to run.
 *
 * @param {object} args
 * @param {string[]} args.installedIds  ids of the downloaded models
 * @param {object}   args.snapshot      from DeviceMonitor.get()
 * @param {object}   args.prefs         { adaptive: boolean, preferred: "auto" | modelId }
 * @returns {{ modelId: string|null, threads: number, downgraded: boolean, reasons: string[] }}
 */
export function pickLocalModel({ installedIds = [], snapshot = {}, prefs = {} } = {}) {

    const adaptive = prefs.adaptive !== false;

    const installed = LOCAL_MODELS
        .filter(model => installedIds.includes(model.id))
        .sort((a, b) => b.rank - a.rank);

    const reasons = [];

    if (installed.length === 0) {

        return { modelId: null, threads: pickThreadCount(snapshot, adaptive), downgraded: false, reasons: ["kurulu yerel model yok"] };
    }

    const hardware = hardwareCeilingRank(snapshot);

    // What the user (or the device) would like when everything is cool.
    const preferred = LOCAL_MODELS.find(model => model.id === prefs.preferred);

    let wanted = preferred && installedIds.includes(preferred.id)
        ? preferred.rank
        : Math.min(installed[0].rank, Math.max(hardware, 1));

    if (!preferred && wanted < installed[0].rank) reasons.push("cihaz büyük modele yetmiyor");

    let ceiling = wanted;

    if (adaptive) {

        const runtime = runtimeCeilingRank(snapshot);

        if (runtime < ceiling) {

            ceiling = runtime;

            if (snapshot.thermal === "hot" || snapshot.thermal === "critical") reasons.push("cihaz ısındı");

            if (snapshot.powerSave) reasons.push("güç tasarrufu açık");

            if (snapshot.batteryPct != null && snapshot.batteryPct <= 15 && snapshot.charging === false) reasons.push("pil azaldı");
        }
    }

    // Best installed model that does not exceed the ceiling…
    let chosen = installed.find(model => model.rank <= ceiling);

    // …or, when only a bigger one is installed, the smallest of those.
    if (!chosen) {

        chosen = installed[installed.length - 1];

        reasons.push("yalnızca daha büyük model kurulu");
    }

    return {
        modelId: chosen.id,
        threads: pickThreadCount(snapshot, adaptive),
        downgraded: chosen.rank < wanted,
        reasons
    };
}

/**
 * Which model to RECOMMEND downloading first on this device.
 * (Never the big one on a phone we cannot read the RAM of.)
 */
export function recommendedModelId(snapshot = {}) {

    const rank = hardwareCeilingRank(snapshot);

    if (rank === 0) return null;

    return (LOCAL_MODELS.find(model => model.rank === Math.min(rank, 2)) || LOCAL_MODELS[0]).id;
}
