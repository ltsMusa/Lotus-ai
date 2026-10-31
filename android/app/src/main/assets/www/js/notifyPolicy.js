/**
 * ==========================================================
 * Lotus AI - Notification rules (pure)
 * ==========================================================
 * Which notifications exist, what the user switched on, when one is worth
 * showing, and the Turkish texts. No DOM and no Android here, so the rules
 * are unit-tested (tests/notifications.test.mjs); js/notify.js does the
 * actual showing.
 * ==========================================================
 */

/**
 *  enabled    master switch for every notification
 *  reply      "Yanıt hazır" / "Görsel hazır" when the app is not on screen
 *  download   Lotus Mini download progress and completion
 *  alert      limit reached, provider switched, device too hot, errors
 *  background keep the app alive (ongoing notification) while an answer or
 *             a download is in progress, so leaving the app does not cut it off
 */
export const DEFAULT_NOTIFICATIONS = Object.freeze({
    enabled: true,
    reply: true,
    download: true,
    alert: true,
    background: true
});

export const NOTIFICATION_KINDS = Object.freeze(["reply", "download", "alert"]);

/** Always a complete, valid settings object — whatever storage handed over. */
export function normalizeNotifications(value) {

    const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};

    const result = {};

    for (const key of Object.keys(DEFAULT_NOTIFICATIONS)) {

        result[key] = typeof source[key] === "boolean" ? source[key] : DEFAULT_NOTIFICATIONS[key];
    }

    return result;
}

/**
 * @param {"reply"|"download"|"alert"} kind
 * @param {{ settings?: object, foreground?: boolean, permission?: string }} context
 *        foreground: the app is on screen — then the answer is already visible
 *        permission: "granted" | "denied" | "default" | "unsupported"
 */
export function shouldNotify(kind, { settings, foreground = false, permission = "default" } = {}) {

    const rules = normalizeNotifications(settings);

    if (!NOTIFICATION_KINDS.includes(kind)) return false;

    if (!rules.enabled || !rules[kind]) return false;

    if (foreground) return false;

    return permission === "granted";
}

/** Plain one-line preview of a markdown answer, for the notification body. */
export function previewText(markdown, max = 140) {

    let text = String(markdown ?? "")
        .replace(/<think>[\s\S]*?<\/think>/gi, " ")
        .replace(/```[\s\S]*?```/g, " (kod) ")
        .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
        .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
        .replace(/^\s{0,3}#{1,6}\s+/gm, "")
        .replace(/^\s*[-*+]\s+/gm, "• ")
        .replace(/[*_~`>]+/g, "")
        .replace(/\s+/g, " ")
        .trim();

    if (text.length > max) text = `${text.slice(0, max - 1).trimEnd()}…`;

    return text;
}

/** @returns {{ title: string, body: string }} */
export function replyNotification({ text = "", image = false } = {}) {

    if (image) return { title: "Görselin hazır", body: previewText(text, 100) || "Dokun ve gör." };

    return { title: "Lotus yanıtladı", body: previewText(text) || "Yanıtın hazır." };
}

/** Whole-number percent (0–100), or -1 when the total is unknown. */
export function percentOf(loaded, total) {

    if (!(total > 0) || !(loaded >= 0)) return -1;

    return Math.min(100, Math.max(0, Math.floor((loaded / total) * 100)));
}

export function downloadNotification({ name = "Lotus Mini", loaded = 0, total = 0 } = {}) {

    const percent = percentOf(loaded, total);

    const mb = value => Math.round(value / 1024 / 1024);

    const body = percent >= 0 ? `%${percent} — ${mb(loaded)} / ${mb(total)} MB` : "İndiriliyor…";

    return { title: `${name} indiriliyor`, body, percent };
}

/** The ongoing text shown while the app works in the background. */
export function keepAliveText(reason = "reply") {

    return reason === "download" ? "Lotus Mini indiriliyor…" : reason === "image" ? "Görsel hazırlanıyor…" : "Lotus yanıt hazırlıyor…";
}

/**
 * During a download, a new progress notification is only worth sending when
 * the percent moved by a point AND a moment has passed — a progress callback
 * fires many times per second.
 */
export function shouldPostProgress({ lastPercent = -2, lastAt = 0, percent, now = Date.now(), minIntervalMs = 1500 }) {

    if (percent === lastPercent) return false;

    if (percent >= 100) return true;

    return now - lastAt >= minIntervalMs && (percent < 0 || percent > lastPercent);
}
