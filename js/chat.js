/**
 * ==========================================================
 * Lotus AI - Chat Manager
 * Version : 5.0
 * Description : Chat, streaming, message actions (copy /
 *               edit / regenerate / stop), and the "Limit
 *               doldu" choice screen.
 * ==========================================================
 */
console.log("chat.js yüklendi");

import CommandManager from "./commands.js";
import APIManager from "./api.js";
import Storage from "./storage.js";
import Memory from "./memory.js";
import Speech from "./speech.js";
import config from "./config.js";
import DeviceProfile from "./deviceProfile.js";
import { consumeAttachments, hasAttachment } from "./attachments.js";
import { shouldSearch, searchWeb } from "./webSearch.js";
import { generateImage } from "./imageGen.js";
import { escapeHtml } from "./utils.js";
import { renderMarkdown, bindCodeCopyButtons } from "./markdown.js";

const GROQ_CONSOLE_URL = "https://console.groq.com/keys";
const IMAGE_GEN_PREFIX = "🎨 Görsel oluştur: ";

class ChatManager {

    constructor() {

        this.commandManager = new CommandManager();
        this.apiManager = new APIManager();

        this.chat = null;
        this.input = null;
        this.sendButton = null;
        this.stopButton = null;

        // Kept index-aligned: this.messages[i] <-> this.messageElements[i].
        // Only real conversation turns live here (not error/limit bubbles,
        // not the typing indicator) — this is what's sent to the API and
        // persisted via Storage.
        this.messages = [];
        this.messageElements = [];

        this.isGenerating = false;
        this.typingElement = null;
        this.currentController = null;

        this.init();
    }

    init() {

        this.cacheElements();
        this.bindEvents();

        document.addEventListener("lotus:conversation-changed", event => {

            this.loadFromHistory(event.detail?.messages ?? []);
        });

        console.log("✅ ChatManager initialized.");
    }

    cacheElements() {

        this.chat = document.getElementById("chat");
        this.input = document.getElementById("message-input");
        this.sendButton = document.getElementById("send-button");
        this.stopButton = document.getElementById("stop-button");
    }

    bindEvents() {

        this.sendButton.addEventListener("click", () => {

            this.sendMessage();
        });

        this.stopButton?.addEventListener("click", () => {

            this.stopGenerating();
        });

        this.input.addEventListener("keydown", event => {

            if (event.key === "Enter" && !event.shiftKey) {

                event.preventDefault();

                this.sendMessage();
            }
        });
    }

    // ------------------------------------------------------
    // GENERATING STATE (send/stop button swap)
    // ------------------------------------------------------

    setGenerating(isGenerating) {

        this.isGenerating = isGenerating;

        this.sendButton.classList.toggle("hidden", isGenerating);
        this.stopButton?.classList.toggle("hidden", !isGenerating);

        // js/statusIndicator.js watches this class to update the
        // header's "Hazır"/"Yazıyor..." badge without an import cycle.
        document.body.classList.toggle("lotus-generating", isGenerating);
    }

    stopGenerating() {

        if (!this.currentController) return;

        this.currentController.userStopped = true;

        this.currentController.abort();
    }

    // ------------------------------------------------------
    // LOAD AN EXISTING CONVERSATION INTO THE CHAT VIEW
    // ------------------------------------------------------

    loadFromHistory(storedMessages) {

        this.chat.innerHTML = "";

        this.messages = [];
        this.messageElements = [];

        storedMessages.forEach(message => {

            if (message.role === "user") {

                this.addUserMessage(message.content, { save: false });

            } else if (message.role === "assistant") {

                this.addAIMessage(message.content, { save: false, speak: false });
            }
        });

        this.scrollToBottom();
    }

    // ------------------------------------------------------
    // SEND
    // ------------------------------------------------------

    sendMessage() {

        const text = this.input.value.trim();

        if ((!text && !hasAttachment()) || this.isGenerating) return;

        const { text: attachedText, images } = consumeAttachments();

        const fullText = text + attachedText;

        this.addUserMessage(fullText, { images });

        this.clearInput();

        this.scrollToBottom();

        this.processMessage(fullText);
    }

    // ------------------------------------------------------
    // MESSAGE BUBBLES
    // ------------------------------------------------------

    addUserMessage(text, { save = true, images = [] } = {}) {

        const message = document.createElement("div");

        message.className = "message user-message";

        const imagesHtml = images.length > 0
            ? images.map(image => `<img class="message-image" src="${image.dataUrl}" alt="">`).join("")
            : "";

        message.innerHTML = `
            <div class="message-content">${escapeHtml(text)}${imagesHtml}</div>
        `;

        this.chat.appendChild(message);

        const index = this.messages.length;

        // images are NOT persisted to Storage (base64 would bloat
        // localStorage/Supabase fast) — kept in-memory only, just long
        // enough for generateAIResponse to send them for this one reply.
        this.messages.push({ role: "user", content: text, images });
        this.messageElements.push(message);

        this.attachMessageActions(message, index, "user");

        if (save) {

            const storedText = images.length > 0
                ? `${text}\n[${images.length} görsel eklendi — sohbet geçmişinde görseller saklanmaz]`
                : text;

            Storage.appendMessage("user", storedText);
        }

        return message;
    }

    addAIMessage(text, { save = true, speak = true, isError = false } = {}) {

        const message = document.createElement("div");

        message.className = "message ai-message" + (isError ? " error-message" : "");

        const bodyHtml = isError ? `<p>${escapeHtml(text)}</p>` : renderMarkdown(text);

        message.innerHTML = `<div class="message-content">${bodyHtml}</div>`;

        if (isError) {

            const retryButton = document.createElement("button");

            retryButton.className = "message-retry-button";
            retryButton.textContent = "Tekrar dene";

            retryButton.addEventListener("click", () => {

                message.remove();

                this.retryLastUserMessage();
            });

            message.querySelector(".message-content").appendChild(retryButton);
        }

        this.chat.appendChild(message);

        bindCodeCopyButtons(message);

        this.scrollToBottom();

        if (!isError) {

            const index = this.messages.length;

            this.messages.push({ role: "assistant", content: text });
            this.messageElements.push(message);

            this.attachMessageActions(message, index, "assistant");

            if (save) Storage.appendMessage("assistant", text);

            if (speak) Speech.speak(text);
        }

        return message;
    }

    retryLastUserMessage() {

        const lastUser = [...this.messages].reverse().find(m => m.role === "user");

        if (lastUser) this.processMessage(lastUser.content);
    }

    /** Re-runs real image generation for a "🎨 Görsel oluştur: ..." turn. */
    async regenerateImage(prompt) {

        this.setGenerating(true);
        this.showTyping("Görsel oluşturuluyor...");

        try {

            const url = await generateImage(prompt);

            this.hideTyping();

            this.addAIMessage(`![${prompt.replace(/[[\]]/g, "")}](${url})`, { speak: false });

        } catch (error) {

            this.hideTyping();

            this.addAIMessage(error.message, { isError: true });

        } finally {

            this.setGenerating(false);
        }
    }

    // ------------------------------------------------------
    // MESSAGE ACTIONS (copy / edit / regenerate)
    // ------------------------------------------------------

    attachMessageActions(element, index, role) {

        // Idempotent: drop any existing action bar first so re-calling
        // this (e.g. after canceling an edit) never duplicates buttons.
        element.querySelector(".message-actions")?.remove();

        const actions = document.createElement("div");

        actions.className = "message-actions";

        const copyButton = document.createElement("button");

        copyButton.className = "message-action-button";
        copyButton.title = "Kopyala";
        copyButton.textContent = "📋";

        copyButton.addEventListener("click", async () => {

            try {

                await navigator.clipboard.writeText(this.messages[index]?.content ?? "");

                copyButton.textContent = "✓";

                setTimeout(() => { copyButton.textContent = "📋"; }, 1200);

            } catch (error) {

                console.warn("Kopyalama başarısız:", error);
            }
        });

        actions.appendChild(copyButton);

        if (role === "user") {

            const editButton = document.createElement("button");

            editButton.className = "message-action-button";
            editButton.title = "Düzenle";
            editButton.textContent = "✏️";

            editButton.addEventListener("click", () => {

                this.startEditingMessage(index);
            });

            actions.appendChild(editButton);

        } else {

            const regenerateButton = document.createElement("button");

            regenerateButton.className = "message-action-button";
            regenerateButton.title = "Yeniden oluştur";
            regenerateButton.textContent = "🔄";

            regenerateButton.addEventListener("click", () => {

                this.regenerateFrom(index);
            });

            actions.appendChild(regenerateButton);
        }

        element.appendChild(actions);
    }

    /**
     * Removes this.messages/this.messageElements/DOM/storage from
     * `fromIndex` to the end (inclusive) — shared by edit (drop the
     * edited message and everything after) and regenerate (drop the
     * old answer and anything after it).
     */
    async truncateFrom(fromIndex) {

        for (let i = fromIndex; i < this.messageElements.length; i++) {

            this.messageElements[i]?.remove();
        }

        this.messages = this.messages.slice(0, fromIndex);
        this.messageElements = this.messageElements.slice(0, fromIndex);

        await Storage.setMessages(Storage.activeId, this.messages);
    }

    startEditingMessage(index) {

        if (this.isGenerating) return;

        const element = this.messageElements[index];

        if (!element) return;

        const originalText = this.messages[index].content;

        element.querySelector(".message-actions")?.remove();

        const content = element.querySelector(".message-content");

        content.innerHTML = `
            <textarea class="message-edit-textarea">${escapeHtml(originalText)}</textarea>
            <div class="message-edit-actions">
                <button class="message-choice-button secondary message-edit-cancel">İptal</button>
                <button class="message-choice-button primary message-edit-save">Kaydet ve Gönder</button>
            </div>
        `;

        const textarea = content.querySelector(".message-edit-textarea");

        textarea.focus();

        textarea.setSelectionRange(originalText.length, originalText.length);

        content.querySelector(".message-edit-cancel").addEventListener("click", () => {

            content.innerHTML = escapeHtml(originalText);

            this.attachMessageActions(element, index, "user");
        });

        content.querySelector(".message-edit-save").addEventListener("click", async () => {

            const newText = textarea.value.trim();

            if (!newText) return;

            await this.truncateFrom(index);

            this.addUserMessage(newText);

            this.clearInput();

            this.scrollToBottom();

            this.processMessage(newText);
        });
    }

    async regenerateFrom(index) {

        if (this.isGenerating) return;

        // Everything from this assistant message onward gets dropped;
        // the preceding user message (index - 1) stays and becomes the
        // last entry in this.messages, which generateAIResponse expects.
        await this.truncateFrom(index);

        const lastUser = [...this.messages].reverse().find(m => m.role === "user");

        if (lastUser) this.generateAIResponse();
    }

    // ------------------------------------------------------
    // STREAMING MESSAGE BUBBLE
    // ------------------------------------------------------

    createStreamingMessage() {

        const message = document.createElement("div");

        message.className = "message ai-message streaming";

        message.innerHTML = `<div class="message-content"></div>`;

        this.chat.appendChild(message);

        this.scrollToBottom();

        return message;
    }

    updateStreamingMessage(element, fullText) {

        element.querySelector(".message-content").innerHTML = renderMarkdown(fullText);

        this.scrollToBottom();
    }

    finalizeStreamingMessage(element, fullText) {

        element.classList.remove("streaming");

        bindCodeCopyButtons(element);

        const index = this.messages.length;

        this.messages.push({ role: "assistant", content: fullText });
        this.messageElements.push(element);

        this.attachMessageActions(element, index, "assistant");

        Storage.appendMessage("assistant", fullText);

        Speech.speak(fullText);
    }

    // ------------------------------------------------------
    // "LIMIT DOLDU" CHOICE SCREEN
    // ------------------------------------------------------

    showLimitReachedMessage() {

        const message = document.createElement("div");

        message.className = "message ai-message limit-message";

        message.innerHTML = `
            <div class="message-content">
                <p>⚠️ Limit doldu. Groq için şu anki paylaşılan kullanım hakkı bitti.</p>
                <div class="limit-choices">
                    <button class="message-choice-button primary" data-action="new-key">
                        🔑 Yeni Groq API Key al
                    </button>
                    <button class="message-choice-button secondary" data-action="local-ollama">
                        💻 Yerel API kullanarak devam et
                    </button>
                </div>
                <div class="limit-key-form hidden">
                    <p class="settings-note">
                        Açılan sayfadan ücretsiz bir Groq API key oluşturup buraya yapıştır —
                        anında kaydedilip kullanılmaya başlanır.
                    </p>
                    <input type="password" class="limit-key-input" placeholder="gsk_...">
                    <button class="message-choice-button primary limit-key-save">Kaydet ve Devam Et</button>
                </div>
            </div>
        `;

        this.chat.appendChild(message);

        this.scrollToBottom();

        const newKeyButton = message.querySelector('[data-action="new-key"]');
        const localButton = message.querySelector('[data-action="local-ollama"]');
        const keyForm = message.querySelector(".limit-key-form");
        const keyInput = message.querySelector(".limit-key-input");
        const keySaveButton = message.querySelector(".limit-key-save");

        newKeyButton.addEventListener("click", () => {

            window.open(GROQ_CONSOLE_URL, "_blank", "noopener,noreferrer");

            keyForm.classList.remove("hidden");

            newKeyButton.disabled = true;
            localButton.disabled = true;
        });

        keySaveButton.addEventListener("click", () => {

            const key = keyInput.value.trim();

            if (!key) return;

            config.setProviderKey("groq", key);

            message.remove();

            this.retryLastUserMessage();
        });

        localButton.addEventListener("click", () => {

            newKeyButton.disabled = true;
            localButton.disabled = true;

            message.remove();

            this.generateAIResponse({ viaOllama: true });
        });
    }

    // ------------------------------------------------------
    // TYPING INDICATOR
    // ------------------------------------------------------

    showTyping(label = "Lotus düşünüyor...") {

        if (this.typingElement) {

            // Update the label in place (e.g. "Web'de aranıyor..." →
            // "Lotus düşünüyor...") instead of no-op'ing — this used to
            // silently ignore later calls once a typing bubble already
            // existed, so the search-phase label never actually showed.
            const content = this.typingElement.querySelector(".message-content");

            if (content) {

                content.innerHTML = `
                    ${escapeHtml(label)}
                    <span class="typing-dots"><span></span><span></span><span></span></span>
                `;
            }

            return;
        }

        const typing = document.createElement("div");

        typing.className = "message ai-message typing-message";

        typing.innerHTML = `
            <div class="message-content">
                ${escapeHtml(label)}
                <span class="typing-dots"><span></span><span></span><span></span></span>
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

    // ------------------------------------------------------
    // PROCESS A MESSAGE: local commands first, then AI
    // ------------------------------------------------------

    async processMessage(text) {

        const commandResponse = this.commandManager.handleCommand(text);

        if (commandResponse) {

            this.setGenerating(true);

            this.showTyping();

            await new Promise(resolve => setTimeout(resolve, 400));

            this.hideTyping();

            this.setGenerating(false);

            this.addAIMessage(commandResponse);

            return;
        }

        await this.generateAIResponse();
    }

    /**
     * Generates a reply to whatever user message currently sits last
     * in this.messages — shared by a normal send, regenerate, retry,
     * the "Limit doldu" personal-key retry, and the Ollama fallback.
     */
    async generateAIResponse({ viaOllama = false } = {}) {

        const lastUserForRoute = [...this.messages].reverse().find(m => m.role === "user");

        // Regenerating an image-generation request (🎨 Görsel oluştur: ...)
        // needs to re-run image generation, not send that text to the
        // normal text LLM — which would happily "reply" to it in words
        // instead of actually making a new image.
        if (lastUserForRoute?.content.startsWith(IMAGE_GEN_PREFIX)) {

            return this.regenerateImage(lastUserForRoute.content.slice(IMAGE_GEN_PREFIX.length));
        }

        this.setGenerating(true);
        this.showTyping(viaOllama ? `${DeviceProfile.getModel()} ile yerel olarak düşünüyor...` : undefined);

        const lastUser = [...this.messages].reverse().find(m => m.role === "user");

        if (!lastUser) {

            this.hideTyping();
            this.setGenerating(false);

            return;
        }

        let memoryContext = "";

        if (config.memoryEnabled && !viaOllama) {

            try {

                const memories = await Memory.getMemories({ limit: 20 });

                memoryContext = Memory.formatForAI(memories);

            } catch (error) {

                console.warn("🧠 Hafıza bağlamı alınamadı:", error);
            }
        }

        let searchContext = "";

        // Created here (not later) so Stop actually works during the
        // search phase too — previously this.currentController didn't
        // exist yet while "Web'de aranıyor..." was showing, so pressing
        // Stop during a search did nothing until the search finished or
        // timed out on its own.
        this.currentController = new AbortController();

        if (config.webSearchEnabled && !viaOllama && !lastUser.images?.length && shouldSearch(lastUser.content)) {

            this.showTyping("Web'de aranıyor...");

            try {

                searchContext = await searchWeb(lastUser.content, this.currentController);

            } catch (error) {

                // User pressed Stop mid-search — stop the whole turn
                // here, same "no error bubble" behavior as aborting
                // mid-stream (see the outer catch below).
                if (error.userAborted) {

                    this.hideTyping();
                    this.setGenerating(false);
                    this.currentController = null;

                    return;
                }

                searchContext = "";
            }

            this.showTyping(); // back to the normal "Lotus düşünüyor..." label
        }

        // History sent to the API excludes the message we're replying
        // to (it's passed separately as `message`), so exclude the
        // last entry.
        const historyForApi = this.messages.slice(0, -1);

        let streamingElement = null;
        let latestText = "";

        const onToken = (_, fullText) => {

            latestText = fullText;

            if (!streamingElement) {

                this.hideTyping();

                streamingElement = this.createStreamingMessage();
            }

            this.updateStreamingMessage(streamingElement, fullText);
        };

        try {

            let result;

            if (lastUser.images?.length > 0) {

                this.showTyping("Görsel inceleniyor...");

                // Real vision analysis — non-streaming (see api.js),
                // so there's no onToken here, just a final result.
                result = await this.apiManager.sendMessageWithImages(
                    lastUser.content,
                    lastUser.images,
                    { history: historyForApi, memoryContext, searchContext }
                );

            } else if (viaOllama) {

                result = await this.apiManager.sendMessageViaOllama(lastUser.content, {
                    history: historyForApi,
                    onToken,
                    controller: this.currentController
                });

            } else {

                result = await this.apiManager.sendMessage(lastUser.content, {
                    history: historyForApi,
                    memoryContext,
                    searchContext,
                    onToken,
                    controller: this.currentController
                });
            }

            this.hideTyping();
            this.setGenerating(false);

            if (result.limitReached) {

                if (streamingElement) streamingElement.remove();

                this.showLimitReachedMessage();

                return;
            }

            if (result.error) {

                if (streamingElement) streamingElement.remove();

                this.addAIMessage(result.text, { isError: true });

                return;
            }

            if (streamingElement) {

                this.finalizeStreamingMessage(streamingElement, result.text);

            } else {

                this.addAIMessage(result.text);
            }

        } catch (error) {

            this.hideTyping();
            this.setGenerating(false);

            // User pressed Stop — no error bubble. Keep whatever text
            // already streamed in as the final answer (ChatGPT-style),
            // or just drop an empty bubble if nothing arrived yet.
            if (error.code === "ABORTED") {

                if (streamingElement) {

                    if (latestText) {

                        this.finalizeStreamingMessage(streamingElement, latestText);

                    } else {

                        streamingElement.remove();
                    }
                }

                return;
            }

            console.error("💥 Beklenmeyen sohbet hatası:", error);

            if (streamingElement) streamingElement.remove();

            this.addAIMessage(
                viaOllama ? "Yerel Ollama sunucusuna bağlanılamadı." : "Beklenmeyen bir hata oluştu. Lütfen tekrar dene.",
                { isError: true }
            );

        } finally {

            this.currentController = null;
        }
    }
}

const chatManager = new ChatManager();

export default chatManager;
