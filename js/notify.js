/**
 * ==========================================================
 * Lotus AI - Notifications + background keep-alive
 * ==========================================================
 * One small API for two worlds:
 *
 *  • Android app → window.LotusNative (MainActivity.java): real system
 *    notifications and a foreground service. While an answer or a model
 *    download is running the service shows one ongoing notification and
 *    keeps the app process alive, so switching to another app does not
 *    cut the answer off.
 *  • Browser / PWA → the Notification API (through the service worker
 *    when there is one).
 *
 * Nothing is shown while the app is on screen (the answer is right
 * there); what to show and when is decided by notifyPolicy.js.
 *
 * Honest limit: Android decides how long a background app lives.
 * Battery savers and some phone makers' "app killers" can still stop it;
 * the ongoing notification is what makes that unlikely, not impossible.
 * ==========================================================
 */

import config from "./config.js";
import { hasNative, callNative } from "./nativeBridge.js";
import {
    shouldNotify,
    replyNotification,
    downloadNotification,
    keepAliveText,
    shouldPostProgress
} from "./notifyPolicy.js";

const IDS = { reply: 2001, download: 3001, alert: 4001 };

const ASKED_KEY = "lotus_notif_asked";

const HEARTBEAT_MS = 45 * 1000;

function remember(key, value) {

    try { localStorage.setItem(key, value); } catch { /* storage unavailable */ }
}

function recall(key) {

    try { return localStorage.getItem(key); } catch { return null; }
}

const isNative = () => hasNative("notify");

/** "granted" | "denied" | "default" | "unsupported" */
export function permissionState() {

    if (isNative()) {

        if (callNative("notificationsAllowed")) return "granted";

        return recall(ASKED_KEY) ? "denied" : "default";
    }

    if (typeof Notification === "undefined") return "unsupported";

    return Notification.permission;
}

function inForeground() {

    if (hasNative("isForeground")) return Boolean(callNative("isForeground"));

    return typeof document === "undefined" ? true : document.visibilityState === "visible";
}

/** Asks for permission (Android 13+ dialog / browser prompt). Resolves with the state it ends in right away. */
export async function requestPermission() {

    if (isNative()) {

        remember(ASKED_KEY, "1");

        // The answer arrives later as the "lotus-native-permission" event.
        callNative("requestNotificationPermission");

        return permissionState();
    }

    if (typeof Notification === "undefined") return "unsupported";

    try {

        return await Notification.requestPermission();

    } catch {

        return Notification.permission;
    }
}

/**
 * Android only, once: ask when the first answer is being made — the first
 * moment a notification could matter. (Browsers only allow the prompt from
 * a tap in Settings, so the web waits for that.)
 */
export function askPermissionOnce() {

    if (!isNative() || !config.notifications.enabled) return;

    if (recall(ASKED_KEY) || permissionState() !== "default") return;

    requestPermission();
}

async function show(kind, title, body, { ignoreForeground = false } = {}) {

    const allowed = shouldNotify(kind, {
        settings: config.notifications,
        foreground: ignoreForeground ? false : inForeground(),
        permission: permissionState()
    });

    if (!allowed) return false;

    if (isNative()) return Boolean(callNative("notify", kind, title, body, IDS[kind]));

    try {

        const options = { body, tag: `lotus-${kind}`, renotify: true, icon: "./assets/icons/icon-192.png" };

        const registration = await navigator.serviceWorker?.getRegistration?.();

        if (registration?.showNotification) {

            await registration.showNotification(title, options);

        } else {

            new Notification(title, options); // eslint-disable-line no-new
        }

        return true;

    } catch (error) {

        console.warn("Bildirim gösterilemedi:", error);

        return false;
    }
}

// ----------------------------------------------------------
// Background keep-alive (Android foreground service)
// ----------------------------------------------------------

const holders = new Set();

let heartbeat = null;
let serviceText = "";
let servicePercent = -1;

function pushService() {

    callNative("keepAlive", true, serviceText, servicePercent);
}

function syncService() {

    if (holders.size === 0) {

        clearInterval(heartbeat);

        heartbeat = null;
        servicePercent = -1;

        callNative("keepAlive", false, "", -1);

        return;
    }

    const reasons = [...holders].map(token => token.description);

    serviceText = keepAliveText(reasons.includes("download") ? "download" : reasons.includes("image") ? "image" : "reply");

    pushService();

    // The service stops itself when the page goes quiet (crash, closed WebView).
    heartbeat ||= setInterval(pushService, HEARTBEAT_MS);
}

/**
 * Keeps the app alive in the background until the returned function is called.
 * @param {"reply"|"image"|"download"} reason
 * @returns {() => void} release
 */
export function keepAlive(reason = "reply") {

    if (!config.notifications.background || !hasNative("keepAlive")) return () => {};

    const token = Symbol(reason);

    holders.add(token);

    syncService();

    return () => {

        if (holders.delete(token)) syncService();
    };
}

// ----------------------------------------------------------
// The notifications themselves
// ----------------------------------------------------------

export function replyReady({ text = "", image = false } = {}) {

    const { title, body } = replyNotification({ text, image });

    return show("reply", title, body);
}

export function notice(title, body = "") {

    return show("alert", title, body);
}

let lastProgress = { percent: -2, at: 0 };

/** Model download progress: shown in the ongoing notification. */
export function downloadProgress({ name = "Lotus Mini", loaded = 0, total = 0 } = {}) {

    if (!holders.size) return;

    const { title, body, percent } = downloadNotification({ name, loaded, total });

    if (!shouldPostProgress({ lastPercent: lastProgress.percent, lastAt: lastProgress.at, percent })) return;

    lastProgress = { percent, at: Date.now() };

    servicePercent = percent;

    serviceText = config.notifications.download ? `${title} · ${body}` : keepAliveText("download");

    pushService();
}

export function downloadFinished({ name = "Lotus Mini", ok = true, message = "" } = {}) {

    lastProgress = { percent: -2, at: 0 };

    return show(
        "download",
        ok ? `${name} hazır` : `${name} indirilemedi`,
        ok ? "Artık internet olmadan da yanıt verebilir." : message || "Bağlantını kontrol edip tekrar dene."
    );
}

/** The Settings "Test bildirimi" button: shows one even though the app is on screen. */
export async function sendTest() {

    if (permissionState() !== "granted") await requestPermission();

    return show("alert", "Lotus AI", "Bildirimler çalışıyor.", { ignoreForeground: true });
}

// Native permission answers come back as a window event; let the Settings panel refresh.
if (typeof window !== "undefined") {

    window.addEventListener("lotus-native-permission", () => {

        try { window.dispatchEvent(new CustomEvent("lotus:notification-permission")); } catch { /* no window */ }
    });
}

export default {
    permissionState,
    requestPermission,
    askPermissionOnce,
    keepAlive,
    replyReady,
    notice,
    downloadProgress,
    downloadFinished,
    sendTest
};
