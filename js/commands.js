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

}
handleCommand(text) {

    const message = text.toLowerCase();

    for (const command of this.commands) {

        if (command.keywords.some(keyword => message.includes(keyword))) {

            return command.response;

        }

    }

    return null;

}
