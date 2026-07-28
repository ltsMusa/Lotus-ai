/**
 * ==========================================================
 * Lotus AI - Command Manager
 * Version : 3.0 Alpha
 * Author  : ltsMusa
 * Description : Handles local commands.
 * ==========================================================
 */

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

        const message = text.toLowerCase();

        if (message.includes("saat")) {

    const now = new Date();

    return `Şu an saat ${now.toLocaleTimeString("tr-TR", {
        hour: "2-digit",
        minute: "2-digit"
    })}.`;

        }

        if (message.includes("tarih")) {

    const now = new Date();

    return `Bugünün tarihi ${now.toLocaleDateString("tr-TR")}.`;

        }

        if (
    message.includes("günlerden ne") ||
    message.includes("hangi gün") ||
    message === "gün ne"
) {

    const days = [
        "Pazar",
        "Pazartesi",
        "Salı",
        "Çarşamba",
        "Perşembe",
        "Cuma",
        "Cumartesi"
    ];

    const today = days[new Date().getDay()];

    return `📅 Bugün ${today}.`;

        }

        for (const command of this.commands) {

            if (command.keywords.some(keyword => message.includes(keyword))) {

                return command.response;

            }

        }

        return null;

    }

}
