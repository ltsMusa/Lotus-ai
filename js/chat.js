/**
 * ==========================================================
 * Lotus AI - Chat Manager
 * Version : 3.0 Alpha
 * Author  : ltsMusa
 * Description : Handles chat, messages and conversations.
 * ==========================================================
 */
console.log("chat.js yüklendi");

import CommandManager from "./commands.js";
import APIManager from "./api.js";

export default class ChatManager {

    constructor() {

        this.commandManager = new CommandManager();
        this.apiManager = new APIManager();
        
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
    addAIMessage(text) {

    const message = document.createElement("div");

    message.className = "message ai-message";

    message.innerHTML = `
        <div class="message-content">
            ${text}
        </div>
    `;

    this.chat.appendChild(message);

    this.scrollToBottom();

    }
    showTyping() {

    if (this.typingElement) return;

    const typing = document.createElement("div");

    typing.className = "message ai-message typing-message";

    typing.innerHTML = `
        <div class="message-content">
            Lotus düşünüyor...
        </div>
    `;

    this.chat.appendChild(typing);

    this.typingElement = typing;

    this.scrollToBottom();

    }
    hideTyping() {

    if (!this.typingElement) return;

    this.typingElement.remove();

    this.typingElement = null;

    }
    clearInput() {

        this.input.value = "";

    }

    scrollToBottom() {

        this.chat.scrollTop = this.chat.scrollHeight;

    }
    async processMessage(text) {

    this.showTyping();

    await new Promise(resolve => setTimeout(resolve, 600));

    const commandResponse = this.commandManager.handleCommand(text);

    this.hideTyping();

    if (commandResponse) {

        this.addAIMessage(commandResponse);

        return;

    }

    const apiResponse = await this.apiManager.sendMessage(text);

this.addAIMessage(apiResponse);

    }

    }

const chatManager = new ChatManager();
