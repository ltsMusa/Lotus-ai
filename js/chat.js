/**
 * ==========================================================
 * Lotus AI - Chat Manager
 * Version : 3.0 Alpha
 * Author  : ltsMusa
 * Description : Handles chat, messages and conversations.
 * ==========================================================
 */

export default class ChatManager {

    constructor() {

        this.chat = null;
        this.input = null;
        this.sendButton = null;

        this.messages = [];
        this.isTyping = false;
        this.typingElement = null;

        this.init();

    }

    init() {

        this.cacheElements();
        this.bindEvents();

        console.log("✅ ChatManager initialized.");

    }
    cacheElements() {

        this.chat = document.getElementById("chat");

        this.input = document.getElementById("message-input");

        this.sendButton = document.getElementById("send-button");

    }
    bindEvents() {

        this.sendButton.addEventListener("click", () => {

            this.sendMessage();

        });

        this.input.addEventListener("keydown", (event) => {

            if (event.key === "Enter" && !event.shiftKey) {

                event.preventDefault();

                this.sendMessage();

            }

        });

    }
    sendMessage() {

        const text = this.input.value.trim();

        if (!text) return;

        this.addUserMessage(text);

        this.clearInput();

        this.scrollToBottom();

        this.processMessage(text);

    }
    addUserMessage(text) {

        const message = document.createElement("div");

        message.className = "message user-message";

        message.innerHTML = `

            <div class="message-content">

                ${text}

            </div>

        `;

        this.chat.appendChild(message);

    }
    clearInput() {

        this.input.value = "";

    }

    scrollToBottom() {

        this.chat.scrollTop = this.chat.scrollHeight;

    }
    async processMessage(text) {

        console.log("Mesaj alındı:", text);

    }

}
const chatManager = new ChatManager();






