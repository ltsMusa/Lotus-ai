/**
 * ==========================================================
 * Lotus AI - Device monitor (power · temperature · battery)
 * ==========================================================
 * Gives js/localPolicy.js a snapshot of how capable and how hot the
 * device is. Signals, best first:
 *
 *   • Android app  → window.LotusNative (MainActivity.java): exact RAM,
 *                    PowerManager thermal status (Android 10+), battery
 *                    temperature, battery level, power-saver mode.
 *   • Browsers     → Compute Pressure API (Chromium, where available),
 *                    Battery Status API, navigator.deviceMemory (capped
 *                    at 8 GB and rounded down) and hardwareConcurrency.
 *   • Everywhere   → measured generation speed. A phone that throttles
 *                    because it is hot gets visibly slower; a drop to
 *                    well below the best speed seen for that model is
 *                    treated as "warm"/"hot" even with no sensor at all.
 *
 * Honesty: a web page cannot read a real CPU temperature. Outside the
 * Android app the thermal state is inferred (pressure API + speed), so
 * it reacts after the device has started to slow down, not before.
 * ==========================================================
 */

import { THERMAL_ORDER, worstThermal } from "./localPolicy.js";

const SPEED_KEY = "lotus_local_speed_v1";
const MIN_TOKENS_FOR_SPEED = 12;
const SPEED_HISTORY = 5;

// ----------------------------------------------------------
// Pure mappings (exported for tests)
// ----------------------------------------------------------

/** Android PowerManager.THERMAL_STATUS_* (0 none … 6 shutdown). */
export function thermalFromAndroidStatus(status) {

    const value = Number(status);

    if (!Number.isFinite(value) || value < 0) return null;

    if (value <= 1) return "normal"; // NONE, LIGHT
    if (value === 2) return "warm"; // MODERATE
    if (value === 3) return "hot"; // SEVERE

    return "critical"; // CRITICAL, EMERGENCY, SHUTDOWN
}

/** Battery temperature in °C — phones start throttling around 41–43 °C. */
export function thermalFromBatteryTemp(celsius) {

    const value = Number(celsius);

    if (!Number.isFinite(value) || value <= 0) return null;

    if (value >= 45) return "critical";
    if (value >= 42) return "hot";
    if (value >= 39) return "warm";

    return "normal";
}

/** Compute Pressure API states. */
export function thermalFromPressure(state) {

    return { nominal: "normal", fair: "warm", serious: "hot", critical: "critical" }[state] || null;
}

/**
 * Compares the latest speed (tokens/s) with the best speed seen for the
 * same model. Needs a few samples, otherwise returns "normal".
 */
export function thermalFromSpeed(history = []) {

    if (history.length < 3) return "normal";

    const best = Math.max(...history);

    const recent = history.slice(-2).reduce((a, b) => a + b, 0) / Math.min(2, history.length);

    if (!best) return "normal";

    const ratio = recent / best;

    if (ratio < 0.4) return "hot";
    if (ratio < 0.65) return "warm";

    return "normal";
}

// ----------------------------------------------------------
// Sources
// ----------------------------------------------------------

function readNative() {

    try {

        const bridge = window.LotusNative;

        if (!bridge || typeof bridge.getDeviceInfo !== "function") return null;

        const info = JSON.parse(bridge.getDeviceInfo());

        return info && typeof info === "object" ? info : null;

    } catch {

        return null;
    }
}

let pressureState = null;
let batteryState = null;
let sourcesStarted = false;

function startWebSources() {

    if (sourcesStarted) return;

    sourcesStarted = true;

    try {

        if (typeof window.PressureObserver === "function") {

            const observer = new window.PressureObserver(records => {

                const last = records[records.length - 1];

                pressureState = thermalFromPressure(last?.state);
            });

            Promise.resolve(observer.observe("cpu", { sampleInterval: 2000 })).catch(() => {});
        }

    } catch {

        // not allowed / not supported — speed tracking still works
    }

    try {

        navigator.getBattery?.().then(battery => {

            const update = () => {

                batteryState = { level: Math.round(battery.level * 100), charging: battery.charging };
            };

            update();

            battery.addEventListener("levelchange", update);
            battery.addEventListener("chargingchange", update);

        }).catch(() => {});

    } catch {

        // Battery API missing (Firefox/Safari)
    }
}

// ----------------------------------------------------------
// Speed history (per model)
// ----------------------------------------------------------

function readSpeeds() {

    try {

        return JSON.parse(localStorage.getItem(SPEED_KEY) || "{}") || {};

    } catch {

        return {};
    }
}

function writeSpeeds(data) {

    try {

        localStorage.setItem(SPEED_KEY, JSON.stringify(data));

    } catch {

        // storage unavailable — adaptation just starts over next time
    }
}

// ----------------------------------------------------------
// Public API
// ----------------------------------------------------------

const DeviceMonitor = {

    /** Starts the passive sensors (safe to call many times). */
    init() {

        startWebSources();
    },

    /**
     * Records how fast a local generation ran. Short answers are ignored
     * (too noisy to say anything about temperature).
     */
    recordSpeed(modelId, tokens, elapsedMs) {

        if (!modelId || tokens < MIN_TOKENS_FOR_SPEED || elapsedMs < 800) return;

        const perSecond = tokens / (elapsedMs / 1000);

        const data = readSpeeds();

        const list = Array.isArray(data[modelId]) ? data[modelId] : [];

        list.push(Math.round(perSecond * 100) / 100);

        data[modelId] = list.slice(-SPEED_HISTORY);

        writeSpeeds(data);
    },

    speedHistory(modelId) {

        const list = readSpeeds()[modelId];

        return Array.isArray(list) ? list : [];
    },

    /** Forget recorded speeds (e.g. after the user switches models). */
    resetSpeeds() {

        writeSpeeds({});
    },

    /**
     * Current picture of the device.
     * @param {string} [modelId] the model whose speed history should count
     */
    get(modelId = null) {

        startWebSources();

        const native = readNative();

        const cores = Number(native?.cores) || navigator.hardwareConcurrency || 0;

        const ramGB = native?.ramMB
            ? Math.round((native.ramMB / 1024) * 10) / 10
            : (navigator.deviceMemory || 0);

        const sensors = [];

        if (native) {

            sensors.push(thermalFromAndroidStatus(native.thermalStatus));
            sensors.push(thermalFromBatteryTemp(native.batteryTempC));
        }

        sensors.push(pressureState);

        const sensed = sensors.filter(Boolean);

        const inferred = modelId ? thermalFromSpeed(this.speedHistory(modelId)) : "normal";

        const thermal = worstThermal(...sensed, inferred);

        const batteryPct = native && Number.isFinite(native.batteryPct)
            ? native.batteryPct
            : (batteryState ? batteryState.level : null);

        const charging = native && typeof native.charging === "boolean"
            ? native.charging
            : (batteryState ? batteryState.charging : null);

        return {
            ramGB,
            ramExact: Boolean(native?.ramMB),
            cores,
            thermal,
            thermalSources: sensed.length > 0 ? (native ? "cihaz sensörü" : "tarayıcı") : "hız ölçümü",
            tempC: native && Number.isFinite(native.batteryTempC) && native.batteryTempC > 0 ? native.batteryTempC : null,
            batteryPct,
            charging,
            powerSave: Boolean(native?.powerSave),
            online: navigator.onLine !== false,
            native: Boolean(native)
        };
    }
};

export { THERMAL_ORDER };

export default DeviceMonitor;
