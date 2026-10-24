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

const MAX_COMMAND_WORDS = 4;

// Lowercase (Turkish rules), drop punctuation/emoji, collapse spaces.
function normalize(text) {

    return String(text ?? "")
        .toLocaleLowerCase("tr-TR")
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .replace(/\s+/g, " ")
        .trim();
}

const GREETING = /^(?:merhaba|merhabalar|selam|selamlar)(?: lotus)?(?: ai)?$/u;
const WHO_ARE_YOU = /^(?:sen kimsin|kimsin|sen kimsin lotus|kendini tanıt)$/u;
const HELP = /^(?:yardım|help|komutlar|yardım et)$/u;

export default class CommandManager {

    constructor() {

        this.commands = this.registerCommands();
    }

    registerCommands() {

        return [

            {
                pattern: GREETING,
                response: "Merhaba! Ben Lotus AI. Bugün ne üretelim?"
            },

            {
                pattern: WHO_ARE_YOU,
                response: "Ben Lotus AI. Senin kişisel yapay zekâ asistanınım."
            },

            {
                pattern: HELP,
                response: "Bana istediğini sorabilirsin: kod yazarım, metin özetler/çeviririm, web'de güncel bilgi ararım, görsel oluştururum ve dosya ya da görsellerini incelerim. “hatırla: …” dersen bir şeyi aklımda tutarım, “unut: …” dersen silerim."
            }

        ];
    }

    handleCommand(text) {

        // Never intercept a message that has a file attached
        // (js/attachments.js) — the user always wants the AI to
        // actually read it, never a canned reply.
        if (String(text ?? "").includes("[Eklenen dosya:")) return null;

        const message = normalize(text);

        if (!message) return null;

        const words = message.split(" ");

        // Commands are tiny utterances ("saat kaç?", "merhaba"). Anything
        // longer — "Merhaba, bana Python öğretir misin?", "Osmanlı tarihi
        // hakkında bilgi ver" — is a real question and goes to the AI.
        // (A looser keyword match used to swallow those with a canned reply.)
        if (words.length > MAX_COMMAND_WORDS) return null;

        const has = word => words.includes(word);

        if (has("saat") && (has("kaç") || has("ne") || has("kaçta") || has("söyle") || has("oldu"))) {

            const now = new Date();

            return `Şu an saat ${now.toLocaleTimeString("tr-TR", {
                hour: "2-digit",
                minute: "2-digit"
            })}.`;
        }

        if (
            /^(?:bugünün tarihi|bugün tarih ne|tarih ne|tarih|bugün ayın kaçı|ayın kaçı|bugün günlerden ne|günlerden ne)$/u.test(message) ||
            /^(?:bugün )?tarih(?:i)? (?:ne|nedir|kaç)$/u.test(message)
        ) {

            const now = new Date();

            // "günlerden ne" asks for the weekday, the rest for the date.
            if (message.includes("günlerden")) {

                const days = [
                    "Pazar", "Pazartesi", "Salı", "Çarşamba",
                    "Perşembe", "Cuma", "Cumartesi"
                ];

                return `Bugün ${days[now.getDay()]}.`;
            }

            return `Bugünün tarihi ${now.toLocaleDateString("tr-TR")}.`;
        }

        if (/^(?:hangi gün|gün ne|bugün hangi gün)$/u.test(message)) {

            const days = [
                "Pazar", "Pazartesi", "Salı", "Çarşamba",
                "Perşembe", "Cuma", "Cumartesi"
            ];

            return `Bugün ${days[new Date().getDay()]}.`;
        }

        for (const command of this.commands) {

            if (command.pattern.test(message)) return command.response;
        }

        return null;
    }
}
