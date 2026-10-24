/**
 * ==========================================================
 * Lotus AI - Environment detection
 * ==========================================================
 * The Android wrapper serves the app from a private https origin
 * (see MainActivity.java: appassets.androidplatform.net). Older builds
 * loaded file:///android_asset/. Both mean "packaged app": there is no
 * server of our own behind relative URLs like /api/chat, and OAuth
 * redirects cannot come back.
 * ==========================================================
 */

export const APP_ASSET_HOST = "appassets.androidplatform.net";

export function isPackagedApp() {

    return window.location.protocol === "file:" || window.location.hostname === APP_ASSET_HOST;
}
