/**
 * ==========================================================
 * Lotus AI - Clipboard helper
 * ==========================================================
 * navigator.clipboard only exists in secure contexts (https://
 * or localhost). Packaged as an Android WebView app the page
 * is loaded from file:///android_asset/..., and on a plain
 * http:// LAN address it is missing too — every "Kopyala"
 * button silently did nothing there. This falls back to the
 * old execCommand("copy") path, which works everywhere.
 * ==========================================================
 */

import { isPackagedApp } from "./env.js";

export async function copyText(text) {

    const value = String(text ?? "");

    try {

        if (navigator.clipboard?.writeText && window.isSecureContext !== false) {

            await navigator.clipboard.writeText(value);

            return true;
        }

    } catch {

        // fall through to the legacy path
    }

    const area = document.createElement("textarea");

    area.value = value;

    area.setAttribute("readonly", "");

    area.style.cssText = "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none;";

    document.body.appendChild(area);

    area.focus();
    area.select();
    area.setSelectionRange(0, value.length);

    let ok = false;

    try {

        ok = document.execCommand("copy");

    } catch {

        ok = false;
    }

    area.remove();

    return ok;
}

/**
 * Saves text as a file. Returns "download" when the browser took
 * the download, "share" when the native share sheet was used, or
 * "copied" when neither is available (WebView without a download
 * listener) and the text was put on the clipboard instead.
 */
export async function saveTextFile(filename, text, mime = "text/markdown") {

    const isWebView = /;\s*wv\)/.test(navigator.userAgent) || isPackagedApp();

    if (!isWebView) {

        try {

            const blob = new Blob([text], { type: `${mime};charset=utf-8` });

            const url = URL.createObjectURL(blob);

            const link = document.createElement("a");

            link.href = url;
            link.download = filename;

            document.body.appendChild(link);
            link.click();
            link.remove();

            setTimeout(() => URL.revokeObjectURL(url), 4000);

            return "download";

        } catch {

            // fall through
        }
    }

    try {

        if (navigator.share) {

            await navigator.share({ title: filename, text });

            return "share";
        }

    } catch (error) {

        // User dismissed the share sheet — not a failure to fall back from.
        if (error?.name === "AbortError") return "share";
    }

    await copyText(text);

    return "copied";
}
