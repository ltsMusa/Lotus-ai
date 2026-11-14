/**
 * ==========================================================
 * Lotus AI - Backup & restore (the part that touches storage)
 * ==========================================================
 * Rules and file format: js/backup.js (tested without a browser).
 * This file reads everything from Storage / Memory / config, saves
 * the file (Android: straight into Downloads, js/clipboard.js),
 * and puts a restored file back without overwriting anything.
 * Settings → "Yedek ve veriler" calls these.
 * ==========================================================
 */

import Storage from "./storage.js";
import Memory from "./memory.js";
import config from "./config.js";
import { saveTextFile, nativeSaveLocation } from "./clipboard.js";
import { showToast } from "./toast.js";
import { planPull } from "./keyTools.js";
import {
    buildBackup,
    parseBackup,
    planRestore,
    newMemories,
    describeRestore,
    backupFilename,
    backupReminderDue
} from "./backup.js";

const LAST_BACKUP_KEY = "lotus_last_backup_at";
const LAST_REMINDER_KEY = "lotus_backup_remind_at";

const APP_VERSION = "7.1-beta";

function readTime(key) {

    try {

        const value = Number(localStorage.getItem(key));

        return Number.isFinite(value) ? value : 0;

    } catch {

        return 0;
    }
}

function writeTime(key, value = Date.now()) {

    try { localStorage.setItem(key, String(value)); } catch { /* storage unavailable */ }
}

const deviceKeys = () => ({
    groq: String(config.providers.groq?.apiKey ?? "").trim(),
    gemini: String(config.providers.gemini?.apiKey ?? "").trim()
});

/** Where a saved file went, in words. */
export function savedWhere(mode, filename) {

    if (mode === "native") {

        const where = nativeSaveLocation();

        return where.includes("/") ? `${filename} şuraya kaydedildi: ${where}` : `${filename} İndirilenler klasörüne kaydedildi`;
    }

    if (mode === "download") return `${filename} indirildi`;

    if (mode === "share") return "Paylaşım menüsü açıldı";

    return "Yedek panoya kopyalandı — bir notlar uygulamasına yapıştırıp sakla. (Bu ortamda dosya indirilemiyor.)";
}

// ----------------------------------------------------------
// Backup
// ----------------------------------------------------------

/**
 * Builds the backup of everything and saves it.
 * @returns {Promise<{ mode: string, filename: string, conversations: number, messages: number, memories: number }>}
 */
export async function createBackup({ includeKeys = false } = {}) {

    const conversations = await Storage.exportAll();

    const memories = await Memory.getMemories().catch(() => []);

    const backup = buildBackup({
        conversations,
        pinnedIds: Storage.pinnedIds(),
        memories,
        settings: {
            personalization: config.personalization,
            theme: config.theme,
            image: config.image,
            notifications: config.notifications,
            voice: config.voice
        },
        keys: deviceKeys(),
        includeKeys,
        appVersion: APP_VERSION
    });

    const filename = backupFilename();

    const mode = await saveTextFile(filename, JSON.stringify(backup), "application/json");

    // A file that exists (or was shared/copied on purpose) counts as a backup.
    writeTime(LAST_BACKUP_KEY);

    return {
        mode,
        filename,
        conversations: backup.conversations.length,
        messages: backup.conversations.reduce((sum, conversation) => sum + conversation.messages.length, 0),
        memories: backup.memories.length
    };
}

// ----------------------------------------------------------
// Restore
// ----------------------------------------------------------

/**
 * Reads a backup text and works out what restoring it would do — changes nothing.
 * @returns {Promise<{ ok: false, error: string } | { ok: true, parsed: object, plan: object, memoriesToAdd: object[], keysToAdd: object[], summary: string }>}
 */
export async function inspectBackup(text) {

    const parsed = parseBackup(text);

    if (!parsed.ok) return parsed;

    const existing = await Storage.listConversations();

    const plan = planRestore(existing, parsed.backup);

    const memoriesToAdd = parsed.backup.memories.length ? newMemories(await Memory.getMemories().catch(() => []), parsed.backup.memories) : [];

    const keysToAdd = parsed.backup.keys ? planPull(deviceKeys(), parsed.backup.keys) : [];

    const summary = describeRestore({
        stats: parsed.stats,
        plan,
        newMemoryCount: memoriesToAdd.length,
        willApplySettings: parsed.stats.hasSettings,
        keysToAdd: keysToAdd.length
    });

    return { ok: true, parsed, plan, memoriesToAdd, keysToAdd, summary };
}

function applySettings(settings) {

    if (settings.personalization) config.setPersonalization(settings.personalization);

    if (settings.theme) config.setTheme(settings.theme);

    if (settings.image) config.setImageSettings(settings.image);

    if (settings.notifications) config.setNotifications(settings.notifications);

    if (settings.voice) {

        // Only the options this version knows, with the type they have here.
        const known = Object.fromEntries(Object.entries(settings.voice)
            .filter(([key, value]) => key in config.voice && typeof value === typeof config.voice[key]));

        if (Object.keys(known).length) config.setVoice(known);
    }
}

/**
 * Puts the inspected backup in place. Never deletes or overwrites.
 * @returns {Promise<{ added: number, messages: number, failed: number, memories: number, keys: number, settings: boolean }>}
 */
export async function applyRestore(inspected, { onProgress } = {}) {

    const { parsed, plan, memoriesToAdd, keysToAdd } = inspected;

    const result = { added: 0, messages: 0, failed: 0, memories: 0, keys: 0, settings: false };

    if (plan.add.length) Object.assign(result, await Storage.importConversations(plan.add, { onProgress }));

    for (const item of memoriesToAdd) {

        try {

            await Memory.add(item.content, item.category, item.importance);

            result.memories++;

        } catch (error) {

            console.warn("Hafıza notu geri yüklenemedi:", error);
        }
    }

    for (const { provider, key } of keysToAdd) {

        config.setProviderKey(provider, key);

        result.keys++;
    }

    if (parsed.stats.hasSettings) {

        applySettings(parsed.backup.settings);

        result.settings = true;
    }

    Memory.renderModalIfOpen?.();

    return result;
}

export function restoreResultText(result) {

    const parts = [];

    if (result.added) parts.push(`${result.added} sohbet`);

    if (result.memories) parts.push(`${result.memories} hafıza notu`);

    if (result.keys) parts.push(`${result.keys} anahtar`);

    if (result.settings) parts.push("tercihler");

    const done = parts.length ? `Geri yüklendi: ${parts.join(", ")}.` : "Eklenecek yeni bir şey yoktu; her şey zaten bu cihazda.";

    return result.failed ? `${done} ${result.failed} sohbet eklenemedi — bağlantını kontrol edip aynı dosyayı tekrar yükle (olanlar tekrar eklenmez).` : done;
}

// ----------------------------------------------------------
// Gentle reminder for guests
// ----------------------------------------------------------

const REMINDER_DELAY_MS = 25_000;

async function remindIfNeeded() {

    try {

        const signedIn = Storage.useSupabase;

        if (signedIn) return;

        const conversationCount = (await Storage.listConversations()).length;

        if (!backupReminderDue({ signedIn, conversationCount, lastBackupAt: readTime(LAST_BACKUP_KEY), lastReminderAt: readTime(LAST_REMINDER_KEY) })) return;

        writeTime(LAST_REMINDER_KEY);

        showToast(
            `${conversationCount} sohbetin yalnızca bu cihazda duruyor. Uygulamayı silersen kaybolur — yedek almak ister misin?`,
            "info",
            14000,
            {
                actionLabel: "Yedek al",
                onAction: async () => {

                    try {

                        const result = await createBackup();

                        showToast(savedWhere(result.mode, result.filename), "success", 6000);

                    } catch (error) {

                        showToast(error?.message || "Yedek alınamadı.", "error");
                    }
                }
            }
        );

    } catch (error) {

        console.warn("Yedek hatırlatması atlandı:", error);
    }
}

if (typeof window !== "undefined") {

    window.addEventListener("load", () => setTimeout(remindIfNeeded, REMINDER_DELAY_MS), { once: true });
}
