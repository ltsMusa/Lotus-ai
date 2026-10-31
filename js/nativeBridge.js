/**
 * ==========================================================
 * Lotus AI - Android bridge (window.LotusNative)
 * ==========================================================
 * The Android app (MainActivity.java) gives the page one object,
 * `LotusNative`, for the things a web page cannot do by itself:
 * device readings, notifications, a foreground service that keeps the
 * app alive while an answer is being made, and the browser hand-off for
 * Google sign-in. In a normal browser it does not exist.
 *
 * An older APK has fewer methods than the page expects, so callers ask
 * with hasNative("method") instead of assuming.
 * ==========================================================
 */

export function nativeBridge() {

    return typeof window !== "undefined" && window.LotusNative ? window.LotusNative : null;
}

export function hasNative(method) {

    const bridge = nativeBridge();

    return Boolean(bridge) && typeof bridge[method] === "function";
}

/** Calls a bridge method; returns undefined when it is missing or throws. */
export function callNative(method, ...args) {

    if (!hasNative(method)) return undefined;

    try {

        return window.LotusNative[method](...args);

    } catch (error) {

        console.warn(`LotusNative.${method} hata verdi:`, error);

        return undefined;
    }
}
