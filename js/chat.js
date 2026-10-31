/**
 * ==========================================================
 * Lotus AI - Chat Manager
 * Version : 7.0
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
import LocalAI from "./providers/local.js";
import { getLocalModel, formatBytes, LOCAL_MODEL_NAME } from "./localModels.js";
import { consumeAttachments, hasAttachment } from "./attachments.js";
import { shouldSearch, searchWeb, getLastSearchProvider } from "./webSearch.js";
import { generateImage } from "./imageGen.js";
import { escapeHtml, stripThinking, icon } from "./utils.js";
import { copyText } from "./clipboard.js";
import { showToast } from "./toast.js";
import Notify from "./notify.js";
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

        // Bumped whenever a generation is cancelled or superseded (the user
        // switched/created a chat mid-answer). A running generation compares
        // against it after every await and quietly bails if it went stale,
        // so a late answer can never land in — or be saved to — a different
        // conversation than the one it was asked in.
        this.generationId = 0;

        // Follow the stream only while the user is at the bottom; scrolling
        // up to re-read freezes the view instead of yanking it back.
        this.stickToBottom = true;

        this.init();
    }

    init() {

        this.cacheElements();
        this.bindEvents();

        document.addEventListener("lotus:conversation-changed", event => {

            this.loadFromHistory(event.detail?.messages ?? []);
        });

        // The welcome screen (logo + quick actions) lives in #chat. It used to
        // be wiped by loadFromHistory() and never came back, so "Yeni Sohbet"
        // showed an empty black page. Now it is only hidden while there are
        // messages, and returns on its own when the chat is empty again.
        if (this.welcome) {

            const syncWelcome = () => this.welcome.classList.toggle("hidden", Boolean(this.chat.querySelector(".message")));

            new MutationObserver(syncWelcome).observe(this.chat, { childList: true });

            syncWelcome();
        }

        console.log("✅ ChatManager initialized.");
    }

    cacheElements() {

        this.chat = document.getElementById("chat");
        this.input = document.getElementById("message-input");
        this.sendButton = document.getElementById("send-button");
        this.stopButton = document.getElementById("stop-button");
        this.scrollButton = document.getElementById("scroll-bottom");
        this.welcome = document.getElementById("welcome-screen");
    }

    bindEvents() {

        this.sendButton.addEventListener("click", () => {

            this.sendMessage();
        });

        this.stopButton?.addEventListener("click", () => {

            this.stopGenerating();
        });

        // On touch screens Enter is a newline key (the send button sends),
        // like every mobile chat app; on desktop Enter sends, Shift+Enter
        // adds a line. Never send while an IME is composing a word.
        const touchFirst = window.matchMedia?.("(pointer: coarse)").matches;

        this.input.addEventListener("keydown", event => {

            if (event.isComposing || event.keyCode === 229) return;

            if (event.key === "Enter" && !event.shiftKey && !touchFirst) {

                event.preventDefault();

                this.sendMessage();
            }
        });

        this.chat.addEventListener("scroll", () => {

            this.stickToBottom = this.isNearBottom();

            this.updateScrollButton();

        }, { passive: true });

        this.scrollButton?.addEventListener("click", () => {

            this.chat.scrollTo({ top: this.chat.scrollHeight, behavior: "smooth" });

            this.stickToBottom = true;

            this.updateScrollButton();
        });

        this.bindImageStates();
    }

    /**
     * Pictures in the chat: the "loading" shimmer stops once they decode
     * (.is-loaded), and one that fails — typically a generated image whose
     * keyless host is throttling, or an old chat reopened offline — turns
     * into a card with a retry button instead of a broken-image icon.
     * load/error don't bubble, so the listeners capture on #chat.
     */
    bindImageStates() {

        this.chat.addEventListener("load", event => {

            const image = event.target;

            if (image?.classList?.contains("message-image")) image.classList.add("is-loaded");

        }, true);

        this.chat.addEventListener("error", event => {

            const image = event.target;

            if (!image?.classList?.contains("message-image")) return;

            this.showBrokenImage(image);

        }, true);
    }

    showBrokenImage(image) {

        const src = image.getAttribute("src") || "";

        const card = document.createElement("div");

        card.className = "image-broken";

        card.innerHTML = `
            ${icon("image", "ic ic-lg")}
            <span>Görsel yüklenemedi. Görsel servisi yoğun olabilir ya da internet yok.</span>
            <button type="button">Yeniden dene</button>
        `;

        card.querySelector("button").addEventListener("click", () => {

            const fresh = document.createElement("img");

            fresh.className = "message-image";
            fresh.alt = image.alt || "";
            fresh.decoding = "async";

            // A different query string so the browser doesn't replay the failure from cache.
            try {

                const url = new URL(src, window.location.href);

                url.searchParams.set("retry", String(Date.now()));

                fresh.src = url.toString();

            } catch {

                fresh.src = src;
            }

            card.replaceWith(fresh);
        });

        image.replaceWith(card);
    }

    isNearBottom() {

        return this.chat.scrollHeight - this.chat.scrollTop - this.chat.clientHeight < 140;
    }

    updateScrollButton() {

        if (!this.scrollButton) return;

        const overflowing = this.chat.scrollHeight > this.chat.clientHeight + 240;

        this.scrollButton.classList.toggle("hidden", this.isNearBottom() || !overflowing);
    }

    /** Aborts and forgets whatever is generating right now (no bubble, no save). */
    cancelGeneration() {

        this.generationId++;

        if (this.currentController) {

            this.currentController.userStopped = true;

            try { this.currentController.abort(); } catch { /* already aborted */ }
        }

        this.hideTyping();

        this.setGenerating(false);
    }

    // ------------------------------------------------------
    // GENERATING STATE (send/stop button swap)
    // ------------------------------------------------------

    setGenerating(isGenerating, reason = "reply") {

        this.isGenerating = isGenerating;

        // Android: keep the app alive (ongoing notification) while an answer is
        // being made, so leaving the app does not cut it off. No-op elsewhere.
        this.releaseKeepAlive?.();

        this.releaseKeepAlive = null;

        if (isGenerating) {

            Notify.askPermissionOnce();

            this.releaseKeepAlive = Notify.keepAlive(reason);
        }

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

        this.cancelGeneration();

        this.chat.querySelectorAll(".message").forEach(node => node.remove());

        this.messages = [];
        this.messageElements = [];

        storedMessages.forEach(message => {

            if (message.role === "user") {

                this.addUserMessage(message.content, { save: false });

            } else if (message.role === "assistant") {

                this.addAIMessage(message.content, { save: false, speak: false });
            }
        });

        this.scrollToBottom(true);

        this.chat.classList.remove("history-enter");

        // eslint-disable-next-line no-unused-expressions
        this.chat.offsetWidth; // restart the CSS fade-in for the loaded chat

        this.chat.classList.add("history-enter");
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

        this.scrollToBottom(true);

        this.processMessage(fullText);
    }

    // ------------------------------------------------------
    // MESSAGE BUBBLES
    // ------------------------------------------------------

    addUserMessage(text, { save = true, images = [], forceSearch = false, searchQuery = "" } = {}) {

        const message = document.createElement("div");

        message.className = "message user-message";

        const imagesHtml = images.length > 0
            ? images.map(image => `<img class="message-image" src="${image.dataUrl}" alt="">`).join("")
            : "";

        message.innerHTML = `
            <div class="message-content">${escapeHtml(text)}${imagesHtml}</div>
        `;

        this.chat.appendChild(message);

        this.makeCollapsible(message.querySelector(".message-content"), text);

        const index = this.messages.length;

        // images are NOT persisted to Storage (base64 would bloat
        // localStorage/Supabase fast) — kept in-memory only, just long
        // enough for generateAIResponse to send them for this one reply.
        this.messages.push({ role: "user", content: text, images, forceSearch, searchQuery });
        this.messageElements.push(message);

        this.attachMessageActions(message, index, "user");

        if (save) {

            const storedText = images.length > 0
                ? `${text}\n[${images.length} görsel eklendi — sohbet geçmişinde görseller saklanmaz]`
                : text;

            Storage.appendMessage("user", storedText);

            this.scrollToBottom(true);
        }

        return message;
    }

    /**
     * A pasted page or attached file can be thousands of characters —
     * collapse it behind a toggle so the chat stays readable.
     */
    makeCollapsible(content, text) {

        if (!content) return;

        const lines = String(text).split("\n").length;

        if (String(text).length <= 700 && lines <= 12) return;

        content.classList.add("collapsible", "collapsed");

        const toggle = document.createElement("button");

        toggle.type = "button";
        toggle.className = "message-expand-toggle";
        toggle.textContent = "Tümünü göster ▾";

        toggle.addEventListener("click", () => {

            const collapsed = content.classList.toggle("collapsed");

            toggle.textContent = collapsed ? "Tümünü göster ▾" : "Daralt ▴";
        });

        content.after(toggle);
    }

    addAIMessage(rawText, { save = true, speak = true, isError = false, searchProvider = "", route = null } = {}) {

        const text = isError ? rawText : stripThinking(rawText);

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

            this.appendSourceBadge(message, searchProvider);
            this.appendRouteBadge(message, route);

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

        const myId = ++this.generationId;

        // A real controller, so the Stop button that setGenerating() shows
        // actually does something while the picture is being made.
        const controller = new AbortController();

        this.currentController = controller;

        this.setGenerating(true, "image");
        this.showTyping("Görsel oluşturuluyor...");

        try {

            const url = await generateImage(prompt, {
                signal: controller.signal,
                onStatus: label => { if (myId === this.generationId) this.showTyping(label); }
            });

            if (myId !== this.generationId) return;

            this.hideTyping();

            this.addAIMessage(`![${prompt.replace(/[[\]]/g, "")}](${url})`, { speak: false });

            Notify.replyReady({ image: true, text: prompt });

        } catch (error) {

            if (myId !== this.generationId) return;

            this.hideTyping();

            // Stop pressed — no error bubble.
            if (error.code === "ABORTED") return;

            this.addAIMessage(error.message, { isError: true });

            Notify.notice("Görsel oluşturulamadı", String(error.message).slice(0, 140));

        } finally {

            if (myId === this.generationId) this.setGenerating(false);

            if (this.currentController === controller) this.currentController = null;
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

        const addButton = (title, iconName, onClick) => {

            const button = document.createElement("button");

            button.type = "button";
            button.className = "message-action-button";
            button.title = title;

            button.setAttribute("aria-label", title);

            button.innerHTML = icon(iconName);

            button.addEventListener("click", onClick);

            actions.appendChild(button);

            return button;
        };

        const copyButton = addButton("Kopyala", "copy", async () => {

            const ok = await copyText(this.messages[index]?.content ?? "");

            copyButton.innerHTML = icon(ok ? "check" : "x");

            copyButton.classList.toggle("is-done", ok);
            copyButton.classList.toggle("is-failed", !ok);

            setTimeout(() => {

                copyButton.innerHTML = icon("copy");

                copyButton.classList.remove("is-done", "is-failed");

            }, 1300);
        });

        if (role === "user") {

            addButton("Düzenle", "pencil", () => this.startEditingMessage(index));

        } else {

            addButton("Yeniden oluştur", "refresh", () => this.regenerateFrom(index));
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

        const cancel = () => {

            content.innerHTML = escapeHtml(originalText);

            this.attachMessageActions(element, index, "user");
        };

        const save = async () => {

            const newText = textarea.value.trim();

            if (!newText || this.isGenerating) return;

            await this.truncateFrom(index);

            this.addUserMessage(newText);

            this.clearInput();

            this.scrollToBottom();

            this.processMessage(newText);
        };

        const fit = () => {

            textarea.style.height = "auto";

            textarea.style.height = `${Math.min(textarea.scrollHeight, 320)}px`;
        };

        fit();

        textarea.addEventListener("input", fit);

        // Esc cancels; Ctrl/Cmd+Enter always saves; a plain Enter saves too
        // on a keyboard device (on a phone Enter stays a new line).
        textarea.addEventListener("keydown", event => {

            if (event.key === "Escape") {

                event.preventDefault();

                cancel();

                return;
            }

            if (event.key !== "Enter" || event.isComposing) return;

            const touchFirst = window.matchMedia?.("(pointer: coarse)").matches;

            if (event.ctrlKey || event.metaKey || (!event.shiftKey && !touchFirst)) {

                event.preventDefault();

                save();
            }
        });

        content.querySelector(".message-edit-cancel").addEventListener("click", cancel);

        content.querySelector(".message-edit-save").addEventListener("click", save);
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

        // Re-rendering the whole markdown on every token is wasted work
        // (and janky on phones) — coalesce to one render per frame.
        element._pendingText = fullText;

        if (element._frame) return;

        element._frame = requestAnimationFrame(() => {

            element._frame = null;

            element.querySelector(".message-content").innerHTML = renderMarkdown(stripThinking(element._pendingText));

            this.scrollToBottom();
        });
    }

    /** Small "🔎 Kaynak: …" line under an answer that used live web results. */
    appendSourceBadge(element, provider) {

        if (!provider) return;

        const badge = document.createElement("div");

        badge.className = "message-source";
        badge.innerHTML = `${icon("search")}<span>Güncel web sonuçları kullanıldı · ${escapeHtml(provider)}</span>`;

        element.appendChild(badge);
    }

    /** "Cihazda yanıtlandı" — shown when the reply came from the on-device model. */
    appendRouteBadge(element, route) {

        if (!route || route.kind !== "local") return;

        const badge = document.createElement("div");

        badge.className = "message-source message-route";
        badge.innerHTML = `${icon("cpu")}<span>Cihazda yanıtlandı · ${escapeHtml(route.label || LOCAL_MODEL_NAME)}</span>`;

        element.appendChild(badge);
    }

    finalizeStreamingMessage(element, rawText, meta = {}) {

        if (element._frame) {

            cancelAnimationFrame(element._frame);

            element._frame = null;
        }

        const fullText = stripThinking(rawText);

        element.classList.remove("streaming");

        // Final render with the complete text (the last throttled frame
        // may not have run yet).
        element.querySelector(".message-content").innerHTML = renderMarkdown(fullText);

        bindCodeCopyButtons(element);

        const index = this.messages.length;

        this.messages.push({ role: "assistant", content: fullText });
        this.messageElements.push(element);

        this.appendSourceBadge(element, meta.searchProvider);
        this.appendRouteBadge(element, meta.route);

        this.attachMessageActions(element, index, "assistant");

        Storage.appendMessage("assistant", fullText);

        Speech.speak(fullText);

        this.scrollToBottom();
    }

    // ------------------------------------------------------
    // "LIMIT DOLDU" CHOICE SCREEN
    // ------------------------------------------------------

    showLimitReachedMessage({ reason = "quota" } = {}) {

        const message = document.createElement("div");

        message.className = "message ai-message limit-message";

        const headline = reason === "no-provider"
            ? "Henüz bağlı bir yapay zekâ sağlayıcısı yok."
            : "Limit doldu. Bağlı yapay zekâ sağlayıcılarının kullanım hakkı şu an bitti.";

        const hasLocal = this.apiManager.localBackends().length > 0;

        const modelId = LocalAI.recommendedModelId() || "mini-0.5b";

        const model = getLocalModel(modelId);

        const localLabel = hasLocal
            ? "Yerel modelle devam et"
            : `${LOCAL_MODEL_NAME}'yi indir (${formatBytes(model.sizeBytes)}) ve devam et`;

        message.innerHTML = `
            <div class="message-content">
                <p>${icon("alert")}<span>${escapeHtml(headline)}</span></p>
                <div class="limit-choices">
                    <button class="message-choice-button primary" data-action="new-key">
                        ${icon("key")}Yeni Groq API Key al
                    </button>
                    <button class="message-choice-button secondary" data-action="local-ollama">
                        ${icon(hasLocal ? "cpu" : "download")}${escapeHtml(localLabel)}
                    </button>
                </div>
                <div class="limit-download hidden">
                    <div class="limit-download-text"></div>
                    <div class="local-progress"><span></span></div>
                    <button class="message-choice-button secondary limit-download-cancel">Vazgeç</button>
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
        const downloadBox = message.querySelector(".limit-download");
        const downloadText = message.querySelector(".limit-download-text");
        const downloadBar = message.querySelector(".local-progress span");
        const downloadCancel = message.querySelector(".limit-download-cancel");

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

        localButton.addEventListener("click", async () => {

            newKeyButton.disabled = true;
            localButton.disabled = true;

            if (!hasLocal) {

                // Download Lotus Mini right here, then answer with it.
                const controller = new AbortController();

                downloadBox.classList.remove("hidden");

                downloadText.textContent = `${model.name} indiriliyor…`;

                downloadCancel.onclick = () => controller.abort();

                const unsubscribe = LocalAI.subscribe(snapshot => {

                    const info = snapshot.downloading;

                    if (!info) return;

                    const percent = Math.min(100, Math.round((info.loaded / info.total) * 100));

                    downloadBar.style.width = `${percent}%`;

                    downloadText.textContent = `${model.name} indiriliyor… ${formatBytes(info.loaded)} / ${formatBytes(info.total)} (%${percent})`;
                });

                try {

                    await LocalAI.download(modelId, { signal: controller.signal });

                } catch (error) {

                    unsubscribe();

                    downloadText.textContent = error.code === "ABORTED"
                        ? "İndirme iptal edildi."
                        : (error.message || "Model indirilemedi.");

                    downloadBar.style.width = "0%";

                    downloadCancel.classList.add("hidden");

                    newKeyButton.disabled = false;
                    localButton.disabled = false;

                    return;
                }

                unsubscribe();

                showToast(`${model.name} cihaza kuruldu — artık internet olmadan da çalışır.`, "success", 4500);
            }

            message.remove();

            this.generateAIResponse({ viaLocal: true });
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

        // lets js/composer.js shrink the auto-sized textarea back down
        this.input.dispatchEvent(new Event("input", { bubbles: true }));
    }

    scrollToBottom(force = false) {

        if (force) this.stickToBottom = true;

        if (!this.stickToBottom) {

            this.updateScrollButton();

            return;
        }

        this.chat.scrollTop = this.chat.scrollHeight;

        this.updateScrollButton();
    }

    // ------------------------------------------------------
    // PROCESS A MESSAGE: local commands first, then AI
    // ------------------------------------------------------

    /**
     * Sends `text` exactly as if the user had typed it. Used by the tools
     * panel and quick actions. `forceSearch` makes the reply use live web
     * results even when automatic search is switched off in Settings.
     * Returns false (and does nothing) while another answer is running.
     */
    sendPrompt(text, { forceSearch = false, searchQuery = "" } = {}) {

        const clean = String(text ?? "").trim();

        if (!clean || this.isGenerating) return false;

        this.addUserMessage(clean, { forceSearch, searchQuery });

        this.scrollToBottom(true);

        this.processMessage(clean);

        return true;
    }

    async processMessage(text) {

        // "hatırla: …", "unut: …", "hafızanı temizle", "neler hatırlıyorsun?"
        const memoryCommand = Memory.parseCommand(text);

        if (memoryCommand) {

            const myId = ++this.generationId;

            this.setGenerating(true);

            this.showTyping("Hafıza güncelleniyor...");

            let reply = "";

            try {

                reply = await Memory.runCommand(memoryCommand);

            } catch (error) {

                console.warn("🧠 Hafıza komutu başarısız:", error);

                reply = "Hafızayla ilgili bir şey ters gitti, tekrar dener misin?";
            }

            if (myId !== this.generationId) return;

            this.hideTyping();

            this.setGenerating(false);

            if (reply) this.addAIMessage(reply);

            return;
        }

        const commandResponse = this.commandManager.handleCommand(text);

        if (commandResponse) {

            const myId = ++this.generationId;

            this.setGenerating(true);

            this.showTyping();

            await new Promise(resolve => setTimeout(resolve, 400));

            // The user switched chats while the "thinking" dots were up.
            if (myId !== this.generationId) return;

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
     *
     * Every `await` below is followed by a staleness check: if the user
     * switched or cleared the conversation (cancelGeneration bumps
     * generationId) the old answer is dropped silently instead of being
     * drawn into — and saved to — a different chat.
     */
    async generateAIResponse({ viaLocal = false, viaOllama = false } = {}) {

        const lastUser = [...this.messages].reverse().find(m => m.role === "user");

        if (!lastUser) return;

        // Regenerating an image-generation request (🎨 Görsel oluştur: ...)
        // needs to re-run image generation, not send that text to the
        // normal text LLM — which would happily "reply" to it in words
        // instead of actually making a new image.
        if (lastUser.content.startsWith(IMAGE_GEN_PREFIX)) {

            return this.regenerateImage(lastUser.content.slice(IMAGE_GEN_PREFIX.length));
        }

        const forceLocal = viaLocal || viaOllama;

        const myId = ++this.generationId;

        const isStale = () => myId !== this.generationId;

        // Created up front so the Stop button works during the memory and
        // web-search phases too, not only while tokens are streaming.
        const controller = new AbortController();

        this.currentController = controller;

        this.setGenerating(true);
        // Nothing leaves the device when the user asked for it, or when the
        // router can only reach the on-device model (offline / local mode).
        const staysOnDevice = forceLocal || this.apiManager.willStayOnDevice();

        const onStatus = label => { if (myId === this.generationId) this.showTyping(label); };

        this.showTyping(staysOnDevice ? `${LOCAL_MODEL_NAME} cihazda düşünüyor...` : undefined);

        let streamingElement = null;
        let latestText = "";

        try {

            let memoryContext = "";

            if (config.memoryEnabled) {

                try {

                    const memories = await Memory.getMemories({ limit: 20 });

                    memoryContext = Memory.formatForAI(memories);

                } catch (error) {

                    console.warn("🧠 Hafıza bağlamı alınamadı:", error);
                }

                if (isStale()) return;
            }

            let searchContext = "";
            let searchProvider = "";

            const hasImages = Boolean(lastUser.images?.length);

            const wantsSearch = !staysOnDevice && !hasImages &&
                (lastUser.forceSearch || (config.webSearchEnabled && shouldSearch(lastUser.content)));

            if (wantsSearch) {

                this.showTyping("Web'de aranıyor...");

                try {

                    searchContext = await searchWeb(lastUser.searchQuery || lastUser.content, controller);

                    searchProvider = searchContext ? getLastSearchProvider() : "";

                    if (lastUser.forceSearch && !searchContext && !isStale()) {

                        showToast("Web araması sonuç getiremedi — yanıt modelin kendi bilgisine dayanıyor.", "info", 5000);
                    }

                } catch (error) {

                    // Stop pressed mid-search → stop the whole turn, with the
                    // same "no error bubble" behaviour as stopping mid-stream.
                    if (error.userAborted) throw Object.assign(new Error("stopped"), { code: "ABORTED" });

                    searchContext = "";
                }

                if (isStale()) return;

                this.showTyping(); // back to the normal "Lotus düşünüyor..." label
            }

            // History sent to the API excludes the message we're replying
            // to (it's passed separately as `message`), so exclude the
            // last entry.
            const historyForApi = this.messages.slice(0, -1).map(({ role, content }) => ({ role, content }));

            const onToken = (_, fullText) => {

                if (isStale()) return;

                latestText = fullText;

                // A reasoning model first "thinks" inside <think>…</think>;
                // keep the dots up until there is real answer text to show.
                if (!stripThinking(fullText).trim()) return;

                if (!streamingElement) {

                    this.hideTyping();

                    streamingElement = this.createStreamingMessage();
                }

                this.updateStreamingMessage(streamingElement, fullText);
            };

            let result;

            if (hasImages) {

                this.showTyping("Görsel inceleniyor...");

                // Real vision analysis — non-streaming (see api.js),
                // so there's no onToken here, just a final result.
                result = await this.apiManager.sendMessageWithImages(
                    lastUser.content,
                    lastUser.images,
                    { history: historyForApi, memoryContext, searchContext, controller }
                );

            } else if (forceLocal) {

                result = await this.apiManager.sendMessageViaLocal(lastUser.content, {
                    history: historyForApi,
                    memoryContext,
                    onToken,
                    controller,
                    onStatus
                });

            } else {

                result = await this.apiManager.sendMessage(lastUser.content, {
                    history: historyForApi,
                    memoryContext,
                    searchContext,
                    onToken,
                    controller,
                    onStatus
                });
            }

            if (isStale()) {

                streamingElement?.remove();

                return;
            }

            // Stop pressed while a non-abortable request (vision through a
            // personal key) was still in flight — honour it.
            if (controller.signal.aborted) throw Object.assign(new Error("stopped"), { code: "ABORTED" });

            this.hideTyping();
            this.setGenerating(false);

            if (result.limitReached) {

                streamingElement?.remove();

                this.showLimitReachedMessage({ reason: result.reason });

                return;
            }

            if (result.error) {

                streamingElement?.remove();

                this.addAIMessage(result.text, { isError: true });

                Notify.notice("Yanıt alınamadı", String(result.text ?? "").slice(0, 140));

                return;
            }

            if (streamingElement) {

                this.finalizeStreamingMessage(streamingElement, result.text, { searchProvider, route: result.route });

            } else {

                this.addAIMessage(result.text, { searchProvider, route: result.route });
            }

            // Only shows when the app is not on screen (see notifyPolicy.js).
            Notify.replyReady({ text: result.text });

        } catch (error) {

            if (isStale()) {

                streamingElement?.remove();

                return;
            }

            this.hideTyping();
            this.setGenerating(false);

            // User pressed Stop — no error bubble. Keep whatever text
            // already streamed in as the final answer (ChatGPT-style),
            // or just drop an empty bubble if nothing arrived yet.
            if (error.code === "ABORTED") {

                if (streamingElement) {

                    if (stripThinking(latestText).trim()) {

                        this.finalizeStreamingMessage(streamingElement, latestText);

                    } else {

                        streamingElement.remove();
                    }
                }

                return;
            }

            console.error("💥 Beklenmeyen sohbet hatası:", error);

            streamingElement?.remove();

            this.addAIMessage(
                forceLocal ? "Yerel model çalıştırılamadı." : "Beklenmeyen bir hata oluştu. Lütfen tekrar dene.",
                { isError: true }
            );

        } finally {

            if (this.currentController === controller) this.currentController = null;
        }
    }
}

const chatManager = new ChatManager();

export default chatManager;
