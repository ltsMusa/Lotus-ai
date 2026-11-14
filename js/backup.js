/**
 * ==========================================================
 * Lotus AI - Backup & restore: pure rules
 * ==========================================================
 * No DOM, no network — tested with plain `node --test`
 * (tests/backup.test.mjs). The part that talks to storage lives
 * in js/dataTools.js.
 *
 * WHY: a guest's chats exist only in this browser/app. Deleting
 * the app (or clearing site data) loses them, and "Dışa aktar (.md)"
 * only saves one chat as readable text. A backup file holds EVERYTHING
 * (chats, pins, memory items, preferences) and can be restored on any
 * device, signed in or not.
 *
 * File (JSON, UTF-8):
 *   { format: "lotus-ai-backup", version: 1, created_at, app,
 *     conversations: [{ id, title, created_at, updated_at, pinned, messages: [{ role, content, created_at }] }],
 *     memories:      [{ content, category, importance }],
 *     settings:      { personalization, theme, image, notifications, voice },
 *     keys:          { groq, gemini }          ← only when the user asked for it }
 *
 * Restoring never overwrites: a chat that is already there (same id,
 * or same title and start time) is skipped, memory items already
 * present are skipped, a key is only put on a device that has none.
 * Restoring the same file twice changes nothing the second time.
 * ==========================================================
 */

import { isWellFormed, WIZARD_PROVIDERS } from "./keyTools.js";

export const BACKUP_FORMAT = "lotus-ai-backup";
export const BACKUP_VERSION = 1;

export const LIMITS = {
    fileChars: 120_000_000,
    conversations: 5000,
    messagesPerConversation: 20000,
    contentChars: 2_000_000,
    titleChars: 200,
    idChars: 100,
    memories: 500,
    memoryChars: 1000,
    settingChars: 2000,
    settingKeys: 30
};

const ROLES = new Set(["user", "assistant", "system"]);

const MEMORY_CATEGORIES = new Set(["general", "preference", "fact", "project"]);

const SETTING_GROUPS = ["personalization", "image", "notifications", "voice"];

const SAFE_KEY = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;

// ----------------------------------------------------------
// Small helpers
// ----------------------------------------------------------

const isObject = value => value !== null && typeof value === "object" && !Array.isArray(value);

function validDate(value, fallback) {

    const time = Date.parse(value);

    return Number.isFinite(time) ? new Date(time).toISOString() : fallback;
}

/** Local calendar date, YYYY-MM-DD. */
function dayLabel(date) {

    const pad = number => String(number).padStart(2, "0");

    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function backupFilename(now = new Date()) {

    return `lotus-yedek-${dayLabel(now)}.json`;
}

/** UTF-8 text → base64 (in pieces: a long backup would overflow the call stack in one go). */
export function utf8ToBase64(text) {

    const bytes = new TextEncoder().encode(String(text ?? ""));

    let binary = "";

    for (let at = 0; at < bytes.length; at += 0x8000) binary += String.fromCharCode.apply(null, bytes.subarray(at, at + 0x8000));

    return btoa(binary);
}

// ----------------------------------------------------------
// Building
// ----------------------------------------------------------

/**
 * @param {object} input
 * @param {Array}  input.conversations  as stored: { id, title, created_at, updated_at, messages: [{ role, content, created_at }] }
 * @param {Set<string>|string[]} [input.pinnedIds]
 * @param {Array}  [input.memories]     [{ content, category, importance }]
 * @param {object} [input.settings]     { personalization, theme, image, notifications, voice }
 * @param {object} [input.keys]         { groq, gemini } — only used when includeKeys is true
 * @param {boolean} [input.includeKeys]
 */
export function buildBackup({ conversations = [], pinnedIds = [], memories = [], settings = {}, keys = {}, includeKeys = false, now = new Date(), appVersion = "" } = {}) {

    const pinned = new Set(pinnedIds);

    const ordered = conversations
        .filter(conversation => Array.isArray(conversation?.messages) && conversation.messages.length > 0)
        .sort((a, b) => String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")));

    const backup = {
        format: BACKUP_FORMAT,
        version: BACKUP_VERSION,
        created_at: now.toISOString(),
        app: String(appVersion || ""),
        conversations: ordered.map(conversation => ({
            id: String(conversation.id),
            title: String(conversation.title ?? ""),
            created_at: conversation.created_at,
            updated_at: conversation.updated_at,
            pinned: pinned.has(conversation.id),
            messages: conversation.messages.map(message => ({
                role: message.role,
                content: message.content,
                created_at: message.created_at
            }))
        })),
        memories: memories.map(item => ({
            content: String(item.content ?? ""),
            category: item.category ?? "general",
            importance: item.importance ?? 1
        })),
        settings: pickRestorableSettings(settings)
    };

    if (includeKeys) {

        const wanted = {};

        for (const provider of WIZARD_PROVIDERS) {

            if (isWellFormed(provider, keys[provider])) wanted[provider] = String(keys[provider]).trim();
        }

        if (Object.keys(wanted).length) backup.keys = wanted;
    }

    return backup;
}

// ----------------------------------------------------------
// Reading
// ----------------------------------------------------------

/** Only plain, short, well-named values travel; the app's own normalisers do the rest. */
function cleanGroup(value) {

    if (!isObject(value)) return null;

    const clean = {};

    for (const [key, item] of Object.entries(value).slice(0, LIMITS.settingKeys)) {

        if (!SAFE_KEY.test(key)) continue;

        if (typeof item === "string") clean[key] = item.slice(0, LIMITS.settingChars);
        else if (typeof item === "boolean") clean[key] = item;
        else if (typeof item === "number" && Number.isFinite(item)) clean[key] = item;
    }

    return Object.keys(clean).length ? clean : null;
}

export function pickRestorableSettings(raw) {

    const picked = {};

    if (!isObject(raw)) return picked;

    for (const group of SETTING_GROUPS) {

        const clean = cleanGroup(raw[group]);

        if (clean) picked[group] = clean;
    }

    if (typeof raw.theme === "string" && /^[a-z0-9-]{1,40}$/i.test(raw.theme)) picked.theme = raw.theme;

    return picked;
}

function cleanMemories(list, stats) {

    const seen = new Set();

    const clean = [];

    for (const item of Array.isArray(list) ? list : []) {

        const content = typeof item?.content === "string" ? item.content.trim().slice(0, LIMITS.memoryChars) : "";

        const key = content.toLowerCase();

        if (!content || seen.has(key)) {

            if (content) stats.skippedMemories++;

            continue;
        }

        if (clean.length >= LIMITS.memories) {

            stats.skippedMemories++;

            continue;
        }

        seen.add(key);

        clean.push({
            content,
            category: MEMORY_CATEGORIES.has(item.category) ? item.category : "general",
            importance: Math.min(5, Math.max(1, Math.round(Number(item.importance)) || 1))
        });
    }

    return clean;
}

function cleanConversations(list, stats, now) {

    const seenIds = new Set();

    const clean = [];

    (Array.isArray(list) ? list : []).slice(0, LIMITS.conversations).forEach((raw, index) => {

        if (!isObject(raw) || !Array.isArray(raw.messages)) {

            stats.skippedConversations++;

            return;
        }

        const created = validDate(raw.created_at, validDate(raw.updated_at, now));

        const messages = [];

        raw.messages.slice(0, LIMITS.messagesPerConversation).forEach((message, position) => {

            const content = typeof message?.content === "string" ? message.content : "";

            if (!ROLES.has(message?.role) || !content.trim() || content.length > LIMITS.contentChars) {

                stats.skippedMessages++;

                return;
            }

            // Keep the order even when a message has no (valid) time: +1 ms per position.
            messages.push({
                role: message.role,
                content,
                created_at: validDate(message.created_at, new Date(Date.parse(created) + position).toISOString())
            });
        });

        if (!messages.length) {

            stats.skippedConversations++;

            return;
        }

        let id = typeof raw.id === "string" && raw.id.trim() ? raw.id.trim().slice(0, LIMITS.idChars) : `yedek-${index + 1}`;

        // Two entries with one id: the second keeps its content under a new id.
        if (seenIds.has(id)) id = `${id}-${index + 1}`;

        seenIds.add(id);

        clean.push({
            id,
            title: (typeof raw.title === "string" ? raw.title.trim() : "").slice(0, LIMITS.titleChars) || "Yeni Sohbet",
            created_at: created,
            updated_at: validDate(raw.updated_at, messages[messages.length - 1].created_at),
            pinned: raw.pinned === true,
            messages
        });
    });

    return clean;
}

/**
 * @param {string} text  the file's content
 * @returns {{ ok: true, backup: object, stats: object } | { ok: false, error: string }}
 */
export function parseBackup(text, { now = new Date().toISOString() } = {}) {

    const source = String(text ?? "");

    if (source.length > LIMITS.fileChars) return { ok: false, error: "Dosya çok büyük (en fazla ~120 MB)." };

    let data;

    try {

        data = JSON.parse(source);

    } catch {

        return { ok: false, error: "Bu dosya geçerli bir yedek değil (içeriği okunamadı)." };
    }

    if (!isObject(data) || data.format !== BACKUP_FORMAT) return { ok: false, error: "Bu bir Lotus AI yedek dosyası değil." };

    if (!Number.isInteger(data.version) || data.version < 1) return { ok: false, error: "Yedek dosyasının sürümü okunamadı." };

    if (data.version > BACKUP_VERSION) return { ok: false, error: "Bu yedek daha yeni bir Lotus AI sürümünden. Önce uygulamayı güncelle." };

    const stats = { skippedConversations: 0, skippedMessages: 0, skippedMemories: 0 };

    const conversations = cleanConversations(data.conversations, stats, now);

    const memories = cleanMemories(data.memories, stats);

    const settings = pickRestorableSettings(data.settings);

    const keys = {};

    if (isObject(data.keys)) {

        for (const provider of WIZARD_PROVIDERS) {

            if (isWellFormed(provider, data.keys[provider])) keys[provider] = String(data.keys[provider]).trim();
        }
    }

    const backup = {
        format: BACKUP_FORMAT,
        version: data.version,
        created_at: validDate(data.created_at, now),
        app: typeof data.app === "string" ? data.app.slice(0, 40) : "",
        conversations,
        memories,
        settings,
        ...(Object.keys(keys).length ? { keys } : {})
    };

    return {
        ok: true,
        backup,
        stats: {
            ...stats,
            conversations: conversations.length,
            messages: conversations.reduce((sum, conversation) => sum + conversation.messages.length, 0),
            memories: memories.length,
            hasSettings: Object.keys(settings).length > 0,
            hasKeys: Object.keys(keys).length > 0
        }
    };
}

// ----------------------------------------------------------
// Restoring without duplicates
// ----------------------------------------------------------

/** Same title + same start second = the same chat, even when a signed-in account gave it a new id. */
export function fingerprint(conversation) {

    const time = Math.floor(Date.parse(conversation?.created_at) / 1000);

    return `${String(conversation?.title ?? "").trim().toLowerCase()}|${Number.isFinite(time) ? time : "?"}`;
}

/**
 * @param {Array<{ id: string, title?: string, created_at?: string }>} existing  what is already there
 * @param {object} backup  a parsed backup
 * @returns {{ add: object[], skipped: number, messages: number }}
 */
export function planRestore(existing, backup) {

    const ids = new Set(existing.map(conversation => conversation.id));

    const prints = new Set(existing.map(fingerprint));

    const add = [];

    let skipped = 0;

    for (const conversation of backup?.conversations ?? []) {

        const print = fingerprint(conversation);

        if (ids.has(conversation.id) || prints.has(print)) {

            skipped++;

            continue;
        }

        ids.add(conversation.id);
        prints.add(print);

        add.push(conversation);
    }

    return { add, skipped, messages: add.reduce((sum, conversation) => sum + conversation.messages.length, 0) };
}

/** Memory items of the backup that are not on this account/device yet (compared by text). */
export function newMemories(existing, incoming) {

    const have = new Set(existing.map(item => String(item?.content ?? "").trim().toLowerCase()));

    return incoming.filter(item => !have.has(item.content.trim().toLowerCase()));
}

// ----------------------------------------------------------
// What the user is told before restoring
// ----------------------------------------------------------

export function describeRestore({ stats, plan, newMemoryCount = 0, willApplySettings = false, keysToAdd = 0 }) {

    const lines = [];

    if (plan.add.length) lines.push(`${plan.add.length} sohbet (${plan.messages} mesaj) eklenecek`);
    else lines.push("Eklenecek yeni sohbet yok");

    if (plan.skipped) lines.push(`${plan.skipped} sohbet zaten var, atlanacak`);

    if (stats.memories) lines.push(newMemoryCount ? `${newMemoryCount} hafıza notu eklenecek` : "hafıza notlarının hepsi zaten var");

    if (willApplySettings) lines.push("kişiselleştirme ve tercihler yedekteki haline dönecek");

    if (keysToAdd) lines.push(`${keysToAdd} API anahtarı eklenecek`);

    const warnings = stats.skippedMessages || stats.skippedConversations
        ? ` (${stats.skippedMessages} mesaj ve ${stats.skippedConversations} sohbet okunamadığı için atlandı)`
        : "";

    return `${lines.join(", ")}.${warnings} Mevcut sohbetlerin ve notların hiçbiri silinmez ya da değiştirilmez.`;
}

// ----------------------------------------------------------
// Reminder
// ----------------------------------------------------------

export const REMINDER_MIN_CHATS = 3;
export const REMINDER_EVERY_MS = 14 * 24 * 60 * 60 * 1000;
export const BACKUP_STALE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Chats that live only on this device are lost with the app. A gentle, rare nudge
 * (a toast with a button, never a dialog) for guests who have something to lose.
 */
export function backupReminderDue({ signedIn = false, conversationCount = 0, lastBackupAt = 0, lastReminderAt = 0, now = Date.now() } = {}) {

    if (signedIn || conversationCount < REMINDER_MIN_CHATS) return false;

    const recent = time => {

        const value = Number(time);

        return Number.isFinite(value) && value > 0 && value <= now;
    };

    if (recent(lastBackupAt) && now - Number(lastBackupAt) < BACKUP_STALE_MS) return false;

    if (recent(lastReminderAt) && now - Number(lastReminderAt) < REMINDER_EVERY_MS) return false;

    return true;
}
