/**
 * ==========================================================
 * Lotus AI - Command Manager
 * Version : 4.1
 * Author  : ltsMusa
 * Description : Handles local commands (instant canned replies
 *               for things like "saat kaç" / "sen kimsin" that
 *               don't need a round-trip to the AI).
 * ==========================================================
 * FIX: this previously matched with plain `message.includes("saat")`
 * — a substring check with no word boundary and no length limit.
 * That meant any real question containing "saat" or "tarih"
 * ANYWHERE — e.g. "Osmanlı tarihi hakkında bilgi ver" — got
 * hijacked into a canned "Bugünün tarihi..." reply instead of
 * reaching the AI at all. Same risk for attached file content
 * (js/attachments.js), which is appended into the same message
 * text. Fixed with: (1) word-boundary regex instead of raw
 * substring, (2) a short-message gate so long real questions are
 * never intercepted, (3) skipping command routing entirely when
 * a file is attached.
 * ==========================================================
 */

const MAX_COMMAND_LENGTH = 40;

function hasWord(message, word) {

    // \b doesn't work well with Turkish characters (ı, ş, ğ, ç,
    // ö, ü aren't in \w), so bound manually against whitespace/
    // punctuation/string edges instead of relying on \b.
    const pattern = new RegExp(`(^|[^\\p{L}\\p{N}])${word}($|[^\\p{L}\\p{N}])`, "u");

    return pattern.test(` ${message} `);
}

export default class CommandManager {

    constructor() {

        this.commands = this.registerCommands();
    }

    registerCommands() {

        return [

            {
                keywords: ["merhaba", "selam", "selamlar"],
                response: "Merhaba! Ben Lotus AI. 😊"
            },

            {
                keywords: ["sen kimsin", "kimsin"],
                response: "Ben Lotus AI. Senin kişisel yapay zekâ asistanınım."
            },

            {
                keywords: ["yardım", "help"],
                response: "Şu an saat, tarih ve temel sohbet komutlarını destekliyorum."
            }

        ];
    }

    handleCommand(text) {

        // Never intercept a message that has a file attached
        // (js/attachments.js) — the user always wants the AI to
        // actually read it, never a canned reply.
        if (text.includes("[Eklenen dosya:")) return null;

        const trimmed = text.trim();

        // Commands are short, command-like utterances ("saat kaç?"),
        // not real questions that happen to contain the same word.
        if (trimmed.length > MAX_COMMAND_LENGTH) return null;

        const message = trimmed.toLowerCase("tr-TR");

        if (hasWord(message, "saat")) {

            const now = new Date();

            return `Şu an saat ${now.toLocaleTimeString("tr-TR", {
                hour: "2-digit",
                minute: "2-digit"
            })}.`;
        }

        if (hasWord(message, "tarih")) {

            const now = new Date();

            return `Bugünün tarihi ${now.toLocaleDateString("tr-TR")}.`;
        }

        if (
            message.includes("günlerden ne") ||
            hasWord(message, "hangi gün") ||
            message === "gün ne"
        ) {

            const days = [
                "Pazar", "Pazartesi", "Salı", "Çarşamba",
                "Perşembe", "Cuma", "Cumartesi"
            ];

            const today = days[new Date().getDay()];

            return `📅 Bugün ${today}.`;
        }

        for (const command of this.commands) {

            if (command.keywords.some(keyword => hasWord(message, keyword))) {

                return command.response;
            }
        }

        return null;
    }
}
